import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'

import { ClusterProvider, useCluster } from './ClusterContext'

const mockUpdateSettings = jest.fn()
const mockUseSpecialSettings = jest.fn()

jest.mock('../hooks/useSpecialSettings', () => ({
  useSpecialSettings: () => mockUseSpecialSettings(),
}))

function makeJsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: jest.fn().mockResolvedValue(payload),
  } as unknown as Response
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  })

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ClusterProvider>{children}</ClusterProvider>
      </QueryClientProvider>
    )
  }
}

describe('ClusterContext', () => {
  const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>

  beforeEach(() => {
    window.localStorage.clear()
    ;(globalThis as { fetch?: typeof fetch }).fetch = fetchMock
    fetchMock.mockReset()
    mockUpdateSettings.mockReset()
    mockUpdateSettings.mockResolvedValue(undefined)
    mockUseSpecialSettings.mockReset()
    mockUseSpecialSettings.mockReturnValue({
      settings: {
        enabled: false,
        hiddenPlugins: [],
        menuLocation: 'hidden',
        pinnedRoutes: [],
        lastActiveNode: null,
      },
      isLoading: false,
      error: null,
      updateSettings: mockUpdateSettings,
      reload: jest.fn(),
    })
  })

  afterEach(() => {
    delete (globalThis as { fetch?: typeof fetch }).fetch
    window.localStorage.clear()
  })

  it('restores the active node from localStorage and exposes node-aware API prefixes', async () => {
    window.localStorage.setItem('map2_active_node', 'node-b')
    fetchMock.mockResolvedValueOnce(
      makeJsonResponse({
        local_node_id: 'node-a',
        peers: [
          {
            node_id: 'node-b',
            node_mode: 'AUDIO-NODE',
            host: 'rack-b',
            api_url: 'http://rack-b:8080',
            last_seen: new Date().toISOString(),
            latency_ms: 12.5,
          },
        ],
      }),
    )

    const { result } = renderHook(() => useCluster(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.nodes.length).toBe(2))

    expect(fetchMock).toHaveBeenCalledWith('/api/peers')
    expect(result.current.localNodeId).toBe('node-a')
    expect(result.current.activeNodeId).toBe('node-b')
    expect(result.current.isClusterMode).toBe(true)
    expect(result.current.getNodeApiPrefix()).toBe('?node_id=node-b')
    expect(result.current.getNodeApiPrefix('node-a')).toBe('')
    expect(result.current.getNodeApiPrefix('node-b')).toBe('?node_id=node-b')
    await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalledWith({ lastActiveNode: 'node-b' }))
  })

  it('persists all-node selection and clears back to local mode', async () => {
    fetchMock.mockResolvedValueOnce(
      makeJsonResponse({
        local_node_id: 'node-a',
        peers: [
          {
            node_id: 'node-b',
            node_mode: 'AUDIO-NODE',
            host: 'rack-b',
            api_url: 'http://rack-b:8080',
            last_seen: new Date().toISOString(),
            latency_ms: 8.1,
          },
        ],
      }),
    )

    const { result } = renderHook(() => useCluster(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isClusterMode).toBe(true))

    act(() => {
      result.current.setActiveNode('all')
    })

    await waitFor(() => expect(result.current.activeNodeId).toBe('all'))
    await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalledWith({ lastActiveNode: 'all' }))
    expect(result.current.activeNodeId).toBe('all')
    expect(result.current.getNodeApiPrefix()).toBe('?node_id=all')

    act(() => {
      result.current.setActiveNode(null)
    })

    await waitFor(() => expect(result.current.activeNodeId).toBeNull())
    expect(result.current.activeNodeId).toBeNull()
    expect(result.current.getNodeApiPrefix()).toBe('')
  })

  it('prefers the special-settings node preference over localStorage when both exist', async () => {
    window.localStorage.setItem('map2_active_node', 'node-c')
    mockUseSpecialSettings.mockReturnValue({
      settings: {
        enabled: false,
        hiddenPlugins: [],
        menuLocation: 'hidden',
        pinnedRoutes: [],
        lastActiveNode: 'node-b',
      },
      isLoading: false,
      error: null,
      updateSettings: mockUpdateSettings,
      reload: jest.fn(),
    })
    fetchMock.mockResolvedValueOnce(
      makeJsonResponse({
        local_node_id: 'node-a',
        peers: [
          {
            node_id: 'node-b',
            node_mode: 'AUDIO-NODE',
            host: 'rack-b',
            api_url: 'http://rack-b:8080',
            last_seen: new Date().toISOString(),
            latency_ms: 12.5,
          },
          {
            node_id: 'node-c',
            node_mode: 'AUDIO-NODE',
            host: 'rack-c',
            api_url: 'http://rack-c:8080',
            last_seen: new Date().toISOString(),
            latency_ms: 10.2,
          },
        ],
      }),
    )

    const { result } = renderHook(() => useCluster(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.nodes.length).toBe(3))

    expect(result.current.activeNodeId).toBe('node-b')
    expect(window.localStorage.getItem('map2_active_node')).toBe('node-b')
    expect(mockUpdateSettings).not.toHaveBeenCalled()
  })

  it('respects the explicit peer online flag when building node state', async () => {
    fetchMock.mockResolvedValueOnce(
      makeJsonResponse({
        local_node_id: 'node-a',
        peers: [
          {
            node_id: 'node-b',
            node_mode: 'AUDIO-NODE',
            hostname: 'rack-b',
            host: '10.0.0.22',
            api_url: 'http://10.0.0.22:8080',
            last_seen: new Date().toISOString(),
            latency_ms: 9.2,
            is_online: false,
          },
        ],
      }),
    )

    const { result } = renderHook(() => useCluster(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.nodes.length).toBe(2))

    const remoteNode = result.current.nodes.find((node) => node.nodeId === 'node-b')
    expect(remoteNode?.hostname).toBe('rack-b')
    expect(remoteNode?.isOnline).toBe(false)
  })
})
