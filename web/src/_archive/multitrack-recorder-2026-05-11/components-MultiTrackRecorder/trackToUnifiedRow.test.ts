import { trackToUnifiedRow, dawTrackChainId } from './trackToUnifiedRow'
import type { DawTrack } from '../../stores/dawProjectStore'

function makeTrack(overrides: Partial<DawTrack> = {}): DawTrack {
  return {
    id: 0,
    type: 'audio',
    name: 'Audio 1',
    armed: false,
    muted: false,
    solo: false,
    plugins: [],
    ...overrides,
  }
}

describe('trackToUnifiedRow', () => {
  it('produces a row with the expected id, name, and 8 empty slots for a bare track', () => {
    const row = trackToUnifiedRow(makeTrack())
    expect(row.id).toBe('daw-track-0')
    expect(row.name).toBe('Audio 1')
    expect(row.ioLabel).toBe('Audio')
    expect(row.slots).toHaveLength(8)
    expect(row.slots.every((s) => s.kind === null)).toBe(true)
  })

  it('marks MIDI tracks with the MIDI ioLabel and mono stereo flag', () => {
    const row = trackToUnifiedRow(makeTrack({ type: 'midi', name: 'Drums' }))
    expect(row.ioLabel).toBe('MIDI')
    expect(row.stereo).toBe(false)
  })

  it('populates plugin slots, clamps overflow into slot 7, and guesses categories', () => {
    const track = makeTrack({
      plugins: [
        { slot_index: 0, uri: 'urn:test:reverb', display_name: 'Hall Reverb', bypass: false, params: {} },
        { slot_index: 1, uri: 'urn:test:eq3', display_name: '3-Band EQ', bypass: true, params: {} },
        { slot_index: 99, uri: 'urn:test:limiter', display_name: 'Brick Limiter', bypass: false, params: {} },
      ],
    })
    const row = trackToUnifiedRow(track)
    expect(row.slots[0].label).toBe('Hall Reverb')
    expect(row.slots[0].category).toBe('Reverb')
    expect(row.slots[1].label).toBe('3-Band EQ')
    expect(row.slots[1].category).toBe('EQ')
    expect(row.slots[1].bypass).toBe(true)
    expect(row.slots[7].label).toBe('Brick Limiter')
    expect(row.slots[7].category).toBe('Dynamics')
  })

  it('dawTrackChainId is stable and prefixed', () => {
    expect(dawTrackChainId(42)).toBe('daw-track-42')
  })

  it('surfaces mute/solo from the track', () => {
    const row = trackToUnifiedRow(makeTrack({ muted: true, solo: true }))
    expect(row.muted).toBe(true)
    expect(row.solo).toBe(true)
  })
})
