// T2480 Follow-up D: tests for the inline naming helpers.

import {
  buildMatchPatterns,
  slugifyProfileId,
  stripGenericPrefix,
  validateDeviceName,
} from './onboardingHelpers'

describe('slugifyProfileId', () => {
  it('lowercases and collapses runs of non-alphanum to underscore', () => {
    expect(slugifyProfileId('My Keyboard 42')).toBe('my_keyboard_42')
    expect(slugifyProfileId('Edirol PCR-300')).toBe('edirol_pcr_300')
  })

  it('strips leading/trailing underscores', () => {
    expect(slugifyProfileId('  ! Hello !  ')).toBe('hello')
    expect(slugifyProfileId('---abc---')).toBe('abc')
  })

  it('falls back to unnamed_device for empty / whitespace-only input', () => {
    expect(slugifyProfileId('')).toBe('unnamed_device')
    expect(slugifyProfileId('   ')).toBe('unnamed_device')
    expect(slugifyProfileId('!!!')).toBe('unnamed_device')
  })

  it('handles unicode by stripping it', () => {
    // Mäschine → m_schine (the umlaut is non-alphanum).
    expect(slugifyProfileId('Mäschine')).toBe('m_schine')
  })
})

describe('stripGenericPrefix', () => {
  it('strips the canonical prefix', () => {
    expect(stripGenericPrefix('generic_controller:my_kbd')).toBe('my_kbd')
  })

  it('leaves non-prefixed ids alone', () => {
    expect(stripGenericPrefix('edirol_pcr_300:abc')).toBe('edirol_pcr_300:abc')
  })

  it('handles empty input', () => {
    expect(stripGenericPrefix('')).toBe('')
  })
})

describe('validateDeviceName', () => {
  it('returns null for valid names', () => {
    expect(validateDeviceName('My Keyboard')).toBeNull()
    expect(validateDeviceName('Edirol PCR-300')).toBeNull()
  })

  it('rejects empty / whitespace-only', () => {
    expect(validateDeviceName('')).toBe('Name cannot be empty.')
    expect(validateDeviceName('   ')).toBe('Name cannot be empty.')
  })

  it('rejects names that exceed 80 characters', () => {
    const longName = 'X'.repeat(81)
    expect(validateDeviceName(longName)).toContain('too long')
  })

  it('rejects names that slug-collide with the reserved generic profile id', () => {
    expect(validateDeviceName('Generic Controller')).toBe('That name is reserved.')
    expect(validateDeviceName('generic   controller')).toBe('That name is reserved.')
  })

  it('accepts names exactly at the 80-char boundary', () => {
    expect(validateDeviceName('X'.repeat(80))).toBeNull()
  })
})

describe('buildMatchPatterns', () => {
  it('includes both display name and port name', () => {
    const result = buildMatchPatterns('My KBD', 'ALSA Port Name 0')
    expect(result).toContain('My KBD')
    expect(result).toContain('ALSA Port Name 0')
  })

  it('dedupes when display name equals port name', () => {
    expect(buildMatchPatterns('Same', 'Same')).toEqual(['Same'])
  })

  it('skips empty inputs', () => {
    expect(buildMatchPatterns('', 'Port')).toEqual(['Port'])
    expect(buildMatchPatterns('Display', '')).toEqual(['Display'])
  })
})
