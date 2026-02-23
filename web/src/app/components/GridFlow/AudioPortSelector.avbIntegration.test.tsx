import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AudioPortSelector } from './AudioPortSelector'
import { audioApi } from '../../../map2/api'

jest.mock('../../../map2/api', () => ({
  audioApi: {
    getPorts: jest.fn(),
    getRouting: jest.fn(),
    getChainRouting: jest.fn(),
    getPortPresets: jest.fn(),
    setRouting: jest.fn(),
    setChainRouting: jest.fn(),
    clearChainRouting: jest.fn(),
  },
}))

const mockAudioApi = audioApi as unknown as {
  getPorts: jest.Mock
  getRouting: jest.Mock
  getChainRouting: jest.Mock
  getPortPresets: jest.Mock
  setRouting: jest.Mock
  setChainRouting: jest.Mock
  clearChainRouting: jest.Mock
}

function renderSelector() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <AudioPortSelector open onClose={jest.fn()} />
    </QueryClientProvider>
  )
}

describe('AudioPortSelector AVB integration', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockAudioApi.getChainRouting.mockResolvedValue({
      available: true,
      chain_id: 1,
      input_ports: [0, 1],
      output_ports: [0, 1],
      input_avb_endpoints: [],
      output_avb_endpoints: [],
      input_bindings: [],
      output_bindings: [],
      is_override: false,
    })
    mockAudioApi.clearChainRouting.mockResolvedValue({
      success: true,
      chain_id: 1,
      message: 'ok',
      input_ports: [0, 1],
      output_ports: [0, 1],
      input_avb_endpoints: [],
      output_avb_endpoints: [],
      input_bindings: [],
      output_bindings: [],
      is_override: false,
    })
    mockAudioApi.getPortPresets.mockResolvedValue({ presets: [], current: { input_ports: [0, 1], output_ports: [0, 1], input_avb_endpoints: [], output_avb_endpoints: [] } })
    mockAudioApi.setChainRouting.mockResolvedValue({
      success: true,
      chain_id: 1,
      message: 'ok',
      input_ports: [0, 1],
      output_ports: [0, 1],
      input_avb_endpoints: [],
      output_avb_endpoints: [],
      input_bindings: [],
      output_bindings: [],
      is_override: true,
    })
    mockAudioApi.setRouting.mockResolvedValue({
      success: true,
      message: 'ok',
      input_ports: [0, 1],
      output_ports: [0, 1],
      input_avb_endpoints: [],
      output_avb_endpoints: [],
      input_bindings: [],
      output_bindings: [],
      is_override: false,
    })
  })

  it('submits AVB talker endpoint selections in global routing payload', async () => {
    mockAudioApi.getPorts.mockResolvedValue({
      available: true,
      device: 'Test Interface',
      inputs: [
        { index: 0, name: 'In 1', type: 'input' },
        { index: 1, name: 'In 2', type: 'input' },
      ],
      outputs: [
        { index: 0, name: 'Out 1', type: 'output' },
        { index: 1, name: 'Out 2', type: 'output' },
      ],
      input_count: 2,
      output_count: 2,
      avb_readiness: { state: 'operational' },
      avb_talkers: [
        {
          endpoint_id: 'node-a:talker-1',
          device_name: 'Stage Talker',
          direction: 'talker',
          host: 'node-a.local',
          channels: 2,
          sample_rate: 48000,
          available: true,
        },
      ],
      avb_listeners: [],
    })
    mockAudioApi.getRouting.mockResolvedValue({
      available: true,
      input_ports: [0, 1],
      output_ports: [0, 1],
      input_avb_endpoints: [],
      output_avb_endpoints: [],
      input_bindings: [],
      output_bindings: [],
      is_override: false,
    })

    renderSelector()

    await screen.findByText('Stage Talker')
    fireEvent.click(screen.getByText('Stage Talker'))
    fireEvent.click(screen.getByText('Apply'))

    await waitFor(() => {
      expect(mockAudioApi.setRouting).toHaveBeenCalledWith({
        inputPorts: [0, 1],
        outputPorts: [0, 1],
        inputAvbEndpoints: ['node-a:talker-1'],
        outputAvbEndpoints: [],
      })
    })
  })

  it('shows graceful no-AVB state when no endpoints are discovered', async () => {
    mockAudioApi.getPorts.mockResolvedValue({
      available: true,
      device: 'Test Interface',
      inputs: [{ index: 0, name: 'In 1', type: 'input' }],
      outputs: [{ index: 0, name: 'Out 1', type: 'output' }],
      input_count: 1,
      output_count: 1,
      avb_readiness: { state: 'disabled' },
      avb_talkers: [],
      avb_listeners: [],
    })
    mockAudioApi.getRouting.mockResolvedValue({
      available: true,
      input_ports: [0],
      output_ports: [0],
      input_avb_endpoints: [],
      output_avb_endpoints: [],
      input_bindings: [],
      output_bindings: [],
      is_override: false,
    })

    renderSelector()

    await screen.findByText('No AVB talker endpoints discovered')
    expect(screen.getByText('No AVB talker endpoints discovered')).toBeTruthy()
  })
})
