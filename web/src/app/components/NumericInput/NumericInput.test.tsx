import { act, fireEvent, render, screen } from '@testing-library/react'

import { createParameterDescriptor } from '../../data/parameterSchema'
import { NumericInput } from './NumericInput'

describe('NumericInput', () => {
  beforeAll(() => {
    if (!HTMLElement.prototype.setPointerCapture) {
      Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
        configurable: true,
        value: jest.fn(),
      })
    }
    if (!HTMLElement.prototype.releasePointerCapture) {
      Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
        configurable: true,
        value: jest.fn(),
      })
    }
    if (!HTMLElement.prototype.hasPointerCapture) {
      Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
        configurable: true,
        value: () => false,
      })
    }
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  function makeTouch(identifier: number, clientY: number): Touch {
    return {
      identifier,
      clientX: 0,
      clientY,
      force: 1,
      pageX: 0,
      pageY: clientY,
      radiusX: 1,
      radiusY: 1,
      rotationAngle: 0,
      screenX: 0,
      screenY: clientY,
      target: document.body,
    } as Touch
  }

  it('renders an accessible Carbon-styled slider with label and unit', () => {
    render(
      <NumericInput
        label="Mix"
        descriptor={createParameterDescriptor({ min: 0, max: 100, step: 5, defaultValue: 50, unit: '%' })}
        value={50}
        onChange={() => {}}
      />,
    )

    const input = screen.getByRole('slider', { name: 'Mix' })

    expect(input.getAttribute('aria-valuenow')).toBe('50')
    expect(screen.getByText('%')).toBeTruthy()
    expect(screen.getByText('default 50')).toBeTruthy()
  })

  it('clamps typed values and commits them on Enter', () => {
    const onChange = jest.fn()
    const onChangeEnd = jest.fn()

    render(
      <NumericInput
        label="Mix"
        descriptor={createParameterDescriptor({ min: 0, max: 100, step: 5, defaultValue: 50, unit: '%' })}
        value={50}
        onChange={onChange}
        onChangeEnd={onChangeEnd}
      />,
    )

    const input = screen.getByRole('slider', { name: 'Mix' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '999' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onChange).toHaveBeenLastCalledWith(100)
    expect(onChangeEnd).toHaveBeenLastCalledWith(100)
  })

  it('supports keyboard stepping plus Home/End bounds', () => {
    const onChange = jest.fn()
    const onChangeEnd = jest.fn()

    render(
      <NumericInput
        label="Gain"
        descriptor={createParameterDescriptor({ min: 0, max: 100, step: 5, defaultValue: 50, unit: '%' })}
        value={50}
        onChange={onChange}
        onChangeEnd={onChangeEnd}
      />,
    )

    const input = screen.getByRole('slider', { name: 'Gain' })
    fireEvent.focus(input)

    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'Home' })
    fireEvent.keyDown(input, { key: 'End' })

    expect(onChange).toHaveBeenNthCalledWith(1, 55)
    expect(onChange).toHaveBeenNthCalledWith(2, 0)
    expect(onChange).toHaveBeenNthCalledWith(3, 100)
    expect(onChangeEnd).toHaveBeenLastCalledWith(100)
  })

  it('accelerates repeated wheel changes', () => {
    const onChange = jest.fn()
    const onChangeEnd = jest.fn()
    const nowSpy = jest.spyOn(Date, 'now')

    nowSpy
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1016)

    const { container } = render(
      <NumericInput
        label="Drive"
        descriptor={createParameterDescriptor({ min: 0, max: 100, step: 5, defaultValue: 50, unit: '%' })}
        value={50}
        onChange={onChange}
        onChangeEnd={onChangeEnd}
      />,
    )

    const control = container.querySelector('.numeric-input__control')
    expect(control).not.toBeNull()

    fireEvent.wheel(control!, { deltaY: -100 })
    fireEvent.wheel(control!, { deltaY: -240 })

    expect(onChange).toHaveBeenNthCalledWith(1, 55)
    expect(onChange).toHaveBeenNthCalledWith(2, 95)
    expect(onChangeEnd).toHaveBeenLastCalledWith(95)
  })

  it('supports touch drag with two-finger fine mode', () => {
    const onChange = jest.fn()
    const onChangeEnd = jest.fn()
    const { container } = render(
      <NumericInput
        label="Resonance"
        descriptor={createParameterDescriptor({
          min: 0,
          max: 1,
          step: 0.01,
          defaultValue: 0.5,
          profile: 'normalized_0_1',
        })}
        value={0.5}
        onChange={onChange}
        onChangeEnd={onChangeEnd}
      />,
    )

    const control = container.querySelector('.numeric-input__control')
    expect(control).not.toBeNull()

    fireEvent.touchStart(control!, {
      touches: [makeTouch(1, 100)],
      changedTouches: [makeTouch(1, 100)],
    })
    fireEvent.touchMove(control!, {
      touches: [makeTouch(1, 80)],
      changedTouches: [makeTouch(1, 80)],
    })

    fireEvent.touchStart(control!, {
      touches: [makeTouch(1, 80), makeTouch(2, 100)],
      changedTouches: [makeTouch(2, 100)],
    })
    fireEvent.touchMove(control!, {
      touches: [makeTouch(1, 60), makeTouch(2, 100)],
      changedTouches: [makeTouch(1, 60)],
    })
    fireEvent.touchEnd(control!, {
      touches: [],
      changedTouches: [makeTouch(1, 60)],
    })

    expect(onChange).toHaveBeenNthCalledWith(1, 0.51)
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange.mock.calls[1][0]).toBeGreaterThanOrEqual(0.5)
    expect(onChange.mock.calls[1][0]).toBeLessThan(0.51)
    expect(onChangeEnd).toHaveBeenCalledTimes(1)
    expect(onChangeEnd.mock.calls[0][0]).toBe(onChange.mock.calls[1][0])
  })

  it('defers commit notifications until blur when using blur commit strategy', () => {
    const onChange = jest.fn()
    const onChangeEnd = jest.fn()

    render(
      <NumericInput
        label="Calibration"
        descriptor={createParameterDescriptor({ min: 0, max: 127, step: 1, defaultValue: 2, profile: 'integer' })}
        value={2}
        onChange={onChange}
        onChangeEnd={onChangeEnd}
        commitStrategy="blur"
      />,
    )

    const input = screen.getByRole('slider', { name: 'Calibration' })
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'ArrowUp' })

    expect(onChange).toHaveBeenLastCalledWith(3)
    expect(onChangeEnd).not.toHaveBeenCalled()

    fireEvent.blur(input)

    expect(onChangeEnd).toHaveBeenCalledTimes(1)
    expect(onChangeEnd).toHaveBeenLastCalledWith(3)
  })

  it('commits wheel changes after idle timeout when using idle commit strategy', () => {
    jest.useFakeTimers()

    const onChange = jest.fn()
    const onChangeEnd = jest.fn()

    const { container } = render(
      <NumericInput
        label="Wheel"
        descriptor={createParameterDescriptor({ min: 0, max: 100, step: 5, defaultValue: 50, unit: '%' })}
        value={50}
        onChange={onChange}
        onChangeEnd={onChangeEnd}
        commitStrategy="idle"
      />,
    )

    const control = container.querySelector('.numeric-input__control')
    expect(control).not.toBeNull()

    fireEvent.wheel(control!, { deltaY: -100 })

    expect(onChange).toHaveBeenLastCalledWith(55)
    expect(onChangeEnd).not.toHaveBeenCalled()

    act(() => {
      jest.advanceTimersByTime(200)
    })

    expect(onChangeEnd).toHaveBeenCalledTimes(1)
    expect(onChangeEnd).toHaveBeenLastCalledWith(55)

    jest.useRealTimers()
  })

  it('hides the raw field while a display overlay is shown and restores it on focus', () => {
    render(
      <NumericInput
        label="Mix"
        descriptor={createParameterDescriptor({ min: 0, max: 100, step: 1, defaultValue: 50, unit: '%' })}
        value={50}
        onChange={() => {}}
        displayOverlay={<div data-testid="numeric-overlay">LCD</div>}
      />,
    )

    const input = screen.getByRole('slider', { name: 'Mix' })

    expect(screen.getByTestId('numeric-overlay')).toBeTruthy()
    expect(input.classList.contains('is-overlay-hidden')).toBe(true)

    fireEvent.focus(input)

    expect(screen.queryByTestId('numeric-overlay')).toBeNull()
    expect(input.classList.contains('is-overlay-hidden')).toBe(false)

    fireEvent.blur(input)

    expect(screen.getByTestId('numeric-overlay')).toBeTruthy()
    expect(input.classList.contains('is-overlay-hidden')).toBe(true)
  })
})
