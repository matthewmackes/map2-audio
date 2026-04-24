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
const mockGetBackingTracks = jest.fn()
const mockGetBackingTrackTransport = jest.fn()
const mockSetBackingTrackTransport = jest.fn()
const mockGetDrumState = jest.fn()
const mockGetFactoryPacks = jest.fn()
const mockGetGeneratedPacks = jest.fn()
const mockUpdateDrumState = jest.fn()

jest.mock('@/app/layout/useSetShellWindow', () => ({
  useSetShellWindow: () => undefined,
}))

jest.mock('@/app/pages/brainViews/BrainOverviewShell', () => {
  const React = require('react')
  return {
    BrainOverviewShell: () =>
      React.createElement('div', { 'data-testid': 'brain-overview-shell' }, 'BrainOverviewShell'),
  }
})

jest.mock('@carbon/react', () => {
  const React = require('react')
  const TreeViewContext = React.createContext({ selected: [] as string[] })

  const Button = ({ children, onClick, renderIcon: _renderIcon, kind: _kind, size: _size, ...props }: any) => (
    <button onClick={onClick} {...props}>{children}</button>
  )
  const FeatureFlags = ({ children }: { children: React.ReactNode }) => <>{children}</>
  const InlineLoading = ({ description }: { description?: string }) => <div>{description}</div>
  const InlineNotification = ({ title, subtitle }: { title: string; subtitle?: string }) => <div>{title}{subtitle ? ` ${subtitle}` : ''}</div>
  const Layer = ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div>
  const Tag = ({ children }: { children: React.ReactNode }) => <span>{children}</span>
  const Tile = ({ children, className }: { children: React.ReactNode; className?: string }) => <section className={className}>{children}</section>
  const TreeView = Object.assign(
    ({ children, className, label, selected }: any) => (
      <TreeViewContext.Provider value={{ selected: Array.isArray(selected) ? selected : [] }}>
        <div className={className} aria-label={label}>{children}</div>
      </TreeViewContext.Provider>
    ),
    {
      TreeNode: ({ children, label, onSelect, id, className, 'aria-label': ariaLabel }: any) => {
        const { selected } = React.useContext(TreeViewContext)
        const isSelected = selected.includes(id)
        return (
          <div id={id} className={className} aria-label={ariaLabel}>
            <button type="button" onClick={onSelect} aria-current={isSelected ? 'page' : undefined}>
              {label}
            </button>
            {children}
          </div>
        )
      },
    },
  )

  return {
    Button,
    FeatureFlags,
    InlineLoading,
    InlineNotification,
    Layer,
    Tag,
    Tile,
    TreeView,
  }
})

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
  drumsApi: {
    getState: (...args: any[]) => mockGetDrumState(...args),
    updateState: (...args: any[]) => mockUpdateDrumState(...args),
    getBackingTracks: (...args: any[]) => mockGetBackingTracks(...args),
    getBackingTrackTransport: (...args: any[]) => mockGetBackingTrackTransport(...args),
    getFactoryPacks: (...args: any[]) => mockGetFactoryPacks(...args),
    getGeneratedPacks: (...args: any[]) => mockGetGeneratedPacks(...args),
    setBackingTrackTransport: (...args: any[]) => mockSetBackingTrackTransport(...args),
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

function makeControllerQualification(overrides: Record<string, any> = {}) {
  const base = {
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
      trigger_slot_count: 2,
      unique_trigger_notes: 2,
      fastest_scan_time_ms: 1.1,
      widest_mask_time_ms: 7,
      summary: '1 profiles · 8 pads · 2 trigger notes',
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
  }

  return {
    ...base,
    ...overrides,
    keyboard: { ...base.keyboard, ...(overrides.keyboard ?? {}) },
    triggers: { ...base.triggers, ...(overrides.triggers ?? {}) },
    sequence: { ...base.sequence, ...(overrides.sequence ?? {}) },
    routing: { ...base.routing, ...(overrides.routing ?? {}) },
  }
}

function makeDiagnostics(overrides: Record<string, any> = {}) {
  return {
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
    controller_qualification: makeControllerQualification(overrides.controller_qualification),
    updated_at_iso: '2026-04-05T13:30:00Z',
    ...overrides,
  }
}

function makeBackingTracks() {
  return [
    { track_id: 'arena-drive', name: 'Arena Drive', genre: 'Rock', key: 'E minor', tempo: 124, duration_seconds: 186, duration_label: '3:06' },
    { track_id: 'midnight-grid', name: 'Midnight Grid', genre: 'Electronic', key: 'D minor', tempo: 118, duration_seconds: 204, duration_label: '3:24' },
  ]
}

function makeBackingTrackTransport(overrides: Record<string, any> = {}) {
  return {
    track_id: 'arena-drive',
    track_name: 'Arena Drive',
    genre: 'Rock',
    key: 'E minor',
    tempo: 124,
    duration_seconds: 186,
    duration_label: '3:06',
    position_seconds: 12,
    position_label: '0:12',
    is_playing: false,
    loop_enabled: true,
    tempo_shift: 0,
    pitch_shift: 0,
    runtime_source: 'drum_machine_service',
    ...overrides,
  }
}

function makeDrumPracticeState(overrides: Record<string, any> = {}) {
  return {
    ui_mode: 'practice',
    bpm: 124,
    volume: 80,
    pattern: 3,
    variation: 1,
    transport: false,
    swing: 10,
    active_pack: 'factory-rock-pack',
    practice_style_id: 'rock_8',
    practice_variation: 4,
    practice_change_quantization: 2,
    practice_count_in_bars: 1,
    practice_auto_fill: false,
    midi_output_enabled: false,
    midi_clock_output_enabled: false,
    midi_output_channel: 9,
    program_change_enabled: false,
    track_swing: Array.from({ length: 16 }, () => 0),
    pad_sound_sources: Array.from({ length: 16 }, () => 'sample'),
    pad_synth_params: Array.from({ length: 16 }, () => ({ tone: 0 })),
    pad_filters: Array.from({ length: 16 }, () => ({ type: 'lowpass', cutoff_hz: 12000, resonance: 0.1, env_amount: 0, env_decay_ms: 100 })),
    pad_cv_gate_configs: Array.from({ length: 16 }, () => ({
      enabled: false,
      output_pair: 0,
      gate_length_ms: 10,
      note_min: 0,
      note_max: 127,
      pitch_min_volts: 0,
      pitch_max_volts: 5,
    })),
    ...overrides,
  }
}

function makePracticePacks() {
  return {
    factory: [
      { pack_id: 'factory-rock-pack', name: 'Factory Rock Pack', description: 'Straight rehearsal pack with counted intros.', source: 'factory', filename: 'factory-rock.json' },
    ],
    generated: [
      { pack_id: 'user-funk-pack', name: 'User Funk Pack', description: 'Syncopated coaching pack with tighter fills.', source: 'generated', filename: 'user-funk.json' },
    ],
  }
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
    diagnostics: makeDiagnostics(),
    snapshot_integration: { authority_model: 'snapshot-first', snapshot_id: null, snapshot_name: null, committed_state_id: 'brain:committed', desired_state_id: 'brain:desired', observed_state_id: 'brain:observed' },
  }
}

function primeApi({
  activeSection = 'overview',
  diagnosticsOverride,
}: {
  activeSection?: string
  diagnosticsOverride?: Record<string, any>
} = {}) {
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
  mockGetDiagnostics.mockResolvedValue(makeDiagnostics(diagnosticsOverride))
  mockImportFromDrums.mockResolvedValue(makeState())
  mockImportFromSynthForge.mockResolvedValue(makeState())
  mockGetBackingTracks.mockResolvedValue(makeBackingTracks())
  mockGetBackingTrackTransport.mockResolvedValue(makeBackingTrackTransport())
  mockSetBackingTrackTransport.mockResolvedValue(makeBackingTrackTransport())
  mockGetDrumState.mockResolvedValue(makeDrumPracticeState())
  mockGetFactoryPacks.mockResolvedValue(makePracticePacks().factory)
  mockGetGeneratedPacks.mockResolvedValue(makePracticePacks().generated)
  mockUpdateDrumState.mockResolvedValue(makeDrumPracticeState())
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

    await waitFor(() => expect(screen.getAllByRole('heading', { name: 'Performance Brain' }).length).toBeGreaterThan(0))
    await waitFor(() => expect(mockGetState).toHaveBeenCalledWith({ instanceId: 42, pluginPosition: 9 }))
    expect(screen.getByText('Realtime metrics')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Diagnostics/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/brain?instance_id=42&plugin_position=9&section=diagnostics')

    fireEvent.click(screen.getByRole('button', { name: /^Sequence/ }))

    await waitFor(() => expect(mockUpdateState).toHaveBeenCalledWith({ active_section: 'sequence' }, { instanceId: 42, pluginPosition: 9 }))
    await waitFor(() => expect(screen.getByTestId('location-probe')).toHaveTextContent('/brain?instance_id=42&plugin_position=9&section=sequence'))
    expect(screen.getByRole('button', { name: /^Sequence/ })).toHaveAttribute('aria-current', 'page')
  })

  it('normalizes the section query param from backend state when the route is missing it', async () => {
    primeApi({ activeSection: 'layers' })

    renderPage('/brain?instance_id=7&plugin_position=2')

    await waitFor(() => expect(screen.getByText('Layer map')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByTestId('location-probe')).toHaveTextContent('/brain?instance_id=7&plugin_position=2&section=layers'))
    expect(screen.getByRole('button', { name: /^Layers/ })).toHaveAttribute('aria-current', 'page')
    expect(mockUpdateState).not.toHaveBeenCalled()
  })

  it('runs the drum importer from the library section', async () => {
    renderPage('/brain?section=library')

    await waitFor(() => expect(screen.getByText('Import Drum Machine')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Import Drum Machine'))

    await waitFor(() => expect(mockImportFromDrums).toHaveBeenCalled())
  })

  it('renders the BrainOverviewShell on the overview section', async () => {
    renderPage('/brain?section=overview')

    await waitFor(() => expect(screen.getByTestId('brain-overview-shell')).toBeInTheDocument())
  })

  it('shows scoped qualification details on the inputs and diagnostics sections', async () => {
    primeApi({
      diagnosticsOverride: makeDiagnostics({
        warnings: ['Legacy MIDI clock remains routed externally.'],
        controller_qualification: makeControllerQualification({
          scoped_instance_key: 'instance-42__position-9',
          tier_a_runtime_locked: false,
          controller_ready: false,
          ready_surface_count: 2,
          keyboard: {
            ready: false,
            zone_count: 0,
            channel_count: 0,
            chromatic_slot_count: 0,
            polyphony_capacity: 0,
            max_key_span: 0,
            aftertouch_modes: [],
            summary: '0 zones · 0 melodic slots · poly 0',
            issues: ['No enabled keyboard zones configured.'],
          },
          triggers: {
            ready: false,
            profile_count: 0,
            covered_pad_count: 0,
            trigger_slot_count: 2,
            unique_trigger_notes: 2,
            fastest_scan_time_ms: 0,
            widest_mask_time_ms: 0,
            summary: '0 profiles · 0 pads · 2 trigger notes',
            issues: ['No trigger profiles configured.'],
          },
          summary: '2/4 surfaces ready · Tier A drift',
          issues: ['No enabled keyboard zones configured.', 'No trigger profiles configured.'],
        }),
      }),
    })

    renderPage('/brain?instance_id=42&plugin_position=9&section=inputs')

    await waitFor(() => expect(screen.getByText('Scoped controller qualification')).toBeInTheDocument())
    expect(screen.getAllByText('2/4 surfaces ready · Tier A drift').length).toBeGreaterThan(0)
    expect(
      screen.getByText((_content, element) => element?.textContent === 'Scope key · instance-42__position-9'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Diagnostics/ }))

    await waitFor(() => expect(screen.getByText('Controller qualification')).toBeInTheDocument())
    expect(screen.getByText('No enabled keyboard zones configured.')).toBeInTheDocument()
    expect(screen.getByText('Legacy MIDI clock remains routed externally.')).toBeInTheDocument()
  })

  it('renders session media as a backing-track adjunct and routes transport mutations', async () => {
    mockSetBackingTrackTransport
      .mockResolvedValueOnce(makeBackingTrackTransport({ is_playing: true }))
      .mockResolvedValueOnce(makeBackingTrackTransport({
        track_id: 'midnight-grid',
        track_name: 'Midnight Grid',
        genre: 'Electronic',
        key: 'D minor',
        tempo: 118,
        duration_seconds: 204,
        duration_label: '3:24',
      }))

    renderPage('/brain?section=session_media')

    await waitFor(() => expect(screen.getByText('Session media adjunct')).toBeInTheDocument())
    expect(screen.getByText(/Backing tracks stay outside the core Performance Brain transport/)).toBeInTheDocument()
    expect(screen.getAllByText('Arena Drive').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Play session media' }))
    await waitFor(() => expect(mockSetBackingTrackTransport).toHaveBeenCalledWith({ is_playing: true }))

    fireEvent.click(screen.getByRole('button', { name: 'Load Midnight Grid' }))
    await waitFor(() => expect(mockSetBackingTrackTransport).toHaveBeenCalledWith({
      track_id: 'midnight-grid',
      position_seconds: 0,
      is_playing: false,
    }))
  })

  it('renders practice coaching as an adjunct and routes rehearsal mutations through drum state', async () => {
    mockUpdateDrumState
      .mockResolvedValueOnce(makeDrumPracticeState({ practice_style_id: 'jazz_swing' }))
      .mockResolvedValueOnce(makeDrumPracticeState({ practice_count_in_bars: 3 }))
      .mockResolvedValueOnce(makeDrumPracticeState({ active_pack: 'user-funk-pack' }))

    renderPage('/brain?section=practice_coach')

    await waitFor(() => expect(screen.getByText('Practice and coaching adjunct')).toBeInTheDocument())
    expect(screen.getByText(/Practice packs and coaching cues stay outside the core Performance Brain transport/)).toBeInTheDocument()
    expect(screen.getAllByText('Factory Rock Pack').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Jazz Swing' }))
    await waitFor(() => expect(mockUpdateDrumState).toHaveBeenCalledWith({ practice_style_id: 'jazz_swing' }))

    fireEvent.change(screen.getByLabelText('Practice count-in bars'), { target: { value: '3' } })
    await waitFor(() => expect(mockUpdateDrumState).toHaveBeenCalledWith({ practice_count_in_bars: 3 }))

    fireEvent.click(screen.getByRole('button', { name: 'Load User Funk Pack' }))
    await waitFor(() => expect(mockUpdateDrumState).toHaveBeenCalledWith({ active_pack: 'user-funk-pack' }))
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
    await waitFor(() => expect(screen.getByTestId('location-probe')).not.toHaveTextContent('import_source'))
    expect(mockImportFromDrums).not.toHaveBeenCalled()
  })
})
