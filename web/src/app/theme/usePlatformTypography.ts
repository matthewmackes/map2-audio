import { useCallback, useEffect, useState } from 'react';

export type PlatformFontPresetId =
  | 'ibm-plex-sans'
  | 'jetbrains-mono'
  | 'roboto'
  | 'fira-sans'
  | 'space-grotesk'
  | 'inter'
  | 'open-sans'
  | 'lato'
  | 'poppins'
  | 'montserrat'
  | 'source-sans-3'
  | 'dm-sans'
  | 'work-sans'
  | 'system-ui';

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
  'jetbrains-mono': {
    id: 'jetbrains-mono',
    name: 'JetBrains Mono',
    description: 'Technical mono preset for schematic meters, trace labels, and dense engineering readouts.',
    family: "'JetBrains Mono', ui-monospace, 'SFMono-Regular', Consolas, monospace",
    accent: 'var(--cds-support-success)',
    sample: 'SCHEMATIC BUS 01',
  },
  roboto: {
    id: 'roboto',
    name: 'Roboto',
    description: 'Tighter, more neutral UI text for dashboard-heavy and mobile-like layouts.',
    family: "'Roboto', 'Helvetica Neue', Arial, sans-serif",
    accent: 'var(--cds-support-info)',
    sample: 'Compact control-surface rhythm',
  },
  'fira-sans': {
    id: 'fira-sans',
    name: 'Fira Sans',
    description: 'Humanist sans with clearer personality for operator dashboards that still need technical calm.',
    family: "'Fira Sans', 'Helvetica Neue', Arial, sans-serif",
    accent: 'var(--cds-support-warning)',
    sample: 'Readable cues with warmer cadence',
  },
  'space-grotesk': {
    id: 'space-grotesk',
    name: 'Space Grotesk',
    description: 'Sharper geometric voice for bold shells, larger cards, and more pronounced visual direction.',
    family: "'Space Grotesk', 'Helvetica Neue', Arial, sans-serif",
    accent: 'var(--cds-link-primary)',
    sample: 'Crisp geometry for live surfaces',
  },
  inter: {
    id: 'inter',
    name: 'Inter',
    description: 'Balanced UI sans tuned for dense controls, long sessions, and modern application clarity.',
    family: "'Inter', 'Helvetica Neue', Arial, sans-serif",
    accent: 'var(--cds-support-success)',
    sample: 'Neutral precision for long sessions',
  },
  'open-sans': {
    id: 'open-sans',
    name: 'Open Sans',
    description: 'Humanist workhorse with wide proportions and strong legibility at small sizes.',
    family: "'Open Sans', 'Helvetica Neue', Arial, sans-serif",
    accent: 'var(--cds-support-info)',
    sample: 'Approachable clarity for mixed audiences',
  },
  lato: {
    id: 'lato',
    name: 'Lato',
    description: 'Warm, semi-rounded sans that stays calm across body copy and UI labels.',
    family: "'Lato', 'Helvetica Neue', Arial, sans-serif",
    accent: 'var(--cds-support-info)',
    sample: 'Quiet confidence across dashboards',
  },
  poppins: {
    id: 'poppins',
    name: 'Poppins',
    description: 'Geometric sans with even strokes for bold, modern shell aesthetics.',
    family: "'Poppins', 'Helvetica Neue', Arial, sans-serif",
    accent: 'var(--cds-link-primary)',
    sample: 'Bold geometric stage presence',
  },
  montserrat: {
    id: 'montserrat',
    name: 'Montserrat',
    description: 'Urban geometric sans with editorial weight and strong display presence.',
    family: "'Montserrat', 'Helvetica Neue', Arial, sans-serif",
    accent: 'var(--cds-link-primary)',
    sample: 'Editorial weight for hero surfaces',
  },
  'source-sans-3': {
    id: 'source-sans-3',
    name: 'Source Sans Pro',
    description: "Adobe's utilitarian sans tuned for interface chrome and long reading passages.",
    family: "'Source Sans 3', 'Source Sans Pro', 'Helvetica Neue', Arial, sans-serif",
    accent: 'var(--cds-support-success)',
    sample: 'Neutral UI chrome for long reading',
  },
  'dm-sans': {
    id: 'dm-sans',
    name: 'DM Sans',
    description: 'Low-contrast geometric sans designed for small-size UI and compact layouts.',
    family: "'DM Sans', 'Helvetica Neue', Arial, sans-serif",
    accent: 'var(--cds-support-success)',
    sample: 'Compact cadence for dense controls',
  },
  'work-sans': {
    id: 'work-sans',
    name: 'Work Sans',
    description: 'Grotesque sans optimized for on-screen reading at mid-sized text.',
    family: "'Work Sans', 'Helvetica Neue', Arial, sans-serif",
    accent: 'var(--cds-support-warning)',
    sample: 'Balanced rhythm for operator screens',
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

// Lazy-load each non-default family on demand. main.tsx eagerly imports
// IBM Plex Sans (400/600) and JetBrains Mono (400) only; everything else
// is fetched the first time the user selects it. Modules are cached, so
// repeat selection of the same family is a no-op.
const loadedFontFamilies = new Set<PlatformFontPresetId>(['ibm-plex-sans', 'jetbrains-mono', 'system-ui']);

function loadPlatformFontFamily(presetId: PlatformFontPresetId): void {
  if (loadedFontFamilies.has(presetId)) return;
  loadedFontFamilies.add(presetId);

  switch (presetId) {
    case 'roboto':
      void Promise.allSettled([
        import('@fontsource/roboto/400.css'),
        import('@fontsource/roboto/500.css'),
        import('@fontsource/roboto/700.css'),
      ]);
      return;
    case 'fira-sans':
      void Promise.allSettled([
        import('@fontsource/fira-sans/400.css'),
        import('@fontsource/fira-sans/600.css'),
      ]);
      return;
    case 'space-grotesk':
      void Promise.allSettled([
        import('@fontsource/space-grotesk/400.css'),
        import('@fontsource/space-grotesk/500.css'),
        import('@fontsource/space-grotesk/700.css'),
      ]);
      return;
    case 'inter':
      void Promise.allSettled([
        import('@fontsource/inter/400.css'),
        import('@fontsource/inter/600.css'),
      ]);
      return;
    case 'open-sans':
      void Promise.allSettled([
        import('@fontsource/open-sans/400.css'),
        import('@fontsource/open-sans/600.css'),
      ]);
      return;
    case 'lato':
      void Promise.allSettled([
        import('@fontsource/lato/400.css'),
        import('@fontsource/lato/700.css'),
      ]);
      return;
    case 'poppins':
      void Promise.allSettled([
        import('@fontsource/poppins/400.css'),
        import('@fontsource/poppins/600.css'),
      ]);
      return;
    case 'montserrat':
      void Promise.allSettled([
        import('@fontsource/montserrat/400.css'),
        import('@fontsource/montserrat/600.css'),
      ]);
      return;
    case 'source-sans-3':
      void Promise.allSettled([
        import('@fontsource/source-sans-3/400.css'),
        import('@fontsource/source-sans-3/600.css'),
      ]);
      return;
    case 'dm-sans':
      void Promise.allSettled([
        import('@fontsource/dm-sans/400.css'),
        import('@fontsource/dm-sans/500.css'),
      ]);
      return;
    case 'work-sans':
      void Promise.allSettled([
        import('@fontsource/work-sans/400.css'),
        import('@fontsource/work-sans/600.css'),
      ]);
      return;
    default:
      return;
  }
}

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

  loadPlatformFontFamily(resolvedPresetId);
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
