const THEME_CLASS = "dynamic-theme";
const THEME_VARIABLES = [
  "--ambient-hue",
  "--ambient-saturation",
  "--ambient-hue-secondary",
  "--ambient-saturation-secondary",
  "--ambient-primary-x",
  "--ambient-primary-y",
  "--ambient-secondary-x",
  "--ambient-secondary-y",
  "--ambient-gradient-angle",
];

let requestId = 0;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export function getClosestHue(currentHue, nextHue) {
  if (!Number.isFinite(currentHue)) return nextHue;
  return currentHue + ((nextHue - currentHue + 540) % 360) - 180;
}

export function rgbToHsl(red, green, blue) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const chroma = max - min;

  if (chroma === 0) return { hue: 0, saturation: 0, lightness };

  let hue;
  if (max === r) hue = ((g - b) / chroma) % 6;
  else if (max === g) hue = (b - r) / chroma + 2;
  else hue = (r - g) / chroma + 4;

  return {
    hue: (hue * 60 + 360) % 360,
    saturation: chroma / (1 - Math.abs(2 * lightness - 1)),
    lightness,
  };
}

function createThemeColor(red, green, blue) {
  const { hue, saturation } = rgbToHsl(red, green, blue);
  if (saturation < 0.12) return { hue: 210, saturation: 0 };
  return {
    hue: Math.round(hue),
    saturation: clamp(Math.round(saturation * 85), 28, 85),
  };
}

const hueDistance = (first, second) => Math.min(
  Math.abs(first - second),
  360 - Math.abs(first - second),
);

function getFallbackPalette() {
  return {
    hue: 210,
    saturation: 28,
    secondaryHue: 252,
    secondarySaturation: 36,
    primaryX: 12,
    primaryY: 8,
    secondaryX: 92,
    secondaryY: 96,
    gradientAngle: 160,
  };
}

function getNeutralPalette() {
  return {
    hue: 210,
    saturation: 0,
    secondaryHue: 210,
    secondarySaturation: 0,
    primaryX: 12,
    primaryY: 8,
    secondaryX: 92,
    secondaryY: 96,
    gradientAngle: 160,
  };
}

const toBackgroundPosition = (value) => clamp(Math.round(8 + value * 84), 8, 92);

function getGradientAngle(primaryX, primaryY, secondaryX, secondaryY) {
  const deltaX = secondaryX - primaryX;
  const deltaY = secondaryY - primaryY;
  if (Math.abs(deltaX) < 4 && Math.abs(deltaY) < 4) return 160;
  return Math.round((Math.atan2(deltaX, -deltaY) * 180) / Math.PI + 360) % 360;
}

function createSpatialPalette(primary, secondary) {
  const primaryX = toBackgroundPosition(primary.x);
  const primaryY = toBackgroundPosition(primary.y);
  const secondaryX = secondary ? toBackgroundPosition(secondary.x) : 100 - primaryX;
  const secondaryY = secondary ? toBackgroundPosition(secondary.y) : 100 - primaryY;
  return {
    hue: primary.hue,
    saturation: primary.saturation,
    secondaryHue: secondary?.hue ?? (primary.hue + 48) % 360,
    secondarySaturation: secondary?.saturation ?? primary.saturation,
    primaryX,
    primaryY,
    secondaryX,
    secondaryY,
    gradientAngle: getGradientAngle(primaryX, primaryY, secondaryX, secondaryY),
  };
}

export function getDynamicPalette(imageData) {
  const data = imageData?.data;
  if (!data?.length) return getFallbackPalette();

  const colorBuckets = new Map();
  const width = Math.max(Number(imageData?.width) || data.length / 4, 1);
  const height = Math.max(Number(imageData?.height) || 1, 1);
  let pixelCount = 0;
  let chromaticCoverage = 0;

  for (let index = 0; index < data.length; index += 16) {
    if (data[index + 3] < 192) continue;
    pixelCount += 1;

    const { hue, saturation, lightness } = rgbToHsl(
      data[index],
      data[index + 1],
      data[index + 2],
    );
    if (saturation < 0.12) continue;

    const exposure = Math.min(lightness, 1 - lightness) * 2;
    const weight = 0.2 + saturation * 0.45 + exposure * 0.35;
    chromaticCoverage += 1;

    const key = `${Math.floor(hue / 24)}:${Math.floor(lightness * 4)}`;
    const bucket = colorBuckets.get(key) || { red: 0, green: 0, blue: 0, x: 0, y: 0, weight: 0 };
    const pixelIndex = index / 4;
    const x = (pixelIndex % width) / Math.max(width - 1, 1);
    const y = Math.floor(pixelIndex / width) / Math.max(height - 1, 1);
    bucket.red += data[index] * weight;
    bucket.green += data[index + 1] * weight;
    bucket.blue += data[index + 2] * weight;
    bucket.x += x * weight;
    bucket.y += y * weight;
    bucket.weight += weight;
    colorBuckets.set(key, bucket);
  }

  const colors = Array.from(colorBuckets.values())
    .map((bucket) => ({
      ...createThemeColor(
        bucket.red / bucket.weight,
        bucket.green / bucket.weight,
        bucket.blue / bucket.weight,
      ),
      x: bucket.x / bucket.weight,
      y: bucket.y / bucket.weight,
      weight: bucket.weight,
    }))
    .sort((first, second) => second.weight - first.weight);
  if (!colors.length || chromaticCoverage < pixelCount * 0.15) return getNeutralPalette();

  const primary = colors[0];
  const secondary = colors
    .slice(1)
    .filter((color) => (
      hueDistance(primary.hue, color.hue) >= 35
      && color.weight >= primary.weight * 0.12
    ))
    .sort((first, second) => {
      const firstScore = first.weight * (0.85 + hueDistance(primary.hue, first.hue) / 720);
      const secondScore = second.weight * (0.85 + hueDistance(primary.hue, second.hue) / 720);
      return secondScore - firstScore;
    })[0];

  return createSpatialPalette(primary, secondary);
}

export function getThemePaletteFromColor(color) {
  const match = typeof color === "string" && color.match(/^#([\da-f]{6})$/i);
  if (!match) return null;

  const value = Number.parseInt(match[1], 16);
  const primary = createThemeColor(
    (value >> 16) & 255,
    (value >> 8) & 255,
    value & 255,
  );
  return {
    ...primary,
    secondaryHue: (primary.hue + 48) % 360,
    secondarySaturation: primary.saturation,
    primaryX: 18,
    primaryY: 12,
    secondaryX: 82,
    secondaryY: 88,
    gradientAngle: 155,
  };
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (!source.startsWith("data:")) image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

async function extractDynamicPalette(source) {
  const getCoverPalette = window.windowApi?.getCoverPalette;
  if (typeof getCoverPalette === "function") {
    const palette = await getCoverPalette(source);
    if (Number.isFinite(palette?.hue) && Number.isFinite(palette?.saturation)) {
      return palette;
    }
  }

  const image = await loadImage(source);
  const canvas = document.createElement("canvas");
  canvas.width = 48;
  canvas.height = 48;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas 2D context is unavailable");

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return getDynamicPalette(context.getImageData(0, 0, canvas.width, canvas.height));
}

function applyPalette({
  hue,
  saturation,
  secondaryHue,
  secondarySaturation,
  primaryX = 12,
  primaryY = 8,
  secondaryX = 92,
  secondaryY = 96,
  gradientAngle = 160,
}) {
  const root = document.documentElement;
  const rootStyle = getComputedStyle(root);
  root.style.setProperty(
    "--ambient-hue",
    String(getClosestHue(Number.parseFloat(rootStyle.getPropertyValue("--ambient-hue")), hue)),
  );
  root.style.setProperty("--ambient-saturation", `${saturation}%`);
  const nextSecondaryHue = secondaryHue ?? (hue + 48) % 360;
  root.style.setProperty(
    "--ambient-hue-secondary",
    String(getClosestHue(Number.parseFloat(rootStyle.getPropertyValue("--ambient-hue-secondary")), nextSecondaryHue)),
  );
  root.style.setProperty("--ambient-saturation-secondary", `${secondarySaturation ?? saturation}%`);
  root.style.setProperty("--ambient-primary-x", `${primaryX}%`);
  root.style.setProperty("--ambient-primary-y", `${primaryY}%`);
  root.style.setProperty("--ambient-secondary-x", `${secondaryX}%`);
  root.style.setProperty("--ambient-secondary-y", `${secondaryY}%`);
  root.style.setProperty(
    "--ambient-gradient-angle",
    `${getClosestHue(Number.parseFloat(rootStyle.getPropertyValue("--ambient-gradient-angle")), gradientAngle)}deg`,
  );
  root.classList.add(THEME_CLASS);
}

export function clearDynamicTheme() {
  requestId += 1;
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.classList.remove(THEME_CLASS);
  THEME_VARIABLES.forEach((name) => root.style.removeProperty(name));
}

export async function applyDynamicTheme(source) {
  const currentRequestId = ++requestId;
  if (!source || typeof document === "undefined") {
    clearDynamicTheme();
    return;
  }

  try {
    const palette = await extractDynamicPalette(source);
    if (currentRequestId !== requestId) return;

    applyPalette(palette);
  } catch (_) {
    if (currentRequestId === requestId) clearDynamicTheme();
  }
}

export function applyCustomTheme(color) {
  const palette = getThemePaletteFromColor(color);
  if (!palette || typeof document === "undefined") {
    clearDynamicTheme();
    return;
  }

  requestId += 1;
  applyPalette(palette);
}
