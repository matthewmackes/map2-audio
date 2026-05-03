import { resolveShellRouteMeta } from './shellRouteMeta'

describe('resolveShellRouteMeta', () => {
  it('resolves Node Ops platform routes with canonical labels', () => {
    // Nav reorg 2026-05-03 (second pass) — canonical mount is now
    // `/node-ops/<id>` (no `Platforms` middle breadcrumb level).
    // The legacy `/platforms/api-webhooks` path still resolves but
    // with the new clean breadcrumb shape.
    const meta = resolveShellRouteMeta('/platforms/api-webhooks')
    expect(meta?.windowLabel).toBe('API Webhooks')
    expect(meta?.breadcrumbs.map((crumb) => crumb.label)).toEqual(['Node Ops', 'API Webhooks'])

    const canonical = resolveShellRouteMeta('/node-ops/api-webhooks')
    expect(canonical?.windowLabel).toBe('API Webhooks')
    expect(canonical?.breadcrumbs.map((crumb) => crumb.label)).toEqual(['Node Ops', 'API Webhooks'])
  })

  it('resolves dynamic device detail routes', () => {
    const meta = resolveShellRouteMeta('/devices/profile/vendor-pack/device-model/v2')
    expect(meta?.windowLabel).toBe('Device Device Model')
    expect(meta?.breadcrumbs[0]?.to).toBe('/devices')
    expect(meta?.breadcrumbs.map((crumb) => crumb.label)).toEqual(['Devices', 'Vendor Pack', 'Device Model'])
  })

  it('resolves wildcard device subroutes', () => {
    const mpx1 = resolveShellRouteMeta('/devices/mpx1/panel')
    const lcd = resolveShellRouteMeta('/devices/lcd/alerts')
    expect(mpx1?.windowLabel).toBe('MPX1')
    expect(lcd?.windowLabel).toBe('LCD')
  })

  it('returns null for unknown routes', () => {
    expect(resolveShellRouteMeta('/definitely/unknown/route')).toBeNull()
  })

  it('resolves publish route with snapshot id in breadcrumb', () => {
    const meta = resolveShellRouteMeta('/snapshots/abc123/publish')
    expect(meta?.breadcrumbs.map((crumb) => crumb.label)).toEqual(['Snapshots', '#abc123', 'Publish'])
  })

  it('resolves midi hub wildcard with dynamic segment label', () => {
    // T2491 (2026-05-02 cleanup) — operator-visible label aligned to
    // T2482 iter-94 rename "MIDI Hub" → "MIDI Services". The legacy
    // /midi-hub/* path stays as a fallback for stale bookmarks but
    // the breadcrumb says "MIDI Services".
    const meta = resolveShellRouteMeta('/midi-hub/custom-workbench')
    expect(meta?.windowLabel).toBe('MIDI Custom Workbench')
    expect(meta?.breadcrumbs.map((crumb) => crumb.label)).toEqual(['MIDI Services', 'Custom Workbench'])
  })

  it('covers critical app routes', () => {
    // Nav reorg 2026-05-03 (second pass) — critical-route list now
    // includes the canonical `/node-ops/*` mounts and the new
    // `/artifacts` and `/about` top-level mounts. Legacy paths are
    // retained for one transition cycle.
    const criticalRoutes = [
      // Canonical post-reorg mounts
      '/node-ops',
      '/node-ops/overview',
      '/node-ops/audio-engine',
      '/node-ops/network-discovery',
      '/node-ops/cluster-dashboard',
      '/node-ops/midpoint',
      '/node-ops/adoption',
      '/node-ops/management',
      '/node-ops/theme',
      '/artifacts',
      '/artifacts/discover',
      '/about',
      // Legacy fallback routes (still resolve via redirects)
      '/workspace/platforms/overview',
      '/workspace/platforms/audio-engine',
      '/workspace/artifacts',
      '/workspace/artifacts/discover',
      // Other unchanged routes
      '/brain',
      '/snapshot-editor',
      '/snapshots',
      '/snapshots/id-1/publish',
      '/midi-hub/connections',
      '/midi-hub/network',
      '/midi/assignments',
      '/devices',
      '/devices/diagnostics',
      '/devices/pack-sources',
      '/devices/profile/edirol-ua/ua-1000/v2',
      '/devices/mpx1/panel',
      '/devices/intelfx/panel',
      '/maschine',
      '/mcu',
      '/launch-control',
      '/midi-commander',
      '/labs/push-surface',
      '/state-authority',
      '/metering',
      '/pipewire',
      '/ground-control-pro',
      '/expression',
      '/chains',
    ]
    for (const route of criticalRoutes) {
      expect(resolveShellRouteMeta(route)).not.toBeNull()
    }
  })
})
