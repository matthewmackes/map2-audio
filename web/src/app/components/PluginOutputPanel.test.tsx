import '@testing-library/jest-dom'
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { PluginOutputPanel } from './PluginOutputPanel'

jest.mock('../hooks/usePluginOutputs', () => ({
  usePluginOutput: () => ({
    peaks: {},
    outputPorts: {},
    tuner: undefined,
    spectrum: undefined,
    connected: true,
    clearClip: jest.fn(),
  }),
}))

jest.mock('./AudioMeter', () => ({
  AudioMeter: () => <div>Audio Meter Mock</div>,
  GainReductionMeter: () => <div>Gain Reduction Meter Mock</div>,
}))

jest.mock('./TunerDisplay', () => ({
  TunerDisplay: () => <div>Tuner Display Mock</div>,
}))

jest.mock('./SpectrumAnalyzer', () => ({
  SpectrumAnalyzer: () => <div>Spectrum Analyzer Mock</div>,
}))

describe('PluginOutputPanel', () => {
  beforeEach(() => {
    if (typeof window.ResizeObserver === 'undefined') {
      Object.defineProperty(window, 'ResizeObserver', {
        value: class ResizeObserver {
          observe() {}
          unobserve() {}
          disconnect() {}
        },
        configurable: true,
      })
    }
  })

  it('renders Carbon header tags and collapses the panel body', () => {
    render(
      <PluginOutputPanel
        pluginUri="plugin://compressor"
        pluginName="Studio Compressor"
        uiInfo={{
          output_ports: [
            {
              index: 0,
              symbol: 'meter',
              name: 'Output meter',
              designation: 'meter',
              min_value: 0,
              max_value: 1,
              default_value: 0,
              is_logarithmic: false,
            },
          ],
          has_tuner: true,
          has_spectrum: true,
          has_meters: true,
        }}
        data={{
          uri: 'plugin://compressor',
          outputPortValues: { 0: 0.75 },
        }}
      />,
    )

    expect(screen.getByText('Studio Compressor')).toBeInTheDocument()
    expect(screen.getByText('Meters')).toBeInTheDocument()
    expect(screen.getByText('Tuner')).toBeInTheDocument()
    expect(screen.getByText('Spectrum')).toBeInTheDocument()
    expect(screen.getByText('Audio Meter Mock')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Collapse output panel' }))

    expect(screen.getByText('Panel collapsed')).toBeInTheDocument()
  })
})
