const THEME_CLASS = "dynamic-theme";
const THEME_VARIABLES = [
  "--ambient-hue",
  "--ambient-saturation",
  "--ambient-hue-secondary",
  "--ambient-saturation-secondary",
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
  if (saturation === 0) return { hue: 210, saturation: 28 };
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
  };
}

export function getDynamicPalette(imageData) {
  const data = imageData?.data;
  if (!data?.length) return getFallbackPalette();

  const colorBuckets = new Map();

  for (let index = 0; index < data.length; index += 16) {
    if (data[index + 3] < 192) continue;

    const { hue, saturation, lightness } = rgbToHsl(
      data[index],
      data[index + 1],
      data[index + 2],
    );
    const exposure = Math.min(lightness, 1 - lightness) * 2;
    const weight = saturation * (0.25 + exposure);
    if (weight <= 0) continue;

    const key = `${Math.floor(hue / 24)}:${Math.floor(lightness * 4)}`;
    const bucket = colorBuckets.get(key) || { red: 0, green: 0, blue: 0, weight: 0 };
    bucket.red += data[index] * weight;
    bucket.green += data[index + 1] * weight;
    bucket.blue += data[index + 2] * weight;
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
      weight: bucket.weight,
    }))
    .sort((first, second) => second.weight - first.weight);
  if (!colors.length) return getFallbackPalette();

  const primary = colors[0];
  const secondary = colors
    .slice(1)
    .filter((color) => hueDistance(primary.hue, color.hue) >= 35)
    .sort((first, second) => {
      const firstScore = first.weight * (0.4 + hueDistance(primary.hue, first.hue) / 180);
      const secondScore = second.weight * (0.4 + hueDistance(primary.hue, second.hue) / 180);
      return secondScore - firstScore;
    })[0];

  return {
    hue: primary.hue,
    saturation: primary.saturation,
    secondaryHue: secondary?.hue ?? (primary.hue + 48) % 360,
    secondarySaturation: secondary?.saturation ?? primary.saturation,
  };
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

function applyPalette({ hue, saturation, secondaryHue, secondarySaturation }) {
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
