import '@testing-library/jest-dom'
import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

// ── Mock APIs ─────────────────────────────────────────────────────────────

const mockUseIsMobile = jest.fn(() => false)
let currentMidiMappingsResponse: { mappings: Array<Record<string, unknown>>; count: number } = { mappings: [], count: 0 }
const mockUseCluster = jest.fn(() => ({
  activeNodeId: null,
  localNodeId: 'local-node',
  isClusterMode: true,
  setActiveNode: jest.fn(),
  getNodeApiPrefix: jest.fn(() => ''),
  getNodeWsPrefix: jest.fn(() => ''),
  nodes: [
    {
      nodeId: 'local-node',
      hostname: 'studio-local',
      role: 'LOCAL',
      isLocal: true,
      isOnline: true,
      latencyMs: 0,
      lastSeen: '',
    },
    {
      nodeId: 'rack-a',
      hostname: 'rack-a',
      role: 'AUDIO-NODE',
      isLocal: false,
      isOnline: true,
      latencyMs: 1.5,
      lastSeen: '',
    },
  ],
}))

const buildMockChainsResponse = () => ({
  chains: [
    {
      id: 1,
      name: 'Main',
      plugins: [
        { uri: 'urn:test:reverb', name: 'Reverb', position: 0, bypassed: false, parameters: { mix: 0.5 } },
        { uri: 'urn:test:delay', name: 'Delay', position: 1, bypassed: true, parameters: { time: 0.3, mode: 1 } },
      ],
      is_active: true,
      created_at: '',
      updated_at: '',
    },
    {
      id: 2,
      name: 'Alt',
      plugins: [],
      is_active: false,
      created_at: '',
      updated_at: '',
    },
  ],
  active_chain_id: 1,
})

const buildMockPluginsResponse = () => ({
  plugins: [
    {
      uri: 'urn:test:reverb',
      name: 'Reverb',
      author: 'Test',
      category: 'Effect',
      class_label: 'Reverb',
      version: '1.0',
      license: '',
      has_ui: false,
      in_ports: 2,
      out_ports: 2,
      parameters: [
        { index: 0, name: 'Mix', symbol: 'mix', min: 0, max: 1, default: 0.5, is_toggled: false, is_log: false },
      ],
    },
    {
      uri: 'urn:test:delay',
      name: 'Delay',
      author: 'Test',
      category: 'Effect',
      class_label: 'Delay',
      version: '1.0',
      license: '',
      has_ui: false,
      in_ports: 2,
      out_ports: 2,
      parameters: [
        { index: 0, name: 'Time', symbol: 'time', min: 0, max: 1, default: 0.3, is_toggled: false, is_log: false },
        { index: 1, name: 'Mode', symbol: 'mode', min: 0, max: 2, default: 1, is_toggled: false, is_log: false },
      ],
    },
  ],
})

const buildMockHistoryStatus = () => ({ can_undo: true, can_redo: false })

const buildMockPresetsResponse = () => ({
  presets: [
    {
      id: 101,
      name: 'Default',
      chain_id: 1,
      tags: [],
      category: 'General',
      description: '',
      is_favorite: false,
      created_at: '',
      updated_at: '',
    },
  ],
  count: 1,
})

const buildMockPortsResponse = () => ({
  available: true,
  device: 'PipeWire',
  inputs: [{ index: 0, name: 'Input 1', type: 'input' }],
  outputs: [{ index: 0, name: 'Output 1', type: 'output' }],
  input_count: 1,
  output_count: 1,
})

const buildMockMidiStatus = () => ({
  enabled: true,
  input_open: true,
  output_open: false,
  input_device: 'Test',
  output_device: null,
  mappings_count: 0,
  commands_count: 0,
  learning: false,
  last_channel: 0,
  last_cc: 0,
  last_value: 0,
})

const createMockPluginOutputState = () => ({
  peaks: {},
  outputPorts: {},
  tuners: {},
  spectrums: {},
  connected: false,
  lastUpdate: 0,
  connect: jest.fn(),
  disconnect: jest.fn(),
  getPluginData: jest.fn(() => ({})),
  clearClip: jest.fn(),
})

const mockUsePluginOutputs = jest.fn(() => createMockPluginOutputState())

const mockChainsApi = {
  list: jest.fn(async () => buildMockChainsResponse()),
  addPlugin: jest.fn(async () => ({})),
  create: jest.fn(async () => ({})),
  delete: jest.fn(async () => ({})),
  listPresets: jest.fn(async () => buildMockPresetsResponse()),
  loadPreset: jest.fn(async () => ({})),
  removePlugin: jest.fn(async () => ({})),
  rename: jest.fn(async () => ({})),
  reorderPlugins: jest.fn(async () => ({})),
  savePreset: jest.fn(async () => ({})),
  togglePluginBypass: jest.fn(async () => ({})),
}

const mockPluginsApi = {
  discover: jest.fn(async () => buildMockPluginsResponse()),
  flushParameterBatch: jest.fn(async () => ({})),
  setParameterBatched: jest.fn(),
}

const mockHistoryApi = {
  getStatus: jest.fn(async () => buildMockHistoryStatus()),
  undo: jest.fn(async () => ({})),
  redo: jest.fn(async () => ({})),
}

const mockAudioApi = {
  getPorts: jest.fn(async () => buildMockPortsResponse()),
  getStatus: jest.fn(async () => ({ running: true, engine: 'PipeWire' })),
}

const mockMidiApiV2 = {
  getStatus: jest.fn(async () => buildMockMidiStatus()),
  getMappings: jest.fn(async () => currentMidiMappingsResponse),
  createMapping: jest.fn(async () => ({})),
  updateMapping: jest.fn(async () => ({})),
}

const mockFlowSnapshotsApi = {
  list: jest.fn(async () => ({ snapshots: [{ id: 1, name: 'Startup' }], count: 1, active_id: 1 })),
}

// ── Mocks ─────────────────────────────────────────────────────────────────

jest.mock('../../map2/api', () => ({
  chainsApi: mockChainsApi,
  pluginsApi: mockPluginsApi,
  historyApi: mockHistoryApi,
  audioApi: mockAudioApi,
  midiApiV2: mockMidiApiV2,
  flowSnapshotsApi: mockFlowSnapshotsApi,
  getWsBaseUrl: () => 'ws://localhost:3000',
  getWsUrl: () => 'ws://localhost:3000/ws',
}))

jest.mock('../hooks/useIsMobile', () => ({
  useIsMobile: () => mockUseIsMobile(),
}))

jest.mock('../hooks/useTabletTouchRouteLayout', () => ({
  useTabletTouchRouteLayout: () => ({ isTabletViewport: false, isTouchCapable: false, isTabletTouchRoute: false }),
}))

jest.mock('../hooks/usePluginOutputs', () => ({
  usePluginOutputs: () => mockUsePluginOutputs(),
}))

jest.mock('../hooks/useCPUMetrics', () => ({
  useCPUMetrics: () => ({ metrics: null, isConnected: false }),
}))

jest.mock('../hooks/useSpecialSettings', () => ({
  useSpecialSettings: () => ({ settings: { hiddenPlugins: [] } }),
}))

jest.mock('../components/Toasts', () => ({
  useToasts: () => ({ pushToast: jest.fn(), dismissToast: jest.fn() }),
}))

jest.mock('../../map2/displayNames', () => ({
  getDisplayPluginName: (_uri: string, name: string) => name || 'Unknown',
  sanitizeRestrictedDisplayText: (text: string) => text,
}))

jest.mock('../utils/pluginBrowserSort', () => ({
  sortPluginsForBrowser: <T,>(plugins: T[]) => plugins,
}))

jest.mock('../components/shared/LandscapePrompt', () => ({
  LandscapePrompt: ({ title }: { title?: string }) => <div data-testid="landscape-prompt">{title}</div>,
}))

jest.mock('../contexts/ClusterContext', () => ({
  useCluster: () => mockUseCluster(),
}))

jest.mock('./AudioNodesModal', () => ({
  AudioNodesModal: ({ open }: { open: boolean }) => (open ? <div data-testid="audio-nodes-modal">Audio Nodes Modal</div> : null),
}))

// ── Helpers ───────────────────────────────────────────────────────────────

function createQueryClient() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  })
  client.setQueryData(['chains'], buildMockChainsResponse())
  client.setQueryData(['plugins', 'discover'], buildMockPluginsResponse())
  client.setQueryData(['history', 'status'], buildMockHistoryStatus())
  client.setQueryData(['audio', 'ports'], buildMockPortsResponse())
  client.setQueryData(['midi', 'status'], buildMockMidiStatus())
  client.setQueryData(['chains', 'presets'], buildMockPresetsResponse())
  client.setQueryData(['flow-snapshots'], { snapshots: [{ id: 1, name: 'Startup' }], count: 1, active_id: 1 })
  client.setQueryData(['midi', 'mappings', 'audio-table'], currentMidiMappingsResponse)
  return client
}

function renderPage() {
  const qc = createQueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/audio-table']}>
        <React.Suspense fallback={<div>Loading...</div>}>
          <AudioTablePage />
        </React.Suspense>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// Import after mocks
import { AudioTablePage } from './AudioTablePage'

// ── Pre-test state ────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  currentMidiMappingsResponse = { mappings: [], count: 0 }
  mockUseIsMobile.mockReturnValue(false)
  mockUsePluginOutputs.mockReturnValue(createMockPluginOutputState())
  mockUseCluster.mockReturnValue({
    activeNodeId: null,
    localNodeId: 'local-node',
    isClusterMode: true,
    setActiveNode: jest.fn(),
    getNodeApiPrefix: jest.fn(() => ''),
    getNodeWsPrefix: jest.fn(() => ''),
    nodes: [
      {
        nodeId: 'local-node',
        hostname: 'studio-local',
        role: 'LOCAL',
        isLocal: true,
        isOnline: true,
        latencyMs: 0,
        lastSeen: '',
      },
      {
        nodeId: 'rack-a',
        hostname: 'rack-a',
        role: 'AUDIO-NODE',
        isLocal: false,
        isOnline: true,
        latencyMs: 1.5,
        lastSeen: '',
      },
    ],
  })
  localStorage.clear()
  // Pre-populate shared state so we have 3 flows with chain 1 assigned to flow A
  localStorage.setItem(
    'map2_juce_grid_flows_v2',
    JSON.stringify([
      { id: 'flow-0', chainId: 1, label: 'A', color: '#2563eb', muted: false, solo: false, dryWetMix: 100 },
      { id: 'flow-1', chainId: null, label: 'B', color: '#60a5fa', muted: false, solo: false, dryWetMix: 100 },
      { id: 'flow-2', chainId: null, label: 'C', color: '#22c55e', muted: false, solo: false, dryWetMix: 100 },
    ]),
  )
  localStorage.setItem(
    'map2_juce_grid_routing_v2',
    JSON.stringify({
      mode: 'parallel_blend',
      activeSlotId: 'flow-0',
      blendPositions: {},
      morphProgress: 0.5,
      morphSourceSlotId: null,
      morphTargetSlotId: null,
      seriesOrder: [],
    }),
  )
  localStorage.setItem('map2_juce_grid_active_v2', '0')
})

// ============================================================================
// 1. Render Tests
// ============================================================================

describe('AudioTablePage — Render', () => {
  it('renders without crash', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('audio-table-page')).toBeInTheDocument()
    })
  })

  it('renders flow table sections for each active flow', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('audio-table-flow-flow-0')).toBeInTheDocument()
      expect(screen.getByTestId('audio-table-flow-flow-1')).toBeInTheDocument()
      expect(screen.getByTestId('audio-table-flow-flow-2')).toBeInTheDocument()
    })
  })

  it('renders the shared toolbar', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('audio-table-toolbar')).toBeInTheDocument()
    })
  })

  it('renders the Add Flow button', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('audio-table-add-flow')).toBeInTheDocument()
    })
  })

  it('renders the cluster node section', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('audio-table-cluster-section')).toBeInTheDocument()
      expect(screen.getByText('Cluster Nodes')).toBeInTheDocument()
    })
  })
})

// ============================================================================
// 2. Data Display Tests
// ============================================================================

describe('AudioTablePage — Data Display', () => {
  it('shows plugin names in the flow table', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Reverb')).toBeInTheDocument()
      expect(screen.getByText('Delay')).toBeInTheDocument()
    })
  })

  it('shows plugin count tag', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('2 plugins')).toBeInTheDocument()
    })
  })

  it('shows "No chain assigned" for flows without chains', async () => {
    renderPage()
    await waitFor(() => {
      const noChainMessages = screen.getAllByText(/No chain assigned/)
      expect(noChainMessages.length).toBeGreaterThanOrEqual(2)
    })
  })
})

// ============================================================================
// 3. Mutation Tests
// ============================================================================

describe('AudioTablePage — Row Controls', () => {
  it('renders the add-plugin row for assigned chains', async () => {
    renderPage()
    expect(await screen.findByRole('combobox', { name: /add plugin/i })).toBeInTheDocument()
  })

  it('renders bypass checkbox in plugin rows', async () => {
    renderPage()
    const reverbCell = await screen.findByText('Reverb')
    const reverbRow = reverbCell.closest('tr')
    expect(reverbRow).not.toBeNull()
    expect(within(reverbRow as HTMLTableRowElement).getByRole('checkbox')).toBeInTheDocument()
  })

  it('renders remove button in plugin rows', async () => {
    renderPage()
    const reverbCell = await screen.findByText('Reverb')
    const reverbRow = reverbCell.closest('tr')
    expect(reverbRow).not.toBeNull()
    expect(within(reverbRow as HTMLTableRowElement).getByRole('button', { name: 'Remove' })).toBeInTheDocument()
  })

  it('enables undo when history supports it', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled()
    })
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled()
  })
})

// ============================================================================
// 4. Flow CRUD Tests
// ============================================================================

describe('AudioTablePage — Flow CRUD', () => {
  it('adds a flow when Add Flow button is clicked', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('audio-table-add-flow')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('audio-table-add-flow'))
    await waitFor(() => {
      expect(screen.getByTestId('audio-table-flow-flow-3')).toBeInTheDocument()
    })
  })

  it('removes a flow when Remove Flow button is clicked', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('audio-table-flow-flow-2')).toBeInTheDocument()
    })
    const removeFlowButtons = screen.getAllByLabelText('Remove flow')
    // Click the last flow's remove button
    fireEvent.click(removeFlowButtons[removeFlowButtons.length - 1])
    await waitFor(() => {
      expect(screen.queryByTestId('audio-table-flow-flow-2')).not.toBeInTheDocument()
    })
  })

  it('disables Add Flow when at maximum', async () => {
    // Set up 6 flows
    localStorage.setItem(
      'map2_juce_grid_flows_v2',
      JSON.stringify(
        Array.from({ length: 6 }, (_, i) => ({
          id: `flow-${i}`,
          chainId: null,
          label: String.fromCharCode(65 + i),
          color: '#2563eb',
          muted: false,
          solo: false,
          dryWetMix: 100,
        })),
      ),
    )
    renderPage()
    await waitFor(() => {
      const addBtn = screen.getByTestId('audio-table-add-flow')
      expect(addBtn).toBeDisabled()
    })
  })
})

// ============================================================================
// 5. Shared State Tests
// ============================================================================

describe('AudioTablePage — Shared State', () => {
  it('reads flow state from shared localStorage key', async () => {
    renderPage()
    await waitFor(() => {
      // Flow A should exist (from localStorage setup in beforeEach)
      expect(screen.getByTestId('audio-table-flow-flow-0')).toBeInTheDocument()
    })
  })

  it('writes flow state changes to shared localStorage key', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('audio-table-add-flow')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('audio-table-add-flow'))
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('map2_juce_grid_flows_v2') ?? '[]')
      expect(stored.length).toBe(4)
    })
  })
})

// ============================================================================
// 6. Real-Time Data Tests
// ============================================================================

describe('AudioTablePage — Real-Time Data', () => {
  it('renders input and output dB values from plugin output peaks', async () => {
    mockUsePluginOutputs.mockReturnValue({
      ...createMockPluginOutputState(),
      peaks: {
        'urn:test:reverb': {
          in_l: { peak: 0.5, port_symbol: 'in_l' },
          out_l: { peak: 0.25, port_symbol: 'out_l' },
        },
      },
    })

    renderPage()
    const reverbRow = (await screen.findByText('Reverb')).closest('tr') as HTMLTableRowElement
    expect(within(reverbRow).getByText('-6.0')).toBeInTheDocument()
    expect(within(reverbRow).getByText('-12.0')).toBeInTheDocument()
  })
})

// ============================================================================
// 7. Column Visibility Tests
// ============================================================================

describe('AudioTablePage — Column Visibility', () => {
  it('persists column visibility to localStorage', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('audio-table-toolbar')).toBeInTheDocument()
    })
    // Column visibility is persisted on mount
    await waitFor(() => {
      const stored = localStorage.getItem('map2_audio_table_column_visibility')
      expect(stored).toBeTruthy()
    })
  })

  it('renders dynamic parameter columns and row-specific controls', async () => {
    renderPage()
    expect(await screen.findByText('Mix')).toBeInTheDocument()
    expect(screen.getByText('Time')).toBeInTheDocument()
    expect(screen.getByText('Mode')).toBeInTheDocument()

    const reverbRow = screen.getByText('Reverb').closest('tr') as HTMLTableRowElement
    const delayRow = screen.getByText('Delay').closest('tr') as HTMLTableRowElement

    expect(within(reverbRow).getAllByRole('spinbutton')).toHaveLength(2)
    expect(within(reverbRow).queryByRole('combobox')).not.toBeInTheDocument()
    expect(within(delayRow).getAllByRole('spinbutton')).toHaveLength(2)
    expect(within(delayRow).getByRole('combobox')).toBeInTheDocument()
  })

  it('renders editable numeric and discrete parameter cells', async () => {
    renderPage()
    const reverbRow = (await screen.findByText('Reverb')).closest('tr') as HTMLTableRowElement
    const delayRow = screen.getByText('Delay').closest('tr') as HTMLTableRowElement

    const reverbMixInput = within(reverbRow).getByDisplayValue('0.5') as HTMLInputElement
    expect(reverbMixInput).toHaveValue(0.5)

    const delayModeSelect = within(delayRow).getByRole('combobox') as HTMLSelectElement
    expect(delayModeSelect).toHaveValue('1')
    expect(within(delayModeSelect).getAllByRole('option')).toHaveLength(3)
  })

  it('renders MIDI headers and inline controls when the MIDI column group is enabled', async () => {
    localStorage.setItem(
      'map2_audio_table_column_visibility',
      JSON.stringify({
        midiGroup: true,
        automationGroup: false,
        inputLevel: true,
        outputLevel: true,
        parameters: {},
      }),
    )
    currentMidiMappingsResponse = {
      mappings: [
        {
          id: 55,
          channel: 2,
          cc: 21,
          chain_id: 1,
          target_plugin_uri: 'urn:test:reverb',
          target_param_index: 0,
          target_param_symbol: 'mix',
          min_val: 0.1,
          max_val: 0.9,
          curve_type: 'linear',
          invert: false,
          feedback_enabled: false,
          feedback_cc: null,
          name: 'Reverb mix',
          group_id: null,
          is_learned: false,
          is_enabled: true,
        },
      ],
      count: 1,
    }

    renderPage()

    expect(await screen.findByText('MIDI CC')).toBeInTheDocument()
    expect(screen.getByText('MIDI Ch')).toBeInTheDocument()
    expect(screen.getByText('Curve')).toBeInTheDocument()
    expect(screen.getByText('Min')).toBeInTheDocument()
    expect(screen.getByText('Max')).toBeInTheDocument()

    const reverbRow = screen.getByText('Reverb').closest('tr') as HTMLTableRowElement
    expect(within(reverbRow).getByDisplayValue('21')).toBeInTheDocument()
    expect(within(reverbRow).getByDisplayValue('0.1')).toBeInTheDocument()
    expect(within(reverbRow).getByDisplayValue('0.9')).toBeInTheDocument()
  })
})

// ============================================================================
// 8. Responsive Tests
// ============================================================================

describe('AudioTablePage — Responsive', () => {
  it('shows mobile block message on mobile viewport', async () => {
    mockUseIsMobile.mockReturnValue(true)
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('landscape-prompt')).toBeInTheDocument()
    })
    mockUseIsMobile.mockReturnValue(false)
  })
})

// ============================================================================
// 9. Toolbar Tests
// ============================================================================

describe('AudioTablePage — Toolbar', () => {
  it('renders routing mode dropdown', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /parallel \/ blend/i })).toBeInTheDocument()
    })
  })

  it('renders preset dropdown', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /presets/i })).toBeInTheDocument()
    })
  })

  it('renders undo/redo buttons', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByLabelText('Undo')).toBeInTheDocument()
      expect(screen.getByLabelText('Redo')).toBeInTheDocument()
    })
  })

  it('renders automation transport buttons', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByLabelText('Play')).toBeInTheDocument()
      expect(screen.getByLabelText('Record')).toBeInTheDocument()
      expect(screen.getByLabelText('Loop')).toBeInTheDocument()
    })
  })

  it('renders the global search and visible-row batch actions', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search visible plugins')).toBeInTheDocument()
      expect(screen.getByText('Bypass Visible')).toBeInTheDocument()
      expect(screen.getByText('Remove Visible')).toBeInTheDocument()
      expect(screen.getByText('2 nodes')).toBeInTheDocument()
    })
  })
})
