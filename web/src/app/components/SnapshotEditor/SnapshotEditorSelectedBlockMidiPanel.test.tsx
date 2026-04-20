import '@testing-library/jest-dom'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'

import { midiApiV2 } from '../../../map2/api'
import type { ChainPlugin, MIDIMappingV2, Plugin } from '../../../map2/types'
import { JuceGridSelectedBlockMidiPanel } from './SnapshotEditorSelectedBlockMidiPanel'

jest.mock('../../../map2/api', () => ({
  midiApiV2: {
    getMappings: jest.fn(),
    createMapping: jest.fn(),
    updateMapping: jest.fn(),
    deleteMapping: jest.fn(),
    testMappingFeedback: jest.fn(),
  },
}))

jest.mock('../Toasts', () => ({
  useToasts: () => ({
    pushToast: jest.fn(),
  }),
}))

const mockGetMappings = midiApiV2.getMappings as jest.Mock

const plugin: ChainPlugin = {
  uri: 'plugin://drive',
  name: 'Drive',
  position: 0,
  bypassed: false,
  parameters: {
    gain: 0.75,
    mix: 0.5,
  },
}

const meta: Plugin = {
  uri: 'plugin://drive',
  name: 'Drive',
  author: 'MAP2',
  category: 'Drive',
  class_label: 'Drive',
  version: '1.0.0',
  license: 'AGPL-3.0-only',
  has_ui: false,
  in_ports: 2,
  out_ports: 2,
  parameters: [
    {
      index: 0,
      name: 'Gain',
      symbol: 'gain',
      min: 0,
      max: 1,
      default: 0.5,
      is_toggled: false,
      is_log: false,
    },
    {
      index: 1,
      name: 'Mix',
      symbol: 'mix',
      min: 0,
      max: 1,
      default: 0.5,
      is_toggled: false,
      is_log: false,
    },
  ],
}

const mappings: MIDIMappingV2[] = [
  {
    id: 7,
    channel: 1,
    cc: 11,
    chain_id: 101,
    target_plugin_uri: 'plugin://drive',
    target_param_index: 0,
    target_param_symbol: 'gain',
    min_val: 0,
    max_val: 1,
    curve_type: 'linear',
    invert: false,
    feedback_enabled: true,
    feedback_cc: null,
    name: 'Drive - Gain',
    group_id: null,
    is_learned: false,
    is_enabled: true,
  },
]

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <JuceGridSelectedBlockMidiPanel
        plugin={plugin}
        meta={meta}
        chainId={101}
        lastMidiEvent={{ cc: 74, channel: 2, value: 96 }}
        midiLearnInProgress={false}
        midiLearnTarget={null}
        onStartLearn={jest.fn()}
        onStopLearn={jest.fn()}
      />
    </QueryClientProvider>,
  )
}

describe('JuceGridSelectedBlockMidiPanel', () => {
  beforeEach(() => {
    mockGetMappings.mockResolvedValue({ mappings, count: mappings.length })
  })

  it('renders the schematic MIDI map readout for selected block mappings', async () => {
    const { container } = renderPanel()

    expect(screen.getByText('Selected block MIDI')).toBeInTheDocument()
    expect(await screen.findByLabelText('MIDI map: 1/2 mapped')).toBeInTheDocument()
    expect(container.querySelector('.juce-grid-page__selected-midi-grid-row.is-mapped')).toHaveTextContent('Gain')
  })
})
