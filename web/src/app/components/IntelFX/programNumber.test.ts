import { formatIntelFXProgramName, formatIntelFXProgramNumber } from './programNumber'

describe('formatIntelFXProgramNumber', () => {
  it('formats user bank slots', () => {
    expect(formatIntelFXProgramNumber(0)).toBe('U001')
    expect(formatIntelFXProgramNumber(127)).toBe('U128')
  })

  it('formats factory bank slots', () => {
    expect(formatIntelFXProgramNumber(128)).toBe('F001')
    expect(formatIntelFXProgramNumber(255)).toBe('F128')
  })

  it('clamps out-of-range values', () => {
    expect(formatIntelFXProgramNumber(-10)).toBe('U001')
    expect(formatIntelFXProgramNumber(999)).toBe('F128')
  })
})

describe('formatIntelFXProgramName', () => {
  it('falls back to formatted number when name is empty', () => {
    expect(formatIntelFXProgramName(3, '')).toBe('U004')
    expect(formatIntelFXProgramName(130, null)).toBe('F003')
  })

  it('uses provided name when present', () => {
    expect(formatIntelFXProgramName(10, 'Big Hall')).toBe('Big Hall')
  })
})
