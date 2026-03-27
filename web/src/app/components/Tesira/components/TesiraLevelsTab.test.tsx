import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { TesiraLevelsTab } from './TesiraLevelsTab'

const mockSetLevelMutate = jest.fn()
const mockSetMuteMutate = jest.fn()

jest.mock('../hooks/useTesiraApi', () => ({
  useTesiraDevice: () => ({
    data: {
      avb_streams: [
        { name: 'LevelControl1', channels: 2 },
      ],
    },
  }),
  useSetLevel: () => ({
    mutate: mockSetLevelMutate,
    isPending: false,
  }),
  useSetMute: () => ({
    mutate: mockSetMuteMutate,
    isPending: false,
  }),
}))

jest.mock('../hooks/useTesiraWebSocket', () => ({
  useTesiraMeters: () => undefined,
}))

describe('TesiraLevelsTab', () => {
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
    mockSetLevelMutate.mockReset()
    mockSetMuteMutate.mockReset()
  })

  it('applies live level changes and mute actions to the selected tag', async () => {
    render(<TesiraLevelsTab deviceId="tesira-1" />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('LevelControl1')).toBeTruthy()
    })

    const levelInput = screen.getByRole('slider', { name: 'Level dB channel 1' })
    fireEvent.focus(levelInput)
    fireEvent.change(levelInput, {
      target: { value: '-18' },
    })
    fireEvent.blur(levelInput)
    fireEvent.click(screen.getByRole('button', { name: 'Set level for channel 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mute channel 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Unmute channel 1' }))

    expect(mockSetLevelMutate).toHaveBeenCalledWith({
      deviceId: 'tesira-1',
      tag: 'LevelControl1',
      channel: 0,
      levelDb: -18,
    })

    expect(mockSetMuteMutate).toHaveBeenNthCalledWith(1, {
      deviceId: 'tesira-1',
      tag: 'LevelControl1',
      channel: 0,
      muted: true,
    })
    expect(mockSetMuteMutate).toHaveBeenNthCalledWith(2, {
      deviceId: 'tesira-1',
      tag: 'LevelControl1',
      channel: 0,
      muted: false,
    })
  })
})
