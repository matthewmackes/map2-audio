import '@testing-library/jest-dom'
import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { SnapshotEditorMenuRail } from './SnapshotEditorMenuRail'

function renderRail(overrides: Partial<React.ComponentProps<typeof SnapshotEditorMenuRail>> = {}) {
  const props: React.ComponentProps<typeof SnapshotEditorMenuRail> = {
    prefersReducedMotion: true,
    title: 'Working Snapshot',
    dirty: false,
    onCreate: jest.fn(),
    createPending: false,
    onSave: jest.fn(),
    savePending: false,
    saveDisabled: false,
    onOpenWorkspace: jest.fn(),
    onDuplicate: jest.fn(),
    duplicatePending: false,
    duplicateDisabled: false,
    onOpenVersionHistory: jest.fn(),
    versionHistoryDisabled: false,
    onOpenControlCenter: jest.fn(),
    controlCenterDisabled: false,
    onAddFlow: jest.fn(),
    addFlowDisabled: false,
    onOpenMidi: jest.fn(),
    midiDisabled: false,
    midiTitle: '4 MIDI mappings',
    midiLearning: false,
    onToggleAbSwitch: jest.fn(),
    abSwitchVisible: true,
    abSwitchDisabled: false,
    abSwitchPending: false,
    abSwitchActiveLabel: 'A',
    abSwitchNextLabel: 'B',
    onOpenLiveRuntime: jest.fn(),
    liveRuntimeLabel: 'View live state',
    liveRuntimeActive: false,
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
    lockVisible: false,
    locked: false,
    lockPending: false,
    favoriteVisible: false,
    favoriteActive: false,
    favoritePending: false,
    onClearFlows: jest.fn(),
    clearFlowsDisabled: false,
    ...overrides,
  }

  render(<SnapshotEditorMenuRail {...props} />)
  return props
}

describe('SnapshotEditorMenuRail', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('shows an A/B switch action in the floating quick menu when enabled', () => {
    const props = renderRail()

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Show menu' }))
    })
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Switch A/B from A to B?' }))
    })

    expect(props.onToggleAbSwitch).toHaveBeenCalledTimes(1)
  })

  it('omits the A/B switch action when the page is not in A/B mode', () => {
    renderRail({ abSwitchVisible: false })

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Show menu' }))
    })

    expect(screen.queryByRole('button', { name: 'Switch A/B from A to B?' })).not.toBeInTheDocument()
  })
})
