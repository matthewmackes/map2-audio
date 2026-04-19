import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'

import { useFocusReturnTarget } from './useFocusReturnTarget'

function FocusReturnHarness() {
  const [open, setOpen] = useState(false)
  const { capture, restore } = useFocusReturnTarget<HTMLButtonElement>()

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          capture()
          setOpen(true)
        }}
      >
        Open
      </button>
      {open ? (
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            restore()
          }}
        >
          Close
        </button>
      ) : null}
    </div>
  )
}

describe('useFocusReturnTarget', () => {
  it('restores focus to the captured launcher when the overlay closes', () => {
    render(<FocusReturnHarness />)

    const openButton = screen.getByRole('button', { name: 'Open' })
    openButton.focus()

    fireEvent.click(openButton)
    const closeButton = screen.getByRole('button', { name: 'Close' })
    closeButton.focus()

    fireEvent.click(closeButton)

    expect(openButton).toHaveFocus()
  })
})
