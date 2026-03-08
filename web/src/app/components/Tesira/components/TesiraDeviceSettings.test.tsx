import React from 'react'
import { render, screen } from '@testing-library/react'
import { TesiraDeviceSettings } from './TesiraDeviceSettings'

const mockMutateAsync = jest.fn().mockResolvedValue(undefined)

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
    mutateAsync: mockMutateAsync,
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
    mutateAsync: mockMutateAsync,
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
  it('renders gpio and scene management sections', () => {
    render(<TesiraDeviceSettings deviceId="tesira_1" />)

    expect(screen.getByTestId('firmware-tab')).toBeTruthy()
    expect(screen.getByText('GPIO')).toBeTruthy()
    expect(screen.getByText('Scene Snapshots')).toBeTruthy()
    expect(screen.getByText('Startup')).toBeTruthy()
  })
})
