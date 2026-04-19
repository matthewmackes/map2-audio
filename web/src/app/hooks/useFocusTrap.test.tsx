import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'

import { useFocusTrap } from './useFocusTrap'

function FocusTrapHarness({ onEscape }: { onEscape: () => void }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useFocusTrap({
    enabled: open,
    containerRef: panelRef,
    onEscape: () => {
      onEscape()
      setOpen(false)
    },
    restoreFocusRef: triggerRef,
  })

  return (
    <div>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
        Open launcher
      </button>
      {open ? (
        <div ref={panelRef}>
          <button type="button">First action</button>
          <button type="button">Last action</button>
        </div>
      ) : null}
    </div>
  )
}

describe('useFocusTrap', () => {
  it('focuses the first control, traps tab order, and restores focus after close', () => {
    const handleEscape = jest.fn()
    render(<FocusTrapHarness onEscape={handleEscape} />)

    const trigger = screen.getByRole('button', { name: 'Open launcher' })
    trigger.focus()
    fireEvent.click(trigger)

    const firstAction = screen.getByRole('button', { name: 'First action' })
    const lastAction = screen.getByRole('button', { name: 'Last action' })

    expect(firstAction).toHaveFocus()

    lastAction.focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(firstAction).toHaveFocus()

    firstAction.focus()
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(lastAction).toHaveFocus()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(handleEscape).toHaveBeenCalledTimes(1)
    expect(trigger).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'First action' })).not.toBeInTheDocument()
  })
})
