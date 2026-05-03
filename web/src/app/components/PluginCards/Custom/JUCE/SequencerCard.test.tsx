import '@testing-library/jest-dom'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { SequencerCard } from './SequencerCard'

const mockGetState = jest.fn()
const mockGetTransport = jest.fn()
const mockGetMixer = jest.fn()
const mockSetTransport = jest.fn()
const mockSetMixer = jest.fn()
const mockUpdateSlot = jest.fn()
const mockTopicHandlers = new Map<string, (data: any, message: any) => void>()

jest.mock('../../Base/PluginCardShell', () => ({
  PluginCardShell: ({ plugin, visualization, children, footer, onLaunch }: any) => (
    <section aria-label={`${plugin.name} shell`}>
      {onLaunch ? <button onClick={onLaunch}>Open Full Editor</button> : null}
      <div>{visualization}</div>
      <div>{children}</div>
      <footer>{footer}</footer>
    </section>
  ),
}))

jest.mock('../../withMidiDialog', () => ({
  withMidiDialog: (Component: React.ComponentType<any>) => Component,
}))

jest.mock('../../../ParameterControl', () => ({
  NumberInput: ({ label, ariaLabel, value, onChange }: any) => (
    <label>
      <span>{label}</span>
      <input
        aria-label={ariaLabel ?? label}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  ),
  ParameterKnob: ({ label, ariaLabel, value, onChange }: any) => (
    <label>
      <span>{label}</span>
      <input
        type="number"
        aria-label={ariaLabel ?? label}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  ),
}))

jest.mock('@/map2/api', () => ({
  sequencerApi: {
    getState: (...args: any[]) => mockGetState(...args),
    getTransport: (...args: any[]) => mockGetTransport(...args),
    getMixer: (...args: any[]) => mockGetMixer(...args),
    setTransport: (...args: any[]) => mockSetTransport(...args),
    setMixer: (...args: any[]) => mockSetMixer(...args),
    updateSlot: (...args: any[]) => mockUpdateSlot(...args),
  },
}))

jest.mock('@/map2/hooks/useWebSocket', () => ({
  useWebSocketTopic: (topic: string, handler: (data: any, message: any) => void) => {
    mockTopicHandlers.set(topic, handler)
  },
}))

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })
}

function makePlugin() {
  return {
    uri: 'map2://juce/sequencer',
    name: 'Sequencer',
    author: 'MAP2',
    category: 'Instrument',
    class_label: 'Instrument',
    version: '1.0',
    license: 'AGPL-3.0-only',
    has_ui: false,
    in_ports: 0,
    out_ports: 2,
    parameters: [],
    instance_id: 17,
  }
}

function makeRuntimeState(overrides: Record<string, any> = {}) {
  return {
    instance_id: 'instance-17__position-3',
    product_name: 'Sequencer',
    set_name: 'Stage Brain',
    active_slot: 0,
    active_layer_id: 'main-stack',
    active_section: 'perform',
    transport: {
      is_playing: true,
      bpm: 128,
      swing: 10,
      pattern: 6,
      variation: 2,
      step: 0,
      bar: 1,
      beat: 1,
      pending_pattern: -1,
      switch_quantization_beats: 4,
    },
    slots: [
      { slot_id: 0, name: 'Kick', mode: 'drum', level: 0.76 },
    ],
    layers: [],
    sequence: { pattern_bank_size: 128, max_steps: 64, current_pattern: 6, current_variation: 2, patterns: [], lanes: [], fill_mode: 'manual+auto', song_entry_count: 0 },
    song: { entries: [], loop: false },
    mixer: {
      buses: [],
      master: { master_volume: 0.9, drive_db: 0, compressor_amount: 0.2, reverb_mix: 0.2, limiter_ceiling_db: -0.5 },
    },
    inputs: { keyboard_zones: [], trigger_profiles: [], controller_assignments: [] },
    library: { collections: [], featured_assets: [], last_scan_iso: '' },
    sample_editor: { slot_id: 0, asset_path: '', waveform_available: false, duration_seconds: 0, start_sample: 0, end_sample: 0, normalize_target: 0.99, reverse_enabled: true, record_target_path: '' },
    diagnostics: {
      sample_rate_hz: 48000,
      buffer_size_samples: 128,
      cpu_load_percent: 8.5,
      active_voices: 4,
      peak_voices: 12,
      polyphony_headroom: 84,
      trigger_latency_ms: 2.1,
      roundtrip_latency_ms: 5.2,
      xruns: 0,
      backend_mode: 'hybrid',
      warnings: [],
      last_import_source: null,
      controller_qualification: {
        scoped_instance_key: 'workspace-default',
        scope_binding_ready: true,
        tier_a_runtime_locked: true,
        controller_ready: true,
        ready_surface_count: 4,
        keyboard: {
          ready: true,
          zone_count: 1,
          channel_count: 1,
          chromatic_slot_count: 1,
          polyphony_capacity: 48,
          max_key_span: 37,
          aftertouch_modes: ['channel'],
          summary: '1 zones · 1 melodic slots · poly 48',
          issues: [],
        },
        triggers: {
          ready: true,
          profile_count: 1,
          covered_pad_count: 8,
          trigger_slot_count: 1,
          unique_trigger_notes: 1,
          fastest_scan_time_ms: 1.1,
          widest_mask_time_ms: 7,
          summary: '1 profiles · 8 pads · 1 trigger notes',
          issues: [],
        },
        sequence: {
          ready: true,
          pattern_count: 1,
          populated_pattern_count: 1,
          active_lane_count: 1,
          max_pattern_length: 16,
          swing_lane_count: 0,
          song_entry_count: 0,
          summary: '1 patterns · 1 populated · 0 song entries',
          issues: [],
        },
        routing: {
          ready: true,
          used_bus_count: 2,
          output_pair_count: 2,
          reverb_bus_count: 0,
          controller_assignment_count: 1,
          summary: '2 buses · 2 outputs · 1 assignments',
          issues: [],
        },
        summary: '4/4 surfaces ready · Tier A locked',
        issues: [],
      },
      updated_at_iso: '2026-04-05T18:02:00Z',
    },
    snapshot_integration: { authority_model: 'snapshot-first', snapshot_id: null, snapshot_name: null, committed_state_id: 'brain:committed', desired_state_id: 'brain:desired', observed_state_id: 'brain:observed' },
    ...overrides,
  }
}

function primeApi() {
  mockGetState.mockResolvedValue(makeRuntimeState())
  mockGetTransport.mockResolvedValue({
    is_playing: true,
    bpm: 128,
    pattern: 6,
    variation: 2,
  })
  mockGetMixer.mockResolvedValue({
    buses: [],
    master: { master_volume: 0.9, drive_db: 0, compressor_amount: 0.2, reverb_mix: 0.2, limiter_ceiling_db: -0.5 },
  })
  mockSetTransport.mockImplementation(async (patch: Record<string, unknown>) => ({
    is_playing: typeof patch.is_playing === 'boolean' ? patch.is_playing : true,
    bpm: typeof patch.bpm === 'number' ? patch.bpm : 128,
    pattern: typeof patch.pattern === 'number' ? patch.pattern : 6,
    variation: 2,
  }))
  mockSetMixer.mockImplementation(async (nextMixer: unknown) => nextMixer)
  mockUpdateSlot.mockResolvedValue({ slot_id: 0, name: 'Kick', mode: 'drum', level: 0.65 })
}

describe('SequencerCard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockTopicHandlers.clear()
    window.history.replaceState({}, '', '/')
    primeApi()
  })

  it('renders the compact transport and focused-slot summary', async () => {
    render(
      <QueryClientProvider client={makeClient()}>
        <SequencerCard
          plugin={makePlugin()}
          pluginPosition={3}
          parameterValues={{}}
          onParameterChange={jest.fn()}
          accentColor="#0f62fe"
        />
      </QueryClientProvider>,
    )

    await waitFor(() => expect(screen.getByLabelText('Focused slot summary')).toHaveTextContent('1: Kick'))

    expect(screen.getByLabelText('Master')).toBeInTheDocument()
    expect(screen.getByLabelText('Active slot level')).toBeInTheDocument()
    expect(screen.getByLabelText('Sequencer BPM')).toBeInTheDocument()
    expect(screen.getByLabelText('Sequencer pattern')).toBeInTheDocument()
  })

  it('toggles transport from the compact card and updates the scoped button state', async () => {
    render(
      <QueryClientProvider client={makeClient()}>
        <SequencerCard
          plugin={makePlugin()}
          pluginPosition={3}
          parameterValues={{}}
          onParameterChange={jest.fn()}
          accentColor="#0f62fe"
        />
      </QueryClientProvider>,
    )

    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop Sequencer transport' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Stop Sequencer transport' }))

    await waitFor(() =>
      expect(mockSetTransport).toHaveBeenCalledWith({ is_playing: false }, { instanceId: 17, pluginPosition: 3 }),
    )
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start Sequencer transport' })).toBeInTheDocument())
  })

  it('renders quick mix controls and updates pattern state with the scoped Brain runtime identity', async () => {
    render(
      <QueryClientProvider client={makeClient()}>
        <SequencerCard
          plugin={makePlugin()}
          pluginPosition={3}
          parameterValues={{}}
          onParameterChange={jest.fn()}
          accentColor="#0f62fe"
        />
      </QueryClientProvider>,
    )

    await waitFor(() => expect(screen.getByLabelText('Active slot level')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Sequencer pattern'), { target: { value: '8' } })

    await waitFor(() =>
      expect(mockSetTransport).toHaveBeenCalledWith({ pattern: 7 }, { instanceId: 17, pluginPosition: 3 }),
    )
  })

  it('launches the full Sequencer workspace with instance scope', async () => {
    render(
      <QueryClientProvider client={makeClient()}>
        <SequencerCard
          plugin={makePlugin()}
          pluginPosition={3}
          parameterValues={{}}
          onParameterChange={jest.fn()}
          accentColor="#0f62fe"
        />
      </QueryClientProvider>,
    )

    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Full Editor' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Open Full Editor' }))

    expect(window.location.pathname).toBe('/sequencer')
    expect(window.location.search).toBe('?instance_id=17&plugin_position=3')
  })

  it('applies scoped brain runtime websocket updates without waiting for another fetch', async () => {
    render(
      <QueryClientProvider client={makeClient()}>
        <SequencerCard
          plugin={makePlugin()}
          pluginPosition={3}
          parameterValues={{}}
          onParameterChange={jest.fn()}
          accentColor="#0f62fe"
        />
      </QueryClientProvider>,
    )

    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop Sequencer transport' })).toBeInTheDocument())

    mockTopicHandlers.get('sequencer:runtime')?.(
      {
        resource: 'transport',
        scope: {
          runtime_instance_id: 'instance-17__position-3',
          instance_id: '17',
          plugin_position: 3,
        },
        state: makeRuntimeState({
          set_name: 'Runtime Synced',
          transport: {
            is_playing: false,
            bpm: 132,
            swing: 10,
            pattern: 8,
            variation: 4,
            step: 0,
            bar: 1,
            beat: 1,
            pending_pattern: -1,
            switch_quantization_beats: 4,
          },
        }),
      },
      { type: 'brain_runtime_update', topic: 'sequencer:runtime' },
    )

    await waitFor(() => expect(screen.getByRole('button', { name: 'Start Sequencer transport' })).toBeInTheDocument())
    expect(screen.getByText('Runtime Synced')).toBeInTheDocument()
    expect(screen.getByLabelText('Sequencer BPM')).toHaveValue('132')
    expect(screen.getByLabelText('Sequencer pattern')).toHaveValue('9')
  })
})
