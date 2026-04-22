import {
  DEVICE_REGISTRY,
  buildDeviceRoute,
  resolveDeviceOpenRoute,
} from './deviceRegistry'

describe('deviceRegistry.resolveDeviceOpenRoute', () => {
  it('returns the unified /devices/:id/:defaultView route for hardware devices', () => {
    const mpx1 = DEVICE_REGISTRY.find((entry) => entry.id === 'mpx1')
    if (!mpx1) throw new Error('Fixture assumption broken: mpx1 missing from registry')
    expect(resolveDeviceOpenRoute(mpx1.id)).toBe(buildDeviceRoute(mpx1.id))
    expect(resolveDeviceOpenRoute(mpx1.id)).toBe(`/devices/${mpx1.id}/${mpx1.defaultView}`)
  })

  it('returns the legacyRoute for every control-surface registry entry so clicks land on a real page', () => {
    const controlSurfaces = DEVICE_REGISTRY.filter((entry) => entry.kind === 'control-surface')
    expect(controlSurfaces.length).toBeGreaterThan(0)
    for (const entry of controlSurfaces) {
      expect(entry.legacyRoute).toBeTruthy()
      expect(resolveDeviceOpenRoute(entry.id)).toBe(entry.legacyRoute)
    }
  })

  it('falls back to buildDeviceRoute for unknown IDs (defensive, keeps callers simple)', () => {
    expect(resolveDeviceOpenRoute('does-not-exist')).toBe('/devices/does-not-exist/overview')
  })
})
