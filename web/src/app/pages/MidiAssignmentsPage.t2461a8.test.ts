/** T2461-A8 — Mixxx-shorthand parsers used by the wizard target step. */
import { parseMixxxShorthand, parseBenchPinSurfaceId } from './MidiAssignmentsPage'

describe('parseMixxxShorthand', () => {
  test('matches simple [Group].key form', () => {
    expect(parseMixxxShorthand('[Channel1].volume'))
      .toEqual({ group: '[Channel1]', key: 'volume' })
  })

  test('tolerates surrounding whitespace', () => {
    expect(parseMixxxShorthand('  [Master].crossfader  '))
      .toEqual({ group: '[Master]', key: 'crossfader' })
  })

  test('matches groups with spaces and digits', () => {
    expect(parseMixxxShorthand('[Channel 1].play'))
      .toEqual({ group: '[Channel 1]', key: 'play' })
  })

  test('rejects plain text', () => {
    expect(parseMixxxShorthand('audio.master.volume')).toBeNull()
  })

  test('rejects malformed group bracket', () => {
    expect(parseMixxxShorthand('Channel1.volume')).toBeNull()
  })

  test('rejects shorthand without a key', () => {
    expect(parseMixxxShorthand('[Channel1].')).toBeNull()
    expect(parseMixxxShorthand('[Channel1]')).toBeNull()
  })

  test('rejects empty input', () => {
    expect(parseMixxxShorthand('')).toBeNull()
  })
})

describe('parseBenchPinSurfaceId', () => {
  test('parses a midi bench-pin surface id', () => {
    expect(parseBenchPinSurfaceId('bench-pin:edirol-ua/ua-1000.midi'))
      .toEqual({ packId: 'edirol-ua', model: 'ua-1000', kind: 'midi' })
  })

  test('parses a hid bench-pin surface id', () => {
    expect(parseBenchPinSurfaceId('bench-pin:hotone/jogg.hid'))
      .toEqual({ packId: 'hotone', model: 'jogg', kind: 'hid' })
  })

  test('defaults kind to midi when no dot suffix', () => {
    expect(parseBenchPinSurfaceId('bench-pin:edirol-ua/ua-1000'))
      .toEqual({ packId: 'edirol-ua', model: 'ua-1000', kind: 'midi' })
  })

  test('returns null for non-bench-pin ids', () => {
    expect(parseBenchPinSurfaceId('mpx1')).toBeNull()
    expect(parseBenchPinSurfaceId('push')).toBeNull()
  })

  test('returns null for malformed bench-pin payload', () => {
    expect(parseBenchPinSurfaceId('bench-pin:malformed-no-slash')).toBeNull()
  })
})
