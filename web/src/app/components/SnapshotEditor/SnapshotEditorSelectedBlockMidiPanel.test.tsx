import '@testing-library/jest-dom'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'

import type { MidiBindingRead } from '../../../map2/clients/midiBindings'
import { midiBindingsApi } from '../../../map2/clients/midiBindings'
import type { ChainPlugin, Plugin } from '../../../map2/types'
import { JuceGridSelectedBlockMidiPanel } from './SnapshotEditorSelectedBlockMidiPanel'

jest.mock('../../../map2/clients/midiBindings', () => {
  const actual = jest.requireActual('../../../map2/clients/midiBindings')
  return {
    ...actual,
    midiBindingsApi: {
      list: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  }
})

jest.mock('../Toasts', () => ({
  useToasts: () => ({
    pushToast: jest.fn(),
  }),
}))

const mockList = midiBindingsApi.list as jest.Mock
const mockCreate = midiBindingsApi.create as jest.Mock
const mockUpdate = midiBindingsApi.update as jest.Mock
const mockDelete = midiBindingsApi.delete as jest.Mock

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

// Canonical-shape binding produced by the plugin_param projection.
// `source_descriptor` / `target_descriptor` mirror what
// `canonicalToPanelMapping` reads.
const gainBinding: MidiBindingRead = {
  binding_id: 'b-gain-uuid',
  consumer_type: 'plugin_param',
  consumer_id: '101:plugin://drive:0',
  consumer_label: 'Drive - Gain',
  source_type: 'midi_cc',
  source_descriptor: {
    cc: 11,
    channel: 1,
    min: 0,
    max: 1,
    curve: 'linear',
    invert: false,
    feedback_enabled: true,
    feedback_cc: null,
  },
  target_type: 'engine_param',
  target_descriptor: {
    chain_id: 101,
    plugin_uri: 'plugin://drive',
    param_index: 0,
    parameter_symbol: 'gain',
  },
  device_id: null,
  scope: 'snapshot',
  scope_id: '42',
  enabled: true,
  source: 'snapshot-editor',
  metadata: {},
  created_at: '2026-05-10T00:00:00Z',
  created_by: 'snapshot-editor',
  modified_at: '2026-05-10T00:00:00Z',
  modified_by: 'snapshot-editor',
}

function renderPanel(overrides?: { activeSnapshotId?: number | null }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const activeSnapshotId = overrides && 'activeSnapshotId' in overrides
    ? overrides.activeSnapshotId ?? null
    : 42

  return render(
    <QueryClientProvider client={queryClient}>
      <JuceGridSelectedBlockMidiPanel
        plugin={plugin}
        meta={meta}
        chainId={101}
        activeSnapshotId={activeSnapshotId}
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
    mockList.mockReset()
    mockCreate.mockReset()
    mockUpdate.mockReset()
    mockDelete.mockReset()
    mockList.mockResolvedValue([gainBinding])
    mockCreate.mockResolvedValue(gainBinding)
    mockUpdate.mockResolvedValue(gainBinding)
    mockDelete.mockResolvedValue(undefined)
  })

  it('skips the read when no snapshot is active', async () => {
    renderPanel({ activeSnapshotId: null })
    await new Promise((r) => setTimeout(r, 50))
    // With activeSnapshotId=null the query is disabled, and the
    // queryFn's early return prevents `midiBindingsApi.list` from
    // being invoked. The mock must not see a call with scope_id from
    // a previous test render either; assert no call matches.
    if (mockList.mock.calls.length > 0) {
      // Surface what the (unexpected) call looked like for debug.
      throw new Error(`mockList unexpectedly called: ${JSON.stringify(mockList.mock.calls)}`)
    }
  })

  it('reads canonical bindings scoped to the active snapshot', async () => {
    renderPanel()
    expect(await screen.findByLabelText('MIDI map: 1/2 mapped')).toBeInTheDocument()
    expect(mockList).toHaveBeenCalledWith({
      consumer_type: 'plugin_param',
      scope: 'snapshot',
      scope_id: '42',
    })
  })

  it('renders the canonical mapping summary in the grid for the gain param', async () => {
    const { container } = renderPanel()
    expect(screen.getByText('Selected block MIDI')).toBeInTheDocument()
    expect(await screen.findByLabelText('MIDI map: 1/2 mapped')).toBeInTheDocument()
    expect(container.querySelector('.juce-grid-page__selected-midi-grid-row.is-mapped'))
      .toHaveTextContent('Gain')
  })

  it('saves an update through the canonical authority for an existing binding', async () => {
    renderPanel()
    // Wait for the mapping to render so selectedMapping resolves.
    await screen.findByLabelText('MIDI map: 1/2 mapped')

    const saveButton = screen.getByRole('button', { name: /Save mapping/i })
    fireEvent.click(saveButton)

    // mutate runs async, but the call is synchronous from the button.
    await new Promise((r) => setTimeout(r, 0))

    expect(mockUpdate).toHaveBeenCalledTimes(1)
    const [bindingId, patch] = mockUpdate.mock.calls[0]
    expect(bindingId).toBe('b-gain-uuid')
    expect(patch).toMatchObject({
      consumer_label: 'Drive - Gain',
      scope: 'snapshot',
      scope_id: '42',
      enabled: true,
      source: 'snapshot-editor',
      modified_by: 'snapshot-editor',
    })
    expect(patch.source_descriptor).toMatchObject({ cc: 11, channel: 1 })
    expect(patch.target_descriptor).toMatchObject({
      chain_id: 101,
      plugin_uri: 'plugin://drive',
      param_index: 0,
      parameter_symbol: 'gain',
    })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('creates a new canonical binding for an unmapped param', async () => {
    renderPanel()
    await screen.findByLabelText('MIDI map: 1/2 mapped')

    // Switch to the unmapped Mix param row.
    const mixRow = screen.getByText('Mix').closest('button')
    expect(mixRow).not.toBeNull()
    fireEvent.click(mixRow!)

    // Wait for the draft to settle and the create button to be visible.
    const createButton = await screen.findByRole('button', { name: /Create mapping/i })

    // The CC must be a valid integer before the create path runs;
    // the draft prefills from lastMidiEvent (cc=74), so it's already valid.
    fireEvent.click(createButton)
    await new Promise((r) => setTimeout(r, 0))

    expect(mockCreate).toHaveBeenCalledTimes(1)
    const payload = mockCreate.mock.calls[0][0]
    expect(payload).toMatchObject({
      consumer_type: 'plugin_param',
      consumer_id: '101:plugin://drive:1',
      consumer_label: 'Drive - Mix',
      source_type: 'midi_cc',
      target_type: 'engine_param',
      scope: 'snapshot',
      scope_id: '42',
      enabled: true,
      source: 'snapshot-editor',
      created_by: 'snapshot-editor',
    })
    expect(payload.source_descriptor).toMatchObject({ cc: 74, channel: 2 })
    expect(payload.target_descriptor).toMatchObject({
      chain_id: 101,
      plugin_uri: 'plugin://drive',
      param_index: 1,
      parameter_symbol: 'mix',
    })
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('deletes through the canonical authority using the binding_id', async () => {
    renderPanel()
    await screen.findByLabelText('MIDI map: 1/2 mapped')

    const removeButton = screen.getByRole('button', { name: /Remove/i })
    fireEvent.click(removeButton)
    await new Promise((r) => setTimeout(r, 0))

    expect(mockDelete).toHaveBeenCalledTimes(1)
    expect(mockDelete).toHaveBeenCalledWith('b-gain-uuid')
  })
})
