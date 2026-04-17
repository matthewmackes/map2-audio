import type { CarbonThemeId, Theme, ThemeColors } from './types';
import { PRESET_THEME_MAP, PRESET_THEME_ORDER } from './presetThemes';
import { baseWidgets } from './themeFactory';

function createThemeColors(carbonTheme: CarbonThemeId): ThemeColors {
  const colorScheme = carbonTheme === 'white' || carbonTheme === 'g10' ? 'light' : 'dark';

  return {
    bg: 'var(--cds-background)',
    surface: 'var(--cds-layer)',
    'surface-2': 'var(--cds-layer-hover)',
    'surface-3': 'var(--cds-layer-selected)',
    'surface-overlay': 'var(--cds-layer-hover)',
    interactive: 'var(--cds-button-primary)',
    'interactive-hover': 'var(--cds-button-primary-hover)',
    'interactive-active': 'var(--cds-button-primary-active)',
    'interactive-disabled': 'var(--cds-button-disabled)',
    primary: 'var(--cds-button-primary)',
    'primary-strong': 'var(--cds-button-primary-active)',
    accent: 'var(--cds-link-primary)',
    'text-primary': 'var(--cds-text-primary)',
    'text-secondary': 'var(--cds-text-secondary)',
    'text-tertiary': 'var(--cds-text-helper)',
    'text-inverse': 'var(--cds-text-inverse)',
    muted: 'var(--cds-text-secondary)',
    'muted-2': 'var(--cds-text-helper)',
    border: 'var(--cds-border-subtle)',
    'border-strong': 'var(--cds-border-strong)',
    'support-success': 'var(--cds-support-success)',
    'support-warning': 'var(--cds-support-warning)',
    'support-danger': 'var(--cds-support-error)',
    'support-info': 'var(--cds-support-info)',
    success: 'var(--cds-support-success)',
    warning: 'var(--cds-support-warning)',
    danger: 'var(--cds-support-error)',
    'bg-empty': 'var(--cds-layer)',
    'bg-offline': 'color-mix(in srgb, var(--cds-support-error) 16%, var(--cds-background))',
    'bg-fault': 'color-mix(in srgb, var(--cds-support-error) 24%, var(--cds-background))',
    'bg-warning': 'color-mix(in srgb, var(--cds-support-warning) 20%, var(--cds-background))',
    'focus-ring': 'var(--cds-focus)',
    'shadow-strong': 'none',
    'shadow-soft': 'none',
    'color-scheme': colorScheme,
  };
}

function createTheme(id: string, name: string, description: string, carbonTheme: CarbonThemeId): Theme {
  return {
    id,
    name,
    description,
    carbonTheme,
    colors: createThemeColors(carbonTheme),
    widgets: { ...baseWidgets },
  };
}

const coreThemes: Record<string, Theme> = {
  default: createTheme(
    'default',
    'Carbon gray 100',
    'Dark studio baseline with full Carbon gray 100 tokens across the app shell.',
    'g100',
  ),
  'gray-90': createTheme(
    'gray-90',
    'Carbon gray 90',
    'High-contrast dark theme with Carbon gray 90 surfaces and inverse focus treatment.',
    'g90',
  ),
  'gray-10': createTheme(
    'gray-10',
    'Carbon gray 10',
    'Light-neutral operator theme with Carbon gray 10 layering for longer desktop sessions.',
    'g10',
  ),
  white: createTheme(
    'white',
    'Carbon white',
    'Bright Carbon white theme for documentation-heavy work and daylight environments.',
    'white',
  ),
};

const coreThemeOrder = ['default', 'gray-90', 'gray-10', 'white'];

/** All built-in themes: 4 core Carbon shells + 100 preset themes. */
export const themes: Record<string, Theme> = {
  ...coreThemes,
  ...PRESET_THEME_MAP,
};

/** Ordered list of all built-in theme IDs for display. */
export const themeOrder = [...coreThemeOrder, ...PRESET_THEME_ORDER];
