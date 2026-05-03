import { act, renderHook, waitFor } from '@testing-library/react'
import { useSpecialSettings } from './useSpecialSettings'

jest.mock('../utils/apiTarget', () => ({
  apiUrl: (path: string) => path,
  wsUrl: (path: string) => `ws://localhost${path}`,
}))

class MockWebSocket {
  onmessage: ((event: MessageEvent) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null

  close() {}
}

describe('useSpecialSettings', () => {
  const originalFetch = global.fetch
  const originalWebSocket = global.WebSocket

  beforeEach(() => {
    global.WebSocket = MockWebSocket as unknown as typeof WebSocket
    global.fetch = jest.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
    global.WebSocket = originalWebSocket
    jest.resetAllMocks()
  })

  it('normalizes legacy top-nav settings to hidden and persists landing tiles with pinned routes', async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          enabled: true,
          hidden_plugins: [],
          menu_location: 'top-nav',
          promoted_advanced_routes: ['/welcome', '/grid'],
          snapshot_setlist_mode: true,
          snapshot_setlist_order: [9, 12],
          'snapshot_editor.flow_animation': 'packet',
          'snapshot_editor.grid_backdrop': false,
          'snapshot_editor.node_shape': 'hex',
          last_active_node: null,
          version: 96,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          enabled: true,
          hidden_plugins: [],
          menu_location: 'hidden',
          // Nav reorg 2026-05-03: /intelfx no longer pinnable (T2485-8); use
          // /hardware/host-machine which is the canonical alias for /host-machine.
          promoted_advanced_routes: ['/hardware/host-machine'],
          // /platforms/workspace-catalog is invalid post-reorg → normalizes to
          // empty, then ensureRequiredHomeLauncher seeds /node-ops.
          landing_tiles: [{ route: '/node-ops', size: 'medium' }],
          snapshot_setlist_mode: false,
          snapshot_setlist_order: [5],
          'snapshot_editor.flow_animation': 'scan',
          'snapshot_editor.grid_backdrop': true,
          'snapshot_editor.node_shape': 'rounded',
          last_active_node: null,
          version: 97,
        }),
      } as Response)

    const { result } = renderHook(() => useSpecialSettings())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.settings?.menuLocation).toBe('hidden')
    // Nav reorg 2026-05-03 (second pass) — `/welcome` aliases to
    // `/about`; the required home launcher is now `/node-ops`.
    expect(result.current.settings?.pinnedRoutes).toEqual(['/about'])
    expect(result.current.settings?.landingTiles).toEqual([{ route: '/node-ops', size: 'medium' }])
    expect(result.current.settings?.snapshotSetlistMode).toBe(true)
    expect(result.current.settings?.snapshotSetlistOrder).toEqual([9, 12])
    expect(result.current.settings?.['snapshot_editor.flow_animation']).toBe('packet')
    expect(result.current.settings?.['snapshot_editor.grid_backdrop']).toBe(false)
    expect(result.current.settings?.['snapshot_editor.node_shape']).toBe('hex')

    await act(async () => {
      await result.current.updateSettings({
        pinnedRoutes: ['/host-machine'],
        landingTiles: [{ route: '/platforms/workspace-catalog', size: 'large' }],
        snapshotSetlistMode: false,
        snapshotSetlistOrder: [5],
        'snapshot_editor.flow_animation': 'scan',
        'snapshot_editor.grid_backdrop': true,
        'snapshot_editor.node_shape': 'rounded',
      })
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const postCall = fetchMock.mock.calls[1]
    expect(postCall?.[0]).toBe('/api/settings/special/')
    expect(postCall?.[1]?.method).toBe('POST')

    const payload = JSON.parse(String(postCall?.[1]?.body))
    expect(payload.menu_location).toBe('hidden')
    // Nav reorg 2026-05-03 — /intelfx no longer pinnable (T2485-8 sidebar
    // collapse 9→1); /host-machine is the canonical pinnable example. The
    // required home launcher is now /node-ops (was /workspace).
    expect(payload.pinned_routes).toEqual(['/hardware/host-machine'])
    expect(payload.landing_tiles).toEqual([
      { route: '/node-ops', size: 'medium' },
    ])
    expect(payload.snapshot_setlist_mode).toBe(false)
    expect(payload.snapshot_setlist_order).toEqual([5])
    expect(payload['snapshot_editor.flow_animation']).toBe('scan')
    expect(payload['snapshot_editor.grid_backdrop']).toBe(true)
    expect(payload['snapshot_editor.node_shape']).toBe('rounded')
    expect(payload.promoted_advanced_routes).toEqual(['/hardware/host-machine'])

    await waitFor(() => expect(result.current.settings?.pinnedRoutes).toEqual(['/hardware/host-machine']))
    expect(result.current.settings?.landingTiles).toEqual([{ route: '/node-ops', size: 'medium' }])
    expect(result.current.settings?.snapshotSetlistMode).toBe(false)
    expect(result.current.settings?.snapshotSetlistOrder).toEqual([5])
    expect(result.current.settings?.['snapshot_editor.flow_animation']).toBe('scan')
    expect(result.current.settings?.['snapshot_editor.grid_backdrop']).toBe(true)
    expect(result.current.settings?.['snapshot_editor.node_shape']).toBe('rounded')
    expect(result.current.settings?.menuLocation).toBe('hidden')
  })
})
