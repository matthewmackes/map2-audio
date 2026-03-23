import React from 'react'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'

import { NodeContextBanner } from './NodeContextBanner'
import { useViewedNodeStore } from '../../stores/viewedNodeStore'

const mockUseNodeTopology = jest.fn()

jest.mock('../../hooks/useNodeTopology', () => ({
  useNodeTopology: () => mockUseNodeTopology(),
}))

const localNode = {
  hostname: 'node-a',
  display_label: null,
  role: 'all_in_one' as const,
  node_id: 'node-a',
}

const topology = {
  nodes: [
    {
      ...localNode,
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

describe('NodeContextBanner', () => {
  beforeEach(() => {
    useViewedNodeStore.setState({ pageNodeMap: {} })
    mockUseNodeTopology.mockReturnValue({
      data: topology,
      isLoading: false,
    })
  })

  it('renders local-only context', () => {
    render(<NodeContextBanner pageKey="home" localNode={localNode} />)

    expect(screen.getByText('Host')).toBeInTheDocument()
    expect(screen.getByText('Scope')).toBeInTheDocument()
    expect(screen.getAllByText('node-a')).toHaveLength(2)
    expect(screen.getByText('Local engine')).toBeInTheDocument()
    expect(screen.getByText('Local studio view')).toBeInTheDocument()
  })

  it('shows display label in the local chip', () => {
    render(<NodeContextBanner pageKey="home" localNode={{ ...localNode, display_label: 'Control Rack' }} />)

    expect(screen.getByText('node-a (Control Rack)')).toBeInTheDocument()
  })

  it('shows the viewed remote node when the page targets a peer', () => {
    useViewedNodeStore.setState({ pageNodeMap: { home: 'node-b' } })

    render(<NodeContextBanner pageKey="home" localNode={localNode} />)

    expect(screen.getByText('Scope')).toBeInTheDocument()
    expect(screen.getByText('node-b (Stage Left)')).toBeInTheDocument()
    expect(screen.getByText('Remote live view')).toBeInTheDocument()
  })

  it('shows inline loading while topology is loading', () => {
    mockUseNodeTopology.mockReturnValue({
      data: undefined,
      isLoading: true,
    })

    render(<NodeContextBanner pageKey="home" localNode={localNode} />)

    expect(screen.getByText('Loading node context')).toBeInTheDocument()
  })

  it('falls back to the local label when topology is malformed', () => {
    mockUseNodeTopology.mockReturnValue({
      data: {} as typeof topology,
      isLoading: false,
    })

    render(<NodeContextBanner pageKey="home" localNode={localNode} />)

    expect(screen.getAllByText('node-a')).toHaveLength(2)
    expect(screen.getByText('Local studio view')).toBeInTheDocument()
  })
})
