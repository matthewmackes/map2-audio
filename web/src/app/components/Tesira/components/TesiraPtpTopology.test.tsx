import '@testing-library/jest-dom'
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import { TesiraPtpTopology } from './TesiraPtpTopology'

const mockRefetch = jest.fn().mockResolvedValue(undefined)
const mockUseTesiraPtpTopology = jest.fn()

jest.mock('../hooks/useTesiraApi', () => ({
  useTesiraPtpTopology: () => mockUseTesiraPtpTopology(),
}))

describe('TesiraPtpTopology', () => {
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
    mockUseTesiraPtpTopology.mockReturnValue({
      data: {
        nodes: [
          {
            device_id: 'tesira-1',
            name: 'Main Hall DSP',
            host: '192.168.10.55',
            connected: true,
            ptp_state: 'slave',
            offset_ns: 32,
            grandmaster_id: 'gm-1',
            source_node_id: 'node-a',
          },
        ],
        grandmaster_ids: ['gm-1'],
        node_count: 1,
      },
      error: null,
      isLoading: false,
      refetch: mockRefetch,
    })
  })

  it('renders Carbon PTP topology rows and supports refresh', () => {
    render(<TesiraPtpTopology />)

    expect(screen.getByText('Fleet timing map')).toBeTruthy()
    expect(screen.getByText('Main Hall DSP')).toBeTruthy()
    expect(screen.getByText('node-a')).toBeTruthy()
    expect(screen.getByText('32')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(mockRefetch).toHaveBeenCalled()
  })

  it('renders the empty state when hook data has a malformed nodes payload', () => {
    mockUseTesiraPtpTopology.mockReturnValue({
      data: {
        nodes: { bad: true },
        grandmaster_ids: [],
        node_count: 0,
      },
      error: null,
      isLoading: false,
      refetch: mockRefetch,
    })

    render(<TesiraPtpTopology />)

    expect(screen.getByText('No topology data.')).toBeInTheDocument()
  })
})
