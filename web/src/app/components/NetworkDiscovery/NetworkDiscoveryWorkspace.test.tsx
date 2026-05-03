import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { NetworkDiscoveryWorkspace } from './NetworkDiscoveryWorkspace'
import { useViewedNodeStore } from '../../stores/viewedNodeStore'

const mockNavigate = jest.fn()
const mockSetActiveNode = jest.fn()

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

jest.mock('../../contexts/useCluster', () => ({
  useCluster: () => ({
    setActiveNode: mockSetActiveNode,
  }),
}))

jest.mock('../../hooks/useNodeTopology', () => ({
  useNodeTopology: () => ({
    data: {
      nodes: [
        {
          node_id: 'node-local',
          hostname: 'rack-local',
          display_label: 'Primary',
          role: 'all_in_one',
          status: 'ok',
          cpu_percent: 18,
          memory_percent: 35,
          xrun_count: 0,
          audio_latency_ms: 2.7,
          services: {
            backend: true,
            juce_engine: true,
            pipewire: true,
          },
          last_seen: '2026-04-03T22:00:00Z',
          is_local: true,
          is_viewed: true,
        },
        {
          node_id: 'node-b',
          hostname: 'rack-b',
          display_label: 'Backup',
          role: 'management_node',
          status: 'warn',
          cpu_percent: 22,
          memory_percent: 39,
          xrun_count: 0,
          audio_latency_ms: 3.1,
          services: {
            backend: true,
            juce_engine: true,
            pipewire: true,
          },
          last_seen: '2026-04-03T22:00:00Z',
          is_local: false,
          is_viewed: false,
        },
      ],
      audio_edges: [],
      network_edges: [],
    },
    isLoading: false,
    error: null,
  }),
}))

jest.mock('../../hooks/usePeerDiscovery', () => ({
  usePeerDiscoveryStatus: () => ({
    data: {
      local_node_id: 'node-local',
      discovery_enabled: true,
      discovery_uptime: '1h',
      peers_discovered: 1,
      peers_connected: 1,
      peers: [
        {
          node_id: 'node-b',
          node_mode: 'MANAGEMENT-NODE',
          hostname: 'rack-b',
          host: '10.0.0.20',
          port: 8080,
          api_url: 'http://10.0.0.20:8080',
          ws_url: 'ws://10.0.0.20:8080/ws',
          ssh_url: 'ssh://mm@10.0.0.20',
          discovered_at: '2026-04-03T21:55:00Z',
          last_seen: '2026-04-03T22:00:00Z',
          latency_ms: 3.1,
          ssh_trusted: true,
          is_online: true,
          discovery_sources: ['heartbeat', 'registry'],
          registered: true,
          registry_status: 'managed',
          heartbeat_online: true,
          visible: true,
          visibility_state: 'managed-online',
          registration_required: false,
          routing_ready: true,
          visibility_reason: 'Visible through heartbeat and registry.',
          avb_enabled: true,
          discovered_via_mdns: true,
          discovered_via_peer_mdns: false,
          discovered_via_cluster_mdns: true,
          trust_state: 'trusted',
          adoption_state: 'ready',
          activation_state: 'active',
          readiness_status: 'ready',
          adoption_candidate_id: null,
        },
      ],
    },
    isLoading: false,
    error: null,
  }),
  usePeerLatencyHistory: () => ({
    data: {
      peer_id: 'node-b',
      measurements: [],
      average_latency_ms: 3.2,
      min_latency_ms: 3.0,
      max_latency_ms: 3.5,
      packet_loss_percent: 0,
    },
  }),
}))

jest.mock('./NetworkDiscoveryWorkspaceGraph', () => ({
  NetworkDiscoveryWorkspaceGraph: ({ onSelect }: { onSelect: (selection: { anchorId: 'network-discovery-peers'; recordId: string; contextNodeId: string | null }) => void }) => (
    <button
      type="button"
      data-testid="network-discovery-graph"
      onClick={() => onSelect({
        anchorId: 'network-discovery-peers',
        recordId: 'node-b',
        contextNodeId: 'node-b',
      })}
    >
      Discovery graph
    </button>
  ),
}))

describe('NetworkDiscoveryWorkspace', () => {
  beforeEach(() => {
    useViewedNodeStore.setState({ pageNodeMap: {} })
    mockNavigate.mockReset()
    mockSetActiveNode.mockReset()

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    })

    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    Object.defineProperty(window, 'ResizeObserver', {
      writable: true,
      value: ResizeObserverMock,
    })
  })

  it('expands the selected peer from graph clicks and opens management with node context', async () => {
    render(
      <MemoryRouter>
        <NetworkDiscoveryWorkspace
          layer={{
            id: 'network-discovery',
            label: 'Network Discovery',
            shortLabel: 'Discovery',
            description: 'Network Discovery',
            accent: 'var(--cds-support-info)',
            health: 'healthy',
            activityLevel: 0,
            alertCount: 0,
            isLoading: false,
            error: null,
            summaryMetrics: [],
            gridItems: [
              {
                id: 'peers',
                title: 'Visible peers',
                eyebrow: 'Discovery',
                metric: '1',
                helper: '1 routing ready',
                status: 'healthy',
              },
            ],
            tableColumns: [],
            tableRows: [],
            tableTitle: 'Network discovery telemetry',
            tableDescription: 'Discovery detail',
            notifications: [],
          }}
        />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByTestId('network-discovery-graph'))

    expect(await screen.findByText('Visibility posture')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open Management' }))

    expect(mockSetActiveNode).toHaveBeenCalledWith('node-b')
    // Nav reorg 2026-05-03 (second pass) — canonical Device Manager mount.
    expect(mockNavigate).toHaveBeenCalledWith('/node-ops/management?focusNodeId=node-b')
  })

  it('hydrates the source-node context from focusNodeId query params', () => {
    render(
      <MemoryRouter initialEntries={['/platforms/network-discovery?focusNodeId=node-b']}>
        <NetworkDiscoveryWorkspace
          layer={{
            id: 'network-discovery',
            label: 'Network Discovery',
            shortLabel: 'Discovery',
            description: 'Network Discovery',
            accent: 'var(--cds-support-info)',
            health: 'healthy',
            activityLevel: 0,
            alertCount: 0,
            isLoading: false,
            error: null,
            summaryMetrics: [],
            gridItems: [],
            tableColumns: [],
            tableRows: [],
            tableTitle: 'Network discovery telemetry',
            tableDescription: 'Discovery detail',
            notifications: [],
          }}
        />
      </MemoryRouter>,
    )

    expect(useViewedNodeStore.getState().pageNodeMap.nodes).toBe('node-b')
    expect(screen.getByText('Remote source selected')).toBeInTheDocument()
  })
})
