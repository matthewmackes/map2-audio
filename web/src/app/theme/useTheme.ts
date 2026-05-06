import { useCallback, useEffect, useState } from 'react';
import { themes } from './themes';
import type { CarbonThemeId, Theme } from './types';

const THEME_STORAGE_KEY = 'theme';
const CUSTOM_THEMES_STORAGE_KEY = 'custom-themes';
const DEFAULT_THEME_ID = 'MAIN-DEFAULT';
const CARBON_THEME_EVENT = 'map2:theme-change';
const CARBON_THEME_CLASSES = ['cds--white', 'cds--g10', 'cds--g90', 'cds--g100', 'cds--blueprint'] as const;
const CUSTOM_CARBON_COLOR_TOKEN_MAP = {
  '--cds-background': 'bg',
  '--cds-background-hover': 'surface-2',
  '--cds-background-active': 'surface-3',
  '--cds-background-selected': 'surface-3',
  '--cds-background-selected-hover': 'surface-2',
  '--cds-background-inverse': 'text-primary',
  '--cds-background-brand': 'primary',
  '--cds-layer': 'surface',
  '--cds-layer-01': 'surface',
  '--cds-layer-02': 'surface-2',
  '--cds-layer-03': 'surface-3',
  '--cds-layer-hover': 'surface-2',
  '--cds-layer-active': 'surface-3',
  '--cds-layer-selected': 'surface-3',
  '--cds-layer-selected-hover': 'surface-2',
  '--cds-layer-accent': 'surface-3',
  '--cds-layer-accent-01': 'surface-3',
  '--cds-field': 'surface',
  '--cds-field-01': 'surface',
  '--cds-field-02': 'surface-2',
  '--cds-border-subtle': 'border',
  '--cds-border-subtle-00': 'border',
  '--cds-border-subtle-01': 'border',
  '--cds-border-subtle-02': 'border',
  '--cds-border-subtle-03': 'border',
  '--cds-border-strong': 'border-strong',
  '--cds-border-strong-01': 'border-strong',
  '--cds-border-strong-02': 'border-strong',
  '--cds-border-strong-03': 'border-strong',
  '--cds-border-interactive': 'interactive',
  '--cds-border-inverse': 'text-primary',
  '--cds-text-primary': 'text-primary',
  '--cds-text-secondary': 'text-secondary',
  '--cds-text-helper': 'text-tertiary',
  '--cds-text-placeholder': 'text-tertiary',
  '--cds-text-inverse': 'text-inverse',
  '--cds-text-on-color': 'text-inverse',
  '--cds-text-on-color-disabled': 'muted-2',
  '--cds-icon-primary': 'text-primary',
  '--cds-icon-secondary': 'text-secondary',
  '--cds-icon-on-color': 'text-inverse',
  '--cds-icon-on-color-disabled': 'muted-2',
  '--cds-link-primary': 'accent',
  '--cds-link-primary-hover': 'primary-strong',
  '--cds-link-secondary': 'accent',
  '--cds-link-visited': 'accent',
  '--cds-interactive': 'interactive',
  '--cds-button-primary': 'interactive',
  '--cds-button-primary-hover': 'interactive-hover',
  '--cds-button-primary-active': 'interactive-active',
  '--cds-button-secondary': 'primary-strong',
  '--cds-button-secondary-hover': 'interactive-hover',
  '--cds-button-secondary-active': 'interactive-active',
  '--cds-button-tertiary': 'interactive',
  '--cds-button-tertiary-hover': 'interactive-hover',
  '--cds-button-tertiary-active': 'interactive-active',
  '--cds-button-disabled': 'interactive-disabled',
  '--cds-support-success': 'support-success',
  '--cds-support-warning': 'support-warning',
  '--cds-support-error': 'support-danger',
  '--cds-support-info': 'support-info',
  '--cds-focus': 'focus-ring',
} as const;

const LEGACY_THEME_ALIASES: Record<string, string> = {
  g100: 'default',
  g90: 'gray-90',
  g10: 'gray-10',
  'midnight-studio': 'default',
  'sunset-warmth': 'default',
  'forest-calm': 'default',
  'eventide-eclipse': 'default',
  'material-dark': 'default',
  'material-blue': 'default',
  'material-teal': 'default',
  'material-pink': 'default',
  'material-amber': 'default',
};

function normalizeTheme(theme: Theme): Theme {
  return {
    ...theme,
    carbonTheme: theme.carbonTheme ?? 'g100',
  };
}

function resolveThemeId(themeId: string | null | undefined, availableThemes: Record<string, Theme>): string {
  if (themeId && availableThemes[themeId]) {
    return themeId;
  }

  const aliasedThemeId = themeId ? LEGACY_THEME_ALIASES[themeId] : undefined;
  if (aliasedThemeId && availableThemes[aliasedThemeId]) {
    return aliasedThemeId;
  }

  return DEFAULT_THEME_ID;
}

type CarbonBaseThemeId = Exclude<CarbonThemeId, 'blueprint'>;

/**
 * Resolve a CarbonThemeId to a value accepted by @carbon/react's Theme /
 * GlobalTheme components (which know only the 4 canonical shells). The
 * `blueprint` variant piggybacks on g100 Carbon internals while a separate
 * [data-carbon-theme="blueprint"] scope overrides --cds-* tokens.
 */
export function toCarbonBaseTheme(carbonTheme: CarbonThemeId | null | undefined): CarbonBaseThemeId {
  if (carbonTheme === 'blueprint' || !carbonTheme) return 'g100';
  return carbonTheme as CarbonBaseThemeId;
}

function applyCarbonThemeClass(carbonTheme: CarbonThemeId): void {
  if (typeof document === 'undefined') return;

  const className = `cds--${carbonTheme}`;
  const nodes = [document.documentElement, document.body].filter(Boolean) as HTMLElement[];

  nodes.forEach((node) => {
    node.classList.remove(...CARBON_THEME_CLASSES);
    node.classList.add(className);
    node.setAttribute('data-carbon-theme', carbonTheme);
  });
}

// Cycle 50 follow-up to cycle 49 (home-page theme fix): keep the
// `<meta name="theme-color">` tag synced to the active theme so the
// browser chrome (mobile status bar, PWA title bar) doesn't lock to
// the static `#161616` declared in index.html. We read the freshly
// applied `--cds-background` off the root and fall back to the same
// static value if the computed style isn't readable yet.
function syncThemeColorMeta(): void {
  if (typeof document === 'undefined') return;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) return;
  try {
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--cds-background').trim();
    if (bg) {
      meta.setAttribute('content', bg);
    }
  } catch {
    // getComputedStyle can throw in unusual document states (e.g. detached). Leave the static fallback.
  }
}

function emitThemeChange(themeId: string, carbonTheme: CarbonThemeId): void {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent(CARBON_THEME_EVENT, {
      detail: {
        themeId,
        carbonTheme,
      },
    }),
  );
}

function hasConcreteColorTokenOverrides(theme: Theme): boolean {
  return Object.values(theme.colors).some((value) => (
    typeof value === 'string'
    && value.startsWith('#')
    && !value.includes('var(')
  ));
}

function applyCustomCarbonColorTokens(root: HTMLElement, theme: Theme): void {
  Object.keys(CUSTOM_CARBON_COLOR_TOKEN_MAP).forEach((token) => {
    root.style.removeProperty(token);
  });

  if (!hasConcreteColorTokenOverrides(theme)) {
    return;
  }

  Object.entries(CUSTOM_CARBON_COLOR_TOKEN_MAP).forEach(([token, colorKey]) => {
    const value = theme.colors[colorKey as keyof Theme['colors']];
    if (typeof value === 'string' && !value.includes('var(')) {
      root.style.setProperty(token, value);
    }
  });
}

/**
 * Get custom themes from localStorage
 */
export function getCustomThemes(): Record<string, Theme> {
  if (typeof localStorage === 'undefined') {
    return {};
  }

  try {
    const stored = localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY);
    if (!stored) {
      return {};
    }

    const parsed = JSON.parse(stored) as Record<string, Theme>;
    return Object.fromEntries(
      Object.entries(parsed).map(([themeId, theme]) => [themeId, normalizeTheme(theme)]),
    );
  } catch {
    return {};
  }
}

/**
 * Save a custom theme to localStorage
 */
export function saveCustomTheme(theme: Theme): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    const customThemes = getCustomThemes();
    customThemes[theme.id] = normalizeTheme(theme);
    localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(customThemes));
  } catch (error) {
    console.error('Failed to save custom theme:', error);
  }
}

/**
 * Delete a custom theme from localStorage
 */
export function deleteCustomTheme(themeId: string): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    const customThemes = getCustomThemes();
    delete customThemes[themeId];
    localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(customThemes));
  } catch (error) {
    console.error('Failed to delete custom theme:', error);
  }
}

/**
 * Get all themes (built-in + custom)
 */
export function getAllThemes(): Record<string, Theme> {
  return { ...themes, ...getCustomThemes() };
}

/**
 * Apply a theme by setting CSS custom properties on the document root
 */
export function applyTheme(themeId: string): void {
  const availableThemes = getAllThemes();
  const resolvedThemeId = resolveThemeId(themeId, availableThemes);
  const theme = normalizeTheme(availableThemes[resolvedThemeId] ?? themes[DEFAULT_THEME_ID]);

  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    applyCarbonThemeClass(theme.carbonTheme ?? 'g100');
    applyCustomCarbonColorTokens(root, theme);

    Object.entries(theme.colors).forEach(([key, value]) => {
      if (key === 'color-scheme') {
        root.style.colorScheme = value;
      } else {
        root.style.setProperty(`--${key}`, value);
      }
    });

    Object.entries(theme.widgets).forEach(([key, value]) => {
      root.style.setProperty(`--${key}`, value);
    });

    syncThemeColorMeta();
  }

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, resolvedThemeId);
    } catch {
      // localStorage might not be available
    }
  }

  emitThemeChange(resolvedThemeId, theme.carbonTheme ?? 'g100');
}

/**
 * Get the currently saved theme ID from localStorage
 */
export function getSavedThemeId(): string {
  if (typeof localStorage === 'undefined') {
    return DEFAULT_THEME_ID;
  }

  try {
    const storedThemeId = localStorage.getItem(THEME_STORAGE_KEY);
    return resolveThemeId(storedThemeId, getAllThemes());
  } catch {
    return DEFAULT_THEME_ID;
  }
}

/**
 * Initialize theme on app load
 */
export function initializeTheme(): void {
  try {
    applyTheme(getSavedThemeId());
  } catch (error) {
    console.error('Failed to initialize theme:', error);
    try {
      applyTheme(DEFAULT_THEME_ID);
    } catch {
      // If even that fails, at least the app will load.
    }
  }
}

/**
 * Hook for accessing and changing the current theme
 */
export function useTheme() {
  const [currentThemeId, setCurrentThemeId] = useState<string>(getSavedThemeId);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const syncTheme = () => {
      setCurrentThemeId(getSavedThemeId());
    };

    window.addEventListener(CARBON_THEME_EVENT, syncTheme as EventListener);
    window.addEventListener('storage', syncTheme);

    return () => {
      window.removeEventListener(CARBON_THEME_EVENT, syncTheme as EventListener);
      window.removeEventListener('storage', syncTheme);
    };
  }, []);

  const currentTheme = normalizeTheme(getAllThemes()[currentThemeId] ?? themes[DEFAULT_THEME_ID]);

  const setTheme = useCallback((themeId: string) => {
    applyTheme(themeId);
    setCurrentThemeId(getSavedThemeId());
  }, []);

  useEffect(() => {
    applyTheme(currentThemeId);
  }, [currentThemeId]);

  return {
    theme: currentTheme,
    themeId: currentThemeId,
    setTheme,
    themes: getAllThemes(),
  };
}
