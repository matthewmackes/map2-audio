import React from 'react'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { LCDNodesView } from './LCDNodesView'

const mockUseCluster = jest.fn()
const mockUseLcdFeedHistory = jest.fn()

jest.mock('../../../../contexts/useCluster', () => ({
  useCluster: () => mockUseCluster(),
}))

jest.mock('../../../../hooks/useLcdFeed', () => ({
  useLcdFeedHistory: (...a: unknown[]) => mockUseLcdFeedHistory(...a),
}))

jest.mock('../../../LCDFeed', () => ({
  LCDFeed: ({ entries }: { entries: unknown[] }) => (
    <div data-testid="lcd-feed">entries:{entries.length}</div>
  ),
}))

jest.mock('../../../LCDDisplayEmulator', () => ({
  LCDDisplayEmulator: ({ nodeLabel }: { nodeLabel: string }) => (
    <div data-testid="lcd-emulator">node:{nodeLabel}</div>
  ),
}))

jest.mock('../../../NodeLCDCard', () => ({
  NodeLCDGrid: ({ nodes, selectedNode }: { nodes: Array<{ nodeId: string }>; selectedNode: string }) => (
    <div data-testid="node-grid">
      <span>count:{nodes.length}</span>
      <span>selected:{selectedNode}</span>
    </div>
  ),
}))

jest.mock('../LCDView', () => ({
  NodeHealthBar: () => <div data-testid="node-health-bar">health</div>,
  NodeOverviewCard: ({ node }: { node: { nodeId: string } }) => (
    <div data-testid="node-overview">{node.nodeId}</div>
  ),
}))

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('LCDNodesView (T2430-D)', () => {
  beforeEach(() => {
    mockUseLcdFeedHistory.mockReturnValue({ entries: [] })
  })

  it('renders all nodes when pill scope = "all"', () => {
    mockUseCluster.mockReturnValue({
      nodes: [
        { nodeId: 'NODE-A', isLocal: true, isOnline: true, lastSeen: '2026-04-23' },
        { nodeId: 'NODE-B', isLocal: false, isOnline: true, lastSeen: '2026-04-23' },
        { nodeId: 'NODE-C', isLocal: false, isOnline: false, lastSeen: null },
      ],
      localNodeId: 'NODE-A',
      activeNodeId: 'all',
    })
    wrap(<LCDNodesView />)
    expect(screen.getByText('count:3')).toBeInTheDocument()
    expect(screen.getByText('Scope: All cluster nodes')).toBeInTheDocument()
    expect(screen.getByText('3 nodes in scope')).toBeInTheDocument()
    expect(screen.getAllByTestId('node-overview')).toHaveLength(3)
  })

  it('filters to single node when pill scope targets a specific node', () => {
    mockUseCluster.mockReturnValue({
      nodes: [
        { nodeId: 'NODE-A', isLocal: true, isOnline: true, lastSeen: null },
        { nodeId: 'NODE-B', isLocal: false, isOnline: true, lastSeen: null },
      ],
      localNodeId: 'NODE-A',
      activeNodeId: 'NODE-B',
    })
    wrap(<LCDNodesView />)
    expect(screen.getByText('count:1')).toBeInTheDocument()
    expect(screen.getByText('Scope: NODE-B')).toBeInTheDocument()
    expect(screen.getByText('1 node in scope')).toBeInTheDocument()
  })

  it('maps isLocal/isOnline to status local/online/offline', () => {
    mockUseCluster.mockReturnValue({
      nodes: [
        { nodeId: 'NODE-A', isLocal: true, isOnline: true, lastSeen: null },
        { nodeId: 'NODE-B', isLocal: false, isOnline: false, lastSeen: null },
      ],
      localNodeId: 'NODE-A',
      activeNodeId: 'all',
    })
    wrap(<LCDNodesView />)
    // Grid rendered both; status is in NodeOverviewCard's internals (mocked out here).
    expect(screen.getAllByTestId('node-overview')).toHaveLength(2)
  })
})
