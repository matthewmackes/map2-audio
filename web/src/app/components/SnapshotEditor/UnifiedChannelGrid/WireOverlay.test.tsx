import '@testing-library/jest-dom'
import { render, fireEvent } from '@testing-library/react'

import { WireOverlay, type Wire } from './WireOverlay'
import { makeEmptyRow, type UnifiedChannelRow } from './gridConstants'

const ROWS: UnifiedChannelRow[] = [
  makeEmptyRow('row-a', 'A'),
  makeEmptyRow('row-b', 'B'),
  makeEmptyRow('row-c', 'C'),
]

describe('WireOverlay', () => {
  it('renders an SVG wire for each kind (send, parallel, sidechain) at the correct data attributes', () => {
    const wires: Wire[] = [
      { id: 'w1', kind: 'send', from: { rowId: 'row-a', slotIndex: 1 }, to: { rowId: 'row-b', slotIndex: 3 } },
      { id: 'w2', kind: 'parallel', from: { rowId: 'row-a', slotIndex: 2 }, to: { rowId: 'row-c', slotIndex: 2 } },
      { id: 'w3', kind: 'sidechain', from: { rowId: 'row-b', slotIndex: 0 }, to: { rowId: 'row-c', slotIndex: 5 } },
    ]

    const { container } = render(<WireOverlay rows={ROWS} wires={wires} />)
    const svg = container.querySelector('svg.ucg-wire-overlay')
    expect(svg).not.toBeNull()
    expect(svg).toHaveAttribute('data-wire-count', '3')

    const groups = container.querySelectorAll('[data-wire-id]')
    expect(groups).toHaveLength(3)
    expect(container.querySelector('[data-wire-id="w1"]')).toHaveAttribute('data-wire-kind', 'send')
    expect(container.querySelector('[data-wire-id="w2"]')).toHaveAttribute('data-wire-kind', 'parallel')
    expect(container.querySelector('[data-wire-id="w3"]')).toHaveAttribute('data-wire-kind', 'sidechain')
  })

  it('skips wires that reference missing rows', () => {
    const wires: Wire[] = [
      { id: 'ok', kind: 'send', from: { rowId: 'row-a', slotIndex: 0 }, to: { rowId: 'row-b', slotIndex: 1 } },
      { id: 'bad', kind: 'send', from: { rowId: 'row-a', slotIndex: 0 }, to: { rowId: 'row-missing', slotIndex: 0 } },
    ]

    const { container } = render(<WireOverlay rows={ROWS} wires={wires} />)
    expect(container.querySelector('[data-wire-id="ok"]')).not.toBeNull()
    expect(container.querySelector('[data-wire-id="bad"]')).toBeNull()
  })

  it('activates a wire on hover and fires onHoverWire', () => {
    const onHoverWire = jest.fn()
    const wires: Wire[] = [
      { id: 'w1', kind: 'send', from: { rowId: 'row-a', slotIndex: 0 }, to: { rowId: 'row-b', slotIndex: 0 } },
    ]

    const { container } = render(
      <WireOverlay rows={ROWS} wires={wires} onHoverWire={onHoverWire} />,
    )
    const group = container.querySelector('[data-wire-id="w1"]')!
    expect(group).toHaveAttribute('data-active', 'false')

    fireEvent.mouseEnter(group)
    expect(onHoverWire).toHaveBeenLastCalledWith('w1')
    expect(group).toHaveAttribute('data-active', 'true')

    fireEvent.mouseLeave(group)
    expect(onHoverWire).toHaveBeenLastCalledWith(null)
    expect(group).toHaveAttribute('data-active', 'false')
  })
})
