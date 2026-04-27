/**
 * T2461-A1 — merge Hardware Store pinned profiles into the MIDI
 * Assignments wizard surface picker.
 */
import { mergeBenchPinsIntoSurfaces } from './MidiAssignmentsPage'

const baseSurfaces = [
  { id: 'mpx1', label: 'MPX-1', shortLabel: 'MPX1', status: 'online' as const,
    capabilities: ['midi'], meta: null },
  { id: 'push', label: 'Push', shortLabel: 'Push', status: 'planned' as const,
    capabilities: ['pads'], meta: null },
]

test('mergeBenchPinsIntoSurfaces: empty pin set returns the base surfaces unchanged', () => {
  const result = mergeBenchPinsIntoSurfaces(baseSurfaces, [])
  expect(result).toBe(baseSurfaces)
})

test('mergeBenchPinsIntoSurfaces: pinned profile keys prepend synthetic entries', () => {
  const result = mergeBenchPinsIntoSurfaces(baseSurfaces, [
    'edirol-ua/ua-1000.midi',
    'hotone/jogg.midi',
  ])
  expect(result).toHaveLength(4)
  expect(result[0].id).toBe('bench-pin:edirol-ua/ua-1000.midi')
  expect(result[0].label).toBe('ua-1000 (Hardware Store pin)')
  expect(result[0].shortLabel).toBe('ua-1000')
  expect(result[0].status).toBe('online')
  expect(result[0].capabilities).toContain('midi bindings')
  expect(result[0].capabilities).toContain('pinned in Hardware Store')
  expect(result[1].id).toBe('bench-pin:hotone/jogg.midi')
  // Base surfaces still follow.
  expect(result[2].id).toBe('mpx1')
  expect(result[3].id).toBe('push')
})

test('mergeBenchPinsIntoSurfaces: malformed profile keys are skipped', () => {
  const result = mergeBenchPinsIntoSurfaces(baseSurfaces, [
    'malformed-no-slash',
    'edirol-ua/ua-1000.audio',
    '',
  ])
  expect(result).toHaveLength(3)
  expect(result[0].id).toBe('bench-pin:edirol-ua/ua-1000.audio')
  expect(result[0].capabilities).toContain('audio bindings')
})

test('mergeBenchPinsIntoSurfaces: dedupes against any existing surface with the same synthetic id', () => {
  const surfaces = [
    ...baseSurfaces,
    { id: 'bench-pin:edirol-ua/ua-1000.midi', label: 'pre-existing', shortLabel: 'x',
      status: 'online' as const, capabilities: [], meta: null },
  ]
  const result = mergeBenchPinsIntoSurfaces(surfaces, ['edirol-ua/ua-1000.midi'])
  // No duplicate added; existing surface preserved.
  expect(result).toHaveLength(3)
  expect(result.filter((s) => s.id === 'bench-pin:edirol-ua/ua-1000.midi')).toHaveLength(1)
})

test('mergeBenchPinsIntoSurfaces: kind defaults to midi when profile_key has no dot', () => {
  const result = mergeBenchPinsIntoSurfaces(baseSurfaces, ['edirol-ua/ua-1000'])
  expect(result[0].id).toBe('bench-pin:edirol-ua/ua-1000')
  expect(result[0].capabilities).toContain('midi bindings')
})
