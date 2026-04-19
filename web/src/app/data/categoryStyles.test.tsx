import {
  CATEGORY_COLOR_OVERRIDE_STORAGE_KEY,
  getCategoryConfig,
  resetAllCategoryColorOverrides,
  resetCategoryColorOverride,
  setCategoryColorOverride,
} from './categoryStyles'

describe('categoryStyles', () => {
  beforeEach(() => {
    window.localStorage.clear()
    resetAllCategoryColorOverrides()
  })

  it('returns the shared default palette for known categories', () => {
    expect(getCategoryConfig('Dynamics').color).toBe('var(--support-info)')
    expect(getCategoryConfig('Delay').color).toBe('var(--interactive)')
    expect(getCategoryConfig('Reverb').color).toBe('var(--accent)')
    expect(getCategoryConfig('Dynamics').bg).toBe('color-mix(in srgb, var(--support-info) 15%, transparent)')
  })

  it('persists and applies overrides for resolved category keys', () => {
    expect(setCategoryColorOverride('Dynamics Processor', '#112233')).toBe(true)

    const stored = window.localStorage.getItem(CATEGORY_COLOR_OVERRIDE_STORAGE_KEY) ?? ''
    expect(stored).toContain('"Dynamics":"#112233"')
    expect(getCategoryConfig('Dynamics').color).toBe('#112233')
    expect(getCategoryConfig('Dynamics').bg).toContain('17, 34, 51')
  })

  it('resets individual category overrides', () => {
    setCategoryColorOverride('Delay', '#abcdef')
    resetCategoryColorOverride('Delay')

    expect(getCategoryConfig('Delay').color).toBe('var(--interactive)')
    expect(window.localStorage.getItem(CATEGORY_COLOR_OVERRIDE_STORAGE_KEY)).toBeNull()
  })
})
