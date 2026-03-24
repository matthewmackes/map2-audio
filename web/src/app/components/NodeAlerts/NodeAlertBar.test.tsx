import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { NodeAlertBar } from './NodeAlertBar'
import { NodeAlertMonitor } from './NodeAlertMonitor'
import { NodeAlertToast } from './NodeAlertToast'
import { useNodeAlertStore } from '../../stores/nodeAlertStore'

const mockUseNodeTopology = jest.fn()

jest.mock('../../hooks/useNodeTopology', () => ({
  useNodeTopology: () => mockUseNodeTopology(),
}))

function makeNode(status: 'ok' | 'warn' | 'critical' | 'offline') {
  return {
    hostname: 'node-a',
    display_label: null,
    role: 'all_in_one' as const,
    node_id: 'node-a',
    status,
    cpu_percent: status === 'warn' ? 20 : 10,
    memory_percent: 20,
    xrun_count: status === 'warn' ? 3 : 0,
    audio_latency_ms: 1.3,
    services: { backend: true, juce_engine: status !== 'critical', pipewire: true },
    last_seen: '2026-03-15T09:00:00Z',
    is_local: true,
    is_viewed: true,
  }
}

function AlertHarness() {
  return (
    <MemoryRouter>
      <NodeAlertMonitor />
      <NodeAlertBar />
      <NodeAlertToast />
    </MemoryRouter>
  )
}

describe('NodeAlertBar', () => {
  beforeEach(() => {
    useNodeAlertStore.setState({ alerts: [], toasts: [], collapsed: false })
    mockUseNodeTopology.mockReturnValue({
      data: { nodes: [], audio_edges: [], network_edges: [] },
    })
  })

  it('renders nothing when there are no alerts', () => {
    render(
      <MemoryRouter>
        <NodeAlertBar />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('region', { name: 'Node alerts' })).not.toBeInTheDocument()
  })

  it('renders warn and critical rows, can dismiss, and can collapse', () => {
    useNodeAlertStore.setState({
      alerts: [
        { id: 'warn:1', node_id: 'node-a', hostname: 'node-a', severity: 'warn', message: '3 xruns in last 60s', timestamp: '2026-03-15T09:00:00Z', dismissed: false },
        { id: 'critical:2', node_id: 'node-b', hostname: 'node-b', severity: 'critical', message: 'JUCE engine offline', timestamp: '2026-03-15T09:00:00Z', dismissed: false },
      ],
      toasts: [],
      collapsed: false,
    })

    render(
      <MemoryRouter>
        <NodeAlertBar />
      </MemoryRouter>,
    )

    expect(screen.getByText('3 xruns in last 60s')).toBeInTheDocument()
    expect(screen.getByText('JUCE engine offline')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Node alerts' }))
    expect(screen.queryByText('3 xruns in last 60s')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Node alerts' }))
    fireEvent.click(screen.getAllByRole('button', { name: /close/i })[0])
    expect(useNodeAlertStore.getState().alerts).toHaveLength(1)
  })

  it('fires toasts on critical transition, clears on recovery, and does not duplicate stale critical states', () => {
    mockUseNodeTopology.mockReturnValue({
      data: { nodes: [makeNode('critical')], audio_edges: [], network_edges: [] },
    })

    const { rerender } = render(<AlertHarness />)

    expect(screen.getByText('Node Critical')).toBeInTheDocument()
    expect(useNodeAlertStore.getState().alerts).toHaveLength(1)

    rerender(<AlertHarness />)
    expect(screen.getAllByText('Node Critical')).toHaveLength(1)

    mockUseNodeTopology.mockReturnValue({
      data: { nodes: [makeNode('ok')], audio_edges: [], network_edges: [] },
    })

    rerender(<AlertHarness />)
    expect(useNodeAlertStore.getState().alerts).toHaveLength(0)
  })

  it('ignores malformed topology node payloads without crashing the alert monitor', () => {
    mockUseNodeTopology.mockReturnValue({
      data: { nodes: { bad: true }, audio_edges: [], network_edges: [] },
    })

    render(<AlertHarness />)

    expect(useNodeAlertStore.getState().alerts).toEqual([])
    expect(screen.queryByRole('region', { name: 'Node alerts' })).not.toBeInTheDocument()
  })
})
