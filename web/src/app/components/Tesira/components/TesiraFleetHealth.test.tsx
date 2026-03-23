import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import { TesiraFleetHealth } from './TesiraFleetHealth'

const mockRefetch = jest.fn().mockResolvedValue(undefined)

jest.mock('../hooks/useTesiraApi', () => ({
  useTesiraFleetHealth: () => ({
    data: {
      status: 'healthy',
      total_devices: 3,
      connected_devices: 2,
      offline_devices: 1,
      connected_ratio: 2 / 3,
    },
    error: null,
    isLoading: false,
    refetch: mockRefetch,
  }),
}))

describe('TesiraFleetHealth', () => {
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
    mockRefetch.mockClear()
  })

  it('renders Carbon fleet health stats and refreshes on demand', () => {
    render(<TesiraFleetHealth />)

    expect(screen.getByText('Tesira connection posture')).toBeTruthy()
    expect(screen.getByText('2/3')).toBeTruthy()
    expect(screen.getByText('1')).toBeTruthy()
    expect(screen.getByText('67%')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(mockRefetch).toHaveBeenCalled()
  })
})
