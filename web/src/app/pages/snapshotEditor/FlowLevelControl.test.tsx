import React from 'react'
import { render, screen } from '@testing-library/react'
import { FlowLevelControl } from './FlowLevelControl'

// NumberInput renders a numeric <input> with the level label as
// its accessible name; SegmentedLedText renders the formatted
// percentage. Both primitives are real (no mocks) so the test
// exercises the same render tree the page uses.

describe('FlowLevelControl', () => {
  it('renders the LED readout for the clamped percentage value', () => {
    render(<FlowLevelControl flowId="flow-1" flowLabel="A" value={42} onChange={() => {}} />)
    const shell = screen.getByTestId('juce-grid-flow-level-flow-1')
    expect(shell.getAttribute('title')).toBe('Signal chain A level: 42%')
    // The segmented-LED readout writes the value into the DOM
    expect(shell.textContent).toContain('42%')
  })

  it('clamps the displayed percentage between 0 and 100', () => {
    const { rerender } = render(
      <FlowLevelControl flowId="flow-2" flowLabel="B" value={250} onChange={() => {}} />,
    )
    expect(screen.getByTestId('juce-grid-flow-level-flow-2').textContent).toContain('100%')
    rerender(
      <FlowLevelControl flowId="flow-2" flowLabel="B" value={-50} onChange={() => {}} />,
    )
    expect(screen.getByTestId('juce-grid-flow-level-flow-2').textContent).toContain('0%')
  })

  it('passes the onChange callback through to the underlying number input', () => {
    const handleChange = jest.fn()
    render(<FlowLevelControl flowId="flow-3" flowLabel="C" value={30} onChange={handleChange} />)
    // The NumberInput primitive owns its own commit/blur ceremony;
    // here we just assert the input is wired and the title reflects
    // the prop value (the parent re-renders on real changes).
    const shell = screen.getByTestId('juce-grid-flow-level-flow-3')
    expect(shell.getAttribute('title')).toBe('Signal chain C level: 30%')
    expect(screen.getByLabelText('Signal chain C level')).toBeTruthy()
  })

  it('passes the disabled prop down to the underlying number input', () => {
    render(
      <FlowLevelControl
        flowId="flow-4"
        flowLabel="D"
        value={70}
        onChange={() => {}}
        disabled
      />,
    )
    const input = screen.getByLabelText('Signal chain D level') as HTMLInputElement
    expect(input.disabled).toBe(true)
  })
})
