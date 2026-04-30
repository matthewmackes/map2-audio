/* SnapshotEditorMidiMappingsModal unit tests (T2473 part 18). */

import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'

import { SnapshotEditorMidiMappingsModal } from './SnapshotEditorMidiMappingsModal'

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
  // @ts-expect-error jsdom polyfill
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

describe('SnapshotEditorMidiMappingsModal', () => {
  it('returns null when closed', () => {
    const { container } = render(
      <SnapshotEditorMidiMappingsModal open={false} onClose={jest.fn()}>
        <div data-testid="midi-content" />
      </SnapshotEditorMidiMappingsModal>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the children inside the modal panel when open', () => {
    render(
      <SnapshotEditorMidiMappingsModal open onClose={jest.fn()}>
        <div data-testid="midi-content">workspace body</div>
      </SnapshotEditorMidiMappingsModal>,
    )
    expect(screen.getByText('Audio Grid MIDI mappings')).toBeInTheDocument()
    expect(screen.getByTestId('midi-content')).toBeInTheDocument()
  })

  it('routes the primary Close button click through onClose', () => {
    const onClose = jest.fn()
    render(
      <SnapshotEditorMidiMappingsModal open onClose={onClose}>
        <span />
      </SnapshotEditorMidiMappingsModal>,
    )
    // Carbon Modal renders both an icon-only header close button
    // and the primary footer button labeled "Close" — query the
    // explicitly visible primary action via its visible text.
    const closeButtons = screen.getAllByRole('button', { name: 'Close' })
    fireEvent.click(closeButtons[closeButtons.length - 1])
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
