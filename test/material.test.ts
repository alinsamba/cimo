import { describe, expect, it } from 'bun:test';
import {
  rgbToHex,
  hexToRgb,
  rgbToHsl,
  createTonalPalette,
  generateMaterial3Schemes,
  extractDominantColorFromImageData,
} from '../src/core/material';

describe('Material You (Material 3 Dynamic Color) Engine', () => {
  it('converts RGB and Hex color representations accurately', () => {
    expect(rgbToHex(255, 0, 128)).toBe('#ff0080');
    expect(rgbToHex(0, 0, 0)).toBe('#000000');
    expect(rgbToHex(255, 255, 255)).toBe('#ffffff');

    expect(hexToRgb('#ff0080')).toEqual([255, 0, 128]);
    expect(hexToRgb('#fff')).toEqual([255, 255, 255]);
  });

  it('calculates HSL accurately from RGB', () => {
    const [h, s, l] = rgbToHsl(255, 0, 0); // Pure Red
    expect(h).toBe(0);
    expect(s).toBe(1);
    expect(l).toBe(0.5);
  });

  it('generates Material 3 Tonal Palettes across tone levels 0-100', () => {
    const purplePalette = createTonalPalette(270, 48);

    const tone0 = purplePalette.tone(0);
    const tone30 = purplePalette.tone(30);
    const tone80 = purplePalette.tone(80);
    const tone100 = purplePalette.tone(100);

    expect(tone0).toBe('#000000');
    expect(tone100).toBe('#ffffff');
    expect(tone30).not.toBe(tone80);
    expect(tone30).toMatch(/^#[0-9a-f]{6}$/i);
    expect(tone80).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('generates complete WCAG-compliant Light and Dark schemes from seed color', () => {
    const { light, dark, seedHue } = generateMaterial3Schemes('#a855f7');

    expect(seedHue).toBeGreaterThanOrEqual(250);
    expect(seedHue).toBeLessThanOrEqual(300);

    // Dark Scheme Checks
    expect(dark.primary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(dark.primaryContainer).toMatch(/^#[0-9a-f]{6}$/i);
    expect(dark.surface).toMatch(/^#[0-9a-f]{6}$/i);
    expect(dark.surfaceContainer).toMatch(/^#[0-9a-f]{6}$/i);
    expect(dark.onSurface).toMatch(/^#[0-9a-f]{6}$/i);

    // Light Scheme Checks
    expect(light.primary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(light.primaryContainer).toMatch(/^#[0-9a-f]{6}$/i);
    expect(light.surface).toMatch(/^#[0-9a-f]{6}$/i);
    expect(light.surfaceContainer).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('extracts dominant color from synthetic pixel data', () => {
    // Create synthetic 64x64 blue image buffer
    const data = new Uint8ClampedArray(64 * 64 * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 30;     // R
      data[i + 1] = 144; // G
      data[i + 2] = 255; // B (DodgerBlue)
      data[i + 3] = 255; // A
    }

    const dominantHex = extractDominantColorFromImageData(data);
    const [r, g, b] = hexToRgb(dominantHex);
    const [h] = rgbToHsl(r, g, b);

    // Hue should be around blue (~210 deg)
    expect(h).toBeGreaterThanOrEqual(190);
    expect(h).toBeLessThanOrEqual(230);
  });
});
