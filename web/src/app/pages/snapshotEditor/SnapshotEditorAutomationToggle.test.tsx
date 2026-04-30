/* SnapshotEditorAutomationToggle unit tests (T2473 part 14). */

import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'

import { SnapshotEditorAutomationToggle } from './SnapshotEditorAutomationToggle'

describe('SnapshotEditorAutomationToggle', () => {
  it('renders the Automation button collapsed by default', () => {
    render(
      <SnapshotEditorAutomationToggle
        expanded={false}
        onToggle={jest.fn()}
        disabled={false}
        style={{}}
        title="Idle • 0 lanes"
      />,
    )
    const btn = screen.getByRole('button', { name: 'Show automation toolbar' })
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    expect(btn).toHaveAttribute('aria-controls', 'juce-grid-automation-panel')
  })

  it('reflects expanded state with aria-expanded + label flip', () => {
    render(
      <SnapshotEditorAutomationToggle
        expanded
        onToggle={jest.fn()}
        disabled={false}
        style={{}}
        title="Recording • 2 lanes"
      />,
    )
    const btn = screen.getByRole('button', { name: 'Hide automation toolbar' })
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    expect(btn).toHaveAttribute('title', 'Recording • 2 lanes')
  })

  it('routes click through onToggle', () => {
    const onToggle = jest.fn()
    render(
      <SnapshotEditorAutomationToggle
        expanded={false}
        onToggle={onToggle}
        disabled={false}
        style={{}}
        title="Idle"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /automation/i }))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('honors the disabled prop', () => {
    render(
      <SnapshotEditorAutomationToggle
        expanded={false}
        onToggle={jest.fn()}
        disabled
        style={{}}
        title="Snapshot required"
      />,
    )
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
