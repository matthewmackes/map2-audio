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
  cpu_percent: 62,
  memory_percent: 94,
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

describe('NodeIdentityCard (V4-A3 Numbered Ladder)', () => {
  it('renders the eyebrow, header host/role, ladder, xrun callout and footer chips', () => {
    const onToggle = jest.fn()
    const { container } = render(
      <NodeIdentityCard node={baseNode} isOpen={false} onToggle={onToggle} />,
    )

    const card = screen.getByRole('button', { name: /Node map2-host \(MAP2-TESTBED\)/i })
    expect(card).toHaveAttribute('aria-expanded', 'false')
    expect(card).toHaveAttribute('data-status', 'ok')
    expect(card).toHaveAttribute('data-pressure-tone', 'stable')

    // Eyebrow strip retained.
    expect(card).toHaveTextContent('Current Node in View')
    expect(card).toHaveTextContent('OK')

    // Header row: host + role.
    expect(card).toHaveTextContent('map2-host (MAP2-TESTBED)')
    expect(card).toHaveTextContent('ALL-IN-ONE')

    // Pressure block.
    expect(card).toHaveTextContent('LAT PRESS')
    expect(card).toHaveTextContent('STABLE')
    expect(card).toHaveTextContent('10')
    expect(card).toHaveTextContent('/10')
    expect(card).toHaveTextContent('1 worst → 10 best')

    // 10 ladder steps, all filled at score 10.
    const steps = container.querySelectorAll('.node-id-card__ladder-step')
    expect(steps.length).toBe(10)
    expect(
      Array.from(steps).filter((s) => s.getAttribute('data-filled') === 'true').length,
    ).toBe(10)

    // XRUNS callout.
    expect(card).toHaveTextContent('XRUNS')
    expect(card).toHaveTextContent('NO DROPOUTS')

    // Footer chips.
    expect(card).toHaveTextContent('CPU')
    expect(card).toHaveTextContent('62%')
    expect(card).toHaveTextContent('MEM')
    expect(card).toHaveTextContent('94%')
    expect(card).toHaveTextContent('LAT')
    expect(card).toHaveTextContent('1.33ms')
  })

  it('fills the correct number of ladder steps for a watch-state score of 6', () => {
    const watch: NodeSummary = {
      ...baseNode,
      status: 'warn',
      cpu_percent: 71,
      memory_percent: 78,
      audio_latency_ms: 4.7,
      xrun_count: 3,
      latency_pressure_score: 6,
      latency_pressure_status: 'watch',
    }

    const { container } = render(
      <NodeIdentityCard node={watch} isOpen={false} onToggle={jest.fn()} />,
    )

    const card = container.querySelector('.node-id-card')!
    expect(card).toHaveAttribute('data-status', 'warn')
    expect(card).toHaveAttribute('data-pressure-tone', 'watch')

    const steps = container.querySelectorAll('.node-id-card__ladder-step')
    expect(steps.length).toBe(10)
    expect(
      Array.from(steps).filter((s) => s.getAttribute('data-filled') === 'true').length,
    ).toBe(6)

    expect(card).toHaveTextContent('WATCH')
    expect(card).toHaveTextContent('3')
    expect(card).toHaveTextContent('DROPOUTS')
    expect(card).toHaveTextContent('4.70ms')
  })

  it('renders the offline placeholder and dashes the footer chips when status is offline', () => {
    const offline: NodeSummary = {
      ...baseNode,
      status: 'offline',
      cpu_percent: 0,
      memory_percent: 0,
      audio_latency_ms: 0,
      xrun_count: 0,
      latency_pressure_score: 0,
      latency_pressure_percent: 100,
      latency_pressure_status: 'offline',
    }

    const { container } = render(
      <NodeIdentityCard node={offline} isOpen={false} onToggle={jest.fn()} />,
    )

    const card = container.querySelector('.node-id-card')!
    expect(card).toHaveAttribute('data-status', 'offline')
    expect(card).toHaveAttribute('data-pressure-tone', 'offline')

    // Ladder + xrun callout are hidden.
    expect(container.querySelector('.node-id-card__ladder')).toBeNull()
    expect(container.querySelector('.node-id-card__xrun')).toBeNull()

    // Placeholder strip is shown.
    expect(container.querySelector('.node-id-card__placeholder')).not.toBeNull()
    expect(card).toHaveTextContent('NODE OFFLINE')

    // Footer chips show em-dashes.
    const chipValues = Array.from(container.querySelectorAll('.node-id-card__chip-value')).map(
      (el) => el.textContent,
    )
    expect(chipValues).toEqual(['—', '—', '—'])
  })

  it('renders a placeholder card when no node is available', () => {
    const { container } = render(
      <NodeIdentityCard node={null} isOpen={false} onToggle={jest.fn()} loadingLabel="LOADING" />,
    )
    const card = screen.getByRole('button', { name: 'Node discovery unavailable' })
    expect(card).toBeInTheDocument()
    expect(screen.getByText('LOADING', { selector: '.node-id-card__eyebrow-status' })).toBeInTheDocument()
    expect(container.querySelector('.node-id-card__placeholder')).not.toBeNull()
  })

  it('falls back to WAITING when latency pressure is missing on the payload', () => {
    const partial: NodeSummary = {
      ...baseNode,
      latency_pressure_score: undefined,
      latency_pressure_percent: undefined,
      latency_pressure_status: undefined,
    }
    const { container } = render(
      <NodeIdentityCard node={partial} isOpen={false} onToggle={jest.fn()} />,
    )
    const card = container.querySelector('.node-id-card')!
    expect(card).toHaveAttribute('data-pressure-tone', 'waiting')
    expect(card).toHaveTextContent('WAITING')
    // Ladder/xrun hidden, placeholder shown.
    expect(container.querySelector('.node-id-card__ladder')).toBeNull()
    expect(container.querySelector('.node-id-card__xrun')).toBeNull()
    expect(container.querySelector('.node-id-card__placeholder')).not.toBeNull()
  })

  it('toggles via click', () => {
    const onToggle = jest.fn()
    render(<NodeIdentityCard node={baseNode} isOpen={false} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button', { name: /Node map2-host/i }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  describe('page-body mode (no onToggle)', () => {
    it('renders as a non-interactive <section> when onToggle is omitted', () => {
      const { container } = render(<NodeIdentityCard node={baseNode} />)
      const card = container.querySelector('.node-id-card')!
      expect(card.tagName).toBe('SECTION')
      // No button affordance — no aria-expanded, no caret, no role=button.
      expect(card).not.toHaveAttribute('aria-expanded')
      expect(container.querySelector('.node-id-card__caret')).toBeNull()
      expect(screen.queryByRole('button', { name: /Node map2-host/i })).toBeNull()
    })

    it('keeps the same data-status / data-pressure-tone wiring as the interactive mode', () => {
      const { container } = render(<NodeIdentityCard node={baseNode} />)
      const card = container.querySelector('.node-id-card')!
      expect(card).toHaveAttribute('data-status', 'ok')
      expect(card).toHaveAttribute('data-pressure-tone', 'stable')
    })

    it('renders the same card body content (eyebrow, ladder, xrun callout, footer chips)', () => {
      const { container } = render(<NodeIdentityCard node={baseNode} />)
      const card = container.querySelector('.node-id-card')!
      expect(card).toHaveTextContent('Current Node in View')
      expect(card).toHaveTextContent('OK')
      expect(card).toHaveTextContent('map2-host (MAP2-TESTBED)')
      expect(card).toHaveTextContent('ALL-IN-ONE')
      expect(card).toHaveTextContent('LAT PRESS')
      expect(card).toHaveTextContent('STABLE')
      expect(container.querySelectorAll('.node-id-card__ladder-step').length).toBe(10)
      expect(card).toHaveTextContent('NO DROPOUTS')
      expect(card).toHaveTextContent('62%')
      // The aria-label drops the "Click to switch nodes" call-to-action
      // because the section is no longer clickable.
      expect(card.getAttribute('aria-label')).toBe('Node map2-host (MAP2-TESTBED), status OK.')
    })

    it('renders the placeholder card as a <section> when node is null', () => {
      const { container } = render(<NodeIdentityCard node={null} loadingLabel="LOADING" />)
      const card = container.querySelector('.node-id-card')!
      expect(card.tagName).toBe('SECTION')
      expect(card).toHaveAttribute('data-status', 'offline')
      expect(card).toHaveAttribute('data-pressure-tone', 'waiting')
      expect(container.querySelector('.node-id-card__caret')).toBeNull()
      expect(card).toHaveTextContent('LOADING')
    })
  })
})
