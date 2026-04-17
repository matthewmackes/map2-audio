import '@testing-library/jest-dom'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'

import { ChainsPage } from './ChainsPage'

const mockUseCluster = jest.fn()
const mockUseNodePageContext = jest.fn()
const mockSetViewedNode = jest.fn()
const mockChainsApiList = jest.fn()

jest.mock('../contexts/useCluster', () => ({
  useCluster: () => mockUseCluster(),
}))

jest.mock('../hooks/useNodePageContext', () => ({
  useNodePageContext: (...args: unknown[]) => mockUseNodePageContext(...args),
}))

jest.mock('../stores/viewedNodeStore', () => ({
  useViewedNodeStore: (selector: (state: { setViewedNode: typeof mockSetViewedNode }) => unknown) => selector({
    setViewedNode: mockSetViewedNode,
  }),
}))

jest.mock('../../map2/api', () => ({
  chainsApi: {
    list: (...args: unknown[]) => mockChainsApiList(...args),
  },
}))

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <ChainsPage />
    </QueryClientProvider>,
  )
}

describe('ChainsPage', () => {
  beforeEach(() => {
    mockUseCluster.mockReset()
    mockUseNodePageContext.mockReset()
    mockSetViewedNode.mockReset()
    mockChainsApiList.mockReset()

    mockUseCluster.mockReturnValue({
      activeNodeId: 'node-local',
      nodes: [
        { nodeId: 'node-local', hostname: 'local-rack', role: 'LOCAL', isLocal: true, isOnline: true, latencyMs: 0 },
      ],
      localNodeId: 'node-local',
      setActiveNode: jest.fn(),
      isClusterMode: false,
    })

    mockUseNodePageContext.mockReturnValue({
      localNode: { node_id: 'node-local', hostname: 'local-rack', role: 'LOCAL', is_local: true },
      topology: { nodes: [{ node_id: 'node-local', hostname: 'local-rack', role: 'LOCAL', is_local: true }] },
      viewedNode: { node_id: 'node-local', hostname: 'local-rack', role: 'LOCAL', is_local: true },
      viewedNodeId: 'node-local',
      nodeIdentityQuery: { data: { node_id: 'node-local', hostname: 'local-rack', role: 'LOCAL', is_local: true } },
      nodeTopologyQuery: { data: { nodes: [{ node_id: 'node-local', hostname: 'local-rack', role: 'LOCAL', is_local: true }] } },
    })
  })

  it('shows only snapshot-owned runtime paths and counts hidden legacy chains separately', async () => {
    mockChainsApiList.mockResolvedValue({
      count: 2,
      chains: [
        {
          id: 11,
          name: 'Runtime Path A',
          is_active: true,
          created_at: '2026-04-16T20:00:00Z',
          updated_at: '2026-04-16T20:01:00Z',
          plugins: [],
          source_kind: 'snapshot_path',
          snapshot_id: 501,
          snapshot_name: 'Sunday Set',
          snapshot_chain_id: 7,
          path_id: 'guitar-main',
          management_scope: 'snapshot',
          runtime_sync: { enabled: true, status: 'active', warnings: [], runtime_items: 0, restored_positions: [], missing_positions: [] },
        },
        {
          id: 12,
          name: 'Old Standalone Chain',
          is_active: false,
          created_at: '2026-04-16T19:00:00Z',
          updated_at: '2026-04-16T19:01:00Z',
          plugins: [],
          source_kind: 'manual',
          management_scope: 'runtime',
          runtime_sync: { enabled: true, status: 'inactive', warnings: [], runtime_items: 0, restored_positions: [], missing_positions: [] },
        },
      ],
    })

    renderPage()

    await waitFor(() => expect(mockChainsApiList).toHaveBeenCalledWith(null))
    await screen.findAllByText('Sunday Set')
    await screen.findAllByText('guitar-main')

    expect(screen.getByText('1 non-snapshot runtime chain omitted from this page.')).toBeInTheDocument()
    expect(screen.queryByText('Old Standalone Chain')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New chain' })).not.toBeInTheDocument()
    expect(screen.queryByText('Deploy')).not.toBeInTheDocument()
  })
})
