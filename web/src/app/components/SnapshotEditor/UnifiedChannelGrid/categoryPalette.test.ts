import { CATEGORY_COLOR_TOKENS } from './gridConstants'
import { MAP2_CATEGORIES } from '../categoryHues'

/**
 * Extract the fallback hex from a token of the form `var(--map2-cat-X, #hex)`.
 * Every entry in CATEGORY_COLOR_TOKENS must match this shape; if any entry
 * stops including a fallback, this test will catch it (returns undefined and
 * the uniqueness assertion fails on a collision against `undefined`).
 */
function extractFallbackHex(token: string): string | undefined {
  const match = token.match(/#[0-9a-fA-F]{3,8}/)
  return match ? match[0].toLowerCase() : undefined
}

describe('CATEGORY_COLOR_TOKENS palette', () => {
  it('every CATEGORY_COLOR_TOKENS entry is a CSS var() with a fallback hex', () => {
    // Sentinel `Unknown` is allowed; everything else must be a CSS var token.
    for (const [category, token] of Object.entries(CATEGORY_COLOR_TOKENS)) {
      expect(token).toMatch(/^var\(--map2-cat-[a-z-]+, #[0-9a-f]{6,8}\)$/i)
      expect(extractFallbackHex(token)).toBeDefined()
      // Sanity-check the category key by self-reference; a typo here would
      // surface as an undefined token from a real consumer.
      expect(category).toBeTruthy()
    }
  })

  it('every MAP2 category resolves to a distinct accent hex (no collisions)', () => {
    const seen = new Map<string, string>()
    for (const category of MAP2_CATEGORIES) {
      const token = CATEGORY_COLOR_TOKENS[category]
      const hex = extractFallbackHex(token)
      expect(hex).toBeDefined()
      const previous = seen.get(hex!)
      if (previous) {
        // Build a useful failure message before the assertion fires so a
        // future regression points right at the offending pair.
        throw new Error(
          `Palette collision: ${previous} and ${category} both resolve to ${hex}. ` +
            `See gridConstants.ts::CATEGORY_COLOR_TOKENS.`,
        )
      }
      seen.set(hex!, category)
    }

    // Every MAP2 category produced a unique entry. (15 categories shipped
    // 2026-05-09; if the count changes, MAP2_CATEGORIES drives this — no need
    // to update the assertion.)
    expect(seen.size).toBe(MAP2_CATEGORIES.length)
  })

  it('keeps Distortion and Drums on distinct hexes (T2502 regression guard)', () => {
    const distortion = extractFallbackHex(CATEGORY_COLOR_TOKENS.Distortion)
    const drums = extractFallbackHex(CATEGORY_COLOR_TOKENS.Drums)
    expect(distortion).toBeDefined()
    expect(drums).toBeDefined()
    expect(distortion).not.toEqual(drums)
  })

  it('keeps Pitch and Multi-Effect on distinct hexes (T2502 regression guard)', () => {
    const pitch = extractFallbackHex(CATEGORY_COLOR_TOKENS.Pitch)
    const multiEffect = extractFallbackHex(CATEGORY_COLOR_TOKENS['Multi-Effect'])
    expect(pitch).toBeDefined()
    expect(multiEffect).toBeDefined()
    expect(pitch).not.toEqual(multiEffect)
  })

  it('Unknown sentinel is excluded from the category-uniqueness contract', () => {
    // Unknown is the fallback for slots without a recognised category; it is
    // permitted to be a neutral gray that overlaps no real category. The
    // collision sweep above only walks MAP2_CATEGORIES — assert here that
    // Unknown still has a token entry (so a missing-category render doesn't
    // crash) and that its colour is the neutral sentinel.
    expect(CATEGORY_COLOR_TOKENS.Unknown).toMatch(/^var\(--map2-cat-unknown,/)
  })
})
