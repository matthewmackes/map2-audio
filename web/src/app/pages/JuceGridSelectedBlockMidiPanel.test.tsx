import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { ChainPlugin, Plugin, MIDIMappingV2 } from '../../map2/types'

const mockPushToast = jest.fn()

const mockMidiApiV2 = {
  getMappings: jest.fn(),
  createMapping: jest.fn(),
  updateMapping: jest.fn(),
  deleteMapping: jest.fn(),
  testMappingFeedback: jest.fn(),
}

jest.mock('../../map2/api', () => ({
  midiApiV2: mockMidiApiV2,
}))

jest.mock('../components/Toasts', () => ({
  useToasts: () => ({ pushToast: mockPushToast }),
}))

const { JuceGridSelectedBlockMidiPanel } =
  require('./JuceGridSelectedBlockMidiPanel') as typeof import('./JuceGridSelectedBlockMidiPanel')

function renderPanel(overrides: {
  plugin?: ChainPlugin
  meta?: Plugin
  mappings?: MIDIMappingV2[]
  chainId?: number | null
  lastMidiEvent?: { cc: number; channel: number; value: number } | null
  onStartLearn?: (parameter: Plugin['parameters'][number]) => void
  onStopLearn?: () => void
} = {}) {
  const plugin: ChainPlugin = overrides.plugin ?? {
    uri: 'map2://juce/modulation/chorus',
    name: 'Chorus',
    position: 0,
    bypassed: false,
    parameters: {
      depth: 0.42,
      mix: 0.58,
    },
  }

  const meta: Plugin = overrides.meta ?? {
    uri: 'map2://juce/modulation/chorus',
    name: 'Chorus',
    author: 'MAP2 Audio',
    category: 'Modulation',
    class_label: 'Effect',
    version: '1.0.0',
    license: 'AGPL-3.0-only',
    has_ui: false,
    in_ports: 2,
    out_ports: 2,
    format: 'JUCE',
    parameters: [
      { index: 0, name: 'Depth', symbol: 'depth', min: 0, max: 1, default: 0.5, is_toggled: false, is_log: false },
      { index: 1, name: 'Mix', symbol: 'mix', min: 0, max: 1, default: 0.5, is_toggled: false, is_log: false },
    ],
  }

  mockMidiApiV2.getMappings.mockResolvedValue({
    mappings: overrides.mappings ?? [],
    count: (overrides.mappings ?? []).length,
  })
  mockMidiApiV2.createMapping.mockResolvedValue({ mapping: {}, message: 'created' })
  mockMidiApiV2.updateMapping.mockResolvedValue({ mapping: {}, message: 'updated' })
  mockMidiApiV2.deleteMapping.mockResolvedValue({ success: true, message: 'deleted' })
  mockMidiApiV2.testMappingFeedback.mockResolvedValue({
    mapping_id: 77,
    channel: 4,
    cc: 21,
    normalized_value: 1,
    cc_value: 127,
    source: 'manual',
    message: 'sent',
  })

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <JuceGridSelectedBlockMidiPanel
        plugin={plugin}
        meta={meta}
        chainId={overrides.chainId ?? 12}
        lastMidiEvent={overrides.lastMidiEvent ?? { cc: 21, channel: 4, value: 111 }}
        midiLearnInProgress={false}
        midiLearnTarget={null}
        onStartLearn={overrides.onStartLearn ?? jest.fn()}
        onStopLearn={overrides.onStopLearn ?? jest.fn()}
      />
    </QueryClientProvider>,
  )
}

describe('JuceGridSelectedBlockMidiPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('creates a per-chain mapping with same-CC feedback defaults', async () => {
    renderPanel()

    await waitFor(() => {
      expect(mockMidiApiV2.getMappings).toHaveBeenCalledWith({ plugin_uri: 'map2://juce/modulation/chorus' })
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Create mapping' }))

    await waitFor(() => {
      expect(mockMidiApiV2.createMapping).toHaveBeenCalledWith(expect.objectContaining({
        cc: 21,
        channel: 4,
        chain_id: 12,
        target_plugin_uri: 'map2://juce/modulation/chorus',
        target_param_index: 0,
        target_param_symbol: 'depth',
        feedback_enabled: true,
        feedback_cc: null,
      }))
    })
  })

  it('sends a real toe-position feedback test for the selected mapping', async () => {
    renderPanel({
      mappings: [
        {
          id: 77,
          channel: 4,
          cc: 21,
          chain_id: 12,
          target_plugin_uri: 'map2://juce/modulation/chorus',
          target_param_index: 0,
          target_param_symbol: 'depth',
          min_val: 0,
          max_val: 1,
          curve_type: 'linear',
          invert: false,
          feedback_enabled: true,
          feedback_cc: null,
          name: 'Chorus - Depth',
          group_id: null,
          is_learned: true,
          is_enabled: true,
        },
      ],
    })

    await waitFor(() => {
      expect(mockMidiApiV2.getMappings).toHaveBeenCalled()
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Toe' }))

    await waitFor(() => {
      expect(mockMidiApiV2.testMappingFeedback).toHaveBeenCalledWith(77, { normalized_value: 1 })
    })
  })
})
