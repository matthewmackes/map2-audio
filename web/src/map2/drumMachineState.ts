import type { DrumMachineState } from './types'

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
