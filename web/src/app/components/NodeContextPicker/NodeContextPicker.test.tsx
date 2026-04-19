import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'

import { NodeContextPicker } from './NodeContextPicker'
import { useViewedNodeStore } from '../../stores/viewedNodeStore'

jest.mock('@carbon/react', () => {
  const actual = jest.requireActual('@carbon/react')
  return {
    ...actual,
    Dropdown: ({ id, titleText, items, selectedItem, onChange, disabled }: any) => (
      <label htmlFor={id}>
        {titleText}
        <select
          id={id}
          data-testid={id}
          disabled={disabled}
          value={selectedItem?.id ?? ''}
          onChange={(event) => {
            const item = items.find((candidate: { id: string }) => candidate.id === event.currentTarget.value) ?? null
            onChange?.({ selectedItem: item })
          }}
        >
          {items.map((item: { id: string; label: string }) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
    ),
  }
})

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

describe('NodeContextPicker', () => {
  beforeEach(() => {
    useViewedNodeStore.setState({ pageNodeMap: {} })
  })

  it('renders all topology nodes', () => {
    render(<NodeContextPicker pageKey="chains" topology={topology} />)

    const options = screen.getAllByRole('option').map((option) => option.textContent)
    expect(options).toEqual(['node-a', 'node-b (Stage Left)'])
  })

  it('updates the viewed node for the page', () => {
    render(<NodeContextPicker pageKey="chains" topology={topology} />)

    fireEvent.change(screen.getByTestId('node-context-picker-chains'), { target: { value: 'node-b' } })

    expect(useViewedNodeStore.getState().pageNodeMap.chains).toBe('node-b')
  })

  it('disables itself when only one node exists', () => {
    render(<NodeContextPicker pageKey="chains" topology={{ ...topology, nodes: [topology.nodes[0]] }} />)

    expect(screen.getByTestId('node-context-picker-chains')).toBeDisabled()
  })

  it('disables itself while topology is unavailable', () => {
    render(<NodeContextPicker pageKey="chains" topology={undefined} />)

    expect(screen.getByTestId('node-context-picker-chains')).toBeDisabled()
  })

  it('disables itself when topology is malformed', () => {
    render(<NodeContextPicker pageKey="chains" topology={{} as typeof topology} />)

    expect(screen.getByTestId('node-context-picker-chains')).toBeDisabled()
  })
})
