import { buildAudioEngineWorkspaceGraphModel } from './audioEngineWorkspaceGraph'

describe('buildAudioEngineWorkspaceGraphModel', () => {
  it('builds an authority-backed runtime topology with routing anchors and pulse copy', () => {
    const model = buildAudioEngineWorkspaceGraphModel({
      sourceOfTruth: {
        timestamp: '2026-04-03T21:30:00.000Z',
        status: 'aligned',
        profile: {
          selected_profile: 'Main',
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
          allowed_rates_hz: [44100, 48000],
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
      },
      detailNodeLabel: 'local-rack',
      devices: [
        {
          id: 1,
          name: 'USB Rack',
          nick: 'USB Rack',
          driver: 'alsa',
          bus: 'USB',
          media_class: 'Audio/Device',
          is_default: true,
          properties: {
            'audio.rate': 48000,
            'audio.channels': 2,
          },
        },
      ],
      nodes: [
        {
          id: 10,
          name: 'Main Source',
          nick: 'Main Source',
          description: 'Main Source',
          media_class: 'Audio/Source',
          device_id: 1,
          sample_rate: 48000,
          channels: 2,
          format: 'F32',
          volume: 1,
          muted: false,
          is_driver: false,
          is_default: true,
          state: 'running',
          properties: {},
        },
        {
          id: 11,
          name: 'Main Sink',
          nick: 'Main Sink',
          description: 'Main Sink',
          media_class: 'Audio/Sink',
          device_id: 1,
          sample_rate: 48000,
          channels: 2,
          format: 'F32',
          volume: 1,
          muted: false,
          is_driver: true,
          is_default: true,
          state: 'running',
          properties: {},
        },
      ],
      streams: [
        {
          id: 20,
          client_name: 'Engine',
          client_pid: 100,
          media_name: 'Main stream',
          direction: 'output',
          state: 'running',
          channels: 2,
          sample_rate: 48000,
        },
      ],
      links: [
        {
          id: 30,
          output_node: 10,
          output_port: 'out-L',
          input_node: 11,
          input_port: 'in-L',
          state: 'active',
        },
      ],
      effectiveRate: 48000,
      effectiveQuantum: 128,
      totalLatencyMs: 4.2,
      xruns: 0,
      pressurePercent: 18,
      selectedAnchorId: 'audio-engine-routing-streams',
    })

    expect(model.summaryTags).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'ALIGNED', type: 'green' }),
      expect.objectContaining({ label: '1 device', type: 'cool-gray' }),
      expect.objectContaining({ label: '1 patch link', type: 'green' }),
      expect.objectContaining({ label: 'Pressure 18%', type: 'green' }),
    ]))
    expect(model.pulseCopy).toMatch(/Animated edges reflect observed stream and patch-link volume/i)
    expect(model.nodes.find((node) => node.id === 'audio-engine-workspace:authority')?.data.anchorId).toBe('audio-engine-source-of-truth')
    expect(model.nodes.find((node) => node.id === 'audio-engine-workspace:stream:20')?.data.selected).toBe(true)
    expect(model.edges.some((edge) => edge.animated)).toBe(true)
  })
})
