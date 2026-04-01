import '@testing-library/jest-dom'
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import type { SnapshotRevisionSummary } from '../../../map2/types'
import { SnapshotVersionHistoryModal } from './SnapshotVersionHistoryModal'

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  writable: true,
  value: ResizeObserverMock,
})

Object.defineProperty(window, 'ResizeObserver', {
  configurable: true,
  writable: true,
  value: ResizeObserverMock,
})

const revisions: SnapshotRevisionSummary[] = [
  {
    id: 11,
    snapshot_id: 42,
    revision_number: 2,
    snapshot_revision: 'abcdef1234567890',
    summary: '3 blocks, 2 channels, parallel blend routing',
    saved_at: '2026-04-01T15:45:00Z',
  },
  {
    id: 10,
    snapshot_id: 42,
    revision_number: 1,
    snapshot_revision: 'fedcba0987654321',
    summary: '2 blocks, 2 channels, series routing',
    saved_at: '2026-04-01T15:30:00Z',
  },
]

describe('SnapshotVersionHistoryModal', () => {
  it('renders revision entries and notifies restore selection', () => {
    const onRestore = jest.fn()

    render(
      <SnapshotVersionHistoryModal
        open
        snapshotName="FridayNight"
        revisions={revisions}
        onClose={jest.fn()}
        onRestore={onRestore}
      />,
    )

    expect(screen.getByText('Version History · FridayNight')).toBeInTheDocument()
    expect(screen.getByText('Rev 2')).toBeInTheDocument()
    expect(screen.getByText(/3 blocks, 2 channels, parallel blend routing/i)).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Restore' })[0] as HTMLButtonElement)

    expect(onRestore).toHaveBeenCalledWith(revisions[0])
  })

  it('shows the empty state when no revisions exist', () => {
    render(
      <SnapshotVersionHistoryModal
        open
        snapshotName="FridayNight"
        revisions={[]}
        onClose={jest.fn()}
        onRestore={jest.fn()}
      />,
    )

    expect(screen.getByText(/No saved revisions yet/i)).toBeInTheDocument()
  })

  it('disables all restore buttons while a restore is pending', () => {
    render(
      <SnapshotVersionHistoryModal
        open
        snapshotName="FridayNight"
        revisions={revisions}
        restoringRevisionNumber={2}
        onClose={jest.fn()}
        onRestore={jest.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Restoring...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Restore' })).toBeDisabled()
  })
})
