import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'

import { ClusterProvider, useCluster } from './ClusterContext'

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

    await waitFor(() => expect(window.localStorage.getItem('map2_active_node')).toBe('all'))
    expect(result.current.activeNodeId).toBe('all')
    expect(result.current.getNodeApiPrefix()).toBe('?node_id=all')

    act(() => {
      result.current.setActiveNode(null)
    })

    await waitFor(() => expect(window.localStorage.getItem('map2_active_node')).toBe('null'))
    expect(result.current.activeNodeId).toBeNull()
    expect(result.current.getNodeApiPrefix()).toBe('')
  })
})
