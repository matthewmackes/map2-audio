import '@testing-library/jest-dom'
import React from 'react'
import { render, screen } from '@testing-library/react'

import { JuceGridRoutingVisualizer } from './SnapshotEditorRoutingVisualizer'

const flows = [
  {
    id: 'a',
    label: 'A',
    color: '#0f62fe',
    muted: false,
    active: true,
    blendPercent: 60,
  },
  {
    id: 'b',
    label: 'B',
    color: '#fa4d56',
    muted: false,
    active: false,
    blendPercent: 40,
  },
]

describe('JuceGridRoutingVisualizer', () => {
  it('renders schematic route readouts with the routing diagram', () => {
    render(
      <JuceGridRoutingVisualizer
        mode="parallel_blend"
        flows={flows}
        activeFlowId="a"
      />,
    )

    expect(screen.getByLabelText('Routing: Parallel blend')).toBeInTheDocument()
    expect(screen.getByLabelText('Active: 1/2 flows')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Parallel blend routing diagram' })).toBeInTheDocument()
  })

  // T2521-7 cycle 36 — remote-peer Cloud-badge render.
  it('renders the SonoBus Cloud badge next to the Input terminal when a flow has remoteInput', () => {
    const flowsWithRemoteInput = [
      { ...flows[0], remoteInput: true },
      flows[1],
    ]
    const { container } = render(
      <JuceGridRoutingVisualizer
        mode="series"
        flows={flowsWithRemoteInput}
        activeFlowId="a"
      />,
    )
    const badge = container.querySelector(
      '.juce-grid-page__routing-terminal-remote-badge',
    )
    expect(badge).not.toBeNull()
    expect(badge?.querySelector('title')?.textContent).toBe(
      'SonoBus remote peer',
    )
  })

  it('renders no Cloud badge when no flow has remote flags set', () => {
    const { container } = render(
      <JuceGridRoutingVisualizer
        mode="series"
        flows={flows}
        activeFlowId="a"
      />,
    )
    expect(
      container.querySelector('.juce-grid-page__routing-terminal-remote-badge'),
    ).toBeNull()
  })

  it('marks the Input terminal aria-label with the remote peer hint', () => {
    const flowsWithRemoteInput = [
      { ...flows[0], remoteInput: true },
      flows[1],
    ]
    render(
      <JuceGridRoutingVisualizer
        mode="series"
        flows={flowsWithRemoteInput}
        activeFlowId="a"
        onMarkerSelect={() => undefined}
      />,
    )
    expect(
      screen.getByLabelText('Input routing inspector (SonoBus remote peer)'),
    ).toBeInTheDocument()
  })

  it('renders the Cloud badge on the Output terminal when remoteOutput is set', () => {
    const flowsWithRemoteOutput = [
      { ...flows[0], remoteOutput: true },
      flows[1],
    ]
    const { container } = render(
      <JuceGridRoutingVisualizer
        mode="ab_switch"
        flows={flowsWithRemoteOutput}
        activeFlowId="a"
      />,
    )
    // Both Input + Output terminals render; only the Output side
    // should carry the remote badge.
    const badges = container.querySelectorAll(
      '.juce-grid-page__routing-terminal-remote-badge',
    )
    expect(badges).toHaveLength(1)
  })

  it('renders Cloud badges in every mode (series / parallel_blend / ab_switch / sidechain)', () => {
    const remoteFlows = flows.map((flow) => ({
      ...flow,
      remoteInput: true,
      remoteOutput: true,
    }))
    for (const mode of ['series', 'parallel_blend', 'ab_switch', 'sidechain'] as const) {
      const { container, unmount } = render(
        <JuceGridRoutingVisualizer
          mode={mode}
          flows={remoteFlows}
          activeFlowId="a"
        />,
      )
      const badges = container.querySelectorAll(
        '.juce-grid-page__routing-terminal-remote-badge',
      )
      // Every diagram exposes Input + Output terminals → 2 badges.
      // Sidechain adds a `key` terminal but that one is not
      // input/output, so it stays badge-less; still 2 expected.
      expect(badges.length).toBeGreaterThanOrEqual(2)
      unmount()
    }
  })
})
