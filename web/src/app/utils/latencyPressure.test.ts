import { computeLatencyPressure, formatLatencyPressureScore } from './latencyPressure'

describe('latencyPressure', () => {
  it('keeps healthy live telemetry in the top score band', () => {
    const analysis = computeLatencyPressure({
      running: true,
      totalLatencyMs: 4.4,
      rtlP95Ms: 4.6,
      jitterP95Ms: 0.18,
      xrunCount: 0,
      callbackBudgetMs: 2.67,
      currentCallbackMs: 1.02,
      headroomPercent: 61,
    })

    expect(analysis.isAvailable).toBe(true)
    expect(analysis.score).toBe(10)
    expect(analysis.scoreDisplay).toBe('10')
    expect(analysis.pressurePercent).toBeLessThanOrEqual(10)
    expect(analysis.tone).toBe('blue')
    expect(analysis.status).toBe('stable')
  })

  it('caps the operator score when xruns are present even if averages still look healthy', () => {
    const analysis = computeLatencyPressure({
      running: true,
      totalLatencyMs: 4.3,
      rtlP95Ms: 4.5,
      jitterP95Ms: 0.15,
      xrunCount: 1,
      callbackBudgetMs: 2.67,
      currentCallbackMs: 1.0,
      headroomPercent: 58,
    })

    expect(analysis.score).toBe(6)
    expect(analysis.scoreDisplay).toBe('06')
    expect(analysis.pressurePercent).toBeGreaterThanOrEqual(40)
    expect(analysis.tone).toBe('blue')
    expect(analysis.status).toBe('watch')
  })

  it('drops into the red band under stacked realtime pressure', () => {
    const analysis = computeLatencyPressure({
      running: true,
      totalLatencyMs: 11.5,
      rtlP95Ms: 12.2,
      jitterP95Ms: 0.72,
      xrunCount: 4,
      callbackBudgetMs: 2.67,
      currentCallbackMs: 2.54,
      headroomPercent: 12,
    })

    expect(analysis.score).toBeLessThanOrEqual(2)
    expect(analysis.scoreDisplay).toMatch(/^0[0-2]$/)
    expect(analysis.pressurePercent).toBeGreaterThanOrEqual(80)
    expect(analysis.tone).toBe('red')
    expect(analysis.status).toBe('critical')
  })

  it('returns a hard zero when the engine is offline with known telemetry', () => {
    const analysis = computeLatencyPressure({
      running: false,
      totalLatencyMs: 4.8,
      rtlP95Ms: 5.0,
      jitterP95Ms: 0.2,
      xrunCount: 0,
      callbackBudgetMs: 2.67,
      currentCallbackMs: 0.9,
      headroomPercent: 50,
    })

    expect(analysis.score).toBe(0)
    expect(analysis.scoreDisplay).toBe('00')
    expect(analysis.pressurePercent).toBe(100)
    expect(analysis.tone).toBe('red')
    expect(analysis.status).toBe('offline')
  })

  it('formats missing scores as a loading placeholder', () => {
    expect(formatLatencyPressureScore(null)).toBe('--')
  })
})
