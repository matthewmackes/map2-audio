import '@testing-library/jest-dom'
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { SnapshotEditorToolbar } from './SnapshotEditorToolbar'

function renderToolbar(overrides: Partial<React.ComponentProps<typeof SnapshotEditorToolbar>> = {}) {
  const props: React.ComponentProps<typeof SnapshotEditorToolbar> = {
    title: '12 saved snapshots',
    dirty: false,
    prefersReducedMotion: true,
    goLiveState: {
      phase: 'idle',
      label: 'Go Live',
      disabled: false,
      errorMessage: null,
    },
    activeSnapshot: true,
    onGoLive: jest.fn(),
    onCreate: jest.fn(),
    createPending: false,
    onSave: jest.fn(),
    savePending: false,
    saveDisabled: false,
    onPrevious: jest.fn(),
    previousDisabled: false,
    previousTitle: 'Previous snapshot',
    onNext: jest.fn(),
    nextDisabled: false,
    nextTitle: 'Next snapshot',
    onDuplicate: jest.fn(),
    duplicatePending: false,
    duplicateDisabled: false,
    onToggleLock: jest.fn(),
    lockVisible: true,
    locked: false,
    lockPending: false,
    onUndo: jest.fn(),
    undoDisabled: false,
    undoPending: false,
    onRedo: jest.fn(),
    redoDisabled: false,
    redoPending: false,
    onTapTempo: jest.fn(),
    tapTempoDisabled: false,
    tapTempoPending: false,
    onToggleFavorite: jest.fn(),
    favoriteVisible: true,
    favoriteActive: false,
    favoritePending: false,
    onToggleSetlist: jest.fn(),
    setlistMode: false,
    setlistPending: false,
    setlistTitle: 'Use starred snapshots in gig order',
    onOpenWorkspace: jest.fn(),
    ...overrides,
  }

  render(<SnapshotEditorToolbar {...props} />)
  return props
}

describe('SnapshotEditorToolbar', () => {
  it('renders the required snapshot workflow controls including save, undo/redo, and tap tempo', () => {
    renderToolbar({ dirty: true })

    expect(screen.getByRole('button', { name: 'Go Live' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Redo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tap Tempo' })).toBeInTheDocument()
    expect(document.querySelector('.snapshot-toolbar__dirty-dot')).toBeInTheDocument()
  })

  it('routes the save, undo, redo, and tap tempo actions through the provided callbacks', () => {
    const props = renderToolbar()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tap Tempo' }))

    expect(props.onSave).toHaveBeenCalledTimes(1)
    expect(props.onUndo).toHaveBeenCalledTimes(1)
    expect(props.onRedo).toHaveBeenCalledTimes(1)
    expect(props.onTapTempo).toHaveBeenCalledTimes(1)
  })

  it('shows the live indicator in place of the go-live button when the snapshot is already live', () => {
    renderToolbar({
      goLiveState: {
        phase: 'live',
        label: 'LIVE',
        disabled: true,
        errorMessage: null,
      },
    })

    expect(screen.getByText('LIVE')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Go Live' })).not.toBeInTheDocument()
  })
})
