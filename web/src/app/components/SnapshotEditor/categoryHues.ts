/**
 * MAP2 category hue map — oklch polar coordinates for the 15 canonical
 * plugin categories surfaced in the Unified Channel Grid.
 *
 * Hue angles follow the CSS oklch() spec (0–360°, matching Carbon color tokens).
 * Chroma is the saturation axis; blocks render at fixed lightness with per-theme
 * L adjustments handled in themeBlueprint.css (T710-sub07).
 */

export interface CategoryHue {
  /** oklch hue angle in degrees (0–360). */
  hue: number
  /** oklch chroma (typical 0.05–0.20 for UI surfaces). */
  chroma: number
  /** Semantic fallback label matching the T710 spec vocabulary. */
  fallback:
    | 'amber'
    | 'warm-neutral'
    | 'blue'
    | 'green'
    | 'violet'
    | 'cyan'
    | 'red'
    | 'neutral'
}

const NEUTRAL: CategoryHue = { hue: 0, chroma: 0, fallback: 'neutral' }

const CATEGORY_HUES: Record<string, CategoryHue> = {
  Amplifier: { hue: 70, chroma: 0.14, fallback: 'amber' },
  Cabinet: { hue: 50, chroma: 0.05, fallback: 'warm-neutral' },
  EQ: { hue: 240, chroma: 0.14, fallback: 'blue' },
  Dynamics: { hue: 150, chroma: 0.13, fallback: 'green' },
  Modulation: { hue: 300, chroma: 0.14, fallback: 'violet' },
  Delay: { hue: 200, chroma: 0.13, fallback: 'cyan' },
  Reverb: { hue: 200, chroma: 0.13, fallback: 'cyan' },
  Distortion: { hue: 25, chroma: 0.16, fallback: 'red' },
  Utility: { hue: 0, chroma: 0.0, fallback: 'neutral' },
  Instrument: { hue: 150, chroma: 0.13, fallback: 'green' },
  Drums: { hue: 25, chroma: 0.16, fallback: 'red' },
  Pitch: { hue: 200, chroma: 0.13, fallback: 'cyan' },
  'Multi-Effect': { hue: 300, chroma: 0.14, fallback: 'violet' },
  Effects: { hue: 0, chroma: 0.0, fallback: 'neutral' },
  AVB: { hue: 240, chroma: 0.14, fallback: 'blue' },
}

export type MAP2Category = keyof typeof CATEGORY_HUES

export const MAP2_CATEGORIES: ReadonlyArray<MAP2Category> = Object.freeze(
  Object.keys(CATEGORY_HUES) as MAP2Category[],
)

export function getCategoryHue(category: string | null | undefined): CategoryHue {
  const key = String(category ?? '').trim()
  if (!key) return NEUTRAL

  if (key in CATEGORY_HUES) {
    return CATEGORY_HUES[key]
  }

  const ci = Object.keys(CATEGORY_HUES).find(
    (k) => k.toLowerCase() === key.toLowerCase(),
  )
  return ci ? CATEGORY_HUES[ci] : NEUTRAL
}
