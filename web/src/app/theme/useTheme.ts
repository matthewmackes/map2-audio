import { useState, useEffect, useCallback } from 'react';
import { themes } from './themes';
import type { Theme } from './types';

const THEME_STORAGE_KEY = 'theme';
const CUSTOM_THEMES_STORAGE_KEY = 'custom-themes';
const DEFAULT_THEME_ID = 'default';

/**
 * Get custom themes from localStorage
 */
export function getCustomThemes(): Record<string, Theme> {
  try {
    const stored = localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

/**
 * Save a custom theme to localStorage
 */
export function saveCustomTheme(theme: Theme): void {
  try {
    const customThemes = getCustomThemes();
    customThemes[theme.id] = theme;
    localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(customThemes));
  } catch (e) {
    console.error('Failed to save custom theme:', e);
  }
}

/**
 * Delete a custom theme from localStorage
 */
export function deleteCustomTheme(themeId: string): void {
  try {
    const customThemes = getCustomThemes();
    delete customThemes[themeId];
    localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(customThemes));
  } catch (e) {
    console.error('Failed to delete custom theme:', e);
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
  const allThemes = getAllThemes();
  const theme = allThemes[themeId];
  if (!theme) {
    console.warn(`Theme "${themeId}" not found, falling back to default`);
    if (themeId !== DEFAULT_THEME_ID) {
      applyTheme(DEFAULT_THEME_ID);
    }
    return;
  }

  const root = document.documentElement;

  // Apply color variables
  if (theme.colors) {
    Object.entries(theme.colors).forEach(([key, value]) => {
      if (key === 'color-scheme') {
        root.style.colorScheme = value;
      } else {
        root.style.setProperty(`--${key}`, value);
      }
    });
  }

  // Apply widget style variables
  if (theme.widgets) {
    Object.entries(theme.widgets).forEach(([key, value]) => {
      root.style.setProperty(`--${key}`, value);
    });
  }

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
  try {
    const savedThemeId = getSavedThemeId();
    applyTheme(savedThemeId);
  } catch (e) {
    console.error('Failed to initialize theme:', e);
    // Apply default theme as fallback
    try {
      applyTheme(DEFAULT_THEME_ID);
    } catch {
      // If even that fails, at least the app will load
    }
  }
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
    themes
  };
}
