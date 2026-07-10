import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/utils/dynamicTheme.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript,${encodeURIComponent(source)}`;
const { getClosestHue, getDynamicPalette, getThemePaletteFromColor, rgbToHsl } = await import(moduleUrl);

assert.equal(Math.round(rgbToHsl(255, 0, 0).hue), 0);
assert.equal(Math.round(rgbToHsl(0, 255, 0).hue), 120);
assert.equal(getClosestHue(350, 10), 370);
assert.equal(getClosestHue(10, 350), -10);

const redPixels = Array.from({ length: 64 }, () => [220, 35, 45, 255]).flat();
const redPalette = getDynamicPalette({ data: new Uint8ClampedArray(redPixels) });
assert.ok(redPalette.hue <= 12 || redPalette.hue >= 348, `expected a red hue, got ${redPalette.hue}`);
assert.ok(redPalette.saturation >= 20);

const mixedPixels = [
  ...Array.from({ length: 48 }, () => [220, 35, 45, 255]).flat(),
  ...Array.from({ length: 48 }, () => [35, 70, 220, 255]).flat(),
];
const mixedPalette = getDynamicPalette({ data: new Uint8ClampedArray(mixedPixels) });
const paletteDistance = Math.abs(mixedPalette.hue - mixedPalette.secondaryHue);
assert.ok(Math.min(paletteDistance, 360 - paletteDistance) >= 35);

assert.deepEqual(getThemePaletteFromColor("#ff0000"), {
  hue: 0,
  saturation: 85,
  secondaryHue: 48,
  secondarySaturation: 85,
});
assert.deepEqual(getThemePaletteFromColor("#404040"), {
  hue: 210,
  saturation: 0,
  secondaryHue: 258,
  secondarySaturation: 0,
});
assert.equal(getThemePaletteFromColor("not-a-color"), null);

const grayPixels = Array.from({ length: 64 }, () => [40, 40, 40, 255]).flat();
assert.deepEqual(getDynamicPalette({ data: new Uint8ClampedArray(grayPixels) }), {
  hue: 210,
  saturation: 0,
  secondaryHue: 210,
  secondarySaturation: 0,
});

assert.deepEqual(getDynamicPalette({ data: new Uint8ClampedArray(0) }), {
  hue: 210,
  saturation: 28,
  secondaryHue: 252,
  secondarySaturation: 36,
});
console.log("dynamic-theme checks passed");
