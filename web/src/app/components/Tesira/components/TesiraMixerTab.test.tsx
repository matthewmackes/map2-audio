import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { TesiraMixerTab } from './TesiraMixerTab'

const mockSetCrosspointMutate = jest.fn()
const mockSetCrosspointMuteMutate = jest.fn()
const mockRefetch = jest.fn().mockResolvedValue(undefined)

jest.mock('../hooks/useTesiraApi', () => ({
  useTesiraCrosspointMatrix: () => ({
    data: {
      matrix: [
        [
          { row: 1, col: 1, gain_db: -12, muted: false },
          { row: 1, col: 2, gain_db: -6, muted: true },
        ],
      ],
    },
    isLoading: false,
    error: null,
    refetch: mockRefetch,
  }),
  useSetCrosspoint: () => ({
    mutate: mockSetCrosspointMutate,
    isPending: false,
  }),
  useSetCrosspointMute: () => ({
    mutate: mockSetCrosspointMuteMutate,
    isPending: false,
  }),
}))

describe('TesiraMixerTab', () => {
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
    mockSetCrosspointMutate.mockClear()
    mockSetCrosspointMuteMutate.mockClear()
    mockRefetch.mockClear()
  })

  it('stages gain changes and toggles mute on the selected router tag', async () => {
    render(<TesiraMixerTab deviceId="tesira-1" />)

    fireEvent.change(screen.getByLabelText('Router tag'), {
      target: { value: 'RouterMain' },
    })
    fireEvent.change(screen.getByLabelText('Gain from input 1 to output 1'), {
      target: { value: '-3' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Apply gain for input 1 to output 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mute input 1 to output 1' }))

    await waitFor(() => {
      expect(mockSetCrosspointMutate).toHaveBeenCalledWith({
        deviceId: 'tesira-1',
        tag: 'RouterMain',
        row: 1,
        col: 1,
        gainDb: -3,
        rows: 4,
        cols: 4,
      })
    })

    expect(mockSetCrosspointMuteMutate).toHaveBeenCalledWith({
      deviceId: 'tesira-1',
      tag: 'RouterMain',
      row: 1,
      col: 1,
      muted: true,
      rows: 4,
      cols: 4,
    })
  })
})
