import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'

import { UnifiedChannelGrid } from './UnifiedChannelGrid'
import { makeEmptyRow, type UnifiedChannelRow } from './gridConstants'

function buildRows(): UnifiedChannelRow[] {
  const a = makeEmptyRow('row-a', 'Guitar A')
  a.ioLabel = '1/2 → Main'
  a.slots[0] = {
    ...a.slots[0],
    kind: 'plugin',
    uri: 'urn:plugin:amp',
    label: 'Amp',
    category: 'Amplifier',
  }

  const b = makeEmptyRow('row-b', 'Guitar B')
  b.stereo = true

  const c = makeEmptyRow('row-c', 'Bass')
  c.muted = true

  return [a, b, c]
}

describe('UnifiedChannelGrid', () => {
  it('renders a SlotRuler + N ChannelRow children', () => {
    const { container } = render(<UnifiedChannelGrid rows={buildRows()} />)

    expect(container.querySelectorAll('.ucg-slot-ruler')).toHaveLength(1)
    expect(container.querySelectorAll('.ucg-channel-row')).toHaveLength(3)

    expect(screen.getByText('Guitar A')).toBeInTheDocument()
    expect(screen.getByText('Guitar B')).toBeInTheDocument()
    expect(screen.getByText('Bass')).toBeInTheDocument()

    expect(screen.getByText('Amp')).toBeInTheDocument()
  })

  it('sets grid ARIA attributes from row count + SLOT_COUNT', () => {
    const { container } = render(<UnifiedChannelGrid rows={buildRows()} />)

    const grid = container.querySelector('.ucg-grid')
    expect(grid).toHaveAttribute('role', 'grid')
    expect(grid).toHaveAttribute('aria-rowcount', '4')
    expect(grid).toHaveAttribute('aria-colcount', '9')
  })

  it('passes selectedBlock to the matching row only', () => {
    const { container } = render(
      <UnifiedChannelGrid
        rows={buildRows()}
        selectedBlock={{ rowId: 'row-a', slotIndex: 0 }}
      />,
    )

    const selected = container.querySelectorAll('.ucg-block--selected')
    expect(selected).toHaveLength(1)
    expect(selected[0]).toHaveAttribute('aria-label', 'Amp')
  })
})
