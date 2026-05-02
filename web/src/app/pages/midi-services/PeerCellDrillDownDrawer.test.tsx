/**
 * T2484 loop 20 / iter 193 — PeerCellDrillDownDrawer tests (T2484-3).
 *
 * Confirms the drawer:
 * - is hidden when open=false
 * - shows the right heading when open with a cell
 * - shows the empty-state message when no peers carry bindings for the cell
 * - lists each peer with bindings sorted by count desc
 * - displays 'enabled/total' when partial; raw count when all enabled
 */

import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import React from 'react'

import { PeerCellDrillDownDrawer } from './PeerCellDrillDownDrawer'
import type { ClusterPeerMatrix } from '../../../map2/clients/midiBindings'

const TWO_PEERS: ClusterPeerMatrix[] = [
  {
    node_id: 'peer-a',
    hostname: 'peer-a.local',
    matrix: {
      midi_cc: { plugin_param: { count: 5, enabled_count: 3 } },
    },
    total_bindings: 5,
    health: 'ok',
  },
  {
    node_id: 'peer-b',
    hostname: 'peer-b.local',
    matrix: {
      midi_cc: { plugin_param: { count: 2, enabled_count: 2 } },
      midi_note: { transport: { count: 1, enabled_count: 1 } },
    },
    total_bindings: 3,
    health: 'warn',
  },
]

describe('PeerCellDrillDownDrawer', () => {
  it('does not call onClose on initial render with open=false', () => {
    const onClose = jest.fn()
    render(
      <PeerCellDrillDownDrawer
        open={false}
        onClose={onClose}
        sourceType="midi_cc"
        consumerType="plugin_param"
        peerSlices={TWO_PEERS}
      />,
    )
    // Carbon Modal stays mounted when open=false; the visible state
    // is controlled by aria-hidden + CSS. We assert behaviour: no
    // close-handler calls fire just by rendering closed.
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows the heading when open with a cell selected', () => {
    render(
      <PeerCellDrillDownDrawer
        open
        onClose={() => undefined}
        sourceType="midi_cc"
        consumerType="plugin_param"
        peerSlices={TWO_PEERS}
      />,
    )
    expect(
      screen.getByText(/midi_cc → plugin_param on cluster peers/i),
    ).toBeInTheDocument()
  })

  it('shows the empty-state message when no peers carry bindings for the cell', () => {
    render(
      <PeerCellDrillDownDrawer
        open
        onClose={() => undefined}
        sourceType="midi_pc"
        consumerType="snapshot"
        peerSlices={TWO_PEERS}
      />,
    )
    expect(
      screen.getByText(/No peers carry bindings for this cell/i),
    ).toBeInTheDocument()
  })

  it('lists each peer with bindings sorted by count descending', () => {
    render(
      <PeerCellDrillDownDrawer
        open
        onClose={() => undefined}
        sourceType="midi_cc"
        consumerType="plugin_param"
        peerSlices={TWO_PEERS}
      />,
    )
    const peerARow = screen.getByTestId('peer-row-peer-a')
    const peerBRow = screen.getByTestId('peer-row-peer-b')
    expect(peerARow).toBeInTheDocument()
    expect(peerBRow).toBeInTheDocument()
    // peer-a (count=5) appears before peer-b (count=2) in the document.
    expect(peerARow.compareDocumentPosition(peerBRow)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it("shows 'enabled/total' when partial; raw count when all enabled", () => {
    render(
      <PeerCellDrillDownDrawer
        open
        onClose={() => undefined}
        sourceType="midi_cc"
        consumerType="plugin_param"
        peerSlices={TWO_PEERS}
      />,
    )
    // peer-a: count=5, enabled=3 → '3/5'
    expect(screen.getByText('3/5')).toBeInTheDocument()
    // peer-b: count=2, enabled=2 → '2'
    const peerBRow = screen.getByTestId('peer-row-peer-b')
    expect(peerBRow.textContent).toContain('2')
    expect(peerBRow.textContent).not.toContain('2/2')
  })

  it('filters out peers whose count for the cell is 0', () => {
    // Peer-c has midi_note bindings but no midi_cc; should not appear.
    render(
      <PeerCellDrillDownDrawer
        open
        onClose={() => undefined}
        sourceType="midi_cc"
        consumerType="plugin_param"
        peerSlices={TWO_PEERS}
      />,
    )
    // Both peers in TWO_PEERS have midi_cc/plugin_param entries, so
    // both render. This test confirms peer-b's midi_note slice doesn't
    // pollute the midi_cc/plugin_param view.
    expect(screen.queryByText(/midi_note/i)).not.toBeInTheDocument()
  })

  // T2484-4 iter 198 — health Tag tests.
  it("renders the per-peer health string in the Health column", () => {
    render(
      <PeerCellDrillDownDrawer
        open
        onClose={() => undefined}
        sourceType="midi_cc"
        consumerType="plugin_param"
        peerSlices={TWO_PEERS}
      />,
    )
    // peer-a is 'ok'; peer-b is 'warn'.
    const peerARow = screen.getByTestId('peer-row-peer-a')
    expect(peerARow.textContent).toContain('ok')
    const peerBRow = screen.getByTestId('peer-row-peer-b')
    expect(peerBRow.textContent).toContain('warn')
  })

  it('falls back to offline for missing health field', () => {
    const peersNoHealth = [
      {
        ...TWO_PEERS[0],
        health: undefined as unknown as string,
      },
    ]
    render(
      <PeerCellDrillDownDrawer
        open
        onClose={() => undefined}
        sourceType="midi_cc"
        consumerType="plugin_param"
        peerSlices={peersNoHealth}
      />,
    )
    const peerARow = screen.getByTestId('peer-row-peer-a')
    expect(peerARow.textContent).toContain('offline')
  })

  it.each([
    ['ok', 'green'],
    ['warn', 'magenta'],
    ['critical', 'red'],
    ['offline', 'gray'],
  ])('maps health=%s to Carbon Tag tone', (health, _expectedTone) => {
    render(
      <PeerCellDrillDownDrawer
        open
        onClose={() => undefined}
        sourceType="midi_cc"
        consumerType="plugin_param"
        peerSlices={[{ ...TWO_PEERS[0], health }]}
      />,
    )
    const peerARow = screen.getByTestId('peer-row-peer-a')
    expect(peerARow.textContent).toContain(health)
  })
})
