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
          promoted_advanced_routes: ['/midi-hub'],
          landing_tiles: [{ route: '/platforms/workspace-catalog', size: 'large' }],
          snapshot_setlist_mode: false,
          snapshot_setlist_order: [5],
          last_active_node: null,
          version: 97,
        }),
      } as Response)

    const { result } = renderHook(() => useSpecialSettings())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.settings?.menuLocation).toBe('hidden')
    expect(result.current.settings?.pinnedRoutes).toEqual(['/platforms/about', '/juce-grid'])
    expect(result.current.settings?.landingTiles).toEqual([{ route: '/platforms/overview', size: 'medium' }])
    expect(result.current.settings?.snapshotSetlistMode).toBe(true)
    expect(result.current.settings?.snapshotSetlistOrder).toEqual([9, 12])

    await act(async () => {
      await result.current.updateSettings({
        pinnedRoutes: ['/midi-hub'],
        landingTiles: [{ route: '/platforms/workspace-catalog', size: 'large' }],
        snapshotSetlistMode: false,
        snapshotSetlistOrder: [5],
      })
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const postCall = fetchMock.mock.calls[1]
    expect(postCall?.[0]).toBe('/api/settings/special/')
    expect(postCall?.[1]?.method).toBe('POST')

    const payload = JSON.parse(String(postCall?.[1]?.body))
    expect(payload.menu_location).toBe('hidden')
    expect(payload.pinned_routes).toEqual(['/midi-hub'])
    expect(payload.landing_tiles).toEqual([
      { route: '/platforms/overview', size: 'medium' },
      { route: '/platforms/workspace-catalog', size: 'large' },
    ])
    expect(payload.snapshot_setlist_mode).toBe(false)
    expect(payload.snapshot_setlist_order).toEqual([5])
    expect(payload.promoted_advanced_routes).toEqual(['/midi-hub'])

    await waitFor(() => expect(result.current.settings?.pinnedRoutes).toEqual(['/midi-hub']))
    expect(result.current.settings?.landingTiles).toEqual([
      { route: '/platforms/overview', size: 'medium' },
      { route: '/platforms/workspace-catalog', size: 'large' },
    ])
    expect(result.current.settings?.snapshotSetlistMode).toBe(false)
    expect(result.current.settings?.snapshotSetlistOrder).toEqual([5])
    expect(result.current.settings?.menuLocation).toBe('hidden')
  })
})
