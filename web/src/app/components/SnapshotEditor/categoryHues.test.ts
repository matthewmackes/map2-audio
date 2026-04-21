import { getCategoryHue, MAP2_CATEGORIES } from './categoryHues'

describe('categoryHues', () => {
  it('exposes exactly 15 canonical MAP2 categories', () => {
    expect(MAP2_CATEGORIES).toHaveLength(15)
  })

  it.each([
    ['Amplifier', 'amber'],
    ['Cabinet', 'warm-neutral'],
    ['EQ', 'blue'],
    ['Dynamics', 'green'],
    ['Modulation', 'violet'],
    ['Delay', 'cyan'],
    ['Reverb', 'cyan'],
    ['Distortion', 'red'],
    ['Utility', 'neutral'],
    ['Instrument', 'green'],
    ['Drums', 'red'],
    ['Pitch', 'cyan'],
    ['Multi-Effect', 'violet'],
    ['Effects', 'neutral'],
    ['AVB', 'blue'],
  ])('maps %s to fallback %s', (category, fallback) => {
    expect(getCategoryHue(category).fallback).toBe(fallback)
  })

  it('returns oklch hue angle in [0, 360) and non-negative chroma for every category', () => {
    for (const category of MAP2_CATEGORIES) {
      const { hue, chroma } = getCategoryHue(category)
      expect(hue).toBeGreaterThanOrEqual(0)
      expect(hue).toBeLessThan(360)
      expect(chroma).toBeGreaterThanOrEqual(0)
    }
  })

  it('case-insensitive match for canonical names', () => {
    expect(getCategoryHue('amplifier').fallback).toBe('amber')
    expect(getCategoryHue('AVB').fallback).toBe('blue')
    expect(getCategoryHue('multi-effect').fallback).toBe('violet')
  })

  it('unknown / empty / null yields neutral fallback', () => {
    expect(getCategoryHue('').fallback).toBe('neutral')
    expect(getCategoryHue(null).fallback).toBe('neutral')
    expect(getCategoryHue(undefined).fallback).toBe('neutral')
    expect(getCategoryHue('NotARealCategory').fallback).toBe('neutral')
  })
})
