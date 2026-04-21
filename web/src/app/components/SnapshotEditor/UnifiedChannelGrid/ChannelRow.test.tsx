import '@testing-library/jest-dom'
import { render, screen, fireEvent } from '@testing-library/react'

import { ChannelRow } from './ChannelRow'
import { makeEmptyRow, type UnifiedChannelRow } from './gridConstants'

function rowWithMixedSlots(): UnifiedChannelRow {
  const row = makeEmptyRow('row-1', 'Guitar A')
  row.ioLabel = '1/2 → Main'
  row.slots[0] = {
    ...row.slots[0],
    kind: 'plugin',
    uri: 'urn:plugin:reverb',
    label: 'Reverb',
    category: 'Reverb',
  }
  row.slots[3] = {
    ...row.slots[3],
    kind: 'dynamics',
    uri: 'urn:plugin:comp',
    label: 'Comp',
    category: 'Dynamics',
  }
  return row
}

describe('ChannelRow', () => {
  it('renders ChannelHeader + 8 slot cells with mixed blocks/empties', () => {
    const { container } = render(<ChannelRow row={rowWithMixedSlots()} />)

    const cells = container.querySelectorAll('.ucg-channel-row__slot-cell')
    expect(cells).toHaveLength(8)

    expect(screen.getByText('Reverb')).toBeInTheDocument()
    expect(screen.getByText('Comp')).toBeInTheDocument()

    const addButtons = screen.getAllByRole('button', { name: /Add block to slot/ })
    expect(addButtons).toHaveLength(6)
  })

  it('onSelectBlock fires with row id + slot index when a block is clicked', () => {
    const onSelectBlock = jest.fn()
    render(<ChannelRow row={rowWithMixedSlots()} onSelectBlock={onSelectBlock} />)

    fireEvent.click(screen.getByRole('button', { name: 'Reverb' }))
    expect(onSelectBlock).toHaveBeenCalledWith('row-1', 0)
  })

  it('onAddBlock fires with row id + slot index when an empty slot is clicked', () => {
    const onAddBlock = jest.fn()
    render(<ChannelRow row={rowWithMixedSlots()} onAddBlock={onAddBlock} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add block to slot 2' }))
    expect(onAddBlock).toHaveBeenCalledWith('row-1', 1)
  })

  it('applies ucg-channel-row--stereo class when row is stereo', () => {
    const row = rowWithMixedSlots()
    row.stereo = true
    const { container } = render(<ChannelRow row={row} />)

    const rowEl = container.querySelector('.ucg-channel-row')
    expect(rowEl).toHaveClass('ucg-channel-row--stereo')
    expect(rowEl).toHaveAttribute('data-stereo', 'true')
  })
})
