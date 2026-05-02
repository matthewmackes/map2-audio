/**
 * T2486-4 — MidiClusterEnableModal unit tests.
 */

import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { MidiClusterEnableModal } from './MidiClusterEnableModal'

describe('MidiClusterEnableModal', () => {
  it('renders with is-visible=false when open=false', () => {
    const { container } = render(
      <MidiClusterEnableModal
        open={false}
        onClose={() => undefined}
        onConfirm={() => undefined}
      />,
    )
    // Carbon's Modal mounts but applies visibility classes. Confirm
    // the testid root is present but lacking the visible class.
    const modal = container.querySelector('[data-testid="midi-cluster-enable-modal"]')
    expect(modal).not.toBeNull()
    expect(modal?.className).not.toContain('is-visible')
  })

  it('renders the heading and auto-connect checkbox when open', () => {
    render(
      <MidiClusterEnableModal
        open={true}
        onClose={() => undefined}
        onConfirm={() => undefined}
      />,
    )
    expect(screen.getByText('Enable cluster MIDI?')).toBeInTheDocument()
    expect(
      screen.getByLabelText(/Also enable auto-connect/i),
    ).toBeInTheDocument()
  })

  it('defaults the auto-connect checkbox to checked', () => {
    render(
      <MidiClusterEnableModal
        open={true}
        onClose={() => undefined}
        onConfirm={() => undefined}
      />,
    )
    const checkbox = screen.getByLabelText(/Also enable auto-connect/i) as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })

  it('confirms with enableAutoConnect=true by default', () => {
    const onConfirm = jest.fn()
    render(
      <MidiClusterEnableModal
        open={true}
        onClose={() => undefined}
        onConfirm={onConfirm}
      />,
    )
    fireEvent.click(screen.getByText('Enable'))
    expect(onConfirm).toHaveBeenCalledWith({
      enableCluster: true,
      enableAutoConnect: true,
    })
  })

  it('confirms with enableAutoConnect=false when operator unchecks the box', () => {
    const onConfirm = jest.fn()
    render(
      <MidiClusterEnableModal
        open={true}
        onClose={() => undefined}
        onConfirm={onConfirm}
      />,
    )
    fireEvent.click(screen.getByLabelText(/Also enable auto-connect/i))
    fireEvent.click(screen.getByText('Enable'))
    expect(onConfirm).toHaveBeenCalledWith({
      enableCluster: true,
      enableAutoConnect: false,
    })
  })

  it('fires onClose when the secondary button is clicked', () => {
    const onClose = jest.fn()
    render(
      <MidiClusterEnableModal
        open={true}
        onClose={onClose}
        onConfirm={() => undefined}
      />,
    )
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
