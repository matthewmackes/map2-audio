import '@testing-library/jest-dom'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { SynthForgeCard } from './SynthForgeCard'

const mockListSoundfonts = jest.fn()
const mockGetPresets = jest.fn()
const mockGetParts = jest.fn()
const mockGetVoices = jest.fn()
const mockGetSfzStatus = jest.fn()
const mockGetPerformance = jest.fn()
const mockLoadSoundFont = jest.fn()
const mockGetPatches = jest.fn()

jest.mock('../../Layouts/InstrumentCategoryLayout', () => ({
  InstrumentCategoryLayout: ({ plugin, visualization, transport, performanceParams, extraContent }: any) => (
    <section aria-label={`${plugin.name} instrument shell`}>
      <div>{visualization}</div>
      <div>{transport}</div>
      <div>{performanceParams?.map((param: any) => <span key={param.label}>{param.label}</span>)}</div>
      <div>{extraContent}</div>
    </section>
  ),
}))

jest.mock('../../../Controls/NumberInput', () => ({
  NumberInput: ({ label, value, onChange }: any) => (
    <label>
      {label}
      <input
        aria-label={label}
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  ),
}))

jest.mock('../../Base/CarbonParameterSection', () => ({
  CarbonParameterSection: ({ title, children }: any) => (
    <section aria-label={title}>
      <h4>{title}</h4>
      {children}
    </section>
  ),
}))

jest.mock('../../withMidiDialog', () => ({
  withMidiDialog: (Component: React.ComponentType<any>) => Component,
}))

jest.mock('../../../../../map2/hooks/useWebSocket', () => ({
  useWebSocketConnection: jest.fn(),
  useWebSocketTopic: jest.fn(),
}))

jest.mock('../../../../../map2/api', () => ({
  soundfontApi: {
    listSoundfonts: (...args: any[]) => mockListSoundfonts(...args),
    getPresets: (...args: any[]) => mockGetPresets(...args),
  },
  synthforgeApi: {
    getParts: () => mockGetParts(),
    getVoices: () => mockGetVoices(),
    getSfzStatus: (...args: any[]) => mockGetSfzStatus(...args),
    getPerformance: (...args: any[]) => mockGetPerformance(...args),
    loadSoundFont: (...args: any[]) => mockLoadSoundFont(...args),
    getPatches: () => mockGetPatches(),
    setPartConfig: jest.fn(async () => ({ status: 'ok', part_index: 0 })),
    loadSfz: jest.fn(async () => ({ status: 'ok', part_index: 0 })),
    setPerformance: jest.fn(async () => ({ status: 'ok', part_index: 0 })),
    loadPatch: jest.fn(async () => ({ status: 'ok', part_index: 0 })),
    savePatch: jest.fn(async () => ({ status: 'ok', part_index: 0 })),
    getPartAnalyzerFrame: jest.fn(async () => ({
      peak_left: 0.42,
      peak_right: 0.37,
      rms_left: 0.21,
      rms_right: 0.19,
      midi_events: 3,
      active_voices: 7,
    })),
    getPartBackendStatus: jest.fn(async () => ({
      backend: 'native',
      sfizz_available: true,
      sfizz_loaded: false,
      region_count: 14,
      group_count: 2,
      preloaded_samples: 128,
      unknown_opcodes: [],
      unsupported_opcodes: [],
    })),
    getStreamingConfig: jest.fn(async () => ({
      enabled: true,
      preload_size: 131072,
      max_voices: 64,
      interpolation: 'hermite',
      quality_live: 5,
      quality_freewheeling: 8,
      memory_limit_mb: 256,
    })),
    getHotReload: jest.fn(async () => ({
      enabled: false,
      interval_ms: 1000,
      pending_reload: false,
      reloaded: false,
      generation: 0,
      last_reload_iso: '',
      last_error: '',
    })),
    getScalaTuning: jest.fn(async () => ({
      enabled: false,
      scala_path: '',
      root_key: 60,
      reference_hz: 440,
    })),
    getMpeConfig: jest.fn(async () => ({
      enabled: false,
      lower_zone_channels: 0,
      upper_zone_channels: 0,
      pitch_bend_range_semitones: 48,
    })),
    getModMatrixRoutes: jest.fn(async () => []),
    getFreezeStatus: jest.fn(async () => ({
      freeze_enabled: false,
      frozen_signal_ready: false,
      freeze_samples: 0,
      render_path: '',
      last_error: '',
    })),
    setSamplerBackend: jest.fn(async () => ({ status: 'ok', part_index: 0 })),
    setStreamingConfig: jest.fn(async () => ({ status: 'ok', part_index: 0 })),
    setHotReload: jest.fn(async () => ({ status: 'ok', part_index: 0 })),
    reloadSfzIfChanged: jest.fn(async () => ({ status: 'ok', part_index: 0 })),
    loadScalaTuning: jest.fn(async () => ({ status: 'ok', part_index: 0 })),
    setMpeConfig: jest.fn(async () => ({ status: 'ok', part_index: 0 })),
    setModMatrixRoutes: jest.fn(async () => ({ status: 'ok', part_index: 0 })),
    setFreeze: jest.fn(async () => ({ status: 'ok', part_index: 0 })),
    renderPartToFile: jest.fn(async () => ({ status: 'ok', part_index: 0 })),
    noteOn: jest.fn(async () => ({ status: 'ok' })),
    noteOff: jest.fn(async () => ({ status: 'ok' })),
  },
}))

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  })
}

function makePlugin() {
  return {
    uri: 'map2://juce/synthforge',
    name: 'SynthForge',
    author: 'MAP2',
    category: 'Instrument',
    class_label: 'Instrument',
    version: '1.0',
    license: 'AGPL-3.0-only',
    has_ui: false,
    in_ports: 0,
    out_ports: 2,
    parameters: [],
  }
}

function primeApi() {
  mockGetParts.mockResolvedValue([
    { part_index: 0, midi_channel: 1, output_bus: 'main', level: 1, pan: 0, mute: false, solo: false },
    ...Array.from({ length: 15 }, (_, index) => ({
      part_index: index + 1,
      midi_channel: index + 2,
      output_bus: 'main',
      level: 1,
      pan: 0,
      mute: false,
      solo: false,
    })),
  ])
  mockGetVoices.mockResolvedValue({
    active_voices: 7,
    peak_voices: 11,
    voices_per_part: [7, ...Array(15).fill(0)],
    cpu_percent: 4.8,
  })
  mockGetSfzStatus.mockResolvedValue({
    loaded: true,
    sampler_mode: true,
    part_index: 0,
    region_count: 14,
    loaded_sample_count: 128,
    sfz_path: '',
    soundfont_path: '/factory/keys/grand.sf2',
    soundfont_format: 'sf2',
    active_bank: 0,
    active_program: 0,
    active_preset_name: 'Studio Grand',
    engine: 'native',
    engine_available: true,
    last_error: '',
    warnings: [],
  })
  mockGetPerformance.mockResolvedValue({
    master_transpose: 0,
    velocity_curve: 0,
    pitch_bend_range: 2,
    mono_mode: false,
    legato: false,
  })
  mockListSoundfonts.mockResolvedValue({
    soundfonts: [
      {
        name: 'Grand Collection',
        filename: 'grand.sf2',
        path: '/factory/keys/grand.sf2',
        format: 'sf2',
        category: 'Piano',
        library: 'Factory',
        size: 12345678,
        preset_count: 2,
      },
    ],
    total: 1,
    limit: 300,
    offset: 0,
  })
  mockGetPresets.mockResolvedValue({
    path: '/factory/keys/grand.sf2',
    presets: [
      { name: 'Studio Grand', bank: 0, program: 0, library: 0, genre: 0, morphology: 0 },
      { name: 'Bright Grand', bank: 0, program: 1, library: 0, genre: 0, morphology: 0 },
    ],
    total: 2,
  })
  mockGetPatches.mockResolvedValue([
    { bank: 0, program: 1, name: 'Warm Ballad', category: 'Piano', author: 'MAP2' },
  ])
  mockLoadSoundFont.mockResolvedValue({ status: 'ok', part_index: 0 })
}

function renderCard() {
  return render(
    <QueryClientProvider client={makeClient()}>
      <SynthForgeCard
        plugin={makePlugin()}
        parameterValues={{}}
        onParameterChange={jest.fn()}
        accentColor="#38d6c4"
      />
    </QueryClientProvider>,
  )
}

describe('SynthForgeCard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    })
    primeApi()
  })

  it('renders the workstation hero, tabs, and loads a selected preset', async () => {
    renderCard()

    await waitFor(() => expect(screen.getByText('Studio Grand')).toBeInTheDocument())

    expect(screen.getByText('SynthForge Workstation')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Rack' })).toBeInTheDocument()
    expect(screen.getByText('Stored Patches')).toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: /000 • Studio Grand/i }))
    fireEvent.click(screen.getByRole('button', { name: /Load Studio Grand/i }))

    await waitFor(() => expect(mockLoadSoundFont).toHaveBeenCalledWith(0, '/factory/keys/grand.sf2', 0, 0, 'Studio Grand'))

    fireEvent.click(screen.getByRole('tab', { name: 'Rack' }))
    expect(await screen.findByText('16-Part Rack')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Play' }))
    expect(await screen.findByText('Performance Keyboard')).toBeInTheDocument()
  })
})
