import { buildPluginLevelMap, buildPluginPerformanceMap } from './pluginTelemetry'

describe('pluginTelemetry', () => {
  it('builds per-instance level entries while preserving uri fallback keys', () => {
    const levels = buildPluginLevelMap([
      { uri: 'urn:test:duplicate', instance_id: 101, position: 0, input: 0.12, output: 0.34 },
      { uri: 'urn:test:duplicate', instance_id: 202, position: 1, input: 0.56, output: 0.78 },
    ])

    expect(levels['instance:101']).toEqual({ input: 0.12, output: 0.34 })
    expect(levels['instance:202']).toEqual({ input: 0.56, output: 0.78 })
    expect(levels['urn:test:duplicate']).toEqual({ input: 0.12, output: 0.34 })
  })

  it('builds per-instance performance entries while preserving uri fallback keys', () => {
    const performance = buildPluginPerformanceMap([
      { uri: 'urn:test:duplicate', instance_id: 101, position: 0, cpu_percent: 3.5, latency_samples: 64 },
      { uri: 'urn:test:duplicate', instance_id: 202, position: 1, cpu_percent: 5.5, latency_samples: 32 },
    ])

    expect(performance['instance:101']).toEqual({ cpuPercent: 3.5, latencySamples: 64 })
    expect(performance['instance:202']).toEqual({ cpuPercent: 5.5, latencySamples: 32 })
    expect(performance['urn:test:duplicate']).toEqual({ cpuPercent: 3.5, latencySamples: 64 })
  })
})
