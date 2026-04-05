import { applyBrainRuntimeUpdate } from './useBrainRuntimeState'

function makeRuntimeUpdate() {
  return {
    resource: 'transport' as const,
    scope: {
      runtime_instance_id: 'instance-17__position-3',
      instance_id: '17',
      plugin_position: 3,
    },
    state: {
      instance_id: 'instance-17__position-3',
      product_name: 'Performance Brain',
      set_name: 'Authority Brain',
      active_slot: 1,
      active_layer_id: 'main-stack',
      active_section: 'perform' as const,
      transport: {
        is_playing: true,
        bpm: 131,
        swing: 10,
        pattern: 4,
        variation: 1,
        step: 0,
        bar: 1,
        beat: 1,
        pending_pattern: -1,
        switch_quantization_beats: 4,
      },
      slots: [],
      layers: [],
      sequence: {
        pattern_bank_size: 128,
        max_steps: 64,
        current_pattern: 4,
        current_variation: 1,
        patterns: [],
        lanes: [],
        fill_mode: 'manual',
        song_entry_count: 0,
      },
      song: { entries: [], loop: false },
      mixer: {
        buses: [],
        master: {
          master_volume: 0.82,
          drive_db: 0,
          compressor_amount: 0.2,
          reverb_mix: 0.18,
          limiter_ceiling_db: -0.5,
        },
      },
      inputs: { keyboard_zones: [], trigger_profiles: [], controller_assignments: [] },
      library: { collections: [], featured_assets: [], last_scan_iso: '2026-04-05T19:00:00Z' },
      sample_editor: {
        slot_id: 1,
        asset_path: '',
        waveform_available: false,
        duration_seconds: 0,
        start_sample: 0,
        end_sample: 0,
        normalize_target: 0.99,
        reverse_enabled: true,
        record_target_path: '',
      },
      diagnostics: {
        sample_rate_hz: 48000,
        buffer_size_samples: 128,
        cpu_load_percent: 7.5,
        active_voices: 4,
        peak_voices: 12,
        polyphony_headroom: 84,
        trigger_latency_ms: 2.1,
        roundtrip_latency_ms: 5.2,
        xruns: 0,
        backend_mode: 'hybrid',
        warnings: [],
        last_import_source: null,
        updated_at_iso: '2026-04-05T19:00:00Z',
      },
      snapshot_integration: {
        authority_model: 'snapshot-first' as const,
        snapshot_id: null,
        snapshot_name: null,
        committed_state_id: 'brain:committed:instance-17__position-3',
        desired_state_id: 'brain:desired:instance-17__position-3',
        observed_state_id: 'brain:observed:instance-17__position-3',
      },
    },
  }
}

describe('applyBrainRuntimeUpdate', () => {
  it('updates scoped Brain caches and invalidates authoritative audio-state queries', () => {
    const queryClient = {
      setQueryData: jest.fn(),
      invalidateQueries: jest.fn(),
    }

    const handled = applyBrainRuntimeUpdate(
      queryClient,
      makeRuntimeUpdate(),
      { instanceId: 17, pluginPosition: 3 },
      '17:3',
    )

    expect(handled).toBe(true)
    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      ['brain', 'state', '17:3'],
      expect.objectContaining({ set_name: 'Authority Brain' }),
    )
    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      ['brain', 'transport', '17:3'],
      expect.objectContaining({ bpm: 131, is_playing: true }),
    )
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['audio-state', 'committed'] })
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['audio-state', 'desired'] })
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['audio-state', 'observed'] })
  })

  it('ignores runtime updates for other scoped Brain instances', () => {
    const queryClient = {
      setQueryData: jest.fn(),
      invalidateQueries: jest.fn(),
    }

    const handled = applyBrainRuntimeUpdate(
      queryClient,
      makeRuntimeUpdate(),
      { instanceId: 99, pluginPosition: 3 },
      '99:3',
    )

    expect(handled).toBe(false)
    expect(queryClient.setQueryData).not.toHaveBeenCalled()
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled()
  })
})
