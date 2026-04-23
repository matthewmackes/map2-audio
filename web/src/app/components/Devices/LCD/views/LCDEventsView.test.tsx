import React from 'react'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { LCDEventsView } from './LCDEventsView'

const mockUseLcdFeed = jest.fn()
const mockUseLcdFeedStats = jest.fn()
const mockUseCluster = jest.fn()

jest.mock('../../../../hooks/useLcdFeed', () => ({
  useLcdFeed: () => mockUseLcdFeed(),
  useLcdFeedStats: () => mockUseLcdFeedStats(),
  useLcdFeedHistory: () => ({ entries: [] }),
}))

jest.mock('../../../../contexts/useCluster', () => ({
  useCluster: () => mockUseCluster(),
}))

jest.mock('../../../LCDFeed', () => ({
  LCDFeed: ({ entries }: { entries: unknown[] }) => (
    <div data-testid="lcd-feed">entries:{entries.length}</div>
  ),
}))

jest.mock('../LCDView', () => ({
  EventDetailsModal: () => null,
  // other re-exports not needed in this test
  LCDSimulator: () => null,
  InputController: () => null,
  CustomMessageComposer: () => null,
  EventTriggers: () => null,
  NodeHealthBar: () => null,
  NodeOverviewCard: () => null,
  HardwareControls: () => null,
  FT232HConfig: () => null,
  AlertRouterConfig: () => null,
}))

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const baseEntries = [
  { event_id: 'e1', source_node: 'NODE-A', severity: 'info', category: 'audio', message: 'e1', title: 't1', timestamp: new Date(), icon: '•', context: {}, broadcast: true, target_nodes: [], ttl: 60, color: '', sound: false, dismiss_auto: true },
  { event_id: 'e2', source_node: 'NODE-B', severity: 'info', category: 'audio', message: 'e2', title: 't2', timestamp: new Date(), icon: '•', context: {}, broadcast: true, target_nodes: [], ttl: 60, color: '', sound: false, dismiss_auto: true },
  { event_id: 'e3', source_node: 'NODE-A', severity: 'warning', category: 'audio', message: 'e3', title: 't3', timestamp: new Date(), icon: '•', context: {}, broadcast: true, target_nodes: [], ttl: 60, color: '', sound: false, dismiss_auto: true },
]

describe('LCDEventsView (T2430-C pill filter)', () => {
  beforeEach(() => {
    mockUseLcdFeed.mockReturnValue({ entries: baseEntries, connected: true, error: null })
    mockUseLcdFeedStats.mockReturnValue({ stats: { total_events: 3, local_events: 2, remote_events: 1 } })
  })

  it('shows all cluster events when pill scope = "all"', () => {
    mockUseCluster.mockReturnValue({ activeNodeId: 'all', nodes: [], localNodeId: 'NODE-A' })
    wrap(<LCDEventsView />)
    // Two feeds render (pinned + main); only main should have entries.
    const feeds = screen.getAllByTestId('lcd-feed')
    expect(feeds.some((f) => f.textContent === 'entries:3')).toBe(true)
    expect(screen.getByText('Scope: All cluster nodes')).toBeInTheDocument()
  })

  it('filters to source_node when pill scope = specific node', () => {
    mockUseCluster.mockReturnValue({ activeNodeId: 'NODE-A', nodes: [], localNodeId: 'NODE-A' })
    wrap(<LCDEventsView />)
    const feeds = screen.getAllByTestId('lcd-feed')
    // 2 entries from NODE-A only.
    expect(feeds.some((f) => f.textContent === 'entries:2')).toBe(true)
    expect(screen.getByText('Scope: NODE-A')).toBeInTheDocument()
  })

  it('null activeNodeId treated as all', () => {
    mockUseCluster.mockReturnValue({ activeNodeId: null, nodes: [], localNodeId: 'NODE-A' })
    wrap(<LCDEventsView />)
    expect(screen.getByText('Scope: All cluster nodes')).toBeInTheDocument()
  })
})
