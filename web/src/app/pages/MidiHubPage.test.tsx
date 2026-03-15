import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockPushToast = jest.fn()

const mockMidiHubApi = {
  listPresets: jest.fn(async () => ({
    presets: [{ preset_id: 'baseline', name: 'Baseline', description: 'Known good', created_at: 0, updated_at: 0, conditions: {} }],
    default: { default_preset_id: 'baseline' },
  })),
  getStatus: jest.fn(async () => ({
    ports: [
      { port_id: 'usb-in', name: 'USB In', direction: 'input', kind: 'usb' },
      { port_id: 'din-out', name: 'DIN Out', direction: 'output', kind: 'din' },
    ],
  })),
  getRoutes: jest.fn(async () => ({ routes: [], match_mode: 'all' })),
  getClockStatus: jest.fn(async () => ({ running: false, bpm: 120, output_ports: [], source_mode: 'internal', divider: 1, multiplier: 1, offset_ms: 0, song_position: 0 })),
  getTrafficStats: jest.fn(async () => ({ messages_per_second: 0, captured_total: 0 })),
  listNetworkSessions: jest.fn(async () => ({ count: 0, sessions: [] })),
  getMidi2Status: jest.fn(async () => ({ enabled: false, default_protocol: 'midi1', device_count: 0, devices: [] })),
  recallPreset: jest.fn(async () => ({ ok: true })),
}

jest.mock('../../map2/api', () => ({
  midiHubApi: mockMidiHubApi,
}))

jest.mock('../components/Toasts', () => ({
  useToasts: () => ({ pushToast: mockPushToast }),
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
  MidiHubHelpDrawer: () => null,
}))

jest.mock('../components/MidiHub/MidiHubWorkbenchCards', () => ({
  readPorts: (raw: unknown) => (Array.isArray(raw) ? raw : []),
  MidiHubQuickRouterCard: () => <div>Quick Router Mock</div>,
  MidiHubFilterPlannerCard: () => <div>Filter Planner Mock</div>,
  MidiHubMapperPlannerCard: () => <div>Mapper Planner Mock</div>,
  MidiHubOperatorProfileCard: () => <div>Operator Profile Mock</div>,
}))

const { MidiHubPage } = require('./MidiHubPage') as typeof import('./MidiHubPage')

describe('MidiHubPage', () => {
  beforeEach(() => {
    mockPushToast.mockReset()
    Object.values(mockMidiHubApi).forEach((value) => {
      if (typeof value === 'function' && 'mockReset' in value) {
        ;(value as jest.Mock).mockReset()
      }
    })
    mockMidiHubApi.listPresets.mockResolvedValue({
      presets: [{ preset_id: 'baseline', name: 'Baseline', description: 'Known good', created_at: 0, updated_at: 0, conditions: {} }],
      default: { default_preset_id: 'baseline' },
    })
    mockMidiHubApi.getStatus.mockResolvedValue({
      ports: [
        { port_id: 'usb-in', name: 'USB In', direction: 'input', kind: 'usb' },
        { port_id: 'din-out', name: 'DIN Out', direction: 'output', kind: 'din' },
      ],
    })
    mockMidiHubApi.getRoutes.mockResolvedValue({ routes: [], match_mode: 'all' })
    mockMidiHubApi.getClockStatus.mockResolvedValue({ running: false, bpm: 120, output_ports: [], source_mode: 'internal', divider: 1, multiplier: 1, offset_ms: 0, song_position: 0 })
    mockMidiHubApi.getTrafficStats.mockResolvedValue({ messages_per_second: 0, captured_total: 0 })
    mockMidiHubApi.listNetworkSessions.mockResolvedValue({ count: 0, sessions: [] })
    mockMidiHubApi.getMidi2Status.mockResolvedValue({ enabled: false, default_protocol: 'midi1', device_count: 0, devices: [] })
    mockMidiHubApi.recallPreset.mockResolvedValue({ ok: true })
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

  it('renders the canonical MIDI Hub shell and exposes merged automation planning tools', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MidiHubPage />
      </QueryClientProvider>,
    )

    await screen.findByRole('heading', { name: 'MIDI Hub' })
    expect(screen.getByRole('heading', { name: /wizard and guided flows/i })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /unified workbench/i })).toBeTruthy()
    expect(screen.getByText('Routing Matrix Mock')).toBeTruthy()
    expect(screen.getByText('Quick Router Mock')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: /filters & automation/i }))

    expect(await screen.findByText('Filter Planner Mock')).toBeTruthy()
    expect(screen.getByText('Mapper Planner Mock')).toBeTruthy()
    expect(screen.getByText('Script Editor Mock')).toBeTruthy()
    expect(screen.getByText('Macro Panel Mock')).toBeTruthy()
  })
})
