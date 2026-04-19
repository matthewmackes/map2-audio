import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { TesiraFirmwareTab } from './TesiraFirmwareTab'

const mockRefetchLatest = jest.fn()
const mockRebootMutateAsync = jest.fn()

const firmwareByDevice: Record<string, {
  device_id: string
  host: string
  name: string
  connected: boolean
  current_version: string | null
  latest_version: string | null
  update_available: boolean
  update_path_url: string
  download_url: string
  release_notes_url: string
}> = {
  'tesira-1': {
    device_id: 'tesira-1',
    host: '192.168.10.55',
    name: 'Main Hall DSP',
    connected: true,
    current_version: '4.5.1',
    latest_version: '4.7.0',
    update_available: true,
    update_path_url: 'https://biamp.example/update-path',
    download_url: 'https://biamp.example/firmware.tfa2',
    release_notes_url: 'https://biamp.example/release-notes',
  },
  'tesira-2': {
    device_id: 'tesira-2',
    host: '192.168.10.56',
    name: 'Overflow DSP',
    connected: false,
    current_version: null,
    latest_version: '4.7.0',
    update_available: false,
    update_path_url: 'https://biamp.example/update-path',
    download_url: 'https://biamp.example/firmware.tfa2',
    release_notes_url: 'https://biamp.example/release-notes',
  },
}

jest.mock('../hooks/useTesiraApi', () => ({
  useTesiraDevices: () => ({
    data: [
      { device_id: 'tesira-1' },
      { device_id: 'tesira-2' },
    ],
    isLoading: false,
  }),
  useFirmwareLatest: () => ({
    data: {
      version: '4.7.0',
      fetched_at: '2026-03-23T16:00:00Z',
      download_url: 'https://biamp.example/firmware.tfa2',
      release_notes_url: 'https://biamp.example/release-notes',
      update_path_url: 'https://biamp.example/update-path',
    },
    isLoading: false,
    refetch: mockRefetchLatest,
  }),
  useDeviceFirmware: (deviceId: string) => ({
    data: firmwareByDevice[deviceId],
    isLoading: false,
  }),
  useRebootDevice: () => ({
    isPending: false,
    mutateAsync: mockRebootMutateAsync,
  }),
}))

describe('TesiraFirmwareTab', () => {
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
    mockRefetchLatest.mockReset()
    mockRefetchLatest.mockResolvedValue(undefined)
    mockRebootMutateAsync.mockReset()
    mockRebootMutateAsync.mockResolvedValue({ message: 'Device will reboot now.' })
  })

  it('renders fleet firmware state and supports refresh, reboot, and guide reveal', async () => {
    render(<TesiraFirmwareTab deviceId="tesira-1" />)

    expect(screen.getByText('Compare installed and latest Tesira releases')).toBeTruthy()
    expect(screen.getByText('Release notes')).toBeTruthy()
    expect(screen.getAllByText('Update available').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Refresh latest' }))
    expect(mockRefetchLatest).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Reboot device' }))

    await waitFor(() => {
      expect(mockRebootMutateAsync).toHaveBeenCalledWith('tesira-1')
    })

    expect(await screen.findByText('Device will reboot now.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'How to update firmware' }))

    expect(screen.getByText(/updated through/i)).toBeTruthy()
    expect(screen.getByText(/Open Tesira Software/i)).toBeTruthy()
  })
})
