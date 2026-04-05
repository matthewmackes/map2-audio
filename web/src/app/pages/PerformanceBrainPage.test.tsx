import '@testing-library/jest-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import { PerformanceBrainPage } from './PerformanceBrainPage'

const mockGetState = jest.fn()
const mockUpdateState = jest.fn()
const mockGetTransport = jest.fn()
const mockSetTransport = jest.fn()
const mockGetSlots = jest.fn()
const mockGetLayers = jest.fn()
const mockGetSequence = jest.fn()
const mockGetMixer = jest.fn()
const mockGetInputs = jest.fn()
const mockGetLibrary = jest.fn()
const mockGetDiagnostics = jest.fn()
const mockImportFromDrums = jest.fn()
const mockImportFromSynthForge = jest.fn()

jest.mock('@/app/components/PageHeader', () => ({
  PageHeader: ({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
      {actions}
    </header>
  ),
}))

jest.mock('@carbon/react', () => ({
  Button: ({ children, onClick, renderIcon: _renderIcon, ...props }: any) => <button onClick={onClick} {...props}>{children}</button>,
  InlineLoading: ({ description }: { description?: string }) => <div>{description}</div>,
  InlineNotification: ({ title, subtitle }: { title: string; subtitle?: string }) => <div>{title}{subtitle ? ` ${subtitle}` : ''}</div>,
  Tag: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Tile: ({ children, className }: { children: React.ReactNode; className?: string }) => <section className={className}>{children}</section>,
}))

jest.mock('@/map2/api', () => ({
  brainApi: {
    getState: (...args: any[]) => mockGetState(...args),
    updateState: (...args: any[]) => mockUpdateState(...args),
    getTransport: (...args: any[]) => mockGetTransport(...args),
    setTransport: (...args: any[]) => mockSetTransport(...args),
    getSlots: (...args: any[]) => mockGetSlots(...args),
    getLayers: (...args: any[]) => mockGetLayers(...args),
    getSequence: (...args: any[]) => mockGetSequence(...args),
    getMixer: (...args: any[]) => mockGetMixer(...args),
    getInputs: (...args: any[]) => mockGetInputs(...args),
    getLibrary: (...args: any[]) => mockGetLibrary(...args),
    getDiagnostics: (...args: any[]) => mockGetDiagnostics(...args),
    importFromDrums: (...args: any[]) => mockImportFromDrums(...args),
    importFromSynthForge: (...args: any[]) => mockImportFromSynthForge(...args),
    updateSlot: jest.fn(async () => ({})),
  },
}))

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

function makeState(activeSection = 'overview') {
  return {
    instance_id: 'workspace-default',
    product_name: 'Performance Brain',
    set_name: 'Stage Brain',
    active_slot: 0,
    active_layer_id: 'main-stack',
    active_section: activeSection,
    transport: {
      is_playing: false,
      bpm: 124,
      swing: 10,
      pattern: 3,
      variation: 1,
      step: 0,
      bar: 1,
      beat: 1,
      pending_pattern: -1,
      switch_quantization_beats: 4,
    },
    slots: [],
    layers: [],
    sequence: {},
    song: { entries: [], loop: false },
    mixer: { buses: [], master: { master_volume: 0.82, drive_db: 0, compressor_amount: 0.2, reverb_mix: 0.2, limiter_ceiling_db: -0.5 } },
    inputs: { keyboard_zones: [], trigger_profiles: [], controller_assignments: [] },
    library: { collections: [], featured_assets: [], last_scan_iso: '' },
    sample_editor: { slot_id: 0, asset_path: '', waveform_available: false, duration_seconds: 0, start_sample: 0, end_sample: 0, normalize_target: 0.99, reverse_enabled: true, record_target_path: '' },
    diagnostics: { sample_rate_hz: 48000, buffer_size_samples: 128, cpu_load_percent: 7.5, active_voices: 4, peak_voices: 12, polyphony_headroom: 84, trigger_latency_ms: 2.1, roundtrip_latency_ms: 5.2, xruns: 0, backend_mode: 'hybrid', warnings: [], last_import_source: null, updated_at_iso: '2026-04-05T13:30:00Z' },
    snapshot_integration: { authority_model: 'snapshot-first', snapshot_id: null, snapshot_name: null, committed_state_id: 'brain:committed', desired_state_id: 'brain:desired', observed_state_id: 'brain:observed' },
  }
}

function primeApi({ activeSection = 'overview' }: { activeSection?: string } = {}) {
  mockGetState.mockResolvedValue(makeState(activeSection))
  mockUpdateState.mockResolvedValue(makeState('sequence'))
  mockGetTransport.mockResolvedValue({
    is_playing: false,
    bpm: 124,
    swing: 10,
    pattern: 3,
    variation: 1,
    step: 0,
    bar: 1,
    beat: 1,
    pending_pattern: -1,
    switch_quantization_beats: 4,
  })
  mockGetSlots.mockResolvedValue([
    { slot_id: 0, name: 'Kick', mode: 'drum', asset_type: 'kit', asset_path: '', source_label: 'Arena Kit', level: 1, pan: 0, mute: false, solo: false, tune: 0, transpose: 0, output_bus: 0, polyphony: 8, midi_channel: 0, trigger_note: 36, trigger_notes: [36], key_low: 36, key_high: 36, velocity_low: 1, velocity_high: 127, choke_group: 0, articulation_group: 'trigger', velocity_curve: 'dynamic', status: 'ready' },
    { slot_id: 1, name: 'Snare', mode: 'drum', asset_type: 'kit', asset_path: '', source_label: 'Arena Kit', level: 1, pan: 0, mute: false, solo: false, tune: 0, transpose: 0, output_bus: 1, polyphony: 8, midi_channel: 0, trigger_note: 38, trigger_notes: [38], key_low: 38, key_high: 38, velocity_low: 1, velocity_high: 127, choke_group: 0, articulation_group: 'trigger', velocity_curve: 'dynamic', status: 'ready' },
  ])
  mockGetLayers.mockResolvedValue({
    active_layer_id: 'main-stack',
    layers: [{ layer_id: 'main-stack', name: 'Main Stack', slot_indices: [0, 1], key_low: 36, key_high: 96, velocity_low: 1, velocity_high: 127, polyphony: 32, scene_slot: 0, enabled: true, purpose: 'keys' }],
  })
  mockGetSequence.mockResolvedValue({
    pattern_bank_size: 128,
    max_steps: 64,
    current_pattern: 3,
    current_variation: 1,
    patterns: [{ pattern_id: 3, name: 'Pattern 4', length: 16, active_lane_count: 2, fill_enabled: false, variation_count: 10, summary: 'Main groove' }],
    lanes: [{ slot_id: 0, name: 'Kick', length: 16, swing: 0, active_steps: 4, step_lock_targets: ['volume'] }],
    fill_mode: 'manual+auto',
    song_entry_count: 1,
  })
  mockGetMixer.mockResolvedValue({
    buses: [{ bus_id: 0, name: 'Bus 1', level: 1, pan: 0, mute: false, solo: false, output_pair: 0, reverb_send: 0 }],
    master: { master_volume: 0.82, drive_db: 0, compressor_amount: 0.2, reverb_mix: 0.2, limiter_ceiling_db: -0.5 },
  })
  mockGetInputs.mockResolvedValue({
    keyboard_zones: [{ zone_id: 'lower', name: 'Lower', midi_channel: 1, key_low: 36, key_high: 72, transpose: 0, enabled: true, aftertouch_mode: 'channel' }],
    trigger_profiles: [{ profile_id: 'pads-a', name: 'Pads A', pad_range_start: 0, pad_range_end: 7, curve: 'dynamic', scan_time_ms: 1.1, mask_time_ms: 7, retrigger_cancel_ms: 18, crosstalk_guard: 0.3, velocity_floor: 1, velocity_ceiling: 127 }],
    controller_assignments: [{ source: 'modwheel', target: 'layer:main-stack:blend', mode: 'absolute', enabled: true }],
  })
  mockGetLibrary.mockResolvedValue({
    collections: [{ collection_id: 'kits', label: 'Drum Kits', asset_count: 1, assets: [{ asset_id: 'kit:arena', name: 'Arena Kit', asset_type: 'kit', source: 'factory', path: '/kits/arena', description: 'Arena', default_slot_mode: 'drum', tags: ['kit'] }] }],
    featured_assets: ['kit:arena'],
    last_scan_iso: '2026-04-05T13:30:00Z',
  })
  mockGetDiagnostics.mockResolvedValue({
    sample_rate_hz: 48000,
    buffer_size_samples: 128,
    cpu_load_percent: 7.5,
    active_voices: 4,
    peak_voices: 12,
    polyphony_headroom: 84,
    trigger_latency_ms: 2.1,
    roundtrip_latency_ms: 5.2,
    xruns: 0,
    backend_mode: 'hybrid',
    warnings: [],
    last_import_source: null,
    updated_at_iso: '2026-04-05T13:30:00Z',
  })
  mockImportFromDrums.mockResolvedValue(makeState())
  mockImportFromSynthForge.mockResolvedValue(makeState())
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>
}

function renderPage(initialEntry = '/brain') {
  return render(
    <MemoryRouter
      initialEntries={[initialEntry]}
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <QueryClientProvider client={makeClient()}>
        <Routes>
          <Route
            path="/brain"
            element={(
              <>
                <PerformanceBrainPage />
                <LocationProbe />
              </>
            )}
          />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('PerformanceBrainPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    primeApi()
  })

  it('preserves scoped route state when switching sections through the rail', async () => {
    renderPage('/brain?instance_id=42&plugin_position=9&section=diagnostics')

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Performance Brain' })).toBeInTheDocument())
    await waitFor(() => expect(mockGetState).toHaveBeenCalledWith({ instanceId: 42, pluginPosition: 9 }))
    expect(screen.getByText('Realtime metrics')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Diagnostics$/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/brain?instance_id=42&plugin_position=9&section=diagnostics')

    fireEvent.click(screen.getByRole('button', { name: /Sequence$/ }))

    await waitFor(() => expect(mockUpdateState).toHaveBeenCalledWith({ active_section: 'sequence' }, { instanceId: 42, pluginPosition: 9 }))
    await waitFor(() => expect(screen.getByTestId('location-probe')).toHaveTextContent('/brain?instance_id=42&plugin_position=9&section=sequence'))
    expect(screen.getByRole('button', { name: /Sequence$/ })).toHaveAttribute('aria-current', 'page')
  })

  it('normalizes the section query param from backend state when the route is missing it', async () => {
    primeApi({ activeSection: 'layers' })

    renderPage('/brain?instance_id=7&plugin_position=2')

    await waitFor(() => expect(screen.getByText('Layer map')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByTestId('location-probe')).toHaveTextContent('/brain?instance_id=7&plugin_position=2&section=layers'))
    expect(screen.getByRole('button', { name: /Layers$/ })).toHaveAttribute('aria-current', 'page')
    expect(mockUpdateState).not.toHaveBeenCalled()
  })

  it('runs the drum importer from the overview section', async () => {
    renderPage('/brain')

    await waitFor(() => expect(screen.getByText('Import Drum Machine')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Import Drum Machine'))

    await waitFor(() => expect(mockImportFromDrums).toHaveBeenCalled())
  })

  it('auto-runs a scoped drum handoff import and clears the handoff flag from the route', async () => {
    renderPage('/brain?instance_id=42&plugin_position=9&section=overview&import_source=drums')

    await waitFor(() => expect(mockImportFromDrums).toHaveBeenCalledWith({ instanceId: 42, pluginPosition: 9 }))
    await waitFor(() => expect(screen.getByTestId('location-probe')).toHaveTextContent('/brain?instance_id=42&plugin_position=9&section=overview'))
    expect(screen.getByTestId('location-probe')).not.toHaveTextContent('import_source')
    expect(mockImportFromSynthForge).not.toHaveBeenCalled()
  })

  it('auto-runs a scoped SynthForge handoff import while preserving the selected section', async () => {
    renderPage('/brain?instance_id=7&plugin_position=2&section=library&import_source=synthforge')

    await waitFor(() => expect(mockImportFromSynthForge).toHaveBeenCalledWith({ instanceId: 7, pluginPosition: 2 }))
    await waitFor(() => expect(screen.getByTestId('location-probe')).toHaveTextContent('/brain?instance_id=7&plugin_position=2&section=library'))
    expect(screen.getByTestId('location-probe')).not.toHaveTextContent('import_source')
    expect(mockImportFromDrums).not.toHaveBeenCalled()
  })
})
