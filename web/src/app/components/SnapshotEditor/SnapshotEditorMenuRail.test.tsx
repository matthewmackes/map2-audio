import '@testing-library/jest-dom'
import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { SnapshotEditorMenuRail } from './SnapshotEditorMenuRail'

function renderRail(overrides: Partial<React.ComponentProps<typeof SnapshotEditorMenuRail>> = {}) {
  const props: React.ComponentProps<typeof SnapshotEditorMenuRail> = {
    prefersReducedMotion: true,
    onOpenControlCenter: jest.fn(),
    controlCenterDisabled: false,
    onAddFlow: jest.fn(),
    addFlowDisabled: false,
    onOpenMidi: jest.fn(),
    midiDisabled: false,
    midiTitle: '4 MIDI mappings',
    onOpenLiveRuntime: jest.fn(),
    liveRuntimeLabel: 'View live state',
    onOpenPerform: jest.fn(),
    onUndo: jest.fn(),
    undoDisabled: false,
    undoPending: false,
    onRedo: jest.fn(),
    redoDisabled: false,
    redoPending: false,
    onPrevious: jest.fn(),
    previousDisabled: false,
    onNext: jest.fn(),
    nextDisabled: false,
    ...overrides,
  }

  render(<SnapshotEditorMenuRail {...props} />)
  return props
}

describe('SnapshotEditorMenuRail', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders five statement-style primary actions in the quick menu', () => {
    renderRail()

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Quick actions' }))
    })

    expect(screen.getByRole('menu', { name: 'Snapshot editor quick actions' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Snapshot configuration' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Add signal path' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Edit MIDI mappings' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Inspect live state' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Open performance view' })).toBeInTheDocument()
    expect(screen.queryByText(/\?/)).not.toBeInTheDocument()
  })

  it('routes the quick actions through the provided callbacks', async () => {
    const props = renderRail()

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Quick actions' }))
    })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Snapshot configuration' }))
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Quick actions' }))
    })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Add signal path' }))
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Quick actions' }))
    })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit MIDI mappings' }))
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Quick actions' }))
    })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Inspect live state' }))
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Quick actions' }))
    })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Open performance view' }))

    expect(props.onOpenControlCenter).toHaveBeenCalledTimes(1)
    expect(props.onAddFlow).toHaveBeenCalledTimes(1)
    expect(props.onOpenMidi).toHaveBeenCalledTimes(1)
    expect(props.onOpenLiveRuntime).toHaveBeenCalledTimes(1)
    expect(props.onOpenPerform).toHaveBeenCalledTimes(1)
  })
})
