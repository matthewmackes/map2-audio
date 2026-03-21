import { useCallback, useEffect, useState } from 'react';

export type PlatformFontPresetId = 'ibm-plex-sans' | 'roboto' | 'system-ui';

export interface PlatformFontPreset {
  id: PlatformFontPresetId;
  name: string;
  description: string;
  family: string;
  accent: string;
  sample: string;
}

const PLATFORM_FONT_STORAGE_KEY = 'map2.platform-font-preset.v1';
const PLATFORM_FONT_EVENT = 'map2:platform-font-change';
const DEFAULT_PLATFORM_FONT_ID: PlatformFontPresetId = 'ibm-plex-sans';

export const PLATFORM_FONT_PRESETS: Record<PlatformFontPresetId, PlatformFontPreset> = {
  'ibm-plex-sans': {
    id: 'ibm-plex-sans',
    name: 'IBM Plex Sans',
    description: 'Carbon-native typography with crisp hierarchy for dense operational screens.',
    family: "'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif",
    accent: 'var(--cds-link-primary)',
    sample: 'Carbon-aligned operator UI',
  },
  roboto: {
    id: 'roboto',
    name: 'Roboto',
    description: 'Tighter, more neutral UI text for dashboard-heavy and mobile-like layouts.',
    family: "'Roboto', 'Helvetica Neue', Arial, sans-serif",
    accent: 'var(--cds-support-info)',
    sample: 'Compact control-surface rhythm',
  },
  'system-ui': {
    id: 'system-ui',
    name: 'System UI',
    description: 'Use the host platform stack for the most native-feeling shell typography.',
    family: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    accent: 'var(--cds-support-success)',
    sample: 'Native desktop shell cadence',
  },
};

function resolvePlatformFontPresetId(presetId: string | null | undefined): PlatformFontPresetId {
  if (presetId && presetId in PLATFORM_FONT_PRESETS) {
    return presetId as PlatformFontPresetId;
  }

  return DEFAULT_PLATFORM_FONT_ID;
}

function emitPlatformFontChange(presetId: PlatformFontPresetId): void {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent(PLATFORM_FONT_EVENT, {
      detail: {
        presetId,
      },
    }),
  );
}

function applyPlatformFontVariables(preset: PlatformFontPreset): void {
  if (typeof document === 'undefined') return;

  const nodes = [document.documentElement, document.body].filter(Boolean) as HTMLElement[];

  nodes.forEach((node) => {
    node.style.setProperty('--font-ui', preset.family);
    node.style.setProperty('--font-ui-tight', preset.family);
    node.style.setProperty('--font-display', preset.family);
    node.style.setProperty('--font-sans', preset.family);
    node.style.setProperty('--font-mono', preset.family);
    node.style.setProperty('--cds-body-compact-01-font-family', 'var(--font-ui-tight)');
    node.style.setProperty('--cds-body-compact-02-font-family', 'var(--font-ui-tight)');
    node.style.setProperty('--cds-body-01-font-family', 'var(--font-ui)');
    node.style.setProperty('--cds-body-02-font-family', 'var(--font-ui)');
    node.style.setProperty('--cds-heading-compact-01-font-family', 'var(--font-display)');
    node.style.setProperty('--cds-heading-compact-02-font-family', 'var(--font-display)');
    node.style.setProperty('--cds-heading-01-font-family', 'var(--font-display)');
    node.style.setProperty('--cds-heading-02-font-family', 'var(--font-display)');
    node.style.setProperty('--cds-heading-03-font-family', 'var(--font-display)');
    node.style.setProperty('--cds-heading-04-font-family', 'var(--font-display)');
    node.style.setProperty('--cds-heading-05-font-family', 'var(--font-display)');
    node.style.setProperty('--cds-heading-06-font-family', 'var(--font-display)');
    node.style.setProperty('--cds-code-01-font-family', 'var(--font-mono)');
    node.style.setProperty('--cds-code-02-font-family', 'var(--font-mono)');
    node.setAttribute('data-platform-font', preset.id);
  });
}

export function applyPlatformFontPreset(presetId: string): PlatformFontPresetId {
  const resolvedPresetId = resolvePlatformFontPresetId(presetId);
  const preset = PLATFORM_FONT_PRESETS[resolvedPresetId];

  applyPlatformFontVariables(preset);

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(PLATFORM_FONT_STORAGE_KEY, resolvedPresetId);
    } catch {
      // localStorage might be unavailable.
    }
  }

  emitPlatformFontChange(resolvedPresetId);
  return resolvedPresetId;
}

export function getSavedPlatformFontPresetId(): PlatformFontPresetId {
  if (typeof localStorage === 'undefined') {
    return DEFAULT_PLATFORM_FONT_ID;
  }

  try {
    return resolvePlatformFontPresetId(localStorage.getItem(PLATFORM_FONT_STORAGE_KEY));
  } catch {
    return DEFAULT_PLATFORM_FONT_ID;
  }
}

export function initializePlatformTypography(): void {
  applyPlatformFontPreset(getSavedPlatformFontPresetId());
}

export function usePlatformFontPreference() {
  const [fontPresetId, setFontPresetId] = useState<PlatformFontPresetId>(getSavedPlatformFontPresetId);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const syncFontPreset = () => {
      setFontPresetId(getSavedPlatformFontPresetId());
    };

    window.addEventListener(PLATFORM_FONT_EVENT, syncFontPreset as EventListener);
    window.addEventListener('storage', syncFontPreset);

    return () => {
      window.removeEventListener(PLATFORM_FONT_EVENT, syncFontPreset as EventListener);
      window.removeEventListener('storage', syncFontPreset);
    };
  }, []);

  const setFontPreset = useCallback((presetId: PlatformFontPresetId) => {
    const resolvedPresetId = applyPlatformFontPreset(presetId);
    setFontPresetId(resolvedPresetId);
  }, []);

  useEffect(() => {
    applyPlatformFontPreset(fontPresetId);
  }, [fontPresetId]);

  return {
    fontPreset: PLATFORM_FONT_PRESETS[fontPresetId],
    fontPresetId,
    fontPresets: PLATFORM_FONT_PRESETS,
    setFontPreset,
  };
}
