import { dbToNormalised } from './useChainMeter'

describe('dbToNormalised', () => {
  it('floors at -60 dB → 0', () => {
    expect(dbToNormalised(-60)).toBe(0)
    expect(dbToNormalised(-120)).toBe(0)
    expect(dbToNormalised(Number.NEGATIVE_INFINITY)).toBe(0)
  })

  it('caps at 0 dB → 1', () => {
    expect(dbToNormalised(0)).toBe(1)
    expect(dbToNormalised(6)).toBe(1)
  })

  it('scales linearly between -60 dB and 0 dB', () => {
    expect(dbToNormalised(-30)).toBeCloseTo(0.5, 5)
    expect(dbToNormalised(-12)).toBeCloseTo(0.8, 5)
    expect(dbToNormalised(-48)).toBeCloseTo(0.2, 5)
  })

  it('returns 0 for non-finite values', () => {
    expect(dbToNormalised(Number.NaN)).toBe(0)
  })
})
