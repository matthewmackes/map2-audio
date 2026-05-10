/**
 * T2499 Phase 1 — slotsToChoices unit test.
 *
 * Verifies the live SequencerSlot[] → BrainSlotChoice[] adapter so
 * the Configurator's brain-slot picker renders consistently across
 * the empty / asset-loaded / partial-state cases.
 */
import { slotsToChoices } from './MidiServicesConfiguratorPage'
import type { SequencerSlot } from '../../../map2/api'

function makeSlot(overrides: Partial<SequencerSlot> = {}): SequencerSlot {
  return {
    slot_id: 0,
    name: '',
    mode: 'drum',
    asset_type: 'empty',
    asset_path: '',
    source_label: '',
    level: 1,
    pan: 0,
    mute: false,
    solo: false,
    tune: 0,
    transpose: 0,
    output_bus: 0,
    polyphony: 16,
    midi_channel: 0,
    trigger_note: 36,
    trigger_notes: [36],
    key_low: 0,
    key_high: 127,
    velocity_low: 1,
    velocity_high: 127,
    choke_group: 0,
    articulation_group: 'main',
    velocity_curve: 'linear',
    status: 'ready',
    ...overrides,
  }
}

describe('slotsToChoices', () => {
  it('returns one BrainSlotChoice per slot, sorted by slot_id', () => {
    const slots = [
      makeSlot({ slot_id: 2, asset_type: 'sfz' as const, name: 'Hi-Hat' }),
      makeSlot({ slot_id: 0, asset_type: 'empty' as const }),
      makeSlot({ slot_id: 1, asset_type: 'kit' as const, source_label: 'Drum Kit' }),
    ]
    const choices = slotsToChoices(slots)
    expect(choices.map((c) => c.id)).toEqual([
      'brain-slot-0',
      'brain-slot-1',
      'brain-slot-2',
    ])
  })

  it('renders 1-based slot numbers in the label', () => {
    const choices = slotsToChoices([makeSlot({ slot_id: 0 })])
    expect(choices[0].label.startsWith('01 ')).toBe(true)
  })

  it('zero-pads single-digit slot numbers', () => {
    const choices = slotsToChoices([
      makeSlot({ slot_id: 0 }),
      makeSlot({ slot_id: 9 }),
      makeSlot({ slot_id: 15 }),
    ])
    expect(choices[0].label.startsWith('01 ')).toBe(true)
    expect(choices[1].label.startsWith('10 ')).toBe(true)
    expect(choices[2].label.startsWith('16 ')).toBe(true)
  })

  it('uses asset name + asset_type for labelled slots', () => {
    const choices = slotsToChoices([
      makeSlot({ slot_id: 0, asset_type: 'sfz' as const, name: 'Snare' }),
    ])
    expect(choices[0].label).toContain('Snare')
    expect(choices[0].label).toContain('sfz')
  })

  it('falls back to source_label when name is blank', () => {
    const choices = slotsToChoices([
      makeSlot({
        slot_id: 0,
        asset_type: 'kit' as const,
        name: '',
        source_label: 'Drum Kit',
      }),
    ])
    expect(choices[0].label).toContain('Drum Kit')
  })

  it('marks empty slots with "(empty)"', () => {
    const choices = slotsToChoices([
      makeSlot({ slot_id: 4, asset_type: 'empty' as const }),
    ])
    expect(choices[0].label).toContain('(empty)')
  })

  it('uses asset_path as description when present', () => {
    const choices = slotsToChoices([
      makeSlot({
        slot_id: 0,
        asset_type: 'sfz' as const,
        asset_path: '/srv/sfz/snare.sfz',
        name: 'Snare',
      }),
    ])
    expect(choices[0].description).toBe('/srv/sfz/snare.sfz')
  })

  it('falls back to mode when asset_path is blank', () => {
    const choices = slotsToChoices([
      makeSlot({ slot_id: 0, asset_type: 'empty' as const, mode: 'chromatic' as const }),
    ])
    expect(choices[0].description).toBe('chromatic')
  })
})
