/**
 * T2485-3 — DeviceFlowCanvasShell unit tests.
 */

import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { DeviceFlowCanvasShell } from './DeviceFlowCanvasShell'

describe('DeviceFlowCanvasShell', () => {
  it('renders the canvas slot', () => {
    render(
      <DeviceFlowCanvasShell
        profileKey="lexicon/mpx-1.midi"
        canvas={<div data-testid="canvas-body">SVG body</div>}
      />,
    )
    expect(screen.getByTestId('canvas-body')).toBeInTheDocument()
  })

  it('renders toolbar and sidebar slots when provided', () => {
    render(
      <DeviceFlowCanvasShell
        profileKey="x"
        toolbar={<button>Tool</button>}
        sidebar={<div data-testid="sidebar">Sidebar</div>}
        canvas={<div>Body</div>}
      />,
    )
    expect(screen.getByText('Tool')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
  })

  it('exposes profileKey + sidebar-side data attributes for diagnostics', () => {
    const { container } = render(
      <DeviceFlowCanvasShell
        profileKey="lexicon/mpx-1.midi"
        sidebarSide="left"
        sidebar={<div>S</div>}
        canvas={<div>C</div>}
      />,
    )
    const shell = container.querySelector('.device-flow-canvas-shell')
    expect(shell).toHaveAttribute('data-profile-key', 'lexicon/mpx-1.midi')
    expect(shell).toHaveAttribute('data-sidebar-side', 'left')
    expect(container.querySelector('.device-flow-canvas-shell__sidebar--left')).toBeInTheDocument()
    expect(container.querySelector('.device-flow-canvas-shell__sidebar--right')).toBeNull()
  })

  it('places the sidebar on the right by default', () => {
    const { container } = render(
      <DeviceFlowCanvasShell
        profileKey="x"
        sidebar={<div>S</div>}
        canvas={<div>C</div>}
      />,
    )
    expect(container.querySelector('.device-flow-canvas-shell__sidebar--right')).toBeInTheDocument()
    expect(container.querySelector('.device-flow-canvas-shell__sidebar--left')).toBeNull()
  })

  it('triggers undo on Ctrl/Cmd+Z and redo on Ctrl/Cmd+Shift+Z', () => {
    const undo = jest.fn()
    const redo = jest.fn()
    render(
      <DeviceFlowCanvasShell
        profileKey="x"
        canvas={<div>C</div>}
        shortcuts={{
          undo: { combo: 'mod+z', handler: undo },
          redo: { combo: 'mod+shift+z', handler: redo },
        }}
      />,
    )
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    expect(undo).toHaveBeenCalledTimes(1)
    expect(redo).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true })
    expect(redo).toHaveBeenCalledTimes(1)

    // Ctrl+Y also triggers redo.
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true })
    expect(redo).toHaveBeenCalledTimes(2)
  })

  it('does not trigger undo when typing into a form field', () => {
    const undo = jest.fn()
    render(
      <div>
        <input data-testid="num" type="number" defaultValue={0} />
        <DeviceFlowCanvasShell
          profileKey="x"
          canvas={<div>C</div>}
          shortcuts={{ undo: { combo: 'mod+z', handler: undo }, redo: null }}
        />
      </div>,
    )
    const input = screen.getByTestId('num')
    fireEvent.keyDown(input, { key: 'z', ctrlKey: true })
    expect(undo).not.toHaveBeenCalled()
  })

  it('ignores keystrokes without modifier', () => {
    const undo = jest.fn()
    render(
      <DeviceFlowCanvasShell
        profileKey="x"
        canvas={<div>C</div>}
        shortcuts={{ undo: { combo: 'mod+z', handler: undo }, redo: null }}
      />,
    )
    fireEvent.keyDown(window, { key: 'z' })
    expect(undo).not.toHaveBeenCalled()
  })
})
