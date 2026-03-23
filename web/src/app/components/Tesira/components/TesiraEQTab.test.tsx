import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import { TesiraEQTab } from './TesiraEQTab'

const mockSetEQBandFreq = jest.fn().mockResolvedValue(undefined)
const mockSetEQBandGain = jest.fn().mockResolvedValue(undefined)
const mockSetEQBandQ = jest.fn().mockResolvedValue(undefined)

jest.mock('../../../../map2/api', () => ({
  tesiraApi: {
    setEQBandFreq: (...args: unknown[]) => mockSetEQBandFreq(...args),
    setEQBandGain: (...args: unknown[]) => mockSetEQBandGain(...args),
    setEQBandQ: (...args: unknown[]) => mockSetEQBandQ(...args),
  },
}))

describe('TesiraEQTab', () => {
  beforeAll(() => {
    if (typeof window.matchMedia !== 'function') {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: jest.fn().mockImplementation((query: string) => ({
          matches: false,
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
      })
    }

    if (typeof window.ResizeObserver === 'undefined') {
      Object.defineProperty(window, 'ResizeObserver', {
        writable: true,
        value: class ResizeObserver {
          observe() {}
          unobserve() {}
          disconnect() {}
        },
      })
    }
  })

  beforeEach(() => {
    mockSetEQBandFreq.mockClear()
    mockSetEQBandGain.mockClear()
    mockSetEQBandQ.mockClear()
  })

  it('applies EQ parameter changes to the selected instance tag', () => {
    render(<TesiraEQTab deviceId="tesira-1" />)

    fireEvent.change(screen.getByLabelText('EQ instance tag'), {
      target: { value: 'MainEQ' },
    })
    fireEvent.change(screen.getByLabelText('Frequency for Low'), {
      target: { value: '120' },
    })
    fireEvent.change(screen.getByLabelText('Gain for Low'), {
      target: { value: '4.5' },
    })
    fireEvent.change(screen.getByLabelText('Q for Low'), {
      target: { value: '1.25' },
    })

    expect(mockSetEQBandFreq).toHaveBeenCalledWith('tesira-1', 'MainEQ', 0, 120)
    expect(mockSetEQBandGain).toHaveBeenCalledWith('tesira-1', 'MainEQ', 0, 4.5)
    expect(mockSetEQBandQ).toHaveBeenCalledWith('tesira-1', 'MainEQ', 0, 1.25)
  })
})
