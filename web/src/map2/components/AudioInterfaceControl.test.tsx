import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { AudioInterfaceControl } from './AudioInterfaceControl'

const mockPushToast = jest.fn()
const mockUseVuMeters = jest.fn()

jest.mock('../../app/components/Toasts', () => ({
  useToasts: () => ({
    pushToast: mockPushToast,
  }),
}))

jest.mock('../../app/hooks/useVuMeters', () => ({
  useVuMeters: (...args: unknown[]) => mockUseVuMeters(...args),
}))

function jsonResponse(body: unknown) {
  return Promise.resolve({
    ok: true,
    json: async () => body,
  })
}

describe('AudioInterfaceControl', () => {
  let audioRunning = false
  let currentAudioDevice = 'hw:2,0'

  beforeEach(() => {
    audioRunning = false
    currentAudioDevice = 'hw:2,0'
    mockPushToast.mockReset()
    mockUseVuMeters.mockReset()
    mockUseVuMeters.mockReturnValue({
      levels: {
        inputLeft: -18.4,
        inputRight: -59.5,
        outputLeft: -12.1,
        outputRight: -11.2,
        running: true,
      },
      peakHold: {
        inputLeft: -12.0,
        inputRight: -54.0,
        outputLeft: -8.0,
        outputRight: -7.2,
      },
      isConnected: true,
      isRunning: true,
      resetPeaks: jest.fn(),
    })

    Object.defineProperty(global, 'fetch', {
      configurable: true,
      writable: true,
      value: jest.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)

        if (url.includes('/api/audio/status')) {
          return jsonResponse({
            running: audioRunning,
            sample_rate: 48000,
            buffer_size: 256,
            cpu_load: 12.5,
            engine: 'juce',
            available: true,
            audio_device: currentAudioDevice,
            input_channel_mode: 'stereo',
            input_gain_db: 0,
            output_gain_db: 0,
          })
        }

        if (url.includes('/api/audio/health')) {
          return jsonResponse({
            total_xruns: 0,
            xrun_rate_per_minute: 0,
          })
        }

        if (url.includes('/api/usb/devices')) {
          return jsonResponse({
            hotone_detected: true,
            device_count: 2,
            primary_device: {
              name: 'Hotone Jogg',
              model: 'jogg',
              alsa_device: 'hw:2,0',
            },
            all_devices: [
              { name: 'Hotone Jogg', model: 'jogg', alsa_device: 'hw:2,0', is_hotone: true },
              { name: 'Edirol UA-1000', alsa_device: 'hw:3,0', is_hotone: false },
            ],
            recommendations: [],
          })
        }

        if (url.includes('/api/audio/config') && init?.method === 'POST') {
          const parsed = new URL(url, 'http://localhost')
          currentAudioDevice = parsed.searchParams.get('audio_device') || currentAudioDevice
          return jsonResponse({
            success: true,
            message: 'Audio configuration updated',
            updated_settings: {
              sample_rate: 48000,
              buffer_size: 256,
              audio_device: currentAudioDevice,
              input_channel_mode: parsed.searchParams.get('input_channel_mode') || 'stereo',
              input_gain_db: parsed.searchParams.get('input_gain_db') || '0',
              output_gain_db: parsed.searchParams.get('output_gain_db') || '0',
            },
            current_config: {
              sample_rate: 48000,
              buffer_size: 256,
              cpu_load: 12.5,
              audio_device: currentAudioDevice,
              input_channel_mode: parsed.searchParams.get('input_channel_mode') || 'stereo',
              input_gain_db: Number(parsed.searchParams.get('input_gain_db') || '0'),
              output_gain_db: Number(parsed.searchParams.get('output_gain_db') || '0'),
            },
          })
        }

        if (url.includes('/api/audio/start') && init?.method === 'POST') {
          audioRunning = true
          return jsonResponse({ success: true, message: 'JUCE audio started' })
        }

        if (url.includes('/api/audio/stop') && init?.method === 'POST') {
          audioRunning = false
          return jsonResponse({ success: true, message: 'JUCE audio stopped' })
        }

        return jsonResponse({})
      }),
    })
  })

  it('lists detected USB audio devices and applies the selected audio device', async () => {
    render(<AudioInterfaceControl />)

    expect(await screen.findByText('Live Signal')).toBeInTheDocument()
    expect(screen.getByText('Input L')).toBeInTheDocument()
    expect(screen.getByText('Output R')).toBeInTheDocument()
    expect(screen.getByText('Read-only input/output confirmation from the live engine metering stream.')).toBeInTheDocument()

    const deviceSelect = await screen.findByLabelText('Audio Device')
    const inputChannelModeSelect = screen.getByLabelText('Input Channel Mode')
    const inputGainSlider = screen.getByLabelText('Input Gain')
    const outputGainSlider = screen.getByLabelText('Output Gain')
    expect(screen.getByRole('option', { name: 'Hotone Jogg (hw:2,0)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Edirol UA-1000 (hw:3,0)' })).toBeInTheDocument()

    fireEvent.change(deviceSelect, { target: { value: 'hw:3,0' } })
    fireEvent.change(inputChannelModeSelect, { target: { value: 'mono_left' } })
    fireEvent.change(inputGainSlider, { target: { value: '6' } })
    fireEvent.change(outputGainSlider, { target: { value: '-3' } })
    const applyButton = screen.getByRole('button', { name: 'Apply Settings' })
    await waitFor(() => expect(applyButton).not.toBeDisabled())
    fireEvent.click(applyButton)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/audio/config?sample_rate=48000&buffer_size=256&audio_device=hw%3A3%2C0&input_channel_mode=mono_left&input_gain_db=6&output_gain_db=-3'),
        expect.objectContaining({ method: 'POST' }),
      )
    })
    expect(mockPushToast).toHaveBeenCalledWith('Audio configuration updated', 'success')
  })

  it('starts and stops audio with toast feedback', async () => {
    render(<AudioInterfaceControl />)

    fireEvent.click(await screen.findByRole('button', { name: 'Start Audio' }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/audio/start'),
        expect.objectContaining({ method: 'POST' }),
      )
    })
    await waitFor(() => {
      expect(mockPushToast).toHaveBeenCalledWith('JUCE audio started', 'success')
    })
    expect(await screen.findByRole('button', { name: 'Stop Audio' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Stop Audio' }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/audio/stop'),
        expect.objectContaining({ method: 'POST' }),
      )
    })
    await waitFor(() => {
      expect(mockPushToast).toHaveBeenCalledWith('JUCE audio stopped', 'info')
    })
    expect(await screen.findByRole('button', { name: 'Start Audio' })).toBeInTheDocument()
  })
})
