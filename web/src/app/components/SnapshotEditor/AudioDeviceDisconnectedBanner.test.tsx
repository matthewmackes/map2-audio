import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { AudioDeviceDisconnectedBanner } from './AudioDeviceDisconnectedBanner'
import type { AudioDeviceHealth } from '../../hooks/useAudioDeviceHealth'
import * as deviceHealth from '../../hooks/useAudioDeviceHealth'

function health(overrides: Partial<AudioDeviceHealth> = {}): AudioDeviceHealth {
  return {
    available: true,
    running: true,
    device_connected: true,
    device_name: 'UA-1000',
    sample_rate: 48000,
    buffer_size: 64,
    last_error: null,
    recovery_attempts: 0,
    ...overrides,
  }
}

describe('AudioDeviceDisconnectedBanner (T2451)', () => {
  test('renders nothing when health is null', () => {
    const { container } = render(<AudioDeviceDisconnectedBanner health={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  test('renders nothing when the device is connected', () => {
    const { container } = render(<AudioDeviceDisconnectedBanner health={health()} />)
    expect(container).toBeEmptyDOMElement()
  })

  test('renders the error banner with the device name when disconnected', () => {
    render(
      <AudioDeviceDisconnectedBanner
        health={health({ device_connected: false, device_name: 'Hotone Jogg' })}
      />,
    )
    expect(screen.getByText(/Hotone Jogg/)).toBeInTheDocument()
  })

  test('calls recoverAudioDevice and invokes onRecovered on success', async () => {
    const next = health({ device_connected: true })
    const recoverSpy = jest.spyOn(deviceHealth, 'recoverAudioDevice').mockResolvedValue(next)
    const onRecovered = jest.fn()
    render(
      <AudioDeviceDisconnectedBanner
        health={health({ device_connected: false, device_name: 'UA-1000' })}
        onRecovered={onRecovered}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Reconnect now/i }))
    await waitFor(() => expect(recoverSpy).toHaveBeenCalled())
    await waitFor(() => expect(onRecovered).toHaveBeenCalledWith(next))
    recoverSpy.mockRestore()
  })

  test('surfaces the failure message when recovery rejects', async () => {
    const recoverSpy = jest.spyOn(deviceHealth, 'recoverAudioDevice').mockRejectedValue(new Error('boom'))
    render(
      <AudioDeviceDisconnectedBanner
        health={health({ device_connected: false, last_error: 'xhci_hcd disconnect' })}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Reconnect now/i }))
    await waitFor(() => expect(screen.getByText(/Reconnect failed: boom/)).toBeInTheDocument())
    recoverSpy.mockRestore()
  })
})
