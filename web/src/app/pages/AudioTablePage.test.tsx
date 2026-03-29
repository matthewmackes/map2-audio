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

const mockSnapshotsApi = {
  list: jest.fn(async () => ({ snapshots: [{ id: 1, name: 'Startup' }], count: 1, active_id: 1 })),
}

// ── Mocks ─────────────────────────────────────────────────────────────────

jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query')
  return {
    ...actual,
    useMutation: (options: {
      mutationFn: (variables?: unknown) => Promise<unknown> | unknown
      onSuccess?: (data: unknown, variables: unknown, context: unknown) => unknown
      onError?: (error: unknown, variables: unknown, context: unknown) => unknown
    }) => ({
      mutate: async (variables?: unknown) => {
        try {
          const data = await options.mutationFn(variables)
          await options.onSuccess?.(data, variables, undefined)
          return data
        } catch (error) {
          await options.onError?.(error, variables, undefined)
          throw error
        }
      },
      isPending: false,
    }),
  }
})

jest.mock('../../map2/api', () => {
  const proxy = <T extends Record<string, unknown>>(getter: () => T) =>
    new Proxy(
      {},
      {
        get: (_target, prop) => getter()[prop as keyof T],
      },
    )

  return {
    __esModule: true,
    chainsApi: proxy(() => mockChainsApi),
    pluginsApi: proxy(() => mockPluginsApi),
    historyApi: proxy(() => mockHistoryApi),
    audioApi: proxy(() => mockAudioApi),
    midiApiV2: proxy(() => mockMidiApiV2),
    getWsBaseUrl: () => 'ws://localhost:3000',
    getWsUrl: () => 'ws://localhost:3000/ws',
  }
})

jest.mock('../../map2/clients/snapshots', () => ({
  snapshotsApi: {
    list: (...args: unknown[]) => mockSnapshotsApi.list(...args),
  },
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

jest.mock('../components/modals/AudioNodesModal', () => ({
  AudioNodesModal: ({ open }: { open: boolean }) => (open ? <div data-testid="audio-nodes-modal">Audio Nodes Modal</div> : null),
}))

// ── Helpers ───────────────────────────────────────────────────────────────

function createQueryClient() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false, networkMode: 'always' },
    },
  })
  client.setQueryData(['chains'], buildMockChainsResponse())
  client.setQueryData(['plugins', 'discover'], buildMockPluginsResponse())
  client.setQueryData(['history', 'status'], buildMockHistoryStatus())
  client.setQueryData(['audio', 'ports'], buildMockPortsResponse())
  client.setQueryData(['midi', 'status'], buildMockMidiStatus())
  client.setQueryData(['chains', 'presets'], buildMockPresetsResponse())
  client.setQueryData(['snapshots'], { snapshots: [{ id: 1, name: 'Startup' }], count: 1, active_id: 1 })
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

function getColumnsMenuButton() {
  const trigger = screen.getByText('Columns').closest('button')
  expect(trigger).not.toBeNull()
  return trigger as HTMLButtonElement
}

function getToolbarButton(label: string) {
  const trigger = screen.getByText(label).closest('button')
  expect(trigger).not.toBeNull()
  return trigger as HTMLButtonElement
}

// Import after mocks
import { AudioTablePage } from './AudioTablePage'

// ── Pre-test state ────────────────────────────────────────────────────────

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: jest.fn(),
    writable: true,
  })
})

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

  it('dispatches bypass, remove, and reorder mutations from plugin rows', async () => {
    renderPage()

    const reverbRow = (await screen.findByText('Reverb')).closest('tr') as HTMLTableRowElement
    const delayRow = screen.getByText('Delay').closest('tr') as HTMLTableRowElement

    fireEvent.click(within(reverbRow).getByRole('checkbox'))
    await waitFor(() => {
      expect(mockChainsApi.togglePluginBypass).toHaveBeenCalledWith(1, 'urn:test:reverb', true, 0)
    })

    fireEvent.click(within(reverbRow).getByRole('button', { name: 'Remove' }))
    await waitFor(() => {
      expect(mockChainsApi.removePlugin).toHaveBeenCalledWith(1, 'urn:test:reverb', 0)
    })

    const delayPositionInput = delayRow.querySelector('#pos-flow-0-1') as HTMLInputElement | null
    expect(delayPositionInput).not.toBeNull()
    fireEvent.change(delayPositionInput as HTMLInputElement, { target: { value: '0' } })

    await waitFor(() => {
      expect(mockChainsApi.reorderPlugins).toHaveBeenCalledWith(1, [
        { uri: 'urn:test:delay', position: 0 },
        { uri: 'urn:test:reverb', position: 1 },
      ])
    })
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

  it('persists mute, solo, and dry/wet changes to the shared flow state', async () => {
    renderPage()
    const flowSection = await screen.findByTestId('audio-table-flow-flow-0')

    fireEvent.click(within(flowSection).getByRole('switch', { name: 'M' }))
    fireEvent.click(within(flowSection).getByRole('switch', { name: 'S' }))
    fireEvent.change(flowSection.querySelector('#drywet-flow-0') as HTMLInputElement, { target: { value: '73' } })

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('map2_juce_grid_flows_v2') ?? '[]')
      expect(stored[0]).toMatchObject({
        chainId: 1,
        muted: true,
        solo: true,
        dryWetMix: 73,
      })
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

  it('toggles column groups and parameter columns from the column picker', async () => {
    renderPage()
    expect(screen.queryByText('Armed')).not.toBeInTheDocument()
    expect(screen.getByText('Mix')).toBeInTheDocument()

    fireEvent.click(getColumnsMenuButton())
    fireEvent.click(await screen.findByText(/Automation Columns/))

    await waitFor(() => {
      expect(screen.getByText('Armed')).toBeInTheDocument()
    })

    fireEvent.click(getColumnsMenuButton())
    fireEvent.click(await screen.findByText(/Reverb: Mix/))

    await waitFor(() => {
      expect(screen.queryByText('Mix')).not.toBeInTheDocument()
    })
  })

  it('commits inline parameter edits through the batched parameter API', async () => {
    renderPage()

    await screen.findByText('Reverb')
    const reverbMixInput = document.querySelector('#flow-0-0-param--urn-test-reverb--mix') as HTMLInputElement | null
    const delayModeSelect = document.querySelector('#flow-0-1-param--urn-test-delay--mode') as HTMLSelectElement | null

    expect(reverbMixInput).not.toBeNull()
    expect(delayModeSelect).not.toBeNull()

    fireEvent.input(reverbMixInput as HTMLInputElement, { target: { value: '0.8' } })
    fireEvent.change(reverbMixInput as HTMLInputElement, { target: { value: '0.8' } })
    fireEvent.change(delayModeSelect as HTMLSelectElement, { target: { value: '2' } })

    await waitFor(() => {
      expect(mockPluginsApi.setParameterBatched).toHaveBeenNthCalledWith(
        1,
        'urn:test:reverb',
        0,
        0.8,
        undefined,
        0,
      )
      expect(mockPluginsApi.setParameterBatched).toHaveBeenNthCalledWith(
        2,
        'urn:test:delay',
        1,
        2,
        undefined,
        1,
      )
      expect(mockPluginsApi.flushParameterBatch).toHaveBeenCalledTimes(2)
    })
  })

  it('creates and updates MIDI mappings from inline MIDI cells', async () => {
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
          target_plugin_uri: 'urn:test:delay',
          target_param_index: 0,
          target_param_symbol: 'time',
          min_val: 0.1,
          max_val: 0.9,
          curve_type: 'linear',
          invert: false,
          feedback_enabled: false,
          feedback_cc: null,
          name: 'Delay time',
          group_id: null,
          is_learned: false,
          is_enabled: true,
        },
      ],
      count: 1,
    }

    renderPage()

    await screen.findByText('MIDI CC')

    const reverbMidiCcInput = document.querySelector('#flow-0-0-midiCc') as HTMLInputElement | null
    const delayMaxInput = document.querySelector('#flow-0-1-midiMax') as HTMLInputElement | null

    expect(reverbMidiCcInput).not.toBeNull()
    expect(delayMaxInput).not.toBeNull()

    fireEvent.input(reverbMidiCcInput as HTMLInputElement, { target: { value: '74' } })
    fireEvent.change(reverbMidiCcInput as HTMLInputElement, { target: { value: '74' } })

    await waitFor(() => {
      expect(mockMidiApiV2.createMapping).toHaveBeenCalledWith(expect.objectContaining({
        cc: 74,
        channel: 0,
        chain_id: 1,
        target_plugin_uri: 'urn:test:reverb',
        target_param_index: 0,
        target_param_symbol: 'mix',
        min_val: 0,
        max_val: 1,
        curve_type: 'linear',
      }))
    })

    fireEvent.input(delayMaxInput as HTMLInputElement, { target: { value: '0.8' } })
    fireEvent.change(delayMaxInput as HTMLInputElement, { target: { value: '0.8' } })

    await waitFor(() => {
      expect(mockMidiApiV2.updateMapping).toHaveBeenCalledWith(55, { max_val: 0.8 })
    })
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

  it('filters visible plugins for the active flow table', async () => {
    renderPage()
    const searchInput = await screen.findByPlaceholderText('Search visible plugins')

    fireEvent.change(searchInput, { target: { value: 'rev' } })

    await waitFor(() => {
      expect(screen.getByText('Filtered')).toBeInTheDocument()
      expect(screen.getByText('1 visible')).toBeInTheDocument()
      expect(screen.getByText('Reverb')).toBeInTheDocument()
      expect(screen.queryByText('Delay')).not.toBeInTheDocument()
    })
  })

  it('opens the preset save prompt for the active flow chain', async () => {
    const promptSpy = jest.spyOn(window, 'prompt').mockReturnValue('Main Save')
    renderPage()
    fireEvent.click(getToolbarButton('Save Preset'))

    await waitFor(() => {
      expect(promptSpy).toHaveBeenCalledWith('Preset name:', 'Main Preset')
    })

    promptSpy.mockRestore()
  })

  it('dispatches preset save, preset load, and undo mutations from the toolbar', async () => {
    const promptSpy = jest.spyOn(window, 'prompt').mockReturnValue('Main Save')

    renderPage()

    const savePresetButton = getToolbarButton('Save Preset')
    await waitFor(() => {
      expect(savePresetButton).toBeEnabled()
    })

    fireEvent.click(savePresetButton)
    await waitFor(() => {
      expect(promptSpy).toHaveBeenCalledWith('Preset name:', 'Main Preset')
    })
    await waitFor(() => {
      expect(mockChainsApi.savePreset).toHaveBeenCalledWith(1, 'Main Save')
    })

    const presetCombobox = screen.getByRole('combobox', { name: /presets/i })
    fireEvent.keyDown(presetCombobox, { key: 'ArrowDown' })
    fireEvent.keyDown(presetCombobox, { key: 'Enter' })

    await waitFor(() => {
      expect(mockChainsApi.loadPreset).toHaveBeenCalledWith(101)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => {
      expect(mockHistoryApi.undo).toHaveBeenCalled()
    })

    promptSpy.mockRestore()
  })

  it('dispatches visible-row batch bypass and remove mutations from the toolbar', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true)

    renderPage()

    const bypassVisibleButton = getToolbarButton('Bypass Visible')
    await waitFor(() => {
      expect(bypassVisibleButton).toBeEnabled()
    })

    fireEvent.click(bypassVisibleButton)
    await waitFor(() => {
      expect(mockChainsApi.togglePluginBypass).toHaveBeenCalledWith(1, 'urn:test:reverb', true, 0)
      expect(mockChainsApi.togglePluginBypass).toHaveBeenCalledWith(1, 'urn:test:delay', false, 1)
    })

    const searchInput = await screen.findByPlaceholderText('Search visible plugins')
    fireEvent.change(searchInput, { target: { value: 'rev' } })

    await waitFor(() => {
      expect(screen.getByText('1 visible')).toBeInTheDocument()
    })

    const removeVisibleButton = getToolbarButton('Remove Visible')
    await waitFor(() => {
      expect(removeVisibleButton).toBeEnabled()
    })

    fireEvent.click(removeVisibleButton)

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith('Remove 1 visible plugin(s) from Main?')
      expect(mockChainsApi.removePlugin).toHaveBeenCalledWith(1, 'urn:test:reverb', 0)
    })

    confirmSpy.mockRestore()
  })

  it('opens the node manager modal and updates cluster focus from the cluster table', async () => {
    const setActiveNode = jest.fn()
    mockUseCluster.mockReturnValue({
      activeNodeId: null,
      localNodeId: 'local-node',
      isClusterMode: true,
      setActiveNode,
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

    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Open Node Manager' }))
    expect(await screen.findByTestId('audio-nodes-modal')).toBeInTheDocument()

    const rackRow = (await screen.findByText('rack-a')).closest('tr') as HTMLTableRowElement
    fireEvent.click(within(rackRow).getByRole('button', { name: 'Focus' }))

    expect(setActiveNode).toHaveBeenCalledWith('rack-a')
  })
})
