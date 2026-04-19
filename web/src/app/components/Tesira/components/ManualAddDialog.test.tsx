import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { ManualAddDialog } from './ManualAddDialog'

const mockAddDevice = jest.fn()

jest.mock('../hooks/useTesiraApi', () => ({
  useAddDevice: () => ({
    mutateAsync: mockAddDevice,
    isPending: false,
  }),
}))

describe('ManualAddDialog', () => {
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
    mockAddDevice.mockReset()
    mockAddDevice.mockResolvedValue({ device_id: 'tesira-1' })
  })

  it('adds a Tesira device by IP using the default TTP port', async () => {
    render(<ManualAddDialog open onClose={() => undefined} />)

    fireEvent.change(screen.getByLabelText('IP Address'), {
      target: { value: '192.168.1.100' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Device' }))

    await waitFor(() => {
      expect(mockAddDevice).toHaveBeenCalledWith({
        host: '192.168.1.100',
        port: 23,
        name: undefined,
      })
    })
  })

  it('submits optional name and custom port from advanced options', async () => {
    render(<ManualAddDialog open onClose={() => undefined} />)

    fireEvent.change(screen.getByLabelText('IP Address'), {
      target: { value: '10.10.10.55' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Show advanced options' }))
    fireEvent.change(screen.getByLabelText('Name (optional)'), {
      target: { value: 'Main Hall DSP' },
    })
    fireEvent.change(screen.getByLabelText('TTP Port'), {
      target: { value: '2202' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Device' }))

    await waitFor(() => {
      expect(mockAddDevice).toHaveBeenCalledWith({
        host: '10.10.10.55',
        port: 2202,
        name: 'Main Hall DSP',
      })
    })
  })
})
