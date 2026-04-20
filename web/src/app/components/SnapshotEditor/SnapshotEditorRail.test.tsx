import '@testing-library/jest-dom'
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import { SnapshotEditorRail } from './SnapshotEditorRail'

function renderRail(overrides: Partial<React.ComponentProps<typeof SnapshotEditorRail>> = {}) {
  const props: React.ComponentProps<typeof SnapshotEditorRail> = {
    activeItemId: 'signal-grid',
    onOpenSignalGrid: jest.fn(),
    onOpenDirectory: jest.fn(),
    onOpenParameters: jest.fn(),
    onOpenAutomation: jest.fn(),
    onOpenVersionHistory: jest.fn(),
    onOpenHelp: jest.fn(),
    ...overrides,
  }

  render(<SnapshotEditorRail {...props} />)
  return props
}

describe('SnapshotEditorRail', () => {
  it('renders the schematic rail destinations with signal grid active', () => {
    renderRail()

    expect(screen.getByRole('navigation', { name: 'Snapshot navigation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Signal Grid' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Directory' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Parameters' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Automation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Version History' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Help' })).toBeInTheDocument()
  })

  it('routes rail actions through the provided callbacks', () => {
    const props = renderRail()

    fireEvent.click(screen.getByRole('button', { name: 'Signal Grid' }))
    fireEvent.click(screen.getByRole('button', { name: 'Directory' }))
    fireEvent.click(screen.getByRole('button', { name: 'Parameters' }))
    fireEvent.click(screen.getByRole('button', { name: 'Automation' }))
    fireEvent.click(screen.getByRole('button', { name: 'Version History' }))
    fireEvent.click(screen.getByRole('button', { name: 'Help' }))

    expect(props.onOpenSignalGrid).toHaveBeenCalledTimes(1)
    expect(props.onOpenDirectory).toHaveBeenCalledTimes(1)
    expect(props.onOpenParameters).toHaveBeenCalledTimes(1)
    expect(props.onOpenAutomation).toHaveBeenCalledTimes(1)
    expect(props.onOpenVersionHistory).toHaveBeenCalledTimes(1)
    expect(props.onOpenHelp).toHaveBeenCalledTimes(1)
  })

  it('disables destinations that need unavailable workspace state', () => {
    renderRail({
      activeItemId: 'automation',
      directoryDisabled: true,
      parametersDisabled: true,
      versionHistoryDisabled: true,
    })

    expect(screen.getByRole('button', { name: 'Automation' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Directory' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Parameters' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Version History' })).toBeDisabled()
  })
})
