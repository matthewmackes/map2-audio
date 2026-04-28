import type { CarbonThemeId, Theme, ThemeColors } from './types';
import type { ThemeWidgets } from './types';
import {
  CARBON_FAMILY_BY_ID,
  CARBON_NEUTRALS,
  primaryShadeForDark,
  primaryShadeForLight,
  accentShadeForDark,
  accentShadeForLight,
  type BaseShell,
} from './carbonPalette';

export const baseWidgets = {
  'border-radius-xs': '0px',
  'border-radius-sm': '0px',
  'border-radius-md': '0px',
  'border-radius-lg': '4px',
  'border-radius-xl': '6px',
  'border-radius-xxl': '10px',
  'border-width': '1px',
  'spacing-density-compact': '0.85',
  'spacing-density-default': '1',
  'spacing-density-spacious': '1.15',
  'widget-shadow': '0',
  'glow-intensity': '0',
  'transition-speed': '0.12s',
} as const;

/**
 * Generate a full Theme from a Carbon color family + a base shell (g100/g90/white/g10).
 * All color slots are resolved to concrete values so they can be individually overridden
 * by theme-management surfaces without relying on CDS CSS variable forwarding.
 */
export function generateThemeFromPalette(
  familyId: string,
  base: BaseShell,
  overrides: Partial<ThemeColors> = {},
  id?: string,
  name?: string,
  widgetOverrides: Partial<ThemeWidgets> = {},
): Theme {
  const family = CARBON_FAMILY_BY_ID[familyId] ?? CARBON_FAMILY_BY_ID['blue'];
  const isDark = base === 'g100' || base === 'g90';
  const carbonTheme = base as CarbonThemeId;
  const neutrals = isDark
    ? CARBON_NEUTRALS.dark[base as 'g100' | 'g90']
    : CARBON_NEUTRALS.light[base as 'white' | 'g10'];

  const primaryShade = isDark ? primaryShadeForDark(familyId) : primaryShadeForLight(familyId);
  const accentShade = isDark ? accentShadeForDark(familyId) : accentShadeForLight(familyId);
  const primaryHex = family.shades[primaryShade];
  const primaryStrongHex = family.shades[Math.min(primaryShade + 10, 100)];
  const accentHex = family.shades[accentShade];

  const successHex = isDark ? '#42be65' : '#198038';
  const warningHex = isDark ? '#f1c21b' : '#8e6a00';
  const dangerHex = isDark ? '#fa4d56' : '#da1e28';
  const infoHex = isDark ? '#4589ff' : '#0f62fe';

  const colorScheme: 'dark' | 'light' = isDark ? 'dark' : 'light';

  const generated: ThemeColors = {
    bg: neutrals.bg,
    surface: neutrals.l01,
    'surface-2': neutrals.l02,
    'surface-3': neutrals.l03,
    'surface-overlay': neutrals.l02,
    interactive: primaryHex,
    'interactive-hover': primaryStrongHex,
    'interactive-active': family.shades[Math.min(primaryShade + 20, 100)],
    'interactive-disabled': isDark ? '#525252' : '#c6c6c6',
    primary: primaryHex,
    'primary-strong': primaryStrongHex,
    accent: accentHex,
    'text-primary': neutrals.textPrimary,
    'text-secondary': neutrals.textSecondary,
    'text-tertiary': neutrals.textHelper,
    'text-inverse': neutrals.textInverse,
    muted: neutrals.textSecondary,
    'muted-2': neutrals.textHelper,
    border: neutrals.border,
    'border-strong': neutrals.borderStrong,
    'support-success': successHex,
    'support-warning': warningHex,
    'support-danger': dangerHex,
    'support-info': infoHex,
    success: successHex,
    warning: warningHex,
    danger: dangerHex,
    'bg-empty': neutrals.l01,
    'bg-offline': `color-mix(in srgb, ${dangerHex} 16%, ${neutrals.bg})`,
    'bg-fault': `color-mix(in srgb, ${dangerHex} 24%, ${neutrals.bg})`,
    'bg-warning': `color-mix(in srgb, ${warningHex} 20%, ${neutrals.bg})`,
    'focus-ring': accentHex,
    'shadow-strong': isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.2)',
    'shadow-soft': isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.08)',
    'color-scheme': colorScheme,
    ...overrides,
  };

  const themeId = id ?? `custom-${familyId}-${base}`;
  const themeName =
    name ??
    `${family.name} / ${
      base === 'g100'
        ? 'Gray 100'
        : base === 'g90'
          ? 'Gray 90'
          : base === 'g10'
            ? 'Gray 10'
            : 'White'
    }`;

  return {
    id: themeId,
    name: themeName,
    description: `Carbon ${family.name} palette on ${isDark ? 'dark' : 'light'} (${base}) shell.`,
    carbonTheme,
    colors: generated,
    widgets: {
      ...baseWidgets,
      ...widgetOverrides,
    },
  };
}

// =============================================================================
// validateThemeContract — Carbon discipline contract enforcement
// =============================================================================
//
// Q4=E (locked) requires every generated theme to pass a formal discipline
// contract: contrast, gray-dominance, glow-bound, required-keys. This
// function checks all four and returns a structured result. It does not
// throw. Callers (theme authors, custom-theme dialog, tests) decide what
// to do with violations.
//
// The contract:
//   1. Required keys — every key in the canonical ThemeColors interface is
//      present and is a non-empty string. Catches partial overrides that
//      drop required slots.
//   2. Contrast — text-primary on bg meets WCAG AA (>= 4.5:1 for normal
//      text). Gates illegible themes.
//   3. Gray-dominance — bg, surface, surface-2, surface-3 are within the
//      Carbon neutral ramp (saturation < 12%). Prevents themes from
//      tinting surfaces with the brand color.
//   4. Glow-bound — widgets['glow-intensity'] === '0' and
//      widgets['widget-shadow'] === '0'. Carbon discipline forbids
//      decorative glow.
//
// Contrast computation uses the standard WCAG relative-luminance formula.
// Saturation uses the HSL S channel from the parsed RGB.

export interface ThemeContractViolation {
  rule: 'required-keys' | 'contrast' | 'gray-dominance' | 'glow-bound';
  detail: string;
}

export interface ThemeContractResult {
  ok: boolean;
  violations: ThemeContractViolation[];
}

const REQUIRED_COLOR_KEYS: ReadonlyArray<keyof ThemeColors> = [
  'bg',
  'surface',
  'surface-2',
  'surface-3',
  'surface-overlay',
  'interactive',
  'interactive-hover',
  'interactive-active',
  'interactive-disabled',
  'primary',
  'primary-strong',
  'accent',
  'text-primary',
  'text-secondary',
  'text-tertiary',
  'text-inverse',
  'muted',
  'muted-2',
  'border',
  'border-strong',
  'support-success',
  'support-warning',
  'support-danger',
  'support-info',
  'success',
  'warning',
  'danger',
  'bg-empty',
  'bg-offline',
  'bg-fault',
  'bg-warning',
  'focus-ring',
  'shadow-strong',
  'shadow-soft',
  'color-scheme',
];

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = HEX_RE.exec(hex.trim());
  if (!match) return null;
  let body = match[1];
  if (body.length === 3) {
    body = body.split('').map((c) => c + c).join('');
  }
  const value = parseInt(body, 16);
  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff,
  };
}

function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const channel = (c: number): number => {
    const sRGB = c / 255;
    return sRGB <= 0.03928 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

function contrastRatio(fgHex: string, bgHex: string): number | null {
  const fg = hexToRgb(fgHex);
  const bg = hexToRgb(bgHex);
  if (!fg || !bg) return null;
  const lFg = relativeLuminance(fg);
  const lBg = relativeLuminance(bg);
  const lighter = Math.max(lFg, lBg);
  const darker = Math.min(lFg, lBg);
  return (lighter + 0.05) / (darker + 0.05);
}

function saturationOf(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return 0;
  const d = max - min;
  return l > 0.5 ? d / (2 - max - min) : d / (max + min);
}

const GRAY_DOMINANT_SATURATION_LIMIT = 0.12;
const CONTRAST_AA_NORMAL = 4.5;

/**
 * Validate that a Theme satisfies the MAP2 Carbon discipline contract.
 *
 * Returns { ok: false, violations: [...] } if any rule fails. Non-throwing
 * by design — callers (theme dialog, tests, theme authors) decide whether
 * to surface violations as warnings or block save.
 */
export function validateThemeContract(theme: Theme): ThemeContractResult {
  const violations: ThemeContractViolation[] = [];

  // 1. required-keys
  for (const key of REQUIRED_COLOR_KEYS) {
    const value = theme.colors[key];
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
      violations.push({
        rule: 'required-keys',
        detail: `colors.${String(key)} is missing or empty`,
      });
    }
  }

  // 2. contrast — text-primary on bg
  // Only check if both values are concrete hex (var(...) references resolve
  // at runtime and we can't validate them statically — they're trusted to
  // forward Carbon's own AA-compliant pairings).
  const textPrimary = theme.colors['text-primary'];
  const bg = theme.colors.bg;
  if (typeof textPrimary === 'string' && typeof bg === 'string'
      && HEX_RE.test(textPrimary) && HEX_RE.test(bg)) {
    const ratio = contrastRatio(textPrimary, bg);
    if (ratio !== null && ratio < CONTRAST_AA_NORMAL) {
      violations.push({
        rule: 'contrast',
        detail: `text-primary (${textPrimary}) on bg (${bg}) contrast ${ratio.toFixed(2)}:1 is below WCAG AA 4.5:1`,
      });
    }
  }

  // 3. gray-dominance — surfaces must be near-neutral
  const surfaceKeys: ReadonlyArray<keyof ThemeColors> = ['bg', 'surface', 'surface-2', 'surface-3'];
  for (const key of surfaceKeys) {
    const value = theme.colors[key];
    if (typeof value === 'string' && HEX_RE.test(value)) {
      const sat = saturationOf(value);
      if (sat !== null && sat > GRAY_DOMINANT_SATURATION_LIMIT) {
        violations.push({
          rule: 'gray-dominance',
          detail: `colors.${String(key)} (${value}) saturation ${(sat * 100).toFixed(1)}% exceeds ${(GRAY_DOMINANT_SATURATION_LIMIT * 100).toFixed(0)}% — surfaces must be near-neutral`,
        });
      }
    }
  }

  // 4. glow-bound — widget-shadow and glow-intensity must be '0'
  if (theme.widgets['glow-intensity'] !== '0') {
    violations.push({
      rule: 'glow-bound',
      detail: `widgets['glow-intensity'] is '${theme.widgets['glow-intensity']}' — Carbon discipline requires '0'`,
    });
  }
  if (theme.widgets['widget-shadow'] !== '0') {
    violations.push({
      rule: 'glow-bound',
      detail: `widgets['widget-shadow'] is '${theme.widgets['widget-shadow']}' — Carbon discipline requires '0'`,
    });
  }

  return {
    ok: violations.length === 0,
    violations,
  };
}
