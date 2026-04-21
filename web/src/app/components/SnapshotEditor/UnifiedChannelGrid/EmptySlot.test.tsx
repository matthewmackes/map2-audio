import '@testing-library/jest-dom'
import { render, screen, fireEvent } from '@testing-library/react'

import { EmptySlot } from './EmptySlot'
import { InsertGap } from './InsertGap'

describe('EmptySlot', () => {
  it('calls onAdd with slot index when clicked', () => {
    const onAdd = jest.fn()
    render(<EmptySlot slotIndex={3} onAdd={onAdd} />)

    const button = screen.getByRole('button', { name: 'Add block to slot 4' })
    expect(button).toHaveAttribute('data-slot-index', '3')
    fireEvent.click(button)
    expect(onAdd).toHaveBeenCalledWith(3)
  })

  it('is disabled when disabled prop is true', () => {
    const onAdd = jest.fn()
    render(<EmptySlot slotIndex={1} onAdd={onAdd} disabled />)

    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(onAdd).not.toHaveBeenCalled()
  })
})

describe('InsertGap', () => {
  it('calls onInsert with before-slot index when clicked', () => {
    const onInsert = jest.fn()
    render(<InsertGap beforeSlotIndex={2} onInsert={onInsert} />)

    const button = screen.getByRole('button', { name: 'Insert block before slot 3' })
    expect(button).toHaveAttribute('data-before-slot-index', '2')
    fireEvent.click(button)
    expect(onInsert).toHaveBeenCalledWith(2)
  })
})
