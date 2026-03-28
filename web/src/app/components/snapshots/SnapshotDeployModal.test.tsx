import React from 'react'
import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockPushToast = jest.fn()
const mockFetch = jest.fn()
const mockGetFlowSnapshot = jest.fn()

jest.mock('../../../map2/api', () => ({
  flowSnapshotsApi: {
    get: (...args: unknown[]) => mockGetFlowSnapshot(...args),
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

import { SnapshotDeployModal } from './SnapshotDeployModal'

function renderDialog(onClose = jest.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <SnapshotDeployModal
        open
        onClose={onClose}
        sourceNodeId="node-local"
        snapshot={{
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

describe('SnapshotDeployModal', () => {
  beforeEach(() => {
    mockGetFlowSnapshot.mockReset()
    mockPushToast.mockReset()
    mockFetch.mockReset()

    mockGetFlowSnapshot.mockResolvedValue({
      id: 101,
      name: 'Studio Clean',
      description: '',
      tags: [],
      program_number: null,
      is_active: false,
      is_favorite: false,
      display_order: 1,
      flow_slots: [],
      created_at: '2026-03-28T00:00:00Z',
      updated_at: '2026-03-28T00:00:00Z',
      snapshot_data: {
        flowSlots: [],
        routing: {
          mode: 'parallel_blend',
          activeSlotId: null,
          blendPositions: {},
          morphProgress: 0,
          morphSourceSlotId: null,
          morphTargetSlotId: null,
          seriesOrder: [],
        },
        activeFlowIndex: 0,
        chains: {
          '1': {
            name: 'Amp Chain',
            plugins: [
              {
                uri: 'map2://juce/nam',
                position: 0,
                bypass: false,
                parameters: {},
                loader_state: {
                  selected_asset_name: 'Edge Clean',
                  selected_asset_path: '/models/edge-clean.nam',
                },
              },
            ],
          },
        },
      },
    })

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

      if (url.includes('/api/preset-exchange/cluster/library?content_type=nam')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            nodes: {
              'node-local': {
                body: {
                  items: [
                    {
                      path_token: 'nam_0:edge-clean.nam',
                      relative_path: 'edge-clean.nam',
                      filename: 'edge-clean.nam',
                      checksum: 'nam-checksum',
                      asset_type: 'nam',
                    },
                  ],
                },
              },
              'node-2': {
                body: {
                  items: [],
                },
              },
            },
          }),
        })
      }

      if (url.includes('/api/preset-exchange/cluster/library?content_type=ir')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            nodes: {
              'node-local': { body: { items: [] } },
              'node-2': { body: { items: [] } },
            },
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

  it('renders persisted snapshot dependencies for deployment planning', async () => {
    renderDialog()

    expect(await screen.findByText('node-b')).toBeInTheDocument()
    expect(await screen.findByText('Edge Clean')).toBeInTheDocument()

    await waitFor(() => expect(mockGetFlowSnapshot).toHaveBeenCalledWith(101))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/preset-exchange/cluster/library?content_type=nam&node_id=all')
    })

    expect(screen.getAllByText('Will deploy').length).toBeGreaterThan(0)
  })
})
