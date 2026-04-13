import type { CarbonThemeId, Theme, ThemeColors } from './types';
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
  'border-radius-sm': '0px',
  'border-radius-md': '0px',
  'border-radius-lg': '4px',
  'border-width': '1px',
  'glow-intensity': '0',
  'transition-speed': '0.12s',
} as const;

/**
 * Generate a full Theme from a Carbon color family + a base shell (g100/g90/white/g10).
 * All color slots are resolved to concrete hex values so they can be individually overridden
 * by the ThemeChooserModal per-slot editor without relying on CDS CSS variable forwarding.
 */
export function generateThemeFromPalette(
  familyId: string,
  base: BaseShell,
  overrides: Partial<ThemeColors> = {},
  id?: string,
  name?: string,
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
    widgets: { ...baseWidgets },
  };
}
