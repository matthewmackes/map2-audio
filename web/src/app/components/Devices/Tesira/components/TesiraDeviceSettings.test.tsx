import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TesiraDeviceSettings } from './TesiraDeviceSettings'

const mockSetGpioMutateAsync = jest.fn().mockResolvedValue(undefined)
const mockCaptureSceneMutateAsync = jest.fn().mockResolvedValue(undefined)

jest.mock('../hooks/useTesiraApi', () => ({
  useTesiraCapabilities: () => ({
    isLoading: false,
    error: null,
    data: {
      model: 'TesiraFORTE CI',
      capabilities: { gpio_count: 4, avb_max_channels: 64, usb_channels: 8 },
    },
  }),
  useTesiraGpio: () => ({
    isLoading: false,
    error: null,
    data: { pins: [{ pin: 1, ok: true, state: true }] },
    refetch: jest.fn(),
  }),
  useSetTesiraGpioPin: () => ({
    isPending: false,
    mutateAsync: mockSetGpioMutateAsync,
  }),
  useTesiraScenes: () => ({
    isLoading: false,
    error: null,
    data: {
      scenes: [{ scene_id: 'scene_1', name: 'Startup', created_at: '2026-03-08T00:00:00Z' }],
    },
    refetch: jest.fn(),
  }),
  useCaptureTesiraScene: () => ({
    isPending: false,
    mutateAsync: mockCaptureSceneMutateAsync,
  }),
  useRecallTesiraScene: () => ({
    isPending: false,
    mutate: jest.fn(),
  }),
  useDeleteTesiraScene: () => ({
    isPending: false,
    mutate: jest.fn(),
  }),
}))

jest.mock('./TesiraFirmwareTab', () => ({
  TesiraFirmwareTab: () => <div data-testid="firmware-tab" />,
}))

describe('TesiraDeviceSettings', () => {
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
    mockSetGpioMutateAsync.mockReset()
    mockCaptureSceneMutateAsync.mockReset()
  })

  it('renders gpio and scene management sections and captures a scene', async () => {
    render(<TesiraDeviceSettings deviceId="tesira_1" />)

    expect(screen.getByTestId('firmware-tab')).toBeTruthy()
    expect(screen.getByText('Toggle Tesira GPIO pins')).toBeTruthy()
    expect(screen.getByText('Capture and replay runtime scene state')).toBeTruthy()
    expect(screen.getByText('Startup')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Scene name'), {
      target: { value: 'After Reset' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Capture scene' }))

    await waitFor(() => {
      expect(mockCaptureSceneMutateAsync).toHaveBeenCalledWith({
        deviceId: 'tesira_1',
        name: 'After Reset',
      })
    })
  })
})
