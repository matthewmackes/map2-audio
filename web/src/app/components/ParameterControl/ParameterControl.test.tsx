import { fireEvent, render, screen } from '@testing-library/react'

import { createParameterDescriptor } from '../../data/parameterSchema'
import { ParameterControl } from './ParameterControl'

describe('ParameterControl', () => {
  it('keeps live and commit callbacks separate for blur-driven numeric controls', () => {
    const onLiveChange = jest.fn()
    const onCommit = jest.fn()

    render(
      <ParameterControl
        variant="numeric"
        label="Deadzone Low"
        descriptor={createParameterDescriptor({
          min: 0,
          max: 127,
          step: 1,
          defaultValue: 2,
          profile: 'integer',
          classification: 'CALIBRATION',
          commitStrategy: 'blur',
        })}
        value={2}
        onLiveChange={onLiveChange}
        onCommit={onCommit}
        commitStrategy="blur"
      />,
    )

    const input = screen.getByRole('slider', { name: 'Deadzone Low' })
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'ArrowUp' })

    expect(onLiveChange).toHaveBeenCalledTimes(1)
    expect(onLiveChange).toHaveBeenLastCalledWith(3)
    expect(onCommit).not.toHaveBeenCalled()

    fireEvent.blur(input)

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenLastCalledWith(3)
  })
})
