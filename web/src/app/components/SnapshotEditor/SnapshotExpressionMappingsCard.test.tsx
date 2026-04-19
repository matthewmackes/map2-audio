import '@testing-library/jest-dom'
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import { SnapshotExpressionMappingsCard } from './SnapshotExpressionMappingsCard'

function renderCard(overrides: Partial<React.ComponentProps<typeof SnapshotExpressionMappingsCard>> = {}) {
  const props: React.ComponentProps<typeof SnapshotExpressionMappingsCard> = {
    hasActiveSnapshot: true,
    disabled: false,
    isPending: false,
    mappings: [{
      id: 'expr-1',
      label: 'EXP 1',
      cc: 11,
      channel: 0,
      cc_min: 0,
      cc_max: 127,
      active: true,
      targets: [{
        id: 'expr-1-target-1',
        param_id: 'engine.reverb_mix',
        param_label: 'Reverb Mix',
        out_min: 0,
        out_max: 1,
        curve: 'linear',
        custom_curve: [],
        active: true,
      }],
    }],
    availableParameters: [
      { id: 'engine.reverb_mix', label: 'Reverb Mix', min: 0, max: 1, unit: '%' },
      { id: 'engine.delay_mix', label: 'Delay Mix', min: 0, max: 1, unit: '%' },
    ],
    onSave: jest.fn(),
    onClear: jest.fn(),
    ...overrides,
  }

  return {
    props,
    ...render(<SnapshotExpressionMappingsCard {...props} />),
  }
}

describe('SnapshotExpressionMappingsCard', () => {
  it('renders grouped snapshot expression mappings and forwards save/clear actions', () => {
    const { props } = renderCard()

    expect(screen.getByText('Snapshot expression mappings')).toBeInTheDocument()
    expect(screen.getByText('EXP 1')).toBeInTheDocument()
    expect(screen.getByText('1 pedals')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Pedal label'), { target: { value: 'EXP Heel-Toe' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    expect(props.onSave).toHaveBeenCalledTimes(1)
    expect(props.onClear).toHaveBeenCalledTimes(1)
  })

  it('lets the user add an additional expression pedal draft', () => {
    renderCard({ mappings: [] })

    fireEvent.click(screen.getByRole('button', { name: 'Add expression pedal' }))

    expect(screen.getByText('Expression 1')).toBeInTheDocument()
    expect(screen.getByText('1 linked parameter')).toBeInTheDocument()
  })

  it('shows the empty-state copy when no snapshot is active', () => {
    renderCard({
      hasActiveSnapshot: false,
      disabled: true,
      mappings: [],
    })

    expect(screen.getByText('Load a snapshot to configure per-snapshot expression pedal mappings.')).toBeInTheDocument()
  })
})
