import { baseWidgets } from './themeFactory';
import type { Theme, ThemeColors } from './types';
import type { BaseShell } from './carbonPalette';

export type PublicPaletteRole = 'brand' | 'accent' | 'neutral' | 'support';

export interface PublicPaletteColor {
  name: string;
  hex: string;
  role?: PublicPaletteRole;
}

export interface PublicPaletteSet {
  id: string;
  name: string;
  collection: string;
  description: string;
  sourceName: string;
  sourceUrl: string;
  licenseNote: string;
  colors: PublicPaletteColor[];
}

export interface PaletteThemeManifest {
  schema: 'map2-theme-palette-manifest/v1';
  exportedAt: string;
  palette: PublicPaletteSet;
  theme: Theme;
}

export interface CarbonSemanticTokenRow {
  token: string;
  role: string;
  colorKey: keyof ThemeColors;
  value: string;
  sourceColor: string;
}

const PANTONE_PUBLIC_LICENSE_NOTE =
  'Public web reference only. MAP2 does not bundle the full Pantone digital libraries; operators should import licensed Pantone Connect or vendor-approved palette manifests when exact standards are required.';

export const PUBLIC_PANTONE_PALETTE_SETS: PublicPaletteSet[] = [
  {
    id: 'pantone-coty-2026-cloud-dancer-public',
    name: 'Cloud Dancer public reference',
    collection: 'Pantone Color of the Year 2026',
    description: 'A quiet warm-white brand seed with MAP2-generated companion accents for digital UI theming.',
    sourceName: 'Pantone Color of the Year 2026 public announcement plus public digital approximations',
    sourceUrl: 'https://www.pantone.com/color-of-the-year/2026',
    licenseNote: PANTONE_PUBLIC_LICENSE_NOTE,
    colors: [
      { name: 'PANTONE 11-4201 Cloud Dancer', hex: '#f0eee9', role: 'brand' },
      { name: 'Quiet graphite companion', hex: '#2a2928', role: 'neutral' },
      { name: 'Mineral blue companion', hex: '#4d6f80', role: 'accent' },
      { name: 'Verdant companion', hex: '#4f7b58', role: 'support' },
      { name: 'Clay signal companion', hex: '#9b5548', role: 'support' },
      { name: 'Sunlit brass companion', hex: '#be8b2c', role: 'support' },
    ],
  },
  {
    id: 'pantone-coty-2025-mocha-mousse-public',
    name: 'Mocha Mousse public reference',
    collection: 'Pantone Color of the Year 2025',
    description: 'Warm brown public-reference palette tuned for brand-led Carbon shells and operational status colors.',
    sourceName: 'Pantone Color of the Year 2025 public references',
    sourceUrl: 'https://connect.pantone.com/color-insider/color-of-the-year-2025-the-color-palettes',
    licenseNote: PANTONE_PUBLIC_LICENSE_NOTE,
    colors: [
      { name: 'PANTONE 17-1230 Mocha Mousse', hex: '#a47864', role: 'brand' },
      { name: 'PANTONE 533 C public palette reference', hex: '#1f2a44', role: 'neutral' },
      { name: 'PANTONE 5483 C public palette reference', hex: '#4f868e', role: 'accent' },
      { name: 'PANTONE 7742 C public palette reference', hex: '#456d35', role: 'support' },
      { name: 'PANTONE 150 C public palette reference', hex: '#ffb25b', role: 'support' },
      { name: 'PANTONE 7624 C public palette reference', hex: '#802f2d', role: 'support' },
    ],
  },
  {
    id: 'pantone-coty-2024-peach-fuzz-public',
    name: 'Peach Fuzz public reference',
    collection: 'Pantone Color of the Year 2024',
    description: 'Soft peach public-reference seed mapped to a Carbon-compliant UI target with cooler control accents.',
    sourceName: 'Pantone Color of the Year 2024 public references',
    sourceUrl: 'https://www.pantone.com/color-of-the-year/2024',
    licenseNote: PANTONE_PUBLIC_LICENSE_NOTE,
    colors: [
      { name: 'PANTONE 13-1023 Peach Fuzz', hex: '#ffbe98', role: 'brand' },
      { name: 'Deep fig companion', hex: '#51304f', role: 'neutral' },
      { name: 'Blue slate companion', hex: '#476a80', role: 'accent' },
      { name: 'Sage companion', hex: '#6f8f65', role: 'support' },
      { name: 'Amber companion', hex: '#c98c3a', role: 'support' },
      { name: 'Red clay companion', hex: '#9f4438', role: 'support' },
    ],
  },
];

const CARBON_SEMANTIC_TOKEN_BINDINGS: Array<{
  token: string;
  role: string;
  colorKey: keyof ThemeColors;
}> = [
  { token: '--cds-background', role: 'Page and UI shell base', colorKey: 'bg' },
  { token: '--cds-layer-01', role: 'Primary container layer', colorKey: 'surface' },
  { token: '--cds-layer-02', role: 'Nested container layer', colorKey: 'surface-2' },
  { token: '--cds-layer-03', role: 'Elevated nested layer', colorKey: 'surface-3' },
  { token: '--cds-text-primary', role: 'Primary readable text', colorKey: 'text-primary' },
  { token: '--cds-text-secondary', role: 'Secondary readable text', colorKey: 'text-secondary' },
  { token: '--cds-button-primary', role: 'Primary interactive action', colorKey: 'interactive' },
  { token: '--cds-link-primary', role: 'Accent links and active affordances', colorKey: 'accent' },
  { token: '--cds-focus', role: 'Keyboard focus ring', colorKey: 'focus-ring' },
  { token: '--cds-border-subtle', role: 'Subtle separators', colorKey: 'border' },
  { token: '--cds-border-strong', role: 'Strong boundaries', colorKey: 'border-strong' },
  { token: '--cds-support-success', role: 'Success state', colorKey: 'support-success' },
  { token: '--cds-support-warning', role: 'Warning state', colorKey: 'support-warning' },
  { token: '--cds-support-error', role: 'Error and danger state', colorKey: 'support-danger' },
  { token: '--cds-support-info', role: 'Informational state', colorKey: 'support-info' },
];

function normalizeHex(hex: string): string {
  const trimmed = hex.trim().replace(/^#/, '');
  const expanded = trimmed.length === 3
    ? trimmed.split('').map((channel) => `${channel}${channel}`).join('')
    : trimmed;

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    return '#000000';
  }

  return `#${expanded.toLowerCase()}`;
}

function hexToRgb(hex: string): { red: number; green: number; blue: number } {
  const normalized = normalizeHex(hex).slice(1);

  return {
    red: Number.parseInt(normalized.slice(0, 2), 16),
    green: Number.parseInt(normalized.slice(2, 4), 16),
    blue: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0'))
    .join('')}`;
}

function mixHex(left: string, right: string, amount: number): string {
  const leftRgb = hexToRgb(left);
  const rightRgb = hexToRgb(right);
  const ratio = Math.max(0, Math.min(1, amount));

  return rgbToHex(
    leftRgb.red + ((rightRgb.red - leftRgb.red) * ratio),
    leftRgb.green + ((rightRgb.green - leftRgb.green) * ratio),
    leftRgb.blue + ((rightRgb.blue - leftRgb.blue) * ratio),
  );
}

function relativeLuminance(hex: string): number {
  const { red, green, blue } = hexToRgb(hex);
  const channels = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

function contrastRatio(left: string, right: string): number {
  const leftLum = relativeLuminance(left);
  const rightLum = relativeLuminance(right);
  const lighter = Math.max(leftLum, rightLum);
  const darker = Math.min(leftLum, rightLum);

  return (lighter + 0.05) / (darker + 0.05);
}

function readableForeground(background: string): string {
  return contrastRatio(background, '#161616') >= contrastRatio(background, '#f4f4f4')
    ? '#161616'
    : '#f4f4f4';
}

function ensureContrast(color: string, background: string, targetRatio: number): string {
  let candidate = normalizeHex(color);
  if (contrastRatio(candidate, background) >= targetRatio) {
    return candidate;
  }

  const foreground = readableForeground(background);
  for (let step = 1; step <= 10; step += 1) {
    candidate = mixHex(color, foreground, step / 10);
    if (contrastRatio(candidate, background) >= targetRatio) {
      return candidate;
    }
  }

  return foreground;
}

function rgbToHue(hex: string): number {
  const { red, green, blue } = hexToRgb(hex);
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  if (delta === 0) return 0;
  if (max === r) return (60 * (((g - b) / delta) % 6) + 360) % 360;
  if (max === g) return 60 * (((b - r) / delta) + 2);
  return 60 * (((r - g) / delta) + 4);
}

function hueDistance(left: number, right: number): number {
  const delta = Math.abs(left - right) % 360;
  return Math.min(delta, 360 - delta);
}

function pickByHue(colors: PublicPaletteColor[], targetHue: number, fallback: string): string {
  if (!colors.length) {
    return fallback;
  }

  return normalizeHex(
    [...colors].sort((left, right) => (
      hueDistance(rgbToHue(left.hex), targetHue) - hueDistance(rgbToHue(right.hex), targetHue)
    ))[0]?.hex ?? fallback,
  );
}

function sortedPaletteColors(palette: PublicPaletteSet): PublicPaletteColor[] {
  return palette.colors
    .map((color) => ({ ...color, hex: normalizeHex(color.hex) }))
    .filter((color) => /^#[0-9a-f]{6}$/.test(color.hex));
}

function paletteSourceForColor(palette: PublicPaletteSet, colorValue: string): string {
  const normalized = normalizeHex(colorValue);
  const direct = palette.colors.find((color) => normalizeHex(color.hex) === normalized);

  return direct?.name ?? 'MAP2 generated contrast mix';
}

export function mapPublicPaletteToTheme(
  palette: PublicPaletteSet,
  base: BaseShell,
  id?: string,
  name?: string,
): Theme {
  const colors = sortedPaletteColors(palette);
  const isDark = base === 'g100' || base === 'g90';
  const colorScheme: 'dark' | 'light' = isDark ? 'dark' : 'light';
  const sortedByLum = [...colors].sort((left, right) => relativeLuminance(left.hex) - relativeLuminance(right.hex));
  const brandSeed = colors.find((color) => color.role === 'brand') ?? colors[0] ?? { hex: '#0f62fe', name: 'Carbon blue' };
  const brand = normalizeHex(brandSeed.hex);
  const bgSeed = isDark
    ? sortedByLum[0]?.hex ?? '#161616'
    : sortedByLum[sortedByLum.length - 1]?.hex ?? '#ffffff';
  const bg = ensureContrast(bgSeed, isDark ? '#f4f4f4' : '#161616', 7);
  const textPrimary = readableForeground(bg);
  const textSecondary = mixHex(textPrimary, bg, isDark ? 0.24 : 0.38);
  const textTertiary = mixHex(textPrimary, bg, isDark ? 0.46 : 0.54);
  const surfaceStep = isDark ? '#f4f4f4' : '#161616';
  const surface = mixHex(bg, surfaceStep, isDark ? 0.06 : 0.035);
  const surface2 = mixHex(bg, surfaceStep, isDark ? 0.11 : 0.075);
  const surface3 = mixHex(bg, surfaceStep, isDark ? 0.17 : 0.12);
  const interactive = ensureContrast(brand, bg, 3);
  const interactiveHover = ensureContrast(mixHex(interactive, textPrimary, isDark ? 0.16 : 0.12), bg, 3);
  const interactiveActive = ensureContrast(mixHex(interactive, textPrimary, isDark ? 0.28 : 0.2), bg, 3);
  const accentCandidates = colors.filter((color) => color.role === 'accent' || normalizeHex(color.hex) !== brand);
  const accent = ensureContrast((accentCandidates[0] ?? colors[1] ?? brandSeed).hex, bg, 3);
  const supportCandidates = colors.filter((color) => color.role === 'support' || normalizeHex(color.hex) !== brand);
  const success = ensureContrast(pickByHue(supportCandidates, 130, isDark ? '#42be65' : '#198038'), bg, 2.2);
  const warning = ensureContrast(pickByHue(supportCandidates, 45, isDark ? '#f1c21b' : '#8e6a00'), bg, 2.2);
  const danger = ensureContrast(pickByHue(supportCandidates, 5, isDark ? '#fa4d56' : '#da1e28'), bg, 2.2);
  const info = ensureContrast(pickByHue(accentCandidates, 210, isDark ? '#4589ff' : '#0f62fe'), bg, 2.2);
  const border = mixHex(textPrimary, bg, isDark ? 0.72 : 0.82);
  const borderStrong = mixHex(textPrimary, bg, isDark ? 0.58 : 0.68);

  const themeColors: ThemeColors = {
    bg,
    surface,
    'surface-2': surface2,
    'surface-3': surface3,
    'surface-overlay': surface2,
    interactive,
    'interactive-hover': interactiveHover,
    'interactive-active': interactiveActive,
    'interactive-disabled': isDark ? '#525252' : '#c6c6c6',
    primary: interactive,
    'primary-strong': interactiveActive,
    accent,
    'text-primary': textPrimary,
    'text-secondary': textSecondary,
    'text-tertiary': textTertiary,
    'text-inverse': readableForeground(interactiveActive),
    muted: textSecondary,
    'muted-2': textTertiary,
    border,
    'border-strong': borderStrong,
    'support-success': success,
    'support-warning': warning,
    'support-danger': danger,
    'support-info': info,
    success,
    warning,
    danger,
    'bg-empty': surface,
    'bg-offline': `color-mix(in srgb, ${danger} 16%, ${bg})`,
    'bg-fault': `color-mix(in srgb, ${danger} 24%, ${bg})`,
    'bg-warning': `color-mix(in srgb, ${warning} 20%, ${bg})`,
    'focus-ring': accent,
    'shadow-strong': isDark ? 'rgba(0,0,0,0.58)' : 'rgba(0,0,0,0.22)',
    'shadow-soft': isDark ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.08)',
    'color-scheme': colorScheme,
  };

  return {
    id: id ?? `custom-public-palette-${palette.id}-${base}`,
    name: name ?? `${palette.name} / ${base.toUpperCase()}`,
    description: `${palette.collection} mapped into MAP2 Carbon semantic tokens from a brand-priority public palette manifest.`,
    carbonTheme: base,
    colors: themeColors,
    widgets: { ...baseWidgets },
  };
}

export function buildCarbonSemanticTokenRows(palette: PublicPaletteSet, theme: Theme): CarbonSemanticTokenRow[] {
  return CARBON_SEMANTIC_TOKEN_BINDINGS.map((binding) => {
    const value = theme.colors[binding.colorKey];

    return {
      ...binding,
      value,
      sourceColor: typeof value === 'string' && value.startsWith('#')
        ? paletteSourceForColor(palette, value)
        : 'MAP2 generated state mix',
    };
  });
}

export function createPaletteThemeManifest(palette: PublicPaletteSet, theme: Theme): PaletteThemeManifest {
  return {
    schema: 'map2-theme-palette-manifest/v1',
    exportedAt: new Date().toISOString(),
    palette,
    theme,
  };
}

export function coercePaletteSetsFromManifest(input: unknown): PublicPaletteSet[] {
  const candidates = Array.isArray(input)
    ? input
    : typeof input === 'object' && input !== null && 'palette' in input
      ? [(input as { palette?: unknown }).palette]
      : typeof input === 'object' && input !== null && 'palettes' in input
        ? (input as { palettes?: unknown }).palettes
        : [];

  if (!Array.isArray(candidates)) {
    return [];
  }

  return candidates
    .filter((candidate): candidate is PublicPaletteSet => {
      if (typeof candidate !== 'object' || candidate === null) {
        return false;
      }

      const palette = candidate as Partial<PublicPaletteSet>;
      return Boolean(
        palette.id
        && palette.name
        && palette.collection
        && palette.sourceUrl
        && Array.isArray(palette.colors)
        && palette.colors.length > 0,
      );
    })
    .map((palette) => ({
      ...palette,
      colors: palette.colors.map((color) => ({
        ...color,
        hex: normalizeHex(color.hex),
      })),
      licenseNote: palette.licenseNote || 'Imported public palette manifest. Verify rights before production use.',
    }));
}
