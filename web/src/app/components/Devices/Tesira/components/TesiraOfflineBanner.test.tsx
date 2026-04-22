import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { TesiraOfflineBanner } from './TesiraOfflineBanner'

const mockMutateAsync = jest.fn()
let deviceStateHandler: ((event: { device_id: string; event: string; next_retry_s?: number }) => void) | null = null

jest.mock('../hooks/useTesiraApi', () => ({
  useReconnectDevice: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}))

jest.mock('../hooks/useTesiraWebSocket', () => ({
  useTesiraDeviceState: (handler: (event: { device_id: string; event: string; next_retry_s?: number }) => void) => {
    deviceStateHandler = handler
  },
}))

describe('TesiraOfflineBanner', () => {
  beforeEach(() => {
    mockMutateAsync.mockReset()
    deviceStateHandler = null
  })

  it('shows reconnect guidance and triggers an immediate reconnect', async () => {
    mockMutateAsync.mockResolvedValue({ message: 'Connected' })

    render(<TesiraOfflineBanner deviceId="tesira-1" />)

    expect(screen.getByText(/Device offline/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Try now' }))

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith('tesira-1')
    })
  })

  it('surfaces websocket retry countdown updates for the active device', async () => {
    render(<TesiraOfflineBanner deviceId="tesira-1" />)

    expect(deviceStateHandler).toBeTruthy()

    act(() => {
      deviceStateHandler?.({ device_id: 'tesira-1', event: 'reconnecting', next_retry_s: 12 })
    })

    await waitFor(() => {
      expect(screen.getByText(/Next retry in 12s/i)).toBeTruthy()
    })
  })
})
