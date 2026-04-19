import '@testing-library/jest-dom'
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { SnapshotEditorOptionsRail } from './SnapshotEditorOptionsRail'

function renderRail(overrides: Partial<React.ComponentProps<typeof SnapshotEditorOptionsRail>> = {}) {
  const props: React.ComponentProps<typeof SnapshotEditorOptionsRail> = {
    prefersReducedMotion: true,
    onOpenControlCenter: jest.fn(),
    controlCenterDisabled: false,
    onAddFlow: jest.fn(),
    addFlowDisabled: false,
    onOpenMidi: jest.fn(),
    midiDisabled: false,
    midiTitle: '12 MIDI mappings',
    midiLearning: false,
    onOpenLiveRuntime: jest.fn(),
    liveRuntimeLabel: 'View live state',
    liveRuntimeActive: true,
    onOpenPerform: jest.fn(),
    onClearFlows: jest.fn(),
    clearFlowsDisabled: false,
    ...overrides,
  }

  render(<SnapshotEditorOptionsRail {...props} />)
  return props
}

describe('SnapshotEditorOptionsRail', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders the vertical icon-only options controls', () => {
    renderRail()

    expect(screen.getByRole('button', { name: 'Collapse options toolbar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Snapshot configuration' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add signal path' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit MIDI mappings' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View live state' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open performance view' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear signal paths' })).toBeInTheDocument()
  })

  it('routes the direct buttons through the provided callbacks', () => {
    const props = renderRail()

    fireEvent.click(screen.getByRole('button', { name: 'Snapshot configuration' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add signal path' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit MIDI mappings' }))
    fireEvent.click(screen.getByRole('button', { name: 'View live state' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open performance view' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear signal paths' }))

    expect(props.onOpenControlCenter).toHaveBeenCalledTimes(1)
    expect(props.onAddFlow).toHaveBeenCalledTimes(1)
    expect(props.onOpenMidi).toHaveBeenCalledTimes(1)
    expect(props.onOpenLiveRuntime).toHaveBeenCalledTimes(1)
    expect(props.onOpenPerform).toHaveBeenCalledTimes(1)
    expect(props.onClearFlows).toHaveBeenCalledTimes(1)
  })

  it('collapses the action tray behind the options toggle and restores it on second click', () => {
    renderRail()

    const toggle = screen.getByRole('button', { name: 'Collapse options toolbar' })
    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(window.localStorage.getItem('map2_snapshot_options_rail_collapsed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Expand options toolbar' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Expand options toolbar' }))

    expect(screen.getByRole('button', { name: 'Collapse options toolbar' })).toHaveAttribute('aria-expanded', 'true')
    expect(window.localStorage.getItem('map2_snapshot_options_rail_collapsed')).toBe('false')
    expect(screen.getByRole('toolbar', { name: 'Options toolbar' })).toBeInTheDocument()
  })
})
