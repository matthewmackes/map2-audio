import {
  PROFILE_LCD_TEMPLATES,
  ProfileSchemaError,
  STARTER_PROFILES,
  validateProfile,
} from './profileDsl'

// T2522-B cycle 12 — Profile DSL schema tests.

describe('profileDsl', () => {
  it('PROFILE_LCD_TEMPLATES enumerates the 5 canonical T700 templates', () => {
    expect(PROFILE_LCD_TEMPLATES).toEqual([
      'param-list',
      'big-value',
      'kit-grid',
      'signal-flow',
      'console',
    ])
  })

  it('STARTER_PROFILES ships three valid profiles', () => {
    expect(STARTER_PROFILES.length).toBe(3)
    for (const profile of STARTER_PROFILES) {
      expect(() => validateProfile(profile)).not.toThrow()
    }
  })

  it('rejects a profile missing required string fields', () => {
    expect(() => validateProfile({ id: 'T1', label: 'CTRL' })).toThrow(ProfileSchemaError)
  })

  it('rejects an invalid id (must match T1..T25)', () => {
    const bad = { ...STARTER_PROFILES[0], id: 'T99' }
    expect(() => validateProfile(bad)).toThrow(/T1\.\.T25/)
  })

  it('rejects a profile with the wrong number of pads', () => {
    const bad = {
      ...STARTER_PROFILES[0],
      pads: STARTER_PROFILES[0].pads.slice(0, 8),
    }
    expect(() => validateProfile(bad)).toThrow(/16-entry/)
  })

  it('rejects a pad with an invalid LED color', () => {
    const bad = {
      ...STARTER_PROFILES[0],
      pads: STARTER_PROFILES[0].pads.map((pad, i) =>
        i === 0 ? { ...pad, idle_color: 'fuchsia' as never } : pad,
      ),
    }
    expect(() => validateProfile(bad)).toThrow(/idle_color/)
  })

  it('rejects an encoder with an invalid slot', () => {
    const bad = {
      ...STARTER_PROFILES[0],
      encoders: [...STARTER_PROFILES[0].encoders, { slot: 'enc99' as never, label: 'bogus' }],
    }
    expect(() => validateProfile(bad)).toThrow(/slot/)
  })

  it('rejects an LCD spec with an invalid template', () => {
    const bad = {
      ...STARTER_PROFILES[0],
      lcd_left: { ...STARTER_PROFILES[0].lcd_left, template: 'fake' as never },
    }
    expect(() => validateProfile(bad)).toThrow(/template/)
  })

  it('rejects an LCD spec missing the canvas block', () => {
    const bad = {
      ...STARTER_PROFILES[0],
      lcd_left: {
        template: 'param-list' as const,
        side: 'left' as const,
        // @ts-expect-error — intentional: test the validator's runtime check.
        blocks: { top: { kind: 'breadcrumb', text: 'no canvas' } },
      },
    }
    expect(() => validateProfile(bad)).toThrow(/canvas is required/)
  })
})
