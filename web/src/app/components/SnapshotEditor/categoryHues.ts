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
  /** Semantic fallback label matching the T710 + T2502 vocabulary. */
  fallback:
    | 'amber'
    | 'warm-neutral'
    | 'cool-neutral'
    | 'blue'
    | 'green'
    | 'mint'
    | 'violet'
    | 'indigo'
    | 'cyan'
    | 'red'
    | 'coral'
    | 'taupe'
    | 'steel'
    | 'neutral'
}

const NEUTRAL: CategoryHue = { hue: 0, chroma: 0, fallback: 'neutral' }

// T2502: hue/chroma values reflect the de-collisioned palette in
// `gridConstants.ts::CATEGORY_COLOR_TOKENS`. Distortion stays rose,
// Drums moves to coral; Multi-Effect stays purple, Pitch moves to indigo;
// Cabinet stays warm-gray, Utility moves to cool-slate, Effects to taupe;
// Dynamics stays green, Instrument moves to mint-cyan; Delay stays sky,
// AVB moves to steel-blue. Every category now has a unique hex.
const CATEGORY_HUES: Record<string, CategoryHue> = {
  Amplifier: { hue: 70, chroma: 0.14, fallback: 'amber' },
  Cabinet: { hue: 50, chroma: 0.03, fallback: 'warm-neutral' },
  EQ: { hue: 90, chroma: 0.14, fallback: 'amber' },
  Dynamics: { hue: 150, chroma: 0.13, fallback: 'green' },
  Modulation: { hue: 170, chroma: 0.10, fallback: 'mint' },
  Delay: { hue: 240, chroma: 0.13, fallback: 'blue' },
  Reverb: { hue: 200, chroma: 0.13, fallback: 'cyan' },
  Distortion: { hue: 0, chroma: 0.13, fallback: 'red' },
  Utility: { hue: 250, chroma: 0.02, fallback: 'cool-neutral' },
  Instrument: { hue: 165, chroma: 0.10, fallback: 'mint' },
  Drums: { hue: 35, chroma: 0.10, fallback: 'coral' },
  Pitch: { hue: 285, chroma: 0.13, fallback: 'indigo' },
  'Multi-Effect': { hue: 300, chroma: 0.13, fallback: 'violet' },
  Effects: { hue: 70, chroma: 0.02, fallback: 'taupe' },
  AVB: { hue: 245, chroma: 0.10, fallback: 'steel' },
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
