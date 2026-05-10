/**
 * T2499 Phase 1 — frontend pack-registry indirection.
 *
 * Locks the contract that
 *   - Every backend-registered pack_id has a frontend descriptor.
 *   - lookupPackDescriptor returns undefined (silent filter) for
 *     unknown ids.
 *   - listLocalPacks returns the full registry as the offline
 *     fallback.
 */
import {
  FRONTEND_PACK_REGISTRY,
  listLocalPacks,
  lookupPackDescriptor,
} from './index'

describe('FRONTEND_PACK_REGISTRY', () => {
  it('registers MeloAudio Commander under the backend pack_id', () => {
    expect(FRONTEND_PACK_REGISTRY.meloaudio_commander).toBeDefined()
    expect(FRONTEND_PACK_REGISTRY.meloaudio_commander.displayName).toContain('MeloAudio')
  })

  it('registers Maschine MK1 under the backend pack_id', () => {
    expect(FRONTEND_PACK_REGISTRY.maschine_mk1).toBeDefined()
    expect(FRONTEND_PACK_REGISTRY.maschine_mk1.displayName).toContain('Maschine')
  })

  it('is frozen — packs cannot be added or removed at runtime', () => {
    expect(Object.isFrozen(FRONTEND_PACK_REGISTRY)).toBe(true)
  })
})

describe('lookupPackDescriptor', () => {
  it('returns the descriptor for a known pack_id', () => {
    const descriptor = lookupPackDescriptor('meloaudio_commander')
    expect(descriptor).toBeDefined()
    expect(descriptor?.packId).toBe('meloaudio')
  })

  it('returns undefined for unknown pack_ids', () => {
    expect(lookupPackDescriptor('nonexistent_pack')).toBeUndefined()
  })

  it('is case-sensitive', () => {
    expect(lookupPackDescriptor('Meloaudio_commander')).toBeUndefined()
  })
})

describe('listLocalPacks', () => {
  it('returns every registered descriptor', () => {
    const packs = listLocalPacks()
    expect(packs.length).toBeGreaterThan(0)
    expect(packs.find((p) => p.displayName.includes('MeloAudio'))).toBeDefined()
  })
})
