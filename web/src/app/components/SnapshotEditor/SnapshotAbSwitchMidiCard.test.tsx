import '@testing-library/jest-dom'
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { SnapshotAbSwitchMidiCard } from './SnapshotAbSwitchMidiCard'

function renderCard(overrides: Partial<React.ComponentProps<typeof SnapshotAbSwitchMidiCard>> = {}) {
  const props: React.ComponentProps<typeof SnapshotAbSwitchMidiCard> = {
    hasActiveSnapshot: true,
    disabled: false,
    isPending: false,
    binding: {
      messageType: 'cc_toggle',
      midiChannel: 2,
      number: 81,
    },
    draftMessageType: 'cc_toggle',
    draftMidiChannel: '2',
    draftNumber: 81,
    onDraftMessageTypeChange: jest.fn(),
    onDraftMidiChannelChange: jest.fn(),
    onDraftNumberChange: jest.fn(),
    onSave: jest.fn(),
    onClear: jest.fn(),
    saveDisabled: false,
    ...overrides,
  }

  const renderResult = render(<SnapshotAbSwitchMidiCard {...props} />)
  return { ...renderResult, props }
}

describe('SnapshotAbSwitchMidiCard', () => {
  it('renders the A/B binding controls and summary', () => {
    const { container } = renderCard()

    expect(screen.getByText('A/B switch MIDI')).toBeInTheDocument()
    expect(container.querySelector('.snapshot-schematic-panel')).toHaveAttribute('data-tone', 'active')
    expect(screen.getByLabelText('Status: Configured')).toHaveTextContent('Configured')
    expect(screen.getByLabelText('A/B trigger: CC 81 / Ch 2')).toBeInTheDocument()
    expect(screen.getByLabelText('Message type')).toBeInTheDocument()
    expect(screen.getByLabelText('MIDI channel')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('routes save and clear actions through the provided callbacks', () => {
    const { props } = renderCard()

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(props.onClear).toHaveBeenCalledTimes(1)
    expect(props.onSave).toHaveBeenCalledTimes(1)
  })

  it('shows an empty-state prompt when no active snapshot is loaded', () => {
    renderCard({
      hasActiveSnapshot: false,
      binding: null,
    })

    expect(screen.getByText('Load a snapshot to configure an A/B switch MIDI trigger.')).toBeInTheDocument()
  })
})
