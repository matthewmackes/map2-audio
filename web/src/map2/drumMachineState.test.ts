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
    })
  })
})
