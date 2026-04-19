import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { ManagementWorkspace } from './ManagementWorkspace'
import { useViewedNodeStore } from '../../stores/viewedNodeStore'

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
          node_id: 'node-remote',
          hostname: 'rack-remote',
          display_label: 'Backup',
          role: 'management_node',
          status: 'warn',
          cpu_percent: 41,
          memory_percent: 48,
          xrun_count: 0,
          audio_latency_ms: 3.9,
          services: {
            backend: true,
            juce_engine: true,
            pipewire: false,
          },
          last_seen: '2026-04-03T22:00:03Z',
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

jest.mock('./ManagementWorkspaceGraph', () => ({
  ManagementWorkspaceGraph: ({ onSelect }: { onSelect: (selection: { anchorId: 'management-services'; recordId: string; contextNodeId: string | null }) => void }) => (
    <button
      type="button"
      data-testid="management-graph"
      onClick={() => onSelect({
        anchorId: 'management-services',
        recordId: 'update',
        contextNodeId: 'node-local',
      })}
    >
      Management graph
    </button>
  ),
}))

describe('ManagementWorkspace', () => {
  beforeEach(() => {
    useViewedNodeStore.setState({ pageNodeMap: {} })

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

  it('expands the matching management row from graph selections', async () => {
    render(
      <MemoryRouter>
        <ManagementWorkspace
          layer={{
            id: 'management',
            label: 'Management',
            shortLabel: 'Mgmt',
            description: 'Management',
            accent: 'var(--cds-support-success)',
            health: 'healthy',
            activityLevel: 0,
            alertCount: 0,
            isLoading: false,
            error: null,
            summaryMetrics: [
              {
                id: 'node',
                label: 'Node',
                value: 'rack-local',
                helper: 'node-local',
                tone: 'healthy',
              },
            ],
            gridItems: [
              {
                id: 'services',
                title: 'Node Services',
                eyebrow: 'Management',
                metric: '3/3 online',
                helper: 'Backend, JUCE engine, PipeWire',
                status: 'healthy',
              },
            ],
            tableColumns: [
              { key: 'name', header: 'Service / Subsystem' },
              { key: 'status', header: 'Status' },
              { key: 'metric1', header: 'Detail' },
              { key: 'metric2', header: 'Info' },
              { key: 'alerts', header: 'Alerts' },
            ],
            tableRows: [
              {
                id: 'backend',
                name: 'Backend API',
                status: 'healthy',
                metric1: '18%',
                metric2: '35%',
                alerts: 'Clear',
              },
              {
                id: 'update',
                name: 'Update System',
                status: 'warning',
                metric1: 'Question 4/10',
                metric2: 'Applying payload',
                alerts: 'Update in progress',
              },
            ],
            tableTitle: 'Management services and platform operations',
            tableDescription: 'Management posture',
            notifications: [],
          }}
        />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByTestId('management-graph'))

    expect(await screen.findByText('Subsystem detail')).toBeInTheDocument()
    expect(screen.getAllByText('Applying payload').length).toBeGreaterThan(0)
  })

  it('hydrates the platform viewed-node context from focusNodeId query params', () => {
    render(
      <MemoryRouter initialEntries={['/platforms/management?focusNodeId=node-remote']}>
        <ManagementWorkspace
          layer={{
            id: 'management',
            label: 'Management',
            shortLabel: 'Mgmt',
            description: 'Management',
            accent: 'var(--cds-support-success)',
            health: 'healthy',
            activityLevel: 0,
            alertCount: 0,
            isLoading: false,
            error: null,
            summaryMetrics: [],
            gridItems: [],
            tableColumns: [],
            tableRows: [],
            tableTitle: 'Management services and platform operations',
            tableDescription: 'Management posture',
            notifications: [],
          }}
        />
      </MemoryRouter>,
    )

    expect(useViewedNodeStore.getState().pageNodeMap.nodes).toBe('node-remote')
    expect(screen.getAllByText('rack-remote (Backup)').length).toBeGreaterThan(0)
  })
})
