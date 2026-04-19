import { buildJuceSourceTruthGraphModel } from './juceSourceTruthGraph'

describe('buildJuceSourceTruthGraphModel', () => {
  it('builds the expected source-of-truth chain and per-connection rows', () => {
    const payload = {
      timestamp: '2026-03-15T10:15:00.000Z',
      status: 'aligned',
      profile: {
        selected_profile: 'Default',
        profile_version: '1',
        clock_master: 'local-rack',
        remarks: [],
      },
      configured: {
        engine_rate_hz: 48000,
        avb_stream_rate_hz: 48000,
        spdif_rate_hz: 48000,
        buffer_size_samples: 128,
        bits_per_sample: 24,
        allowed_rates_hz: [44100, 48000, 96000],
        require_hard_lock: false,
        allow_resampler: true,
        spdif: {
          enabled: false,
          device: '',
          transport_mode: '',
          allow_resampler: true,
          require_hard_lock: false,
          remarks: [],
        },
        avb: {
          enabled: false,
          interface: '',
          auto_connect: false,
          ptp_domain: 0,
          max_streams: 0,
        },
      },
      runtime: {
        engine: {
          available: true,
          running: true,
          sample_rate_hz: 48000,
          buffer_size_samples: 128,
          cpu_load_percent: 12,
          audio_device: 'USB Rack',
        },
        pipewire: {
          available: true,
          clock_rate_hz: 48000,
          clock_force_rate_hz: 0,
          clock_quantum_samples: 128,
          clock_force_quantum_samples: 0,
          clock_allowed_rates_hz: [44100, 48000],
          effective_rate_hz: 48000,
          effective_quantum_samples: 128,
        },
        avb: {
          enabled: false,
          interface: '',
          auto_connect: false,
          available: false,
          state: 'disabled',
          ptp: {
            available: false,
          },
        },
      },
      consistency: {
        checks: {},
        issues: [],
        issue_count: 0,
      },
    } as const

    const model = buildJuceSourceTruthGraphModel({
      payload,
      selectedNodeId: 'juce-runtime',
    })

    expect(model.nodes).toHaveLength(7)
    expect(model.rows).toHaveLength(6)
    expect(model.rows.map((row) => row.id)).toEqual([
      'profile-to-configured',
      'configured-to-juce',
      'juce-to-pipewire',
      'configured-to-spdif',
      'configured-to-avb-policy',
      'avb-policy-to-runtime',
    ])
    expect(model.rows.find((row) => row.id === 'configured-to-juce')?.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Runtime device', value: 'USB Rack' }),
      ]),
    )
    expect(model.summaryTags.map((tag) => tag.label)).toEqual(
      expect.arrayContaining([
        'Authority ALIGNED',
        '6 connections',
        '0 issues',
      ]),
    )
  })
})
