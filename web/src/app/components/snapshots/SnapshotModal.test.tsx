import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

const mockSnapshotModalContent = jest.fn(({ onRecall }: { onRecall?: () => void }) => (
  <div>
    <button type="button" onClick={() => onRecall?.()}>
      Recall snapshot
    </button>
  </div>
))

jest.mock('./SnapshotModalContent', () => ({
  SnapshotModalContent: (props: unknown) => mockSnapshotModalContent(props as { onRecall?: () => void }),
}))

const { SnapshotModal } = require('./SnapshotModal') as typeof import('./SnapshotModal')

describe('SnapshotModal', () => {
  const baseProps = {
    open: true,
    onClose: jest.fn(),
    snapshotDraft: { flowSlots: [], routing: {}, activeFlowIndex: 0, chains: {} },
    applySnapshotData: jest.fn(),
    onSnapshotSave: jest.fn(),
  }

  beforeEach(() => {
    localStorage.clear()
    jest.clearAllMocks()
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    ;(globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock
  })

  afterEach(() => {
    delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver
  })

  it('renders closed when open is false', () => {
    render(<SnapshotModal {...baseProps} open={false} />)

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders open with the Snapshots title', async () => {
    render(<SnapshotModal {...baseProps} />)

    expect(await screen.findByText('Snapshots')).toBeTruthy()
  })

  it('calls onClose when the close button is clicked', async () => {
    render(<SnapshotModal {...baseProps} />)

    fireEvent.click(await screen.findByRole('button', { name: /close/i }))

    expect(baseProps.onClose).toHaveBeenCalled()
  })

  it('calls onClose after recall', async () => {
    render(<SnapshotModal {...baseProps} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Recall snapshot' }))

    expect(baseProps.onClose).toHaveBeenCalled()
  })
})
