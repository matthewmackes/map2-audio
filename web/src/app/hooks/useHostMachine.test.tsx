import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'

jest.mock('@/map2/api', () => ({
  map2Api: {
    system: {
      getHostMachineInfo: jest.fn(),
      getDiskHealth: jest.fn(),
      getHealthOverview: jest.fn(),
      getBrandingAssets: jest.fn(),
    },
  },
}))

import { useClusterHostMachineComparison } from './useHostMachine'

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
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

function makeJsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: jest.fn().mockResolvedValue(payload),
  } as unknown as Response
}

describe('useClusterHostMachineComparison', () => {
  const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>

  beforeEach(() => {
    ;(globalThis as { fetch?: typeof fetch }).fetch = fetchMock
    fetchMock.mockReset()
  })

  afterEach(() => {
    delete (globalThis as { fetch?: typeof fetch }).fetch
  })

  it('ignores malformed fanout payloads and still returns valid node comparisons', async () => {
    fetchMock.mockImplementation((input) => {
      const url = String(input)

      if (url === '/api/system/host-machine-info?node_id=all') {
        return Promise.resolve(makeJsonResponse(undefined))
      }

      if (url === '/api/system/disk-health?node_id=all') {
        return Promise.resolve(makeJsonResponse({ nodes: ['bad'] }))
      }

      if (url === '/api/system/health-overview?node_id=all') {
        return Promise.resolve(
          makeJsonResponse({
            nodes: {
              'node-b': {
                status_code: 200,
                body: {
                  cpu_usage_percent: 17,
                  memory_usage_percent: 42,
                },
              },
            },
          }),
        )
      }

      if (url === '/api/cluster/health/extended/devices') {
        return Promise.resolve(makeJsonResponse({ nodes: 'bad' }))
      }

      throw new Error(`Unexpected fetch URL: ${url}`)
    })

    const { result } = renderHook(() => useClusterHostMachineComparison(false, true), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual([
      {
        nodeId: 'node-b',
        hostInfo: null,
        diskHealth: null,
        healthOverview: {
          cpu_usage_percent: 17,
          memory_usage_percent: 42,
        },
        hardware: null,
      },
    ])
  })
})
