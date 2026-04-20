import '@testing-library/jest-dom'
import React from 'react'
import { render, screen } from '@testing-library/react'

import { JuceGridRoutingVisualizer } from './SnapshotEditorRoutingVisualizer'

const flows = [
  {
    id: 'a',
    label: 'A',
    color: '#0f62fe',
    muted: false,
    active: true,
    blendPercent: 60,
  },
  {
    id: 'b',
    label: 'B',
    color: '#fa4d56',
    muted: false,
    active: false,
    blendPercent: 40,
  },
]

describe('JuceGridRoutingVisualizer', () => {
  it('renders schematic route readouts with the routing diagram', () => {
    render(
      <JuceGridRoutingVisualizer
        mode="parallel_blend"
        flows={flows}
        activeFlowId="a"
      />,
    )

    expect(screen.getByLabelText('Routing: Parallel blend')).toBeInTheDocument()
    expect(screen.getByLabelText('Active: 1/2 flows')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Parallel blend routing diagram' })).toBeInTheDocument()
  })
})
