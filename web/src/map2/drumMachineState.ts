import type { DrumMachineState } from './types'

const DEFAULT_TRACK_SWING = Array(16).fill(0)
const DEFAULT_PAD_SOUND_SOURCES = Array(16).fill('sample')
const DEFAULT_PAD_SYNTH_PARAMS = Array.from({ length: 16 }, () => ({
  oscillator_type: 'triangle' as const,
  pitch_envelope_start_hz: 180,
  pitch_envelope_end_hz: 48,
  pitch_envelope_decay_ms: 120,
  noise_level: 0.15,
  noise_decay_ms: 90,
  body_decay_ms: 240,
  tone_amount: 0.5,
}))
const DEFAULT_PAD_FILTERS = Array.from({ length: 16 }, () => ({
  type: 'lowpass' as const,
  cutoff_hz: 20000,
  resonance: 0.2,
  env_amount: 0,
  env_decay_ms: 120,
}))
const DEFAULT_PAD_CV_GATE_CONFIGS = Array.from({ length: 16 }, (_, index) => ({
  enabled: false,
  output_pair: index,
  gate_length_ms: 120,
  note_min: 36,
  note_max: 84,
  pitch_min_volts: 0,
  pitch_max_volts: 5,
}))

const DRUM_MACHINE_DEFAULTS: DrumMachineState = {
  ui_mode: 'practice',
  bpm: 120,
  volume: 80,
  pattern: 0,
  variation: 0,
  transport: false,
  swing: 0,
  active_pack: null,
  practice_style_id: null,
  practice_variation: 0,
  practice_change_quantization: 1,
  practice_count_in_bars: 1,
  practice_auto_fill: false,
  midi_output_enabled: false,
  midi_clock_output_enabled: false,
  midi_output_channel: 9,
  program_change_enabled: false,
  track_swing: DEFAULT_TRACK_SWING,
  pad_sound_sources: DEFAULT_PAD_SOUND_SOURCES,
  pad_synth_params: DEFAULT_PAD_SYNTH_PARAMS,
  pad_filters: DEFAULT_PAD_FILTERS,
  pad_cv_gate_configs: DEFAULT_PAD_CV_GATE_CONFIGS,
}

export function normalizeDrumMachineState(
  state?: Partial<DrumMachineState> | null,
): DrumMachineState {
  return {
    ...DRUM_MACHINE_DEFAULTS,
    ...state,
  }
}

export { DRUM_MACHINE_DEFAULTS }
