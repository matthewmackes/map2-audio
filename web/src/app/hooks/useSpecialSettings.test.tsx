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

  it('normalizes legacy top-nav settings to hidden and writes both pinned route fields for backend compatibility', async () => {
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
          last_active_node: null,
          version: 97,
        }),
      } as Response)

    const { result } = renderHook(() => useSpecialSettings())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.settings?.menuLocation).toBe('hidden')
    expect(result.current.settings?.pinnedRoutes).toEqual(['/juce-grid'])

    await act(async () => {
      await result.current.updateSettings({ pinnedRoutes: ['/midi-hub'] })
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const postCall = fetchMock.mock.calls[1]
    expect(postCall?.[0]).toBe('/api/settings/special/')
    expect(postCall?.[1]?.method).toBe('POST')

    const payload = JSON.parse(String(postCall?.[1]?.body))
    expect(payload.menu_location).toBe('hidden')
    expect(payload.pinned_routes).toEqual(['/midi-hub'])
    expect(payload.promoted_advanced_routes).toEqual(['/midi-hub'])

    await waitFor(() => expect(result.current.settings?.pinnedRoutes).toEqual(['/midi-hub']))
    expect(result.current.settings?.menuLocation).toBe('hidden')
  })
})
