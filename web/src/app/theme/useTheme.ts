import { useCallback, useEffect, useState } from 'react';
import { themes } from './themes';
import type { CarbonThemeId, Theme } from './types';

const THEME_STORAGE_KEY = 'theme';
const CUSTOM_THEMES_STORAGE_KEY = 'custom-themes';
const DEFAULT_THEME_ID = 'gray-10';
const CARBON_THEME_EVENT = 'map2:theme-change';
const CARBON_THEME_CLASSES = ['cds--white', 'cds--g10', 'cds--g90', 'cds--g100'] as const;

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
