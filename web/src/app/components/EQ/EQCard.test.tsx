import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'

const mockSetBandFrequency = jest.fn()

jest.mock('../../hooks/useFilters', () => ({
  useFilters: () => ({
    bands: Array.from({ length: 8 }, (_, index) => ({
      type: 'peak',
      frequency: index === 0 ? 1000 : 200 * (index + 1),
      gain: 0,
      q: 1,
      enabled: true,
    })),
    outputGain: 0,
    bypass: false,
    frequencyResponse: {
      frequencies: [20, 1000, 20_000],
      response: [0, 0, 0],
    },
    isLoading: false,
    isUpdating: false,
    setBandFrequency: mockSetBandFrequency,
    setBandGain: jest.fn(),
    setBandQ: jest.fn(),
    setBandType: jest.fn(),
    setBandEnabled: jest.fn(),
    setOutputGain: jest.fn(),
    setBypass: jest.fn(),
  }),
}))

jest.mock('../ParameterControl', () => ({
  ParameterControl: ({
    label,
    descriptor,
    onLiveChange,
  }: {
    label?: string
    descriptor: { scale?: string; step?: number }
    onLiveChange?: (value: number) => void
  }) => (
    <button
      type="button"
      data-scale={descriptor.scale}
      data-step={descriptor.step}
      onClick={() => onLiveChange?.(2500)}
    >
      {label}
    </button>
  ),
  ParameterKnob: ({ label }: { label: string }) => <div>{label}</div>,
}))

import { EQCard } from './EQCard'

describe('EQCard parameter-control migration', () => {
  beforeEach(() => {
    mockSetBandFrequency.mockReset()
  })

  it('uses the shared log-scaled control for the selected-band frequency editor', () => {
    const { container } = render(<EQCard />)

    fireEvent.click(container.querySelector('.eq-band-chip') as HTMLElement)

    const frequencyControl = screen.getByRole('button', { name: 'Frequency' })
    expect(frequencyControl).toHaveAttribute('data-scale', 'log')
    expect(frequencyControl).toHaveAttribute('data-step', '1')

    fireEvent.click(frequencyControl)

    expect(mockSetBandFrequency).toHaveBeenCalledWith(0, 2500)
  })

  it('reuses the shared log descriptor in the expanded per-band editor', () => {
    render(<EQCard />)

    fireEvent.click(screen.getByRole('button', { name: '+' }))

    const expandedFrequencyControl = screen.getAllByRole('button', { name: 'Freq' })[0]
    expect(expandedFrequencyControl).toHaveAttribute('data-scale', 'log')

    fireEvent.click(expandedFrequencyControl)

    expect(mockSetBandFrequency).toHaveBeenCalledWith(0, 2500)
  })
})
