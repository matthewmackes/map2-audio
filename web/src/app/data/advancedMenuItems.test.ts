import {
  ADVANCED_NAVIGATION_ALLOWED_STATES,
  DEFAULT_NAVIGATION_ALLOWED_STATES,
  advancedMenuItems,
  navigationMaturityMeta,
  primaryOperatorMenuItems,
  secondaryInfoMenuItems,
} from './advancedMenuItems'

describe('operator navigation model', () => {
  it('keeps default primary navigation limited to operator-safe maturity states', () => {
    expect(primaryOperatorMenuItems.length).toBeGreaterThan(0)

    for (const item of primaryOperatorMenuItems) {
      expect(DEFAULT_NAVIGATION_ALLOWED_STATES).toContain(item.maturity)
    }
  })

  it('keeps advanced navigation reserved for non-default maturity states', () => {
    expect(advancedMenuItems.length).toBeGreaterThan(0)

    for (const item of advancedMenuItems) {
      expect(ADVANCED_NAVIGATION_ALLOWED_STATES).toContain(item.maturity)
      expect(item.promotable).toBe(false)
    }
  })

  it('keeps informational secondary routes operator-safe', () => {
    for (const item of secondaryInfoMenuItems) {
      expect(DEFAULT_NAVIGATION_ALLOWED_STATES).toContain(item.maturity)
    }
  })

  it('uses exact maturity labels for UI badges', () => {
    expect(Object.keys(navigationMaturityMeta).sort()).toEqual([
      'beta',
      'experimental',
      'hardware-blocked',
      'production',
      'qualified-with-waiver',
    ])

    for (const [state, meta] of Object.entries(navigationMaturityMeta)) {
      expect(meta.label).toBe(state)
    }
  })
})
