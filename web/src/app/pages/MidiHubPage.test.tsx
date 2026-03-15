import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockPushToast = jest.fn()
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
    song_position: 0,
  })),
  listNetworkSessionsForNode: jest.fn(async () => ({
    count: 1,
    sessions: [{ session_id: 'session-1', name: 'Studio RTP' }],
  })),
  getMidi2StatusForNode: jest.fn(async () => ({
    enabled: true,
    default_protocol: 'ump',
    device_count: 1,
    devices: [{ device_id: 'm2-1', name: 'UMP Bridge' }],
  })),
  recallPresetForNode: jest.fn(async () => ({ ok: true })),
}

jest.mock('../../map2/api', () => ({
  midiHubApi: mockMidiHubApi,
}))

jest.mock('../components/Toasts', () => ({
  useToasts: () => ({ pushToast: mockPushToast }),
}))

jest.mock('../hooks/useNodePageContext', () => ({
  useNodePageContext: () => mockNodePageContext,
}))

jest.mock('../components/NodeContextBanner/NodeContextBanner', () => ({
  NodeContextBanner: () => <div data-testid="node-context-banner" />,
}))

jest.mock('../components/NodeContextPicker/NodeContextPicker', () => ({
  NodeContextPicker: () => <div data-testid="node-context-picker" />,
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

jest.mock('../components/MidiHub/MidiHubWorkbenchCards', () => ({
  readPorts: (raw: unknown) => (Array.isArray(raw) ? raw : []),
  MidiHubQuickRouterCard: () => <div>Quick Router Mock</div>,
  MidiHubFilterPlannerCard: () => <div>Filter Planner Mock</div>,
  MidiHubMapperPlannerCard: () => <div>Mapper Planner Mock</div>,
}))

const { MidiHubPage } = require('./MidiHubPage') as typeof import('./MidiHubPage')

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MidiHubPage />
    </QueryClientProvider>,
  )
}

describe('MidiHubPage', () => {
  beforeEach(() => {
    mockPushToast.mockReset()
    mockNodePageContext.localNode = {
      node_id: 'MANAGEMENT-NODE-1',
      hostname: 'MAP2-TESTBED',
      display_label: null,
      role: 'all_in_one',
    }
    mockNodePageContext.topology = {
      nodes: [
        {
          node_id: 'MANAGEMENT-NODE-1',
          hostname: 'MAP2-TESTBED',
          display_label: null,
          role: 'all_in_one',
          status: 'ok',
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
    }
    mockNodePageContext.viewedNodeId = 'MANAGEMENT-NODE-1'
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
      song_position: 0,
    })
    mockMidiHubApi.listNetworkSessionsForNode.mockResolvedValue({
      count: 1,
      sessions: [{ session_id: 'session-1', name: 'Studio RTP' }],
    })
    mockMidiHubApi.getMidi2StatusForNode.mockResolvedValue({
      enabled: true,
      default_protocol: 'ump',
      device_count: 1,
      devices: [{ device_id: 'm2-1', name: 'UMP Bridge' }],
    })
    mockMidiHubApi.recallPresetForNode.mockResolvedValue({ ok: true })
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

  it('renders the cleaned MIDI Hub shell', async () => {
    renderPage()

    await screen.findByRole('heading', { name: 'MIDI Hub' })
    expect(screen.getByText('Routing Matrix Mock')).toBeTruthy()
    expect(screen.getByText('Quick Router Mock')).toBeTruthy()
    expect(screen.queryByText(/wizard and guided flows/i)).toBeNull()
  })

  it('shows live status tags from the API', async () => {
    renderPage()

    expect(await screen.findByText('Ports 2')).toBeTruthy()
    expect(screen.getByText('Routes 1')).toBeTruthy()
    expect(screen.getByText('Presets 2')).toBeTruthy()
    expect(screen.getByText('Clock live')).toBeTruthy()
    expect(screen.getByText('Sessions 1')).toBeTruthy()
    expect(screen.getByText('MIDI 2.0 devices 1')).toBeTruthy()
  })

  it('switches through all four workbench tabs', async () => {
    renderPage()

    await screen.findByText('Routing Matrix Mock')

    fireEvent.click(screen.getByRole('tab', { name: /Filters & Automation/i }))
    expect(await screen.findByText('Filter Planner Mock')).toBeTruthy()
    expect(screen.getByText('Mapper Planner Mock')).toBeTruthy()
    expect(screen.getByText('Script Editor Mock')).toBeTruthy()
    expect(screen.getByText('Macro Panel Mock')).toBeTruthy()
    expect(screen.getByText('Scheduler Panel Mock')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: /Clock & Diagnostics/i }))
    expect(await screen.findByText('Clock Panel Mock')).toBeTruthy()
    expect(screen.getByText('Traffic Monitor Mock')).toBeTruthy()
    expect(screen.getByText('Recorder Panel Mock')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: /MIDI 2\.0 & Labs/i }))
    expect(await screen.findByText('MIDI 2 Panel Mock')).toBeTruthy()
    expect(screen.getByText('Innovation Panel Mock')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: /Setup & Routing/i }))
    expect(await screen.findByText('Network Panel Mock')).toBeTruthy()
    expect(screen.getByText('Preset Manager Mock')).toBeTruthy()
  })

  it('recalls the selected preset from the header toolbar', async () => {
    renderPage()

    await screen.findByText('Presets 2')

    fireEvent.change(screen.getByLabelText('Quick preset recall'), {
      target: { value: 'baseline' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Recall preset' }))

    await waitFor(() => {
      expect(mockMidiHubApi.recallPresetForNode).toHaveBeenCalledWith('baseline', null)
    })
  })

  it('scopes top-level MIDI Hub queries to the viewed remote node', async () => {
    mockNodePageContext.topology = {
      nodes: [
        mockNodePageContext.topology.nodes[0],
        {
          node_id: 'AUDIO-NODE-2',
          hostname: 'MAP2-STAGE-R',
          display_label: 'Stage Right',
          role: 'audio_node',
          status: 'ok',
          cpu_percent: 18,
          memory_percent: 24,
          xrun_count: 0,
          audio_latency_ms: 1.7,
          services: { backend: true, juce_engine: true, pipewire: true },
          last_seen: '2026-03-15T10:00:00Z',
          is_local: false,
          is_viewed: true,
        },
      ],
      audio_edges: [],
      network_edges: [],
    }
    mockNodePageContext.viewedNodeId = 'AUDIO-NODE-2'

    renderPage()

    await screen.findByText('Presets 2')

    expect(mockMidiHubApi.listPresetsForNode).toHaveBeenCalledWith('AUDIO-NODE-2')
    expect(mockMidiHubApi.getStatusForNode).toHaveBeenCalledWith('AUDIO-NODE-2')
    expect(mockMidiHubApi.getRoutesForNode).toHaveBeenCalledWith('AUDIO-NODE-2')
    expect(mockMidiHubApi.getClockStatusForNode).toHaveBeenCalledWith('AUDIO-NODE-2')
    expect(mockMidiHubApi.listNetworkSessionsForNode).toHaveBeenCalledWith('AUDIO-NODE-2')
    expect(mockMidiHubApi.getMidi2StatusForNode).toHaveBeenCalledWith('AUDIO-NODE-2')
  })
})
