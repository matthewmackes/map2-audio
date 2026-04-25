import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'

import { NodeIdentityCard } from './NodeIdentityCard'
import type { NodeSummary } from '../../types/node'

const baseNode: NodeSummary = {
  node_id: 'map2-host',
  hostname: 'map2-host',
  display_label: 'MAP2-TESTBED',
  role: 'all_in_one',
  status: 'ok',
  cpu_percent: 12,
  memory_percent: 22,
  xrun_count: 0,
  audio_latency_ms: 1.33,
  services: { backend: true, juce_engine: true, pipewire: true },
  latency_pressure_score: 10,
  latency_pressure_percent: 0,
  latency_pressure_status: 'stable',
  last_seen: new Date().toISOString(),
  is_local: true,
  is_viewed: true,
}

describe('NodeIdentityCard', () => {
  it('renders the hero card with HOST/ROLE/LATENCY/XRUNS/LAT PRESS plate', () => {
    const onToggle = jest.fn()
    render(<NodeIdentityCard node={baseNode} isOpen={false} onToggle={onToggle} />)

    const card = screen.getByRole('button', { name: /Node map2-host \(MAP2-TESTBED\)/i })
    expect(card).toHaveAttribute('aria-expanded', 'false')
    expect(card).toHaveAttribute('data-status', 'ok')
    expect(card).toHaveTextContent('HOST')
    expect(card).toHaveTextContent('map2-host')
    expect(card).toHaveTextContent('ROLE')
    expect(card).toHaveTextContent('LATENCY')
    expect(card).toHaveTextContent('1.33 ms')
    expect(card).toHaveTextContent('XRUNS')
    expect(card).toHaveTextContent('LAT PRESS')
    expect(card).toHaveTextContent('10/10')
    expect(card).toHaveTextContent('STABLE')
  })

  it('hides CPU/MEM resources when the node is offline (no live data)', () => {
    const offline: NodeSummary = {
      ...baseNode,
      status: 'offline',
      cpu_percent: 0,
      memory_percent: 0,
      audio_latency_ms: 0,
      latency_pressure_score: 0,
      latency_pressure_percent: 100,
      latency_pressure_status: 'offline',
    }

    const { container } = render(
      <NodeIdentityCard node={offline} isOpen={false} onToggle={jest.fn()} />,
    )
    const card = container.querySelector('.node-id-card')!
    expect(card).toHaveAttribute('data-status', 'offline')
    expect(card).toHaveAttribute('data-resources-overlay', 'false')
    expect(container.querySelector('.node-id-card__overlay')).toBeNull()
    expect(card).toHaveTextContent('00/10')
    expect(card).toHaveTextContent('OFFLINE')
  })

  it('renders a placeholder card when no node is available', () => {
    render(<NodeIdentityCard node={null} isOpen={false} onToggle={jest.fn()} loadingLabel="LOADING" />)
    expect(screen.getByRole('button', { name: 'Node discovery unavailable' })).toBeInTheDocument()
    expect(screen.getByText('LOADING')).toBeInTheDocument()
  })

  it('toggles via click', () => {
    const onToggle = jest.fn()
    render(<NodeIdentityCard node={baseNode} isOpen={false} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button', { name: /Node map2-host/i }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('falls back to WAITING when latency pressure is missing on the payload', () => {
    const partial: NodeSummary = {
      ...baseNode,
      latency_pressure_score: undefined,
      latency_pressure_percent: undefined,
      latency_pressure_status: undefined,
    }
    render(<NodeIdentityCard node={partial} isOpen={false} onToggle={jest.fn()} />)
    const card = screen.getByRole('button', { name: /Node map2-host/i })
    expect(card).toHaveTextContent('--/10')
    expect(card).toHaveTextContent('WAITING')
  })
})
