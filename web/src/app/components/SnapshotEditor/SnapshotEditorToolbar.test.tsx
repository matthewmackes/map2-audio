import '@testing-library/jest-dom'
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { SnapshotEditorToolbar } from './SnapshotEditorToolbar'

function renderToolbar(overrides: Partial<React.ComponentProps<typeof SnapshotEditorToolbar>> = {}) {
  const props: React.ComponentProps<typeof SnapshotEditorToolbar> = {
    title: '12 saved snapshots',
    dirty: false,
    prefersReducedMotion: true,
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
    onToggleFavorite: jest.fn(),
    favoriteVisible: true,
    favoriteActive: false,
    favoritePending: false,
    onOpenWorkspace: jest.fn(),
    ...overrides,
  }

  render(<SnapshotEditorToolbar {...props} />)
  return props
}

describe('SnapshotEditorToolbar', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders the vertical icon-only snapshot controls without the setlist button', () => {
    renderToolbar({ dirty: true })

    expect(screen.getByRole('button', { name: 'Collapse snapshots toolbar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New snapshot' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Load snapshot' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Duplicate snapshot' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Update snapshot' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Redo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Forward' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark snapshot as favorite' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /setlist/i })).not.toBeInTheDocument()
    expect(document.querySelector('.snapshot-toolbar__button--update.is-dirty')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Go Live' })).not.toBeInTheDocument()
  })

  it('routes update, load, undo, redo, and navigation actions through the provided callbacks', () => {
    const props = renderToolbar()

    fireEvent.click(screen.getByRole('button', { name: 'Load snapshot' }))
    fireEvent.click(screen.getByRole('button', { name: 'Update snapshot' }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getByRole('button', { name: 'Forward' }))

    expect(props.onOpenWorkspace).toHaveBeenCalledTimes(1)
    expect(props.onSave).toHaveBeenCalledTimes(1)
    expect(props.onUndo).toHaveBeenCalledTimes(1)
    expect(props.onRedo).toHaveBeenCalledTimes(1)
    expect(props.onPrevious).toHaveBeenCalledTimes(1)
    expect(props.onNext).toHaveBeenCalledTimes(1)
  })

  it('collapses the action tray behind the snapshots toggle and restores it on second click', () => {
    renderToolbar()

    const toggle = screen.getByRole('button', { name: 'Collapse snapshots toolbar' })
    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(window.localStorage.getItem('map2_snapshot_toolbar_collapsed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Expand snapshots toolbar' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Expand snapshots toolbar' }))

    expect(screen.getByRole('button', { name: 'Collapse snapshots toolbar' })).toHaveAttribute('aria-expanded', 'true')
    expect(window.localStorage.getItem('map2_snapshot_toolbar_collapsed')).toBe('false')
    expect(screen.getByRole('toolbar', { name: 'Snapshots toolbar' })).toBeInTheDocument()
  })
})
