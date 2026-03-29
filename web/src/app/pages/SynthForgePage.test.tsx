import '@testing-library/jest-dom'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { SynthForgePage } from './SynthForgePage'

const mockNavigate = jest.fn()
const mockListSoundfonts = jest.fn()
const mockGetPresets = jest.fn()
const mockGetParts = jest.fn()
const mockGetVoices = jest.fn()
const mockGetSfzStatus = jest.fn()
const mockGetPerformance = jest.fn()
const mockGetPatches = jest.fn()
const mockSynthForgeCard = jest.fn()

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

jest.mock('@/app/components/PageHeader', () => ({
  PageHeader: ({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
      {actions}
    </header>
  ),
}))

jest.mock('@/app/components/PluginCards/Layouts/InstrumentCategoryLayout', () => ({
  InstrumentCategoryLayout: ({ plugin, visualization, transport, performanceParams, extraContent }: any) => (
    <section aria-label={`${plugin.name} instrument shell`}>
      <div>{visualization}</div>
      <div>{transport}</div>
      <div>{performanceParams?.map((param: any) => <span key={param.label}>{param.label}</span>)}</div>
      <div>{extraContent}</div>
    </section>
  ),
}))

jest.mock('@/app/components/ParameterControl', () => ({
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

jest.mock('@/app/components/PluginCards/Custom/JUCE/SynthForgeCard', () => ({
  SynthForgeCard: (props: any) => {
    mockSynthForgeCard(props)
    return <div data-testid="synthforge-card" />
  },
}))

jest.mock('@/app/components/PluginCards/Base/CarbonParameterSection', () => ({
  CarbonParameterSection: ({ title, children }: any) => (
    <section aria-label={title}>
      <h4>{title}</h4>
      {children}
    </section>
  ),
}))

jest.mock('@/app/components/PluginCards/withMidiDialog', () => ({
  withMidiDialog: (Component: React.ComponentType<any>) => Component,
}))

jest.mock('@/map2/hooks/useWebSocket', () => ({
  useWebSocketConnection: jest.fn(),
  useWebSocketTopic: jest.fn(),
}))

jest.mock('@carbon/react', () => {
  const React = jest.requireActual('react')
  const TabsContext = React.createContext<{ onChange?: (payload: { selectedIndex: number }) => void } | null>(null)

  function Tabs({ onChange, children }: { onChange?: (payload: { selectedIndex: number }) => void; children: React.ReactNode }) {
    return (
      <TabsContext.Provider value={{ onChange }}>
        <div>{children}</div>
      </TabsContext.Provider>
    )
  }

  function TabList({ children, 'aria-label': ariaLabel }: { children: React.ReactNode; 'aria-label'?: string }) {
    return <div role="tablist" aria-label={ariaLabel}>{children}</div>
  }

  function Tab({ children }: { children: React.ReactNode }) {
    const context = React.useContext(TabsContext)
    return (
      <button
        role="tab"
        onClick={(event) => {
          const parent = event.currentTarget.parentElement
          const siblingTabs = parent ? Array.from(parent.querySelectorAll('[role="tab"]')) : []
          const index = siblingTabs.indexOf(event.currentTarget)
          context?.onChange?.({ selectedIndex: index })
        }}
      >
        {children}
      </button>
    )
  }

  return {
    Button: ({ children, renderIcon: Icon, ...props }: any) => (
      <button {...props}>{Icon ? <Icon /> : null}{children}</button>
    ),
    InlineLoading: ({ description }: { description?: string }) => <div>{description}</div>,
    Tab,
    TabList,
    Tabs,
    Tag: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  }
})

jest.mock('@/map2/api', () => ({
  soundfontApi: {
    listSoundfonts: (...args: any[]) => mockListSoundfonts(...args),
    getPresets: (...args: any[]) => mockGetPresets(...args),
  },
  synthforgeApi: {
    getParts: () => mockGetParts(),
    getVoices: () => mockGetVoices(),
    getSfzStatus: (...args: any[]) => mockGetSfzStatus(...args),
    getPerformance: (...args: any[]) => mockGetPerformance(...args),
    getPatches: () => mockGetPatches(),
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
    setPartConfig: jest.fn(async () => ({ status: 'ok', part_index: 0 })),
    loadSoundFont: jest.fn(async () => ({ status: 'ok', part_index: 0 })),
    loadSfz: jest.fn(async () => ({ status: 'ok', part_index: 0 })),
    setPerformance: jest.fn(async () => ({ status: 'ok', part_index: 0 })),
    loadPatch: jest.fn(async () => ({ status: 'ok', part_index: 0 })),
    savePatch: jest.fn(async () => ({ status: 'ok', part_index: 0 })),
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
}

function renderPage() {
  return render(
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <SynthForgePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SynthForgePage', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockSynthForgeCard.mockReset()
    mockListSoundfonts.mockReset()
    mockGetPresets.mockReset()
    mockGetParts.mockReset()
    mockGetVoices.mockReset()
    mockGetSfzStatus.mockReset()
    mockGetPerformance.mockReset()
    mockGetPatches.mockReset()
    primeApi()
  })

  it('renders the standalone SynthForge workspace with a grid breadcrumb and full card mode', async () => {
    renderPage()

    expect(screen.getAllByRole('heading', { name: 'SynthForge' })[0]).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /back to audio grid/i })).toBeInTheDocument()
    expect(screen.getByTestId('synthforge-card')).toBeInTheDocument()
    expect(mockSynthForgeCard.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ compact: false }))

    fireEvent.click(screen.getByRole('button', { name: /back to audio grid/i }))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/juce-grid'))
  })
})
