import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'

import { NodeNavBar } from './NodeNavBar'
import { NodeNavChip } from './NodeNavChip'
import { useViewedNodeStore } from '../../stores/viewedNodeStore'

jest.mock('@carbon/react', () => {
  const actual = jest.requireActual('@carbon/react')
  return {
    ...actual,
    Tooltip: ({ children }: any) => <>{children}</>,
    Popover: ({ children, open }: any) => {
      const childArray = Array.isArray(children) ? children : [children]
      return (
        <div>
          {childArray[0]}
          {open ? childArray[1] : null}
        </div>
      )
    },
    PopoverContent: ({ children }: any) => <div>{children}</div>,
  }
})

const mockUseNodePageContext = jest.fn()

jest.mock('../../hooks/useNodePageContext', () => ({
  useNodePageContext: (pageKey: string) => mockUseNodePageContext(pageKey),
}))

jest.mock('../../hooks/useNodeAlertMonitoring', () => ({
  useNodeAlertMonitoring: () => undefined,
}))

const baseNode = {
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
}

describe('NodeNavChip', () => {
  function LocationProbe() {
    const location = useLocation()
    return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>
  }

  beforeEach(() => {
    useViewedNodeStore.setState({ pageNodeMap: {} })
    mockUseNodePageContext.mockReturnValue({
      localNode: { hostname: 'node-a', display_label: null, role: 'all_in_one', node_id: 'node-a' },
      topology: {
        nodes: [
          baseNode,
          {
            ...baseNode,
            hostname: 'node-b',
            display_label: 'Stage Left',
            role: 'audio_node',
            node_id: 'node-b',
            is_local: false,
            is_viewed: false,
            status: 'warn',
          },
        ],
        audio_edges: [],
        network_edges: [],
      },
      topologyNodes: [
        baseNode,
        {
          ...baseNode,
          hostname: 'node-b',
          display_label: 'Stage Left',
          role: 'audio_node',
          node_id: 'node-b',
          is_local: false,
          is_viewed: false,
          status: 'warn',
        },
      ],
      viewedNodeId: 'node-a',
      nodeTopologyQuery: { isLoading: false, isError: false },
    })
  })

  it('renders hostname and role classes for standalone chips', () => {
    const { rerender } = render(<NodeNavChip node={baseNode} onClick={() => undefined} presence="LOCAL" />)
    expect(screen.getByRole('button', { name: /node node-a/i })).toHaveClass('node-nav-chip--local')

    rerender(<NodeNavChip node={{ ...baseNode, is_local: false, node_id: 'node-b', hostname: 'node-b' }} onClick={() => undefined} presence="PEER" />)
    expect(screen.getByRole('button', { name: /node node-b/i })).toHaveClass('node-nav-chip--peer')
  })

  it('renders warn, critical, and offline states via CSS classes', () => {
    const { rerender } = render(<NodeNavChip node={{ ...baseNode, status: 'warn' }} onClick={() => undefined} presence="LOCAL" />)
    expect(screen.getByRole('button')).toHaveClass('node-nav-chip--warn')

    rerender(<NodeNavChip node={{ ...baseNode, status: 'critical' }} onClick={() => undefined} presence="LOCAL" />)
    expect(screen.getByRole('button')).toHaveClass('node-nav-chip--critical')

    rerender(<NodeNavChip node={{ ...baseNode, status: 'offline' }} onClick={() => undefined} presence="LOCAL" />)
    expect(screen.getByText('node-a')).toHaveClass('node-nav-chip__hostname--offline')
  })

  it('opens the mini-card popover and updates the viewed node', () => {
    render(
      <MemoryRouter>
        <NodeNavBar />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: /node node-b/i }))
    expect(screen.getByText('Set as page node')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Set as page node'))
    expect(useViewedNodeStore.getState().pageNodeMap.home).toBe('node-b')
  })

  it('routes platform node details into the management layer', () => {
    render(
      <MemoryRouter initialEntries={['/platforms/cluster-dashboard']}>
        <NodeNavBar />
        <LocationProbe />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: /node node-b/i }))
    fireEvent.click(screen.getByText('View details'))

    expect(useViewedNodeStore.getState().pageNodeMap.nodes).toBe('node-b')
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/platforms/management?focusNodeId=node-b')
  })

  it('renders a single chip for n=1 mode and shows a skeleton while loading', () => {
    mockUseNodePageContext.mockReturnValueOnce({
      localNode: { hostname: 'node-a', display_label: null, role: 'all_in_one', node_id: 'node-a' },
      topology: { nodes: [baseNode], audio_edges: [], network_edges: [] },
      topologyNodes: [baseNode],
      viewedNodeId: 'node-a',
      nodeTopologyQuery: { isLoading: false, isError: false },
    })

    const { rerender, container } = render(
      <MemoryRouter>
        <NodeNavBar />
      </MemoryRouter>,
    )

    expect(screen.getAllByRole('button', { name: /node node-a/i })).toHaveLength(1)

    mockUseNodePageContext.mockReturnValueOnce({
      localNode: null,
      topology: undefined,
      topologyNodes: [],
      viewedNodeId: 'node-a',
      nodeTopologyQuery: { isLoading: true, isError: false },
    })

    rerender(
      <MemoryRouter>
        <NodeNavBar />
      </MemoryRouter>,
    )

    expect(container.querySelector('.node-nav-bar__skeleton')).toBeInTheDocument()
  })

  it('ignores malformed topology payloads without crashing the nav shell', () => {
    mockUseNodePageContext.mockReturnValueOnce({
      localNode: { hostname: 'node-a', display_label: null, role: 'all_in_one', node_id: 'node-a' },
      topology: { audio_edges: [], network_edges: [] },
      topologyNodes: [],
      viewedNodeId: 'node-a',
      nodeTopologyQuery: { isLoading: false, isError: false },
    })

    render(
      <MemoryRouter>
        <NodeNavBar />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('button', { name: /node /i })).not.toBeInTheDocument()
  })

  it('collapses extra nodes into an overflow pill when the cluster is wider than the compact shell budget', () => {
    mockUseNodePageContext.mockReturnValueOnce({
      localNode: { hostname: 'node-a', display_label: null, role: 'all_in_one', node_id: 'node-a' },
      topology: {
        nodes: [
          baseNode,
          { ...baseNode, hostname: 'node-b', node_id: 'node-b', is_local: false, is_viewed: false, status: 'warn' },
          { ...baseNode, hostname: 'node-c', node_id: 'node-c', is_local: false, is_viewed: false },
          { ...baseNode, hostname: 'node-d', node_id: 'node-d', is_local: false, is_viewed: false },
          { ...baseNode, hostname: 'node-e', node_id: 'node-e', is_local: false, is_viewed: false },
        ],
        audio_edges: [],
        network_edges: [],
      },
      topologyNodes: [
        baseNode,
        { ...baseNode, hostname: 'node-b', node_id: 'node-b', is_local: false, is_viewed: false, status: 'warn' },
        { ...baseNode, hostname: 'node-c', node_id: 'node-c', is_local: false, is_viewed: false },
        { ...baseNode, hostname: 'node-d', node_id: 'node-d', is_local: false, is_viewed: false, status: 'critical' },
        { ...baseNode, hostname: 'node-e', node_id: 'node-e', is_local: false, is_viewed: false },
      ],
      viewedNodeId: 'node-a',
      nodeTopologyQuery: { isLoading: false, isError: false },
    })

    render(
      <MemoryRouter>
        <NodeNavBar />
      </MemoryRouter>,
    )

    expect(screen.getAllByRole('button', { name: /node /i })).toHaveLength(3)
    expect(screen.getByText('+2')).toHaveClass('node-nav-bar__overflow--critical')
  })
})
