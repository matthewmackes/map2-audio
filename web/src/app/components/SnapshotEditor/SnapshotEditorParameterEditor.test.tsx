import '@testing-library/jest-dom'
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'

import { JuceGridParameterEditor } from './SnapshotEditorParameterEditor'

const mockGetWaveformPreview = jest.fn()

jest.mock('../../../map2/clients/assets', () => ({
  irApi: {
    getWaveformPreview: (...args: unknown[]) => mockGetWaveformPreview(...args),
  },
}))

describe('SnapshotEditorParameterEditor IR waveform preview', () => {
  beforeEach(() => {
    mockGetWaveformPreview.mockReset()
  })

  it('renders the loaded IR waveform and metadata in the parameter editor', async () => {
    mockGetWaveformPreview.mockResolvedValue({
      assetPath: '/tmp/cabs/Deluxe.wav',
      fileName: 'Deluxe.wav',
      sampleRate: 48_000,
      sampleCount: 2_400,
      durationMs: 50,
      points: Array.from({ length: 12 }, (_, index) => (index + 1) / 12),
    })

    render(
      <JuceGridParameterEditor
        plugin={{
          uri: 'map2://juce/convolution/cabinet',
          name: 'Cabinet IR',
          position: 0,
          parameters: {},
          bypassed: false,
          loader_state: {
            selected_asset_path: '/tmp/cabs/Deluxe.wav',
          },
        } as any}
        meta={{
          uri: 'map2://juce/convolution/cabinet',
          name: 'Cabinet IR',
          category: 'Convolution',
          format: 'JUCE',
          parameters: [],
        } as any}
        onParameterChange={jest.fn()}
      />,
    )

    expect(screen.getByText('Cabinet IR waveform')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Deluxe.wav')).toBeInTheDocument()
    })

    expect(screen.getByLabelText('Deluxe.wav waveform preview')).toBeInTheDocument()
    expect(screen.getByText('50 ms • 48 kHz • 2,400 samples')).toBeInTheDocument()
    expect(mockGetWaveformPreview).toHaveBeenCalledWith('/tmp/cabs/Deluxe.wav', 192)
  })

  it('shows a placeholder when no IR asset is loaded', () => {
    render(
      <JuceGridParameterEditor
        plugin={{
          uri: 'map2://juce/convolution/reverb',
          name: 'Reverb IR',
          position: 0,
          parameters: {},
          bypassed: false,
          loader_state: {
            selected_asset_path: null,
          },
        } as any}
        meta={{
          uri: 'map2://juce/convolution/reverb',
          name: 'Reverb IR',
          category: 'Convolution',
          format: 'JUCE',
          parameters: [],
        } as any}
        onParameterChange={jest.fn()}
      />,
    )

    expect(screen.getByText('Reverb IR waveform')).toBeInTheDocument()
    expect(screen.getByText('No WAV impulse loaded for this block yet.')).toBeInTheDocument()
    expect(mockGetWaveformPreview).not.toHaveBeenCalled()
  })

  it('disables numeric parameter editing when read-only', () => {
    render(
      <JuceGridParameterEditor
        plugin={{
          uri: 'plugin://drive',
          name: 'Drive',
          position: 0,
          parameters: {
            drive: 0.5,
          },
          bypassed: false,
        } as any}
        meta={{
          uri: 'plugin://drive',
          name: 'Drive',
          category: 'Drive',
          format: 'LV2',
          parameters: [
            {
              index: 0,
              symbol: 'drive',
              name: 'Drive',
              min: 0,
              max: 1,
              default: 0.5,
              value: 0.5,
              is_log: false,
              is_toggled: false,
            },
          ],
        } as any}
        onParameterChange={jest.fn()}
        readOnly
      />,
    )

    expect(screen.getByLabelText('Drive')).toBeDisabled()
  })

  it('renders the channel context header using the current flow label', () => {
    render(
      <JuceGridParameterEditor
        plugin={{
          uri: 'plugin://drive',
          name: 'Drive',
          position: 0,
          parameters: {
            drive: 0.5,
          },
          bypassed: false,
        } as any}
        meta={{
          uri: 'plugin://drive',
          name: 'Drive',
          category: 'Drive',
          format: 'LV2',
          parameters: [],
        } as any}
        flowLabel="Lead"
        flowColor="#fa4d56"
        onParameterChange={jest.fn()}
      />,
    )

    expect(screen.getByText('Channel Lead')).toBeInTheDocument()
    expect(screen.getByText('Lead')).toBeInTheDocument()
  })
})
