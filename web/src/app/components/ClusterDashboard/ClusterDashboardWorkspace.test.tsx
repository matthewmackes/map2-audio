import '@testing-library/jest-dom'
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { ClusterDashboardWorkspace } from './ClusterDashboardWorkspace'
import type { PlatformLayerData } from '../../platform/model'

const mockNavigate = jest.fn()
const mockSetViewedNode = jest.fn()
const mockSetActiveNode = jest.fn()
const mockUseNodeTopology = jest.fn()
const mockUseViewedNode = jest.fn()

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

jest.mock('../../hooks/useNodeTopology', () => ({
  useNodeTopology: () => mockUseNodeTopology(),
}))

jest.mock('../../contexts/useCluster', () => ({
  useCluster: () => ({
    activeNodeId: null,
    localNodeId: 'node-local',
    setActiveNode: mockSetActiveNode,
  }),
}))

jest.mock('../../stores/viewedNodeStore', () => ({
  useViewedNode: (...args: unknown[]) => mockUseViewedNode(...args),
  useViewedNodeStore: (selector: (state: { setViewedNode: typeof mockSetViewedNode }) => unknown) => (
    selector({ setViewedNode: mockSetViewedNode })
  ),
}))

jest.mock('./ClusterDashboardWorkspaceGraph', () => ({
  ClusterDashboardWorkspaceGraph: ({ onSelect }: { onSelect: (selection: { anchorId: 'cluster-dashboard-nodes'; recordId: string; contextNodeId: string | null }) => void }) => (
    <button
      type="button"
      data-testid="cluster-dashboard-graph"
      onClick={() => onSelect({
        anchorId: 'cluster-dashboard-nodes',
        recordId: 'node-remote',
        contextNodeId: 'node-remote',
      })}
    >
      Cluster Graph Mock
    </button>
  ),
}))

const layer: PlatformLayerData = {
  id: 'cluster-dashboard',
  label: 'Cluster Dashboard',
  shortLabel: 'Cluster',
  description: 'Cluster dashboard',
  accent: 'var(--cds-text-primary)',
  health: 'healthy',
  activityLevel: 88,
  alertCount: 0,
  isLoading: false,
  error: null,
  summaryMetrics: [
    {
      id: 'cluster-mode',
      label: 'Deployment mode',
      value: 'ALL-IN-ONE',
      helper: '1 MIDI node',
      tone: 'info',
    },
  ],
  gridItems: [
    {
      id: 'cluster-platform-health',
      title: 'Platform Health',
      eyebrow: 'Cluster Dashboard',
      metric: '1/1',
      helper: 'Deployment mode: ALL-IN-ONE',
      status: 'healthy',
      alertCount: 0,
    },
    {
      id: 'cluster-health',
      title: 'Cluster Health',
      eyebrow: 'Cluster',
      metric: '92%',
      helper: 'Fabric stable',
      status: 'healthy',
    },
  ],
  tableColumns: [],
  tableRows: [],
  tableTitle: 'Cluster node workloads',
  tableDescription: 'Cluster node workloads',
  notifications: [],
}

describe('ClusterDashboardWorkspace', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockSetViewedNode.mockReset()
    mockSetActiveNode.mockReset()
    mockUseViewedNode.mockReset()
    mockUseViewedNode.mockReturnValue('node-local')
    mockUseNodeTopology.mockReset()
    mockUseNodeTopology.mockReturnValue({
      data: {
        nodes: [
          {
            node_id: 'node-local',
            hostname: 'local-rack',
            display_label: 'Stage',
            role: 'all_in_one',
            status: 'ok',
            cpu_percent: 24,
            memory_percent: 38,
            xrun_count: 0,
            audio_latency_ms: 2.1,
            services: { backend: true, juce_engine: true, pipewire: true },
            last_seen: '2026-04-03T22:00:00.000Z',
            is_local: true,
            is_viewed: false,
          },
          {
            node_id: 'node-remote',
            hostname: 'remote-rack',
            display_label: null,
            role: 'audio_node',
            status: 'warn',
            cpu_percent: 66,
            memory_percent: 71,
            xrun_count: 2,
            audio_latency_ms: 4.4,
            services: { backend: true, juce_engine: true, pipewire: false },
            last_seen: '2026-04-03T22:00:03.000Z',
            is_local: false,
            is_viewed: true,
          },
        ],
        audio_edges: [
          {
            source_node_id: 'node-local',
            dest_node_id: 'node-remote',
            stream_type: 'avb',
            active: true,
          },
        ],
        network_edges: [
          {
            source_node_id: 'node-local',
            dest_node_id: 'node-remote',
            latency_ms: 3.2,
          },
        ],
      },
      isLoading: false,
      error: null,
    })
  })

  it('expands the selected node from graph clicks and opens the management workspace with node context', async () => {
    render(
      <MemoryRouter
        initialEntries={['/platforms/cluster-dashboard']}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <ClusterDashboardWorkspace layer={layer} />
      </MemoryRouter>,
    )

    expect(screen.getByText('Platform Health')).toBeInTheDocument()
    expect(screen.getByText('Deployment mode: ALL-IN-ONE')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('cluster-dashboard-graph'))

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Open Management Workspace' }).length).toBeGreaterThan(0)
    })

    const openButtons = screen.getAllByRole('button', { name: 'Open Management Workspace' })
    fireEvent.click(openButtons[openButtons.length - 1]!)

    expect(mockSetViewedNode).toHaveBeenCalledWith('nodes', 'node-remote')
    expect(mockSetActiveNode).toHaveBeenCalledWith('node-remote')
    expect(mockNavigate).toHaveBeenCalledWith('/platforms/management?focusNodeId=node-remote')
  })
})
