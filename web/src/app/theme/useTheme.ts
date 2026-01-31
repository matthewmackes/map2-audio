import { useState, useEffect, useCallback } from 'react';
import { themes } from './themes';
import type { Theme } from './types';

const THEME_STORAGE_KEY = 'theme';
const DEFAULT_THEME_ID = 'default';

/**
 * Apply a theme by setting CSS custom properties on the document root
 */
export function applyTheme(themeId: string): void {
  const theme = themes[themeId];
  if (!theme) {
    console.warn(`Theme "${themeId}" not found, falling back to default`);
    applyTheme(DEFAULT_THEME_ID);
    return;
  }

  const root = document.documentElement;

  // Apply color variables
  Object.entries(theme.colors).forEach(([key, value]) => {
    if (key === 'color-scheme') {
      root.style.colorScheme = value;
    } else {
      root.style.setProperty(`--${key}`, value);
    }
  });

  // Apply widget style variables
  Object.entries(theme.widgets).forEach(([key, value]) => {
    root.style.setProperty(`--${key}`, value);
  });

  // Store the theme preference
  try {
    localStorage.setItem(THEME_STORAGE_KEY, themeId);
  } catch {
    // localStorage might not be available
  }
}

/**
 * Get the currently saved theme ID from localStorage
 */
export function getSavedThemeId(): string {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

/**
 * Initialize theme on app load
 */
export function initializeTheme(): void {
  const savedThemeId = getSavedThemeId();
  applyTheme(savedThemeId);
}

/**
 * Hook for accessing and changing the current theme
 */
export function useTheme() {
  const [currentThemeId, setCurrentThemeId] = useState<string>(getSavedThemeId);

  const currentTheme: Theme = themes[currentThemeId] || themes[DEFAULT_THEME_ID];

  const setTheme = useCallback((themeId: string) => {
    if (themes[themeId]) {
      applyTheme(themeId);
      setCurrentThemeId(themeId);
    }
  }, []);

  // Apply theme on mount
  useEffect(() => {
    applyTheme(currentThemeId);
  }, []);

  return {
    theme: currentTheme,
    themeId: currentThemeId,
    setTheme,
    themes,
    isDark: currentTheme.colors['color-scheme'] === 'dark',
    isLight: currentTheme.colors['color-scheme'] === 'light'
  };
}
