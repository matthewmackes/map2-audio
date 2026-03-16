import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { JuceGridSignalCanvas, type JuceGridAudioInterfaceStatus } from './JuceGridSignalCanvas'
import type { Chain, Plugin } from '../../map2/types'

const pluginUri = 'plugin://compressor'

const chain: Chain = {
  id: 1,
  name: 'Flow A',
  is_active: true,
  created_at: '2026-03-15T00:00:00Z',
  updated_at: '2026-03-15T00:00:00Z',
  plugins: [
    {
      uri: pluginUri,
      name: 'Studio Compressor',
      position: 0,
      bypassed: false,
      parameters: {},
      in_ports: 2,
      out_ports: 2,
      latency_samples: 96,
      cpu_percent: 12.4,
    },
  ],
}

const pluginMeta: Record<string, Plugin> = {
  [pluginUri]: {
    uri: pluginUri,
    name: 'Studio Compressor',
    author: 'MAP2',
    category: 'Dynamics',
    class_label: 'Dynamics',
    version: '1.0.0',
    license: 'AGPL-3.0-only',
    has_ui: false,
    in_ports: 2,
    out_ports: 2,
    parameters: [],
    format: 'VST3',
    sidechain_buses: 1,
  },
}

function buildInputStatus(): JuceGridAudioInterfaceStatus {
  return {
    deviceName: 'Default ALSA Output (currently PipeWire Media Server)',
    sampleRate: 48000,
    bufferSize: 128,
    isRunning: true,
    routingMode: 'series',
    bindings: [
      {
        selection_type: 'local_port',
        available: true,
        index: 0,
        name: 'Input 1',
      },
      {
        selection_type: 'local_port',
        available: true,
        index: 1,
        name: 'Input 2',
      },
      {
        selection_type: 'avb_endpoint',
        available: false,
        missing: true,
        endpoint_id: 'avb-in-1',
        direction: 'talker',
        device_name: 'Stage Rack Input',
        host: 'rack-a',
        channels: 2,
        sample_rate: 48000,
      },
    ],
    avbReadinessState: 'degraded',
    meterLevels: [0.28, 0.61],
  }
}

function buildOutputStatus(): JuceGridAudioInterfaceStatus {
  return {
    deviceName: 'Default ALSA Output (currently PipeWire Media Server)',
    sampleRate: 48000,
    bufferSize: 128,
    isRunning: true,
    routingMode: 'parallel_blend',
    bindings: [
      {
        selection_type: 'local_port',
        available: true,
        index: 0,
        name: 'Output 1',
      },
      {
        selection_type: 'local_port',
        available: true,
        index: 1,
        name: 'Output 2',
      },
      {
        selection_type: 'avb_endpoint',
        available: true,
        endpoint_id: 'avb-out-1',
        direction: 'listener',
        device_name: 'Main Room Listener',
        host: 'rack-b',
        channels: 2,
        sample_rate: 48000,
      },
    ],
    avbReadinessState: 'operational',
    meterLevels: [0.43, 0.52],
  }
}

describe('JuceGridSignalCanvas', () => {
  it('renders input and output routing summaries above and below the block lane with full-detail tooltips and warning state', () => {
    const handleInputPorts = jest.fn()
    const handleOutputPorts = jest.fn()
    const handlePluginSelect = jest.fn()

    render(
      <JuceGridSignalCanvas
        chain={chain}
        pluginMeta={pluginMeta}
        selectedPluginUri={pluginUri}
        onPluginSelect={handlePluginSelect}
        onToggleBypass={jest.fn()}
        onReorderPlugins={jest.fn()}
        onAddPlugin={jest.fn()}
        audioStatus={buildInputStatus()}
        audioOutputStatus={buildOutputStatus()}
        pluginLevels={{ [pluginUri]: { in: 0.31, out: 0.48 } }}
        automationSummary={{
          laneCountByPlugin: { [pluginUri]: 2 },
          armedLaneCountByPlugin: { [pluginUri]: 1 },
          playing: false,
          recording: true,
        }}
        showEndpoints
        onInputPortSelectClick={handleInputPorts}
        onOutputPortSelectClick={handleOutputPorts}
      />,
    )

    const inputRail = screen.getByTestId('juce-grid-signal-rail-input')
    const outputRail = screen.getByTestId('juce-grid-signal-rail-output')
    const pluginCard = screen.getByTestId('juce-grid-signal-plugin-card-0')

    expect(inputRail.compareDocumentPosition(pluginCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(pluginCard.compareDocumentPosition(outputRail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    expect(within(inputRail).getByText('AVB IN')).toBeTruthy()
    expect(within(outputRail).getByText('AVB OUT')).toBeTruthy()
    expect(within(inputRail).getByText('LOCAL')).toBeTruthy()
    expect(within(inputRail).getByText('AVB')).toBeTruthy()
    expect(within(inputRail).getByLabelText('AVB warning')).toBeTruthy()
    expect(within(outputRail).queryByLabelText('AVB warning')).toBeNull()
    expect(within(inputRail).getAllByText('2 in')).toHaveLength(2)
    expect(within(outputRail).getAllByText('2 out')).toHaveLength(2)

    expect(inputRail.getAttribute('title')).toContain('Default ALSA Output (currently PipeWire Media Server)')
    expect(inputRail.getAttribute('title')).toContain('Stage Rack Input')
    expect(inputRail.getAttribute('title')).toContain('missing')
    expect(outputRail.getAttribute('title')).toContain('Main Room Listener')

    const pluginTitle = within(pluginCard).getByText('Studio Compressor')

    expect(pluginTitle).toBeTruthy()
    expect(pluginTitle.getAttribute('title')).toBe('Studio Compressor')
    expect(within(pluginCard).getByTestId('juce-grid-signal-plugin-actions-0')).toBeTruthy()
    expect(within(pluginCard).getByRole('button', { name: 'Actions for Studio Compressor' })).toBeTruthy()
    expect(within(pluginCard).getByTestId('juce-grid-signal-plugin-metrics-0')).toBeTruthy()
    expect(within(pluginCard).getByTestId('juce-grid-signal-plugin-levels-0')).toBeTruthy()
    expect(within(pluginCard).getByText('CPU')).toBeTruthy()
    expect(within(pluginCard).getByText('12.4%')).toBeTruthy()
    expect(within(pluginCard).getByText('Latency')).toBeTruthy()
    expect(within(pluginCard).getByText('2.0 ms')).toBeTruthy()
    expect(within(pluginCard).getByText('Sidechain')).toBeTruthy()
    expect(within(pluginCard).getByText('Ready')).toBeTruthy()
    expect(within(pluginCard).getByText('Automation')).toBeTruthy()
    expect(within(pluginCard).getByText('Armed')).toBeTruthy()

    fireEvent.click(pluginCard)

    expect(handlePluginSelect).toHaveBeenCalledWith(pluginUri)

    fireEvent.click(screen.getByRole('button', { name: 'Configure input routing' }))
    fireEvent.click(screen.getByRole('button', { name: 'Configure output routing' }))

    expect(handleInputPorts).toHaveBeenCalledTimes(1)
    expect(handleOutputPorts).toHaveBeenCalledTimes(1)
  })
})
