import { fireEvent, render, screen } from '@testing-library/react'

import { ExpressionCalibrationPanel } from './MIDICommanderSetup'

describe('ExpressionCalibrationPanel', () => {
  function expandCalibrationPanel() {
    fireEvent.click(screen.getByText('EXP 1'))
  }

  it('commits deadzone edits on blur instead of every live step', () => {
    const onUpdate = jest.fn()

    render(
      <ExpressionCalibrationPanel
        pedalId="EXP 1"
        label="Volume"
        calibration={{
          min_raw: 0,
          max_raw: 127,
          deadzone_low: 2,
          deadzone_high: 125,
          curve: 'linear',
          invert: false,
        }}
        onUpdate={onUpdate}
      />,
    )

    expandCalibrationPanel()

    const input = screen.getByRole('slider', { name: 'Low' })
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'ArrowUp' })

    expect(onUpdate).not.toHaveBeenCalled()

    fireEvent.blur(input)

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate).toHaveBeenLastCalledWith({ deadzone_low: 3 })
  })

  it('clamps the high deadzone so it cannot fall below the low deadzone', () => {
    const onUpdate = jest.fn()

    render(
      <ExpressionCalibrationPanel
        pedalId="EXP 1"
        label="Volume"
        calibration={{
          min_raw: 0,
          max_raw: 127,
          deadzone_low: 10,
          deadzone_high: 20,
          curve: 'linear',
          invert: false,
        }}
        onUpdate={onUpdate}
      />,
    )

    expandCalibrationPanel()

    const input = screen.getByRole('slider', { name: 'High' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.blur(input)

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate).toHaveBeenLastCalledWith({ deadzone_high: 10 })
  })
})
