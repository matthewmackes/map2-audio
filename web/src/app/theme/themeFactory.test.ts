import '@testing-library/jest-dom';

import { generateThemeFromPalette, validateThemeContract } from './themeFactory';
import type { Theme, ThemeColors } from './types';

describe('validateThemeContract', () => {
  it('passes the canonical g100 + blue theme', () => {
    const theme = generateThemeFromPalette('blue', 'g100');
    const result = validateThemeContract(theme);
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('passes the canonical g10 + blue theme', () => {
    const theme = generateThemeFromPalette('blue', 'g10');
    const result = validateThemeContract(theme);
    expect(result.ok).toBe(true);
  });

  it('passes every Carbon family on g100', () => {
    const families = ['blue', 'cyan', 'teal', 'green', 'purple', 'magenta', 'red', 'orange', 'yellow', 'gray', 'coolGray', 'warmGray'];
    for (const familyId of families) {
      const theme = generateThemeFromPalette(familyId, 'g100');
      const result = validateThemeContract(theme);
      expect(result.ok).toBe(true);
    }
  });

  it('flags missing required color keys', () => {
    const theme = generateThemeFromPalette('blue', 'g100');
    const broken: Theme = {
      ...theme,
      colors: { ...theme.colors, 'text-primary': '' as unknown as string },
    };
    const result = validateThemeContract(broken);
    expect(result.ok).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({ rule: 'required-keys' }),
    );
  });

  it('flags low contrast between text-primary and bg', () => {
    // Dark gray text on dark gray bg — fails AA.
    const theme = generateThemeFromPalette('blue', 'g100');
    const broken: Theme = {
      ...theme,
      colors: {
        ...theme.colors,
        'text-primary': '#1c1c1c',
        bg: '#161616',
      },
    };
    const result = validateThemeContract(broken);
    expect(result.ok).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({ rule: 'contrast' }),
    );
  });

  it('flags surfaces tinted beyond gray-dominance limit', () => {
    const theme = generateThemeFromPalette('blue', 'g100');
    const broken: Theme = {
      ...theme,
      colors: {
        ...theme.colors,
        // Saturated red on the bg slot — should trip gray-dominance.
        bg: '#cc2233',
      },
    };
    const result = validateThemeContract(broken);
    expect(result.ok).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({ rule: 'gray-dominance' }),
    );
  });

  it('flags non-zero glow-intensity', () => {
    const theme = generateThemeFromPalette('blue', 'g100');
    const broken: Theme = {
      ...theme,
      widgets: { ...theme.widgets, 'glow-intensity': '0.5' },
    };
    const result = validateThemeContract(broken);
    expect(result.ok).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({ rule: 'glow-bound' }),
    );
  });

  it('flags non-zero widget-shadow', () => {
    const theme = generateThemeFromPalette('blue', 'g100');
    const broken: Theme = {
      ...theme,
      widgets: { ...theme.widgets, 'widget-shadow': '4px' },
    };
    const result = validateThemeContract(broken);
    expect(result.ok).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({ rule: 'glow-bound' }),
    );
  });

  it('skips contrast and gray-dominance checks for var() references', () => {
    // CSS-variable-forwarding themes reference Carbon's own AA-compliant
    // tokens at runtime. We can't validate them statically — they pass the
    // discipline contract by trusting Carbon's pairings.
    const theme: Theme = {
      id: 'cds-forward',
      name: 'CDS Forward',
      description: 'CSS-variable-forwarding theme',
      carbonTheme: 'g100',
      colors: {
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
        'color-scheme': 'dark',
      } satisfies ThemeColors,
      widgets: {
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
      },
    };
    const result = validateThemeContract(theme);
    expect(result.ok).toBe(true);
  });
});
