import { resolveShellRouteMeta } from './shellRouteMeta'

describe('resolveShellRouteMeta', () => {
  it('resolves Node Ops platform routes with canonical labels', () => {
    const meta = resolveShellRouteMeta('/platforms/api-webhooks')
    expect(meta?.windowLabel).toBe('API Webhooks')
    expect(meta?.breadcrumbs.map((crumb) => crumb.label)).toEqual(['Node Ops', 'Platforms', 'API Webhooks'])
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
    const meta = resolveShellRouteMeta('/midi-hub/custom-workbench')
    expect(meta?.windowLabel).toBe('MIDI Custom Workbench')
    expect(meta?.breadcrumbs.map((crumb) => crumb.label)).toEqual(['MIDI Hub', 'Custom Workbench'])
  })

  it('covers critical app routes', () => {
    const criticalRoutes = [
      '/workspace/platforms/overview',
      '/workspace/platforms/audio-engine',
      '/workspace/artifacts',
      '/workspace/artifacts/discover',
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
