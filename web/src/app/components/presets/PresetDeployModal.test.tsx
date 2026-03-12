import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockGetNAMStatus = jest.fn()
const mockGetIRStatus = jest.fn()
const mockPushToast = jest.fn()
const mockFetch = jest.fn()

jest.mock('../../../map2/api', () => ({
  namApi: {
    getStatus: (...args: unknown[]) => mockGetNAMStatus(...args),
  },
  irApi: {
    getStatus: (...args: unknown[]) => mockGetIRStatus(...args),
  },
}))

jest.mock('../../contexts/ClusterContext', () => ({
  useCluster: () => ({
    localNodeId: 'node-local',
    nodes: [
      {
        nodeId: 'node-local',
        hostname: 'node-local',
        isLocal: true,
        isOnline: true,
        latencyMs: 1,
      },
      {
        nodeId: 'node-2',
        hostname: 'node-b',
        isLocal: false,
        isOnline: true,
        latencyMs: 4,
      },
    ],
  }),
}))

jest.mock('../Toasts', () => ({
  useToasts: () => ({
    pushToast: mockPushToast,
  }),
}))

import { PresetDeployModal } from './PresetDeployModal'

function renderDialog(onClose = jest.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <PresetDeployModal
        open
        onClose={onClose}
        sourceNodeId="node-local"
        preset={{
          id: 101,
          name: 'Studio Clean',
          plugin_uri: 'urn:map2:test-plugin',
          plugin_name: 'Test Plugin',
        }}
        availability={{
          preset_id: 101,
          checksum: 'abc123',
          available_on: [],
          missing_on: ['node-2'],
          source_node_id: 'node-local',
        }}
      />
    </QueryClientProvider>,
  )
}

describe('PresetDeployModal', () => {
  beforeEach(() => {
    mockGetNAMStatus.mockReset()
    mockGetIRStatus.mockReset()
    mockPushToast.mockReset()
    mockFetch.mockReset()

    if (typeof window.matchMedia !== 'function') {
      Object.defineProperty(window, 'matchMedia', {
        value: jest.fn().mockImplementation((query: string) => ({
          matches: query.includes('max-width') ? false : false,
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
        configurable: true,
      })
    }

    if (typeof window.ResizeObserver === 'undefined') {
      Object.defineProperty(window, 'ResizeObserver', {
        value: class ResizeObserver {
          observe() {}
          unobserve() {}
          disconnect() {}
        },
        configurable: true,
      })
    }

    Object.defineProperty(global, 'fetch', {
      value: mockFetch,
      configurable: true,
      writable: true,
    })

    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/cluster/health/extended/plugins')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            plugins: [
              {
                uri: 'urn:map2:test-plugin',
                name: 'Test Plugin',
                installed_on: ['node-local', 'node-2'],
              },
            ],
          }),
        })
      }

      if (url.includes('/api/preset-exchange/deploy')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ successful: ['node-2'], failed: [] }),
        })
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      })
    })
  })

  it('deploys selected targets using Carbon modal primary action', async () => {
    const onClose = jest.fn()
    renderDialog(onClose)

    expect(await screen.findByText('node-b')).toBeInTheDocument()

    const deployButton = screen.getByRole('button', { name: 'Deploy preset' })
    await waitFor(() => {
      expect(deployButton).toBeEnabled()
    })

    fireEvent.click(deployButton)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/preset-exchange/deploy',
        expect.objectContaining({ method: 'POST' }),
      )
    })

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })
  })
})
