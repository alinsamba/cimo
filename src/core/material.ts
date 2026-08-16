export interface HCTColor {
  hue: number;        // 0 - 360
  chroma: number;     // 0 - 120
  tone: number;       // 0 - 100 (Perceived Luminance L*)
}

export interface Material3Scheme {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  primaryGlow: string;

  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;

  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;

  surface: string;
  surfaceDim: string;
  surfaceBright: string;
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;

  onSurface: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;

  scrim: string;
  inverseSurface: string;
  inverseOnSurface: string;
  inversePrimary: string;
}

export interface TonalPalette {
  tone(toneLevel: number): string; // tone 0 to 100
}

/**
 * Convert RGB to Hex String
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const hex = ((clamp(r) << 16) | (clamp(g) << 8) | clamp(b)).toString(16).padStart(6, '0');
  return `#${hex}`;
}

/**
 * Convert Hex String to RGB [r, g, b]
 */
export function hexToRgb(hex: string): [number, number, number] {
  let clean = hex.replace(/^#/, '');
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/**
 * HSL to RGB conversion helper
 */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hNorm = (h % 360) / 360;
  const sNorm = Math.max(0, Math.min(1, s));
  const lNorm = Math.max(0, Math.min(1, l));

  if (sNorm === 0) {
    const v = Math.round(lNorm * 255);
    return [v, v, v];
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    let tNorm = t;
    if (tNorm < 0) tNorm += 1;
    if (tNorm > 1) tNorm -= 1;
    if (tNorm < 1 / 6) return p + (q - p) * 6 * tNorm;
    if (tNorm < 1 / 2) return q;
    if (tNorm < 2 / 3) return p + (q - p) * (2 / 3 - tNorm) * 6;
    return p;
  };

  const q = lNorm < 0.5 ? lNorm * (1 + sNorm) : lNorm + sNorm - lNorm * sNorm;
  const p = 2 * lNorm - q;

  const r = Math.round(hue2rgb(p, q, hNorm + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, hNorm) * 255);
  const b = Math.round(hue2rgb(p, q, hNorm - 1 / 3) * 255);

  return [r, g, b];
}

/**
 * RGB to HSL conversion helper
 */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rN = r / 255;
  const gN = g / 255;
  const bN = b / 255;

  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rN:
        h = (gN - bN) / d + (gN < bN ? 6 : 0);
        break;
      case gN:
        h = (bN - rN) / d + 2;
        break;
      case bN:
        h = (rN - gN) / d + 4;
        break;
    }
    h *= 60;
  }

  return [Math.round(h), s, l];
}

/**
 * Create a Material 3 Tonal Palette for a given Hue and Chroma
 */
export function createTonalPalette(hue: number, chroma: number = 48): TonalPalette {
  return {
    tone(toneLevel: number): string {
      const clampedTone = Math.max(0, Math.min(100, toneLevel));
      // Saturation drops at very dark (tone < 20) and very bright (tone > 90) tones
      let s = Math.min(1.0, chroma / 60);
      if (clampedTone < 20) {
        s *= clampedTone / 20;
      } else if (clampedTone > 85) {
        s *= (100 - clampedTone) / 15;
      }
      const l = clampedTone / 100;
      const [r, g, b] = hslToRgb(hue, s, l);
      return rgbToHex(r, g, b);
    },
  };
}

/**
 * Generate complete Material 3 Light & Dark Tonal Schemes from a Seed Color
 */
export function generateMaterial3Schemes(seedHex: string = '#a855f7'): {
  light: Material3Scheme;
  dark: Material3Scheme;
  seedHue: number;
} {
  const [r, g, b] = hexToRgb(seedHex);
  const [hue] = rgbToHsl(r, g, b);

  // 1. Primary Tonal Palette (Chroma ~48)
  const primaryPalette = createTonalPalette(hue, 48);

  // 2. Secondary Tonal Palette (Chroma ~16 - muted harmonized)
  const secondaryPalette = createTonalPalette(hue, 16);

  // 3. Tertiary Tonal Palette (Hue + 60deg, Chroma ~24 - complementary)
  const tertiaryPalette = createTonalPalette((hue + 60) % 360, 28);

  // 4. Neutral Surface Palette (Chroma ~4 - organic tinted surface)
  const neutralPalette = createTonalPalette(hue, 6);

  // 5. Neutral Variant Outline Palette (Chroma ~8)
  const neutralVariantPalette = createTonalPalette(hue, 10);

  // Dark Theme (Default for Cimo)
  const dark: Material3Scheme = {
    primary: primaryPalette.tone(80),
    onPrimary: primaryPalette.tone(20),
    primaryContainer: primaryPalette.tone(30),
    onPrimaryContainer: primaryPalette.tone(90),
    primaryGlow: `${primaryPalette.tone(70)}88`,

    secondary: secondaryPalette.tone(80),
    onSecondary: secondaryPalette.tone(20),
    secondaryContainer: secondaryPalette.tone(30),
    onSecondaryContainer: secondaryPalette.tone(90),

    tertiary: tertiaryPalette.tone(80),
    onTertiary: tertiaryPalette.tone(20),
    tertiaryContainer: tertiaryPalette.tone(30),
    onTertiaryContainer: tertiaryPalette.tone(90),

    surface: neutralPalette.tone(6),
    surfaceDim: neutralPalette.tone(4),
    surfaceBright: neutralPalette.tone(24),
    surfaceContainerLowest: neutralPalette.tone(3),
    surfaceContainerLow: neutralPalette.tone(8),
    surfaceContainer: neutralPalette.tone(11),
    surfaceContainerHigh: neutralPalette.tone(16),
    surfaceContainerHighest: neutralPalette.tone(20),

    onSurface: neutralPalette.tone(95),
    onSurfaceVariant: neutralVariantPalette.tone(80),
    outline: neutralVariantPalette.tone(60),
    outlineVariant: neutralVariantPalette.tone(30),

    scrim: neutralPalette.tone(0),
    inverseSurface: neutralPalette.tone(90),
    inverseOnSurface: neutralPalette.tone(20),
    inversePrimary: primaryPalette.tone(40),
  };

  // Light Theme
  const light: Material3Scheme = {
    primary: primaryPalette.tone(40),
    onPrimary: primaryPalette.tone(100),
    primaryContainer: primaryPalette.tone(90),
    onPrimaryContainer: primaryPalette.tone(10),
    primaryGlow: `${primaryPalette.tone(50)}55`,

    secondary: secondaryPalette.tone(40),
    onSecondary: secondaryPalette.tone(100),
    secondaryContainer: secondaryPalette.tone(90),
    onSecondaryContainer: secondaryPalette.tone(10),

    tertiary: tertiaryPalette.tone(40),
    onTertiary: tertiaryPalette.tone(100),
    tertiaryContainer: tertiaryPalette.tone(90),
    onTertiaryContainer: tertiaryPalette.tone(10),

    surface: neutralPalette.tone(98),
    surfaceDim: neutralPalette.tone(88),
    surfaceBright: neutralPalette.tone(100),
    surfaceContainerLowest: neutralPalette.tone(100),
    surfaceContainerLow: neutralPalette.tone(96),
    surfaceContainer: neutralPalette.tone(94),
    surfaceContainerHigh: neutralPalette.tone(92),
    surfaceContainerHighest: neutralPalette.tone(90),

    onSurface: neutralPalette.tone(10),
    onSurfaceVariant: neutralVariantPalette.tone(30),
    outline: neutralVariantPalette.tone(50),
    outlineVariant: neutralVariantPalette.tone(80),

    scrim: neutralPalette.tone(0),
    inverseSurface: neutralPalette.tone(20),
    inverseOnSurface: neutralPalette.tone(95),
    inversePrimary: primaryPalette.tone(80),
  };

  return { light, dark, seedHue: hue };
}

/**
 * Fast Color Quantizer to extract dominant vibrant colors from an image/canvas
 */
export function extractDominantColorFromImageData(data: Uint8ClampedArray): string {
  const colorBuckets: Record<string, { count: number; r: number; g: number; b: number }> = {};
  const step = 16; // sample every 16th pixel for high speed

  for (let i = 0; i < data.length; i += 4 * step) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    // Skip transparent or near-black / near-white pixels
    if (a < 128) continue;
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    if (luma < 25 || luma > 240) continue;

    // Quantize to 5-bit color space (32 levels per channel)
    const qR = r >> 3;
    const qG = g >> 3;
    const qB = b >> 3;
    const key = `${qR}_${qG}_${qB}`;

    if (!colorBuckets[key]) {
      colorBuckets[key] = { count: 1, r, g, b };
    } else {
      colorBuckets[key].count++;
    }
  }

  let bestBucket: { count: number; r: number; g: number; b: number } | null = null;
  let maxScore = -1;

  for (const bucket of Object.values(colorBuckets)) {
    const [h, s, l] = rgbToHsl(bucket.r, bucket.g, bucket.b);
    // Score based on frequency and saturation (vibrancy boost)
    const score = bucket.count * (1.0 + s * 2.0) * (l > 0.2 && l < 0.8 ? 1.5 : 0.8);
    if (score > maxScore) {
      maxScore = score;
      bestBucket = bucket;
    }
  }

  if (bestBucket) {
    return rgbToHex(bestBucket.r, bestBucket.g, bestBucket.b);
  }

  return '#a855f7'; // Default Cimo Neon Violet
}

/**
 * Apply Material 3 CSS custom properties dynamically to document root
 */
export function applyMaterialThemeToDom(scheme: Material3Scheme, isDark: boolean = true): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;

  root.style.setProperty('--md-sys-color-primary', scheme.primary);
  root.style.setProperty('--md-sys-color-on-primary', scheme.onPrimary);
  root.style.setProperty('--md-sys-color-primary-container', scheme.primaryContainer);
  root.style.setProperty('--md-sys-color-on-primary-container', scheme.onPrimaryContainer);
  root.style.setProperty('--md-sys-color-primary-glow', scheme.primaryGlow);

  root.style.setProperty('--md-sys-color-secondary', scheme.secondary);
  root.style.setProperty('--md-sys-color-on-secondary', scheme.onSecondary);
  root.style.setProperty('--md-sys-color-secondary-container', scheme.secondaryContainer);
  root.style.setProperty('--md-sys-color-on-secondary-container', scheme.onSecondaryContainer);

  root.style.setProperty('--md-sys-color-tertiary', scheme.tertiary);
  root.style.setProperty('--md-sys-color-on-tertiary', scheme.onTertiary);
  root.style.setProperty('--md-sys-color-tertiary-container', scheme.tertiaryContainer);
  root.style.setProperty('--md-sys-color-on-tertiary-container', scheme.onTertiaryContainer);

  root.style.setProperty('--md-sys-color-surface', scheme.surface);
  root.style.setProperty('--md-sys-color-surface-dim', scheme.surfaceDim);
  root.style.setProperty('--md-sys-color-surface-bright', scheme.surfaceBright);
  root.style.setProperty('--md-sys-color-surface-container-lowest', scheme.surfaceContainerLowest);
  root.style.setProperty('--md-sys-color-surface-container-low', scheme.surfaceContainerLow);
  root.style.setProperty('--md-sys-color-surface-container', scheme.surfaceContainer);
  root.style.setProperty('--md-sys-color-surface-container-high', scheme.surfaceContainerHigh);
  root.style.setProperty('--md-sys-color-surface-container-highest', scheme.surfaceContainerHighest);

  root.style.setProperty('--md-sys-color-on-surface', scheme.onSurface);
  root.style.setProperty('--md-sys-color-on-surface-variant', scheme.onSurfaceVariant);
  root.style.setProperty('--md-sys-color-outline', scheme.outline);
  root.style.setProperty('--md-sys-color-outline-variant', scheme.outlineVariant);

  // Map to legacy and active app variables seamlessly
  root.style.setProperty('--accent', scheme.primary);
  root.style.setProperty('--accent-neon', scheme.primary);
  root.style.setProperty('--accent-hover', scheme.primaryContainer);
  root.style.setProperty('--accent-glow', scheme.primaryGlow);
}
