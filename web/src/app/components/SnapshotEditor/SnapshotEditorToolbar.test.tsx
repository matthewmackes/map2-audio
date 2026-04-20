import '@testing-library/jest-dom'
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import { SnapshotEditorToolbar } from './SnapshotEditorToolbar'

function renderToolbar(overrides: Partial<React.ComponentProps<typeof SnapshotEditorToolbar>> = {}) {
  const props: React.ComponentProps<typeof SnapshotEditorToolbar> = {
    title: 'Rig 01',
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
    onOpenVersionHistory: jest.fn(),
    versionHistoryDisabled: false,
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
    activeLabel: 'A Main Chain',
    liveLabel: 'LIVE',
    liveStreaming: true,
    blendLabel: '84% BLEND',
    routingLabel: 'PARALLEL · 2',
    masterMuted: false,
    masterSoloed: true,
    onToggleMasterMute: jest.fn(),
    onToggleMasterSolo: jest.fn(),
    monitorInputActive: true,
    monitorOutputActive: true,
    monitorClipActive: false,
    onSelectMonitor: jest.fn(),
    onOpenRouting: jest.fn(),
    onOpenDevices: jest.fn(),
    ...overrides,
  }

  render(<SnapshotEditorToolbar {...props} />)
  return props
}

describe('SnapshotEditorToolbar', () => {
  it('renders the schematic toolbar groups and breadcrumbs', () => {
    renderToolbar({ dirty: true })

    expect(screen.getByRole('toolbar', { name: 'Snapshot editor toolbar' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Snapshot breadcrumbs' })).toHaveTextContent('Snapshots/Rig 01/Snapshot Editor')
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Redo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('is-dirty')
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByText('A Main Chain')).toBeInTheDocument()
    expect(screen.getByText('LIVE')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '84% BLEND' })).toBeInTheDocument()
    expect(screen.getByText('PARALLEL · 2')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Master mute and solo' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Monitor source' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Routing' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Devices' })).toBeInTheDocument()
  })

  it('routes command, master, monitor, routing, and device actions through the provided callbacks', () => {
    const props = renderToolbar()

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    fireEvent.click(screen.getByRole('button', { name: 'M' }))
    fireEvent.click(screen.getByRole('button', { name: 'S' }))
    fireEvent.click(screen.getByRole('button', { name: 'IN' }))
    fireEvent.click(screen.getByRole('button', { name: 'OUT' }))
    fireEvent.click(screen.getByRole('button', { name: 'CLIP' }))
    fireEvent.click(screen.getByRole('button', { name: '84% BLEND' }))
    fireEvent.click(screen.getByRole('button', { name: 'Routing' }))
    fireEvent.click(screen.getByRole('button', { name: 'Devices' }))

    expect(props.onUndo).toHaveBeenCalledTimes(1)
    expect(props.onRedo).toHaveBeenCalledTimes(1)
    expect(props.onSave).toHaveBeenCalledTimes(1)
    expect(props.onOpenWorkspace).toHaveBeenCalledTimes(1)
    expect(props.onToggleMasterMute).toHaveBeenCalledTimes(1)
    expect(props.onToggleMasterSolo).toHaveBeenCalledTimes(1)
    expect(props.onSelectMonitor).toHaveBeenNthCalledWith(1, 'input')
    expect(props.onSelectMonitor).toHaveBeenNthCalledWith(2, 'output')
    expect(props.onSelectMonitor).toHaveBeenNthCalledWith(3, 'clip')
    expect(props.onOpenRouting).toHaveBeenCalledTimes(2)
    expect(props.onOpenDevices).toHaveBeenCalledTimes(1)
  })

  it('does not animate the live chip when reduced motion is requested', () => {
    const { rerender } = render(
      <SnapshotEditorToolbar
        {...renderToolbarDefaults()}
        liveStreaming
        prefersReducedMotion={false}
      />,
    )

    expect(screen.getByText('LIVE')).toHaveClass('is-streaming')

    rerender(
      <SnapshotEditorToolbar
        {...renderToolbarDefaults()}
        liveStreaming
        prefersReducedMotion
      />,
    )

    expect(screen.getByText('LIVE')).not.toHaveClass('is-streaming')
  })
})

function renderToolbarDefaults(): React.ComponentProps<typeof SnapshotEditorToolbar> {
  return {
    title: 'Rig 01',
    dirty: false,
    prefersReducedMotion: true,
    onCreate: jest.fn(),
    createPending: false,
    onSave: jest.fn(),
    savePending: false,
    saveDisabled: false,
    onPrevious: jest.fn(),
    previousDisabled: false,
    onNext: jest.fn(),
    nextDisabled: false,
    onDuplicate: jest.fn(),
    duplicatePending: false,
    duplicateDisabled: false,
    onOpenVersionHistory: jest.fn(),
    versionHistoryDisabled: false,
    lockVisible: false,
    locked: false,
    lockPending: false,
    onUndo: jest.fn(),
    undoDisabled: false,
    undoPending: false,
    onRedo: jest.fn(),
    redoDisabled: false,
    redoPending: false,
    favoriteVisible: false,
    favoriteActive: false,
    favoritePending: false,
    onOpenWorkspace: jest.fn(),
  }
}
