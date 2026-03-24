import { DRUM_MACHINE_DEFAULTS, normalizeDrumMachineState } from './drumMachineState'

describe('normalizeDrumMachineState', () => {
  it('fills missing drum state fields from defaults', () => {
    expect(
      normalizeDrumMachineState({
        ui_mode: 'practice',
        practice_variation: 2,
      }),
    ).toEqual({
      ...DRUM_MACHINE_DEFAULTS,
      ui_mode: 'practice',
      practice_variation: 2,
    })
  })

  it('preserves explicit runtime values', () => {
    expect(
      normalizeDrumMachineState({
        ui_mode: 'advanced',
        bpm: 142,
        volume: 61,
        pattern: 7,
        variation: 3,
        transport: true,
        swing: 18,
        active_pack: 'fusion-kit',
        practice_style_id: 'practice-1',
        practice_variation: 4,
        practice_change_quantization: 2,
        practice_count_in_bars: 0,
        practice_auto_fill: true,
      }),
    ).toEqual({
      ui_mode: 'advanced',
      bpm: 142,
      volume: 61,
      pattern: 7,
      variation: 3,
      transport: true,
      swing: 18,
      active_pack: 'fusion-kit',
      practice_style_id: 'practice-1',
      practice_variation: 4,
      practice_change_quantization: 2,
      practice_count_in_bars: 0,
      practice_auto_fill: true,
      midi_output_enabled: false,
      midi_clock_output_enabled: false,
      midi_output_channel: 9,
      program_change_enabled: false,
      track_swing: Array(16).fill(0),
      pad_sound_sources: Array(16).fill('sample'),
      pad_synth_params: Array.from({ length: 16 }, () => ({
        oscillator_type: 'triangle',
        pitch_envelope_start_hz: 180,
        pitch_envelope_end_hz: 48,
        pitch_envelope_decay_ms: 120,
        noise_level: 0.15,
        noise_decay_ms: 90,
        body_decay_ms: 240,
        tone_amount: 0.5,
      })),
      pad_filters: Array.from({ length: 16 }, () => ({
        type: 'lowpass',
        cutoff_hz: 20000,
        resonance: 0.2,
        env_amount: 0,
        env_decay_ms: 120,
      })),
      pad_cv_gate_configs: Array.from({ length: 16 }, (_, index) => ({
        enabled: false,
        output_pair: index,
        gate_length_ms: 120,
        note_min: 36,
        note_max: 84,
        pitch_min_volts: 0,
        pitch_max_volts: 5,
      })),
    })
  })
})
