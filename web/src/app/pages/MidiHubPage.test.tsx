import React from 'react'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const mockNodePageContext = {
  localNode: {
    node_id: 'MANAGEMENT-NODE-1',
    hostname: 'MAP2-TESTBED',
    display_label: null,
    role: 'all_in_one' as const,
  },
  topology: {
    nodes: [
      {
        node_id: 'MANAGEMENT-NODE-1',
        hostname: 'MAP2-TESTBED',
        display_label: null,
        role: 'all_in_one' as const,
        status: 'ok' as const,
        cpu_percent: 10,
        memory_percent: 20,
        xrun_count: 0,
        audio_latency_ms: 1.1,
        services: { backend: true, juce_engine: true, pipewire: true },
        last_seen: '2026-03-15T10:00:00Z',
        is_local: true,
        is_viewed: true,
      },
    ],
    audio_edges: [],
    network_edges: [],
  },
  viewedNodeId: 'MANAGEMENT-NODE-1',
}

const mockMidiHubApi = {
  listPresetsForNode: jest.fn(async () => ({
    presets: [
      { preset_id: 'baseline', name: 'Baseline', description: 'Known good', created_at: 0, updated_at: 0, conditions: {} },
      { preset_id: 'show-a', name: 'Show A', description: 'Performance scene', created_at: 0, updated_at: 0, conditions: {} },
    ],
    default: { default_preset_id: 'baseline' },
  })),
  getStatusForNode: jest.fn(async () => ({
    ports: [
      { port_id: 'usb-in', name: 'USB In', direction: 'input', kind: 'usb' },
      { port_id: 'din-out', name: 'DIN Out', direction: 'output', kind: 'din' },
    ],
  })),
  getRoutesForNode: jest.fn(async () => ({
    routes: [
      {
        route_id: 'route-1',
        source_port: 'usb-in',
        destination_ports: ['din-out'],
        enabled: true,
        priority: 100,
        route_type: 'pass_through',
        filter: { message_types: [], channels: [] },
        transform_chain: [],
        latency_compensation_enabled: false,
        destination_latency_ms: 0,
      },
    ],
    match_mode: 'all',
  })),
  getClockStatusForNode: jest.fn(async () => ({
    running: true,
    bpm: 120,
    output_ports: ['din-out'],
    source_mode: 'internal',
    divider: 1,
    multiplier: 1,
    offset_ms: 0,
    song_position: 32,
  })),
  listNetworkSessionsForNode: jest.fn(async () => ({
    count: 1,
    sessions: [{ session_id: 'session-1', name: 'Studio RTP' }],
  })),
}

jest.mock('../../map2/api', () => ({
  midiHubApi: mockMidiHubApi,
}))

jest.mock('../hooks/useNodePageContext', () => ({
  useNodePageContext: () => mockNodePageContext,
}))

jest.mock('../theme', () => ({
  useTheme: () => ({
    theme: { carbonTheme: 'g100' },
    themeId: 'default',
    setTheme: jest.fn(),
    themes: {},
  }),
}))

jest.mock('../components/MidiHub/MidiRoutingMatrix', () => ({
  MidiRoutingMatrix: () => <div>Routing Matrix Mock</div>,
}))

jest.mock('../components/MidiHub/MidiPatchbay', () => ({
  MidiPatchbay: () => <div>Patchbay Mock</div>,
}))

jest.mock('../components/MidiHub/MidiTrafficMonitor', () => ({
  MidiTrafficMonitor: () => <div>Traffic Monitor Mock</div>,
}))

jest.mock('../components/MidiHub/MidiHubPresetManager', () => ({
  MidiHubPresetManager: () => <div>Preset Manager Mock</div>,
}))

jest.mock('../components/MidiHub/MidiScriptEditor', () => ({
  MidiScriptEditor: () => <div>Script Editor Mock</div>,
}))

jest.mock('../components/MidiHub/MidiClockPanel', () => ({
  MidiClockPanel: () => <div>Clock Panel Mock</div>,
}))

jest.mock('../components/MidiHub/MidiNetworkPanel', () => ({
  MidiNetworkPanel: () => <div>Network Panel Mock</div>,
}))

jest.mock('../components/MidiHub/Midi2Panel', () => ({
  Midi2Panel: () => <div>MIDI 2 Panel Mock</div>,
}))

jest.mock('../components/MidiHub/MidiMacroPanel', () => ({
  MidiMacroPanel: () => <div>Macro Panel Mock</div>,
}))

jest.mock('../components/MidiHub/MidiRecorderPanel', () => ({
  MidiRecorderPanel: () => <div>Recorder Panel Mock</div>,
}))

jest.mock('../components/MidiHub/MidiSchedulerPanel', () => ({
  MidiSchedulerPanel: () => <div>Scheduler Panel Mock</div>,
}))

jest.mock('../components/MidiHub/MidiInnovationPanel', () => ({
  MidiInnovationPanel: () => <div>Innovation Panel Mock</div>,
}))

jest.mock('../components/MidiHub/MidiHubHelpPrimitives', () => ({
  MidiHubPanelShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  MidiHubSurface: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}))

jest.mock('../components/MidiHub/MidiHubQuickRouter', () => ({
  MidiHubQuickRouter: () => <div>Quick Router Mock</div>,
}))

const { MidiHubShell } = jest.requireActual('./MidiHubShell') as typeof import('./MidiHubShell')
const { MidiHubConnectionsPage } =
  jest.requireActual('./midi-hub/MidiHubConnectionsPage') as typeof import('./midi-hub/MidiHubConnectionsPage')
const { MidiHubPresetsPage } =
  jest.requireActual('./midi-hub/MidiHubPresetsPage') as typeof import('./midi-hub/MidiHubPresetsPage')

function renderShell(initialEntry = '/midi-hub/connections') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[initialEntry]}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Routes>
          <Route path="/midi-hub/*" element={<MidiHubShell />}>
            <Route path="connections" element={<MidiHubConnectionsPage />} />
            <Route path="presets" element={<MidiHubPresetsPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('MidiHubShell', () => {
  beforeEach(() => {
    Object.values(mockMidiHubApi).forEach((value) => {
      if (typeof value === 'function' && 'mockReset' in value) {
        ;(value as jest.Mock).mockReset()
      }
    })

    mockMidiHubApi.listPresetsForNode.mockResolvedValue({
      presets: [
        { preset_id: 'baseline', name: 'Baseline', description: 'Known good', created_at: 0, updated_at: 0, conditions: {} },
        { preset_id: 'show-a', name: 'Show A', description: 'Performance scene', created_at: 0, updated_at: 0, conditions: {} },
      ],
      default: { default_preset_id: 'baseline' },
    })
    mockMidiHubApi.getStatusForNode.mockResolvedValue({
      ports: [
        { port_id: 'usb-in', name: 'USB In', direction: 'input', kind: 'usb' },
        { port_id: 'din-out', name: 'DIN Out', direction: 'output', kind: 'din' },
      ],
    })
    mockMidiHubApi.getRoutesForNode.mockResolvedValue({
      routes: [
        {
          route_id: 'route-1',
          source_port: 'usb-in',
          destination_ports: ['din-out'],
          enabled: true,
          priority: 100,
          route_type: 'pass_through',
          filter: { message_types: [], channels: [] },
          transform_chain: [],
          latency_compensation_enabled: false,
          destination_latency_ms: 0,
        },
      ],
      match_mode: 'all',
    })
    mockMidiHubApi.getClockStatusForNode.mockResolvedValue({
      running: true,
      bpm: 120,
      output_ports: ['din-out'],
      source_mode: 'internal',
      divider: 1,
      multiplier: 1,
      offset_ms: 0,
      song_position: 32,
    })
    mockMidiHubApi.listNetworkSessionsForNode.mockResolvedValue({
      count: 1,
      sessions: [{ session_id: 'session-1', name: 'Studio RTP' }],
    })

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
    window.localStorage.clear()
  })

  it('renders the routed shell and connections area', async () => {
    renderShell()

    expect(await screen.findByText('MAP2 MIDI Hub')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Connections' })).toBeTruthy()
    expect(screen.getByText('Routing Matrix Mock')).toBeTruthy()
    expect(screen.getByText('Traffic Monitor Mock')).toBeTruthy()
    expect(screen.getByText('Quick Router Mock')).toBeTruthy()
  })

  it('deep-links into the presets area', async () => {
    renderShell('/midi-hub/presets')

    await screen.findByText('Presets & Recall')
    expect(screen.getByText('Preset Manager Mock')).toBeTruthy()
    expect(screen.getByText('Clock Panel Mock')).toBeTruthy()
    expect(screen.getByText('Recorder Panel Mock')).toBeTruthy()
  })
})
