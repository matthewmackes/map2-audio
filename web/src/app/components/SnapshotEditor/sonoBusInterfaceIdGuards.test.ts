/**
 * T2521-7 cycle 35 — SonoBus interface-ID guards (frontend) tests.
 *
 * Locks the parity contract with the backend
 * `app/services/sonobus/interface_ids.py` helpers: same prefix,
 * same 4-segment shape, same empty-field rejection.
 */
import {
  SONOBUS_ID_PREFIX,
  isSonoBusInterfaceId,
  makeSonoBusInterfaceId,
  parseSonoBusInterfaceId,
} from './sonoBusInterfaceIdGuards'

describe('SONOBUS_ID_PREFIX', () => {
  it('matches the backend canonical prefix', () => {
    expect(SONOBUS_ID_PREFIX).toBe('sonobus:')
  })
})

describe('isSonoBusInterfaceId', () => {
  it('returns true for a valid full ID', () => {
    expect(isSonoBusInterfaceId('sonobus:peer-A:grp-1:stream-1')).toBe(true)
  })

  it('returns false for non-SonoBus IDs', () => {
    expect(isSonoBusInterfaceId('pipewire:usb:0x582:0x0007:edirol')).toBe(false)
    expect(isSonoBusInterfaceId('avb:endpoint-001')).toBe(false)
    expect(isSonoBusInterfaceId('cluster:peer-7:tascam')).toBe(false)
  })

  it('returns false for empty / undefined / non-string inputs', () => {
    expect(isSonoBusInterfaceId('')).toBe(false)
    expect(isSonoBusInterfaceId(null)).toBe(false)
    expect(isSonoBusInterfaceId(undefined)).toBe(false)
    expect(isSonoBusInterfaceId(42)).toBe(false)
  })

  it('returns false for the bare prefix without segments', () => {
    expect(isSonoBusInterfaceId('sonobus:')).toBe(false)
  })
})

describe('parseSonoBusInterfaceId', () => {
  it('parses a full ID into its 3 segments', () => {
    expect(parseSonoBusInterfaceId('sonobus:peer-A:grp-1:stream-1')).toEqual({
      peer: 'peer-A',
      group: 'grp-1',
      stream: 'stream-1',
    })
  })

  it('returns null for a non-SonoBus ID', () => {
    expect(parseSonoBusInterfaceId('avb:endpoint-001')).toBeNull()
  })

  it('returns null for too-few segments', () => {
    expect(parseSonoBusInterfaceId('sonobus:peer-A:grp-1')).toBeNull()
  })

  it('returns null for too-many segments', () => {
    expect(parseSonoBusInterfaceId('sonobus:a:b:c:d')).toBeNull()
  })

  it('returns null when any segment is empty', () => {
    expect(parseSonoBusInterfaceId('sonobus::grp:stream')).toBeNull()
    expect(parseSonoBusInterfaceId('sonobus:peer::stream')).toBeNull()
    expect(parseSonoBusInterfaceId('sonobus:peer:grp:')).toBeNull()
  })
})

describe('makeSonoBusInterfaceId', () => {
  it('builds a canonical ID from 3 non-empty parts', () => {
    expect(makeSonoBusInterfaceId('peer-A', 'grp-1', 'stream-1')).toBe('sonobus:peer-A:grp-1:stream-1')
  })

  it('round-trips through parseSonoBusInterfaceId', () => {
    const id = makeSonoBusInterfaceId('A', 'B', 'C')
    expect(parseSonoBusInterfaceId(id)).toEqual({ peer: 'A', group: 'B', stream: 'C' })
  })

  it('throws on any empty part', () => {
    expect(() => makeSonoBusInterfaceId('', 'b', 'c')).toThrow()
    expect(() => makeSonoBusInterfaceId('a', '', 'c')).toThrow()
    expect(() => makeSonoBusInterfaceId('a', 'b', '')).toThrow()
  })

  it('throws when any part contains a colon', () => {
    expect(() => makeSonoBusInterfaceId('a:b', 'c', 'd')).toThrow()
    expect(() => makeSonoBusInterfaceId('a', 'b:c', 'd')).toThrow()
    expect(() => makeSonoBusInterfaceId('a', 'b', 'c:d')).toThrow()
  })
})
