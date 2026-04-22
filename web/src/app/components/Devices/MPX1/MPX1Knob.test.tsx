import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import { MPX1Knob } from './MPX1Knob'

describe('MPX1Knob', () => {
  it('uses the shared slider runtime for MPX1 parameter edits', () => {
    const onChange = jest.fn()

    render(
      <MPX1Knob
        label="Decay"
        value={25}
        min={0}
        max={100}
        step={5}
        onChange={onChange}
      />,
    )

    const input = screen.getByRole('slider', { name: 'Decay' })
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'ArrowUp' })

    expect(onChange).toHaveBeenCalledWith(30)
  })
})
