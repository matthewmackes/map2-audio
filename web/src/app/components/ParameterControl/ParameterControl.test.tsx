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

  it('suppresses blur commit notifications when the draft resolves back to the committed value', () => {
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
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.blur(input)

    expect(onLiveChange).toHaveBeenNthCalledWith(1, 3)
    expect(onLiveChange).toHaveBeenNthCalledWith(2, 2)
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('auto-selects the knob presentation for log descriptors', () => {
    const { container } = render(
      <ParameterControl
        descriptor={createParameterDescriptor({
          min: 20,
          max: 20_000,
          step: 1,
          defaultValue: 1000,
          unit: 'Hz',
          profile: 'frequency',
          scale: 'log',
        })}
        value={1000}
        onLiveChange={() => {}}
      />,
    )

    expect(container.querySelector('.parameter-control__knob')).toBeTruthy()
  })

  it('snaps stepped knob controls to even values and honors explicit large steps', () => {
    const onLiveChange = jest.fn()

    render(
      <ParameterControl
        variant="knob"
        label="Stages"
        descriptor={createParameterDescriptor({
          min: 2,
          max: 16,
          step: 2,
          largeStep: 4,
          defaultValue: 4,
          profile: 'integer',
        })}
        value={4}
        onLiveChange={onLiveChange}
      />,
    )

    const input = screen.getByRole('slider', { name: 'Stages' })
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'PageUp' })

    expect(onLiveChange).toHaveBeenNthCalledWith(1, 6)
    expect(onLiveChange).toHaveBeenNthCalledWith(2, 10)
  })
})
