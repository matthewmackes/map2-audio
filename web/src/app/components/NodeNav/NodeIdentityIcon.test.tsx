import React from 'react'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { NodeIdentityIcon } from './NodeIdentityIcon'
import type { NodeSummary } from '../../types/node'

const healthyNode: NodeSummary = {
  node_id: 'AUDIO-NODE-CB62',
  hostname: 'map2-host',
  display_label: 'MAP2-TESTBED',
  role: 'all_in_one',
  status: 'ok',
  cpu_percent: 14,
  memory_percent: 71,
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

// Match the app-level future-flag opt-ins (App.tsx ROUTER_FUTURE_FLAGS) so
// tests don't emit unrelated v6→v7 deprecation warnings on every render.
const ROUTER_FUTURE_FLAGS = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter future={ROUTER_FUTURE_FLAGS}>{ui}</MemoryRouter>)
}

describe('NodeIdentityIcon', () => {
  it('renders the hexagon, name, role, and links to /node/<encoded id>', () => {
    const { container } = renderWithRouter(<NodeIdentityIcon node={healthyNode} />)

    const link = screen.getByRole('link', { name: /Node map2-host \(MAP2-TESTBED\), status OK\. Open node detail\./i })
    expect(link).toHaveAttribute('href', '/node/AUDIO-NODE-CB62')
    expect(link).toHaveAttribute('data-health', 'success')
    expect(link).toHaveTextContent('map2-host (MAP2-TESTBED)')
    expect(link).toHaveTextContent('ALL-IN-ONE')

    // Hexagon SVG: viewBox preserved + 3 inner dots + ring polygon.
    const svg = container.querySelector('svg.node-id-icon__hex')!
    expect(svg).toHaveAttribute('viewBox', '0 0 32 32')
    expect(container.querySelector('.node-id-icon__hex-ring')).not.toBeNull()
    expect(container.querySelectorAll('.node-id-icon__hex-dot').length).toBe(3)
  })

  it('encodes nodeIds with URL-unsafe characters in the href', () => {
    const weird: NodeSummary = { ...healthyNode, node_id: 'host with spaces / slash' }
    renderWithRouter(<NodeIdentityIcon node={weird} />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute(
      'href',
      `/node/${encodeURIComponent('host with spaces / slash')}`,
    )
  })

  describe('health roll-up (worst-of-N → ring color via data-health)', () => {
    it('marks the icon success when status=ok, pressure=stable, and no other warnings', () => {
      renderWithRouter(<NodeIdentityIcon node={healthyNode} />)
      expect(screen.getByRole('link')).toHaveAttribute('data-health', 'success')
    })

    it('marks the icon danger when status=critical', () => {
      renderWithRouter(
        <NodeIdentityIcon
          node={{ ...healthyNode, status: 'critical', latency_pressure_status: 'critical' }}
        />,
      )
      expect(screen.getByRole('link')).toHaveAttribute('data-health', 'danger')
    })

    it('marks the icon danger when xruns are present even if status=ok', () => {
      renderWithRouter(<NodeIdentityIcon node={{ ...healthyNode, xrun_count: 3 }} />)
      expect(screen.getByRole('link')).toHaveAttribute('data-health', 'danger')
    })

    it('marks the icon warning when status=warn', () => {
      renderWithRouter(
        <NodeIdentityIcon
          node={{ ...healthyNode, status: 'warn', latency_pressure_status: 'watch' }}
        />,
      )
      expect(screen.getByRole('link')).toHaveAttribute('data-health', 'warning')
    })

    it('marks the icon warning when CPU is at or above 85%', () => {
      renderWithRouter(<NodeIdentityIcon node={{ ...healthyNode, cpu_percent: 90 }} />)
      expect(screen.getByRole('link')).toHaveAttribute('data-health', 'warning')
    })

    it('marks the icon warning when memory is at or above 85%', () => {
      renderWithRouter(<NodeIdentityIcon node={{ ...healthyNode, memory_percent: 88 }} />)
      expect(screen.getByRole('link')).toHaveAttribute('data-health', 'warning')
    })

    it('marks the icon warning when audio latency is at or above 10 ms', () => {
      renderWithRouter(<NodeIdentityIcon node={{ ...healthyNode, audio_latency_ms: 12 }} />)
      expect(screen.getByRole('link')).toHaveAttribute('data-health', 'warning')
    })

    it('marks the icon muted when status=offline', () => {
      renderWithRouter(
        <NodeIdentityIcon
          node={{ ...healthyNode, status: 'offline', latency_pressure_status: 'offline' }}
        />,
      )
      expect(screen.getByRole('link')).toHaveAttribute('data-health', 'muted')
    })

    it('marks the icon muted when latency_pressure_status=waiting (no telemetry yet)', () => {
      renderWithRouter(
        <NodeIdentityIcon node={{ ...healthyNode, latency_pressure_status: 'waiting' }} />,
      )
      expect(screen.getByRole('link')).toHaveAttribute('data-health', 'muted')
    })
  })

  it('renders a placeholder link to /node when node is null', () => {
    renderWithRouter(<NodeIdentityIcon node={null} loadingLabel="LOADING" />)
    const link = screen.getByRole('link', { name: /Node discovery unavailable\. Open node detail\./i })
    expect(link).toHaveAttribute('href', '/node')
    expect(link).toHaveAttribute('data-health', 'muted')
    expect(link).toHaveTextContent('LOADING')
    expect(link).toHaveTextContent('—')
  })

  it('shows UNAVAILABLE in the role slot when no loadingLabel is provided', () => {
    renderWithRouter(<NodeIdentityIcon node={null} />)
    expect(screen.getByRole('link')).toHaveTextContent('UNAVAILABLE')
  })
})
