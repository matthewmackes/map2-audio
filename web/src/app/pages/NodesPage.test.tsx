import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { NodesPage } from './NodesPage'
import { useViewedNodeStore } from '../stores/viewedNodeStore'

const mockUseNodePageContext = jest.fn()

jest.mock('../hooks/useNodePageContext', () => ({
  useNodePageContext: (pageKey: string) => mockUseNodePageContext(pageKey),
}))

jest.mock('../components/NodeGraph/NodeGraph', () => ({
  NodeGraph: ({ topology, onNodeClick }: any) => (
    <div data-testid="node-graph">
      {topology.nodes.map((node: { node_id: string; hostname: string }) => (
        <button key={node.node_id} onClick={() => onNodeClick(node.node_id)}>
          {node.hostname}
        </button>
      ))}
    </div>
  ),
}))

jest.mock('../components/NodeContextBanner/NodeContextBanner', () => ({
  NodeContextBanner: () => <div>LOCAL:</div>,
}))

jest.mock('../components/NodeGraph/NodeDetailTearsheet', () => ({
  NodeDetailTearsheet: ({ node, open, pageKey, onClose }: any) => {
    const { useViewedNodeStore } = jest.requireActual('../stores/viewedNodeStore')
    if (!open || !node) return null
    return (
      <div>
        <span>{`Detail ${node.hostname}`}</span>
        <button onClick={() => {
          useViewedNodeStore.getState().setViewedNode(pageKey, node.node_id)
        }}
        >
          Set as This Page&apos;s Node
        </button>
        <button onClick={onClose}>Close details</button>
      </div>
    )
  },
}))

const topology = {
  nodes: [
    {
      hostname: 'node-a',
      display_label: null,
      role: 'all_in_one' as const,
      node_id: 'node-a',
      status: 'ok' as const,
      cpu_percent: 10,
      memory_percent: 20,
      xrun_count: 0,
      audio_latency_ms: 1.3,
      services: { backend: true, juce_engine: true, pipewire: true },
      last_seen: '2026-03-15T09:00:00Z',
      is_local: true,
      is_viewed: true,
    },
    {
      hostname: 'node-b',
      display_label: 'Stage Left',
      role: 'audio_node' as const,
      node_id: 'node-b',
      status: 'warn' as const,
      cpu_percent: 20,
      memory_percent: 40,
      xrun_count: 1,
      audio_latency_ms: 1.3,
      services: { backend: true, juce_engine: true, pipewire: true },
      last_seen: '2026-03-15T09:00:00Z',
      is_local: false,
      is_viewed: false,
    },
  ],
  audio_edges: [],
  network_edges: [],
}

describe('NodesPage', () => {
  beforeEach(() => {
    useViewedNodeStore.setState({ pageNodeMap: {} })
    mockUseNodePageContext.mockReturnValue({
      localNode: { hostname: 'node-a', display_label: null, role: 'all_in_one', node_id: 'node-a' },
      topology,
      viewedNodeId: 'node-a',
      nodeTopologyQuery: { isLoading: false, isError: false },
    })
  })

  it('renders nodes page content and banner', () => {
    render(
      <MemoryRouter>
        <NodesPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Platform Nodes')).toBeInTheDocument()
    expect(screen.getByText('LOCAL:')).toBeInTheDocument()
    expect(screen.getByTestId('node-graph')).toBeInTheDocument()
  })

  it('shows loading and error states', () => {
    mockUseNodePageContext.mockReturnValueOnce({
      localNode: null,
      topology: undefined,
      viewedNodeId: 'node-a',
      nodeTopologyQuery: { isLoading: true, isError: false },
    })

    const { rerender } = render(
      <MemoryRouter>
        <NodesPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Loading node topology')).toBeInTheDocument()

    mockUseNodePageContext.mockReturnValueOnce({
      localNode: null,
      topology: undefined,
      viewedNodeId: 'node-a',
      nodeTopologyQuery: { isLoading: false, isError: true },
    })

    rerender(
      <MemoryRouter>
        <NodesPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Node discovery unavailable')).toBeInTheDocument()
  })

  it('opens and closes the tearsheet, and sets the viewed node', () => {
    render(
      <MemoryRouter>
        <NodesPage />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'node-b' }))
    expect(screen.getByText('Detail node-b')).toBeInTheDocument()

    fireEvent.click(screen.getByText("Set as This Page's Node"))
    expect(useViewedNodeStore.getState().pageNodeMap.nodes).toBe('node-b')

    fireEvent.click(screen.getByText('Close details'))
    expect(screen.queryByText('Detail node-b')).not.toBeInTheDocument()
  })

  it('renders a single node in aio mode', () => {
    mockUseNodePageContext.mockReturnValueOnce({
      localNode: { hostname: 'node-a', display_label: null, role: 'all_in_one', node_id: 'node-a' },
      topology: { ...topology, nodes: [topology.nodes[0]] },
      viewedNodeId: 'node-a',
      nodeTopologyQuery: { isLoading: false, isError: false },
    })

    render(
      <MemoryRouter>
        <NodesPage />
      </MemoryRouter>,
    )

    expect(screen.getAllByRole('button', { name: 'node-a' })).toHaveLength(1)
  })
})
