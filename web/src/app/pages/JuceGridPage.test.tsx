import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

const mockSideNav = jest.fn(({ children, expanded, isFixedNav, className }: any) => (
  <nav
    data-testid="juce-grid-midi-rail"
    data-expanded={String(Boolean(expanded))}
    data-fixed={String(Boolean(isFixedNav))}
    className={className}
  >
    {children}
  </nav>
))

const mockInvalidateQueries = jest.fn()
const mockFetchQuery = jest.fn()
const mockSetQueryData = jest.fn()
const mockCancelQueries = jest.fn(async () => undefined)
const mockGetQueryData = jest.fn()
const mockUseIsMobile = jest.fn(() => false)
const mockResolveLivePluginCardStrategy = jest.fn(() => ({ renderMode: 'generic' as const }))
let mockLivePathLayout: any = {
  status: 'unavailable',
  activeFlowIds: [],
  primaryFlowId: null,
  secondaryFlowId: null,
  flowStates: {},
  mobileSummary: ['No live path available'],
  groups: [],
}

const mockChainsApi = {
  list: jest.fn(async () => ({
    chains: [
      { id: 1, name: 'Song 1', plugins: [], is_active: true },
      { id: 2, name: 'Kate', plugins: [], is_active: false },
    ],
    active_chain_id: 1,
  })),
  listPresets: jest.fn(async () => ({ presets: [] })),
  activate: jest.fn(async () => ({})),
  addPlugin: jest.fn(async () => ({})),
  create: jest.fn(async () => ({})),
  deactivate: jest.fn(async () => ({})),
  deletePreset: jest.fn(async () => ({})),
  loadPreset: jest.fn(async () => ({})),
  removePlugin: jest.fn(async () => ({})),
  rename: jest.fn(async () => ({})),
  reorderPlugins: jest.fn(async () => ({})),
  savePreset: jest.fn(async () => ({})),
  togglePluginBypass: jest.fn(async () => ({})),
}

const mockPluginsApi = {
  discover: jest.fn(async () => ({ plugins: [] })),
  flushParameterBatch: jest.fn(async () => ({})),
  setParameterBatched: jest.fn(async () => ({})),
}

const mockHistoryApi = {
  getStatus: jest.fn(async () => ({ can_undo: false, can_redo: false })),
  undo: jest.fn(async () => ({})),
  redo: jest.fn(async () => ({})),
}

const mockAudioApi = {
  getPorts: jest.fn(async () => ({
    device: 'PipeWire Media Server',
    input_count: 2,
    output_count: 2,
    inputs: [],
    outputs: [],
    avb_talkers: [],
    avb_listeners: [],
  })),
  getRouting: jest.fn(async () => ({
    input_ports: [],
    input_avb_endpoints: [],
    output_ports: [],
    output_avb_endpoints: [],
  })),
  getStatus: jest.fn(async () => ({ running: true, engine: 'PipeWire' })),
  getLevels: jest.fn(async () => ({
    input_left: 0.24,
    input_right: 0.31,
    output_left: 0.42,
    output_right: 0.38,
  })),
}

const mockMetricsApi = {
  getJack: jest.fn(async () => ({
    buffer_size: 256,
    sample_rate: 48000,
    xruns: 0,
  })),
}

const mockFlowSnapshotsApi = {
  list: jest.fn(async () => ({ snapshots: [], count: 0, active_id: null })),
  get: jest.fn(async () => ({ id: 0, snapshot_data: { flows: [], routing: {} } })),
  create: jest.fn(async () => ({})),
  delete: jest.fn(async () => ({})),
  duplicate: jest.fn(async () => ({})),
  load: jest.fn(async () => ({})),
  preview: jest.fn(async () => ({})),
  reorder: jest.fn(async () => ({})),
  setProgram: jest.fn(async () => ({})),
  update: jest.fn(async () => ({})),
}

const mockMidiApiV2 = {
  getStatus: jest.fn(async () => ({
    enabled: true,
    input_open: true,
    output_open: false,
    input_device: 'Test Input',
    output_device: null,
    mappings_count: 0,
    commands_count: 0,
    learning: false,
    last_channel: 0,
    last_cc: 0,
    last_value: 0,
  })),
  getLearnStatus: jest.fn(async () => ({
    learning: false,
    target: null,
  })),
  getMappings: jest.fn(async () => ({ mappings: [], count: 0 })),
  createMapping: jest.fn(async () => ({ mapping: {}, message: 'created' })),
  updateMapping: jest.fn(async () => ({ mapping: {}, message: 'ok' })),
  deleteMapping: jest.fn(async () => ({ success: true, message: 'deleted' })),
  testMappingFeedback: jest.fn(async () => ({ mapping_id: 1, channel: 1, cc: 11, normalized_value: 1, cc_value: 127, source: 'manual', message: 'sent' })),
  startLearn: jest.fn(async () => ({ success: true, target: {} })),
  stopLearn: jest.fn(async () => ({ success: true })),
}

jest.mock('@carbon/react', () => {
  const actual = jest.requireActual('@carbon/react')
  return {
    ...actual,
    SideNav: (props: any) => mockSideNav(props),
    SideNavItems: ({ children, className }: any) => <ul className={className}>{children}</ul>,
    SideNavFooter: ({ assistiveText, expanded, onToggle }: any) => (
      <button
        type="button"
        data-testid="juce-grid-midi-rail-footer"
        aria-label={assistiveText}
        data-expanded={String(Boolean(expanded))}
        onClick={onToggle}
      >
        Toggle rail
      </button>
    ),
  }
})

jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query')
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: mockInvalidateQueries,
      fetchQuery: mockFetchQuery,
      setQueryData: mockSetQueryData,
      cancelQueries: mockCancelQueries,
      getQueryData: mockGetQueryData,
    }),
  }
})

jest.mock('../hooks/useSpecialSettings', () => ({
  useSpecialSettings: () => ({ settings: { hiddenPlugins: [] } }),
}))

jest.mock('../hooks/useIsMobile', () => ({
  useIsMobile: () => mockUseIsMobile(),
}))

jest.mock('../grid/shared', () => ({
  getCategoryConfig: () => ({ label: 'All', color: '#0f62fe' }),
}))

jest.mock('../../map2/api', () => ({
  chainsApi: mockChainsApi,
  pluginsApi: mockPluginsApi,
  historyApi: mockHistoryApi,
  audioApi: mockAudioApi,
  metricsApi: mockMetricsApi,
  flowSnapshotsApi: mockFlowSnapshotsApi,
  midiApiV2: mockMidiApiV2,
  getWsBaseUrl: () => 'ws://localhost:3000',
  getWsUrl: () => 'ws://localhost:3000/ws',
}))

jest.mock('../components/Toasts', () => ({
  useToasts: () => ({ pushToast: jest.fn() }),
}))

jest.mock('../hooks/useCPUMetrics', () => ({
  useCPUMetrics: () => ({
    metrics: { totalCpuPercent: 0, xrunCount: 0 },
    status: 'ok',
    hasXruns: false,
    getPluginCpu: () => 0,
  }),
}))

jest.mock('../hooks/usePluginOutputs', () => ({
  usePluginOutputs: () => ({
    outputPorts: {},
    peaks: {},
    connected: false,
  }),
}))

jest.mock('../hooks/useFlowSnapshots', () => ({
  useFlowSnapshots: () => ({ isConnected: false }),
}))

jest.mock('./PerformPage', () => ({
  PerformPage: () => <div data-testid="mock-perform-page" />,
}))

jest.mock('../components/PluginCards/Dialogs/ExpressionOverlay', () => ({
  ExpressionOverlay: () => <div data-testid="mock-expression-overlay" />,
}))

jest.mock('../../map2/components/MIDI/MidiLearnButton', () => ({
  __esModule: true,
  default: ({ onToggle }: { onToggle?: () => void }) => (
    <button type="button" onClick={onToggle}>MIDI learn</button>
  ),
}))

jest.mock('../components/PluginDetailsModal', () => ({
  PluginDetailsModal: () => null,
}))

jest.mock('../components/ParameterControl', () => ({
  NumberInput: ({
    value,
    label,
    min = 0,
    max = 100,
    defaultValue,
    onChange,
  }: {
    value: number
    label?: string
    min?: number
    max?: number
    defaultValue?: number
    onChange?: (nextValue: number) => void
  }) => (
    <input
      aria-label={label ?? 'Number input'}
      aria-valuemax={max}
      aria-valuemin={min}
      aria-valuenow={value}
      onDoubleClick={() => onChange?.(typeof defaultValue === 'number' ? defaultValue : value)}
      readOnly
      role="slider"
      value={value}
    />
  ),
}))

jest.mock('../components/snapshots/SnapshotImportDialog', () => ({
  SnapshotImportDialog: () => null,
}))

jest.mock('../components/shared/LandscapePrompt', () => ({
  LandscapePrompt: () => null,
}))

jest.mock('./JuceGridAudioPortModal', () => ({
  JuceGridAudioPortModal: () => null,
}))

jest.mock('./JuceGridChainManagementCard', () => ({
  JuceGridChainManagementCard: ({ onChainSelect }: { onChainSelect?: (chainId: number) => void }) => (
    <div data-testid="juce-grid-chain-card">
      <button type="button" onClick={() => onChainSelect?.(1)}>
        Select chain
      </button>
    </div>
  ),
}))

jest.mock('./JuceGridClusterPanels', () => ({
  JuceGridClusterPanel: () => <div data-testid="juce-grid-cluster-panel">Cluster</div>,
  JuceGridFlowAssignmentPanel: () => <div data-testid="juce-grid-assignment-panel">Assignments</div>,
  JuceGridClusterSummaryBar: () => <div data-testid="juce-grid-cluster-summary-bar">Cluster summary</div>,
}))

jest.mock('./JuceGridParameterEditor', () => ({
  JuceGridParameterEditor: () => <div data-testid="juce-grid-parameter-editor">Editor</div>,
}))

jest.mock('../components/PluginCards', () => ({
  PluginCardRouter: ({ forceTemplate }: { forceTemplate?: string }) => (
    <div
      data-testid="plugin-card-router"
      data-force-template={forceTemplate ?? ''}
    >
      Plugin card router
    </div>
  ),
}))

jest.mock('../components/PluginCards/liveEditorRouting', () => ({
  resolveLivePluginCardStrategy: (...args: unknown[]) => mockResolveLivePluginCardStrategy(...args),
}))

jest.mock('./JuceGridRoutingVisualizer', () => ({
  JuceGridRoutingVisualizer: () => <div data-testid="juce-grid-routing-visualizer">Routing</div>,
  getJuceGridRoutingInspectorItems: () => [],
}))

jest.mock('./JuceGridSignalCanvas', () => ({
  JuceGridSignalCanvas: ({
    chain,
    onAddPlugin,
    onPluginSelect,
    showAddPluginSlot,
  }: {
    chain?: { plugins?: Array<{ uri: string; position: number }> } | null
    onAddPlugin?: () => void
    onPluginSelect?: (uri: string, position: number) => void
    showAddPluginSlot?: boolean
  }) => {
    const targetPlugin = chain?.plugins?.find((plugin) => plugin.uri === 'map2://juce/modulation/chorus')
      ?? chain?.plugins?.[0]

    return (
    <div data-testid="juce-grid-signal-canvas">
      {showAddPluginSlot && onAddPlugin && <button type="button" onClick={onAddPlugin}>Add block</button>}
      {targetPlugin && (
        <button
          type="button"
          onClick={() => onPluginSelect?.(targetPlugin.uri, targetPlugin.position)}
        >
          Select block
        </button>
      )}
      Signal canvas
    </div>
    )
  },
}))

jest.mock('./juceGridLivePath', () => ({
  buildJuceGridLivePath: () => mockLivePathLayout,
}))

const { JuceGridPage } = require('./JuceGridPage') as typeof import('./JuceGridPage')

describe('JuceGridPage snapshot modal workflow', () => {
  beforeEach(() => {
    localStorage.clear()
    mockLivePathLayout = {
      status: 'unavailable',
      activeFlowIds: [],
      primaryFlowId: null,
      secondaryFlowId: null,
      flowStates: {},
      mobileSummary: ['No live path available'],
      groups: [],
    }
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: query === '(max-width: 768px)' ? false : false,
        media: query,
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }),
    })
    mockSideNav.mockClear()
    mockUseIsMobile.mockReset()
    mockUseIsMobile.mockReturnValue(false)
    mockResolveLivePluginCardStrategy.mockReset()
    mockResolveLivePluginCardStrategy.mockReturnValue({ renderMode: 'generic' })
    mockInvalidateQueries.mockReset()
    mockFetchQuery.mockReset()
    mockSetQueryData.mockReset()
    mockCancelQueries.mockClear()
    mockGetQueryData.mockReset()
    mockGetQueryData.mockReturnValue({
      chains: [
        { id: 1, name: 'Song 1', plugins: [], is_active: true },
        { id: 2, name: 'Kate', plugins: [], is_active: false },
      ],
      active_chain_id: 1,
    })
    Object.values(mockChainsApi).forEach((mockFn) => {
      if (typeof mockFn === 'function' && 'mockReset' in mockFn) {
        ;(mockFn as jest.Mock).mockReset()
      }
    })
    mockChainsApi.list.mockResolvedValue({
      chains: [
        { id: 1, name: 'Song 1', plugins: [], is_active: true },
        { id: 2, name: 'Kate', plugins: [], is_active: false },
      ],
      active_chain_id: 1,
    })
    mockChainsApi.activate.mockResolvedValue({})
    mockChainsApi.addPlugin.mockResolvedValue({})
    mockChainsApi.create.mockResolvedValue({})
    mockChainsApi.deactivate.mockResolvedValue({})
    mockChainsApi.deletePreset.mockResolvedValue({})
    mockChainsApi.listPresets.mockResolvedValue({ presets: [] })
    mockChainsApi.loadPreset.mockResolvedValue({})
    mockChainsApi.removePlugin.mockResolvedValue({})
    mockChainsApi.rename.mockResolvedValue({})
    mockChainsApi.reorderPlugins.mockResolvedValue({})
    mockChainsApi.savePreset.mockResolvedValue({})
    mockChainsApi.togglePluginBypass.mockResolvedValue({})
    mockPluginsApi.discover.mockReset()
    mockPluginsApi.discover.mockResolvedValue({ plugins: [] })
    mockPluginsApi.flushParameterBatch.mockReset()
    mockPluginsApi.flushParameterBatch.mockResolvedValue({})
    mockPluginsApi.setParameterBatched.mockReset()
    mockPluginsApi.setParameterBatched.mockResolvedValue({})
    Object.values(mockMidiApiV2).forEach((mockFn) => {
      if (typeof mockFn === 'function' && 'mockReset' in mockFn) {
        ;(mockFn as jest.Mock).mockReset()
      }
    })
    mockMidiApiV2.getStatus.mockResolvedValue({
      enabled: true,
      input_open: true,
      output_open: false,
      input_device: 'Test Input',
      output_device: null,
      mappings_count: 0,
      commands_count: 0,
      learning: false,
      last_channel: 0,
      last_cc: 0,
      last_value: 0,
    })
    mockMidiApiV2.getLearnStatus.mockResolvedValue({
      learning: false,
      target: null,
    })
    mockMidiApiV2.getMappings.mockResolvedValue({ mappings: [], count: 0 })
    mockMidiApiV2.updateMapping.mockResolvedValue({ mapping: {}, message: 'ok' })
    mockMidiApiV2.deleteMapping.mockResolvedValue({ success: true, message: 'deleted' })
    mockMidiApiV2.startLearn.mockResolvedValue({ success: true, target: {} })
    mockMidiApiV2.stopLearn.mockResolvedValue({ success: true })
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1440,
    })
    Object.defineProperty(window, 'scrollTo', {
      configurable: true,
      writable: true,
      value: jest.fn(),
    })
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    ;(globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock
    ;(globalThis as { fetch?: typeof fetch }).fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ nodes: [] }),
    })) as unknown as typeof fetch
  })

  afterEach(() => {
    jest.restoreAllMocks()
    delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver
    delete (globalThis as { fetch?: typeof fetch }).fetch
    delete (window as Window & { ontouchstart?: unknown }).ontouchstart
  })

  it('renders floating snapshot and MIDI triggers without either side rail', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          initialEntries={['/juce-grid']}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <JuceGridPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByLabelText('Open Snapshots')).toBeTruthy()
    expect(screen.getByLabelText('Open MIDI')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Docs' })).toBeNull()
    const audioNodesButton = screen.getByRole('button', { name: 'Audio Nodes' })
    const configureRoutingButton = screen.getByRole('button', { name: 'Configure routing' })
    expect(audioNodesButton.compareDocumentPosition(configureRoutingButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(container.querySelector('.juce-grid-page__state-rail')).toBeNull()
    expect(container.querySelector('.juce-grid-page__midi-rail-shell')).toBeNull()
    expect(container.querySelector('.snapshot-floating-trigger')).toBeTruthy()
  })

  it('opens the snapshots modal from the trigger button', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          initialEntries={['/juce-grid']}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <JuceGridPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    fireEvent.click(await screen.findByLabelText('Open Snapshots'))

    expect(await screen.findByText('Snapshots', { selector: 'h2' })).toBeTruthy()
  })

  it('renders the snapshot count badge next to the floating trigger', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <JuceGridPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const snapshotTrigger = (await screen.findByLabelText('Open Snapshots')).closest('.snapshot-rail-trigger')
    expect(snapshotTrigger?.querySelector('.snapshot-rail-trigger__count')).toBeTruthy()
  })

  it('closes the snapshots modal after recall', async () => {
    mockFlowSnapshotsApi.list.mockResolvedValue({
      snapshots: [
        {
          id: 11,
          name: 'Verse Wash',
          description: 'Favorite snapshot A',
          updated_at: '2026-03-15T18:00:00.000Z',
          flow_slots: [{ id: 'flow-0', label: 'A', color: '#0f62fe' }],
          is_active: false,
          is_favorite: true,
          program_number: null,
          display_order: 0,
        },
      ],
      count: 1,
      active_id: null,
    })
    mockFlowSnapshotsApi.load.mockResolvedValue({
      snapshot_data: { flowSlots: [], routing: {}, activeFlowIndex: 0, chains: {} },
    })

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          initialEntries={['/juce-grid']}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <JuceGridPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    fireEvent.click(await screen.findByLabelText('Open Snapshots'))
    fireEvent.click(await screen.findByRole('button', { name: 'Recall' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Snapshots' })).toBeNull()
    })
  })

  it('renders the dirty pulse after a routing change', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <JuceGridPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Parallel' }))

    await waitFor(() => {
      expect(container.querySelector('.snapshot-rail-trigger__pulse')).toBeTruthy()
    })
  })

  it('moves flow focus selection into the left routing controls and removes the visual legend cards', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <JuceGridPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await screen.findByText('Audio Grid')
    expect(screen.queryByRole('list', { name: 'Routing flows' })).toBeNull()
  })

  it('normalizes malformed persisted flow slots instead of crashing on first render', async () => {
    localStorage.setItem('map2_juce_grid_flows_v2', JSON.stringify([
      { id: 'flow-0', chainId: 1, label: 'Lead', color: '#0f62fe', muted: 'true', solo: false, dryWetMix: 75 },
      null,
      { id: 'flow-0', chainId: 'bad', label: '', color: '', muted: false, solo: 'true', dryWetMix: 140 },
    ]))
    localStorage.setItem('map2_juce_grid_routing_v2', JSON.stringify({
      mode: 'parallel_blend',
      activeSlotId: 'missing-flow',
      blendPositions: { 'flow-0': 55, 'missing-flow': 20 },
      morphProgress: 4,
      morphSourceSlotId: 'missing-flow',
      morphTargetSlotId: 'missing-flow',
      seriesOrder: ['missing-flow', 'flow-0', 'flow-0'],
    }))
    localStorage.setItem('map2_juce_grid_active_v2', '99')

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <JuceGridPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByTestId('juce-grid-routing-visualizer')).toBeTruthy()

    await waitFor(() => {
      const storedFlows = JSON.parse(localStorage.getItem('map2_juce_grid_flows_v2') ?? '[]')
      expect(storedFlows).toEqual([
        { id: 'flow-0', chainId: 1, label: 'Lead', color: '#0f62fe', muted: true, solo: false, dryWetMix: 75 },
        { id: 'flow-1', chainId: null, label: 'B', color: '#60a5fa', muted: false, solo: false, dryWetMix: 100 },
        { id: 'flow-2', chainId: null, label: 'C', color: '#22c55e', muted: false, solo: true, dryWetMix: 100 },
      ])
      expect(JSON.parse(localStorage.getItem('map2_juce_grid_routing_v2') ?? '{}')).toEqual({
        mode: 'parallel_blend',
        activeSlotId: 'flow-0',
        blendPositions: { 'flow-0': 55 },
        morphProgress: 1,
        morphSourceSlotId: null,
        morphTargetSlotId: null,
        seriesOrder: ['flow-0', 'flow-1', 'flow-2'],
      })
      expect(localStorage.getItem('map2_juce_grid_active_v2')).toBe('2')
    })
  })

  it('renders a readable per-flow signal-chain level control and resets it to unity on double click', async () => {
    localStorage.setItem('map2_juce_grid_flows_v2', JSON.stringify([
      { id: 'flow-0', chainId: 1, label: 'Lead', color: '#0f62fe', muted: false, solo: false, dryWetMix: 75 },
      { id: 'flow-1', chainId: null, label: 'B', color: '#24a148', muted: false, solo: false, dryWetMix: 100 },
    ]))

    mockLivePathLayout = {
      status: 'available',
      activeFlowIds: ['flow-0'],
      primaryFlowId: 'flow-0',
      secondaryFlowId: null,
      flowStates: {
        'flow-0': { activeAudio: true, dimmed: false, sidechainKey: false },
      },
      mobileSummary: ['Flow Lead live'],
      groups: [
        {
          id: 'group-0',
          kind: 'series',
          tone: 'active',
          dashed: false,
          flowIds: ['flow-0'],
        },
      ],
    }

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <JuceGridPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await screen.findByTestId('juce-grid-routing-visualizer')

    const levelControl = await screen.findByTestId('juce-grid-flow-level-flow-0')
    const slider = within(levelControl).getByRole('slider', { name: 'Signal chain Lead level' })

    expect(slider.getAttribute('aria-valuenow')).toBe('75')

    fireEvent.doubleClick(slider)

    await waitFor(() => {
      const storedFlows = JSON.parse(localStorage.getItem('map2_juce_grid_flows_v2') ?? '[]')
      expect(storedFlows[0].dryWetMix).toBe(100)
    })
  })

  it('restores the selected block, editor-open state, and scroll position from localStorage', async () => {
    localStorage.setItem('map2_juce_grid_flows_v2', JSON.stringify([
      { id: 'flow-0', chainId: 1, label: 'A', color: '#2563eb', muted: false, solo: false, dryWetMix: 100 },
      { id: 'flow-1', chainId: 1, label: 'B', color: '#60a5fa', muted: false, solo: false, dryWetMix: 100 },
    ]))
    localStorage.setItem('map2_juce_grid_active_v2', '0')
    localStorage.setItem('map2_juce_grid_selected_plugin_uri', 'map2://juce/modulation/chorus')
    localStorage.setItem('map2_juce_grid_effect_modal_open', 'true')
    localStorage.setItem('map2_juce_grid_scroll_top', '144')

    mockChainsApi.list.mockResolvedValue({
      chains: [
        {
          id: 1,
          name: 'Song 1',
          is_active: true,
          plugins: [
            {
              uri: 'map2://juce/modulation/chorus',
              name: 'Alpha Chorus',
              position: 0,
              bypassed: false,
              parameters: {},
            },
          ],
        },
      ],
      active_chain_id: 1,
    })

    mockPluginsApi.discover.mockResolvedValue({
      plugins: [
        {
          uri: 'map2://juce/modulation/chorus',
          name: 'Alpha Chorus',
          category: 'Modulation',
          parameters: [],
        },
      ],
    })

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <JuceGridPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByTestId('juce-grid-parameter-editor')).toBeTruthy()

    await waitFor(() => {
      expect(window.scrollTo).toHaveBeenCalledWith({ top: 144, behavior: 'auto' })
    })
  })

  it('keeps docs access inside the keyboard shortcuts modal after removing the masthead docs button', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <JuceGridPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('button', { name: 'Shortcuts' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Docs' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Shortcuts' }))

    expect(await screen.findByRole('heading', { name: 'Keyboard shortcuts' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open docs' })).toBeTruthy()
  })

  it('waits for settled discovery before warning about missing selected plugin metadata', async () => {
    localStorage.setItem('map2_juce_grid_flows_v2', JSON.stringify([
      { id: 'flow-0', chainId: 1, label: 'A', color: '#2563eb', muted: false, solo: false, dryWetMix: 100 },
      { id: 'flow-1', chainId: 1, label: 'B', color: '#60a5fa', muted: false, solo: false, dryWetMix: 100 },
    ]))
    localStorage.setItem('map2_juce_grid_active_v2', '0')
    localStorage.setItem('map2_juce_grid_selected_plugin_uri', 'map2://juce/modulation/chorus')
    localStorage.setItem('map2_juce_grid_effect_modal_open', 'true')

    mockChainsApi.list.mockResolvedValue({
      chains: [
        {
          id: 1,
          name: 'Song 1',
          is_active: true,
          plugins: [
            {
              uri: 'map2://juce/modulation/chorus',
              name: 'Alpha Chorus',
              position: 0,
              bypassed: false,
              parameters: {},
            },
          ],
        },
      ],
      active_chain_id: 1,
    })

    let resolveDiscover: ((value: { plugins: Array<unknown> }) => void) | null = null
    mockPluginsApi.discover.mockImplementation(
      () => new Promise((resolve) => {
        resolveDiscover = resolve as (value: { plugins: Array<unknown> }) => void
      }),
    )

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <JuceGridPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await waitFor(() => expect(mockPluginsApi.discover).toHaveBeenCalled())
    expect(warnSpy).not.toHaveBeenCalled()

    await act(async () => {
      resolveDiscover?.({ plugins: [] })
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(
        '[JuceGridPage] Selected plugin metadata is missing after discovery settled:',
        expect.objectContaining({
          selectedPluginUri: 'map2://juce/modulation/chorus',
          discoveredPluginCount: 0,
        }),
      )
    })
    expect(warnSpy).toHaveBeenCalledTimes(1)
    warnSpy.mockRestore()
  })

  it('opens the bottom editor panel on block select and closes it when the same block is selected again', async () => {
    localStorage.setItem('map2_juce_grid_flows_v2', JSON.stringify([
      { id: 'flow-0', chainId: 1, label: 'A', color: '#2563eb', muted: false, solo: false, dryWetMix: 100 },
      { id: 'flow-1', chainId: 1, label: 'B', color: '#60a5fa', muted: false, solo: false, dryWetMix: 100 },
    ]))
    localStorage.setItem('map2_juce_grid_active_v2', '0')

    mockLivePathLayout = {
      status: 'available',
      activeFlowIds: ['flow-0'],
      primaryFlowId: 'flow-0',
      secondaryFlowId: null,
      flowStates: {
        'flow-0': { activeAudio: true, dimmed: false, sidechainKey: false },
      },
      mobileSummary: ['Flow A live'],
      groups: [
        {
          id: 'group-0',
          kind: 'series',
          tone: 'active',
          dashed: false,
          flowIds: ['flow-0'],
        },
      ],
    }

    mockChainsApi.list.mockResolvedValue({
      chains: [
        {
          id: 1,
          name: 'Song 1',
          is_active: true,
          plugins: [
            {
              uri: 'map2://juce/modulation/chorus',
              name: 'Alpha Chorus',
              position: 0,
              bypassed: false,
              parameters: {},
            },
          ],
        },
      ],
      active_chain_id: 1,
    })

    mockPluginsApi.discover.mockResolvedValue({
      plugins: [
        {
          uri: 'map2://juce/modulation/chorus',
          name: 'Alpha Chorus',
          category: 'Modulation',
          parameters: [],
        },
      ],
    })

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <JuceGridPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const selectButtons = await screen.findAllByRole('button', { name: 'Select block' })
    fireEvent.click(selectButtons[0])

    expect(await screen.findByLabelText('Block parameter editor')).toBeTruthy()
    expect(screen.getByTestId('juce-grid-parameter-editor')).toBeTruthy()

    fireEvent.click(selectButtons[0])

    await waitFor(() => {
      expect(screen.queryByLabelText('Block parameter editor')).toBeNull()
    })
  })

  it('moves the selected block left from the bottom editor controls and keyboard arrows', async () => {
    localStorage.setItem('map2_juce_grid_flows_v2', JSON.stringify([
      { id: 'flow-0', chainId: 1, label: 'A', color: '#2563eb', muted: false, solo: false, dryWetMix: 100 },
      { id: 'flow-1', chainId: 1, label: 'B', color: '#60a5fa', muted: false, solo: false, dryWetMix: 100 },
    ]))
    localStorage.setItem('map2_juce_grid_active_v2', '0')

    mockLivePathLayout = {
      status: 'available',
      activeFlowIds: ['flow-0'],
      primaryFlowId: 'flow-0',
      secondaryFlowId: null,
      flowStates: {
        'flow-0': { activeAudio: true, dimmed: false, sidechainKey: false },
      },
      mobileSummary: ['Flow A live'],
      groups: [
        {
          id: 'group-0',
          kind: 'series',
          tone: 'active',
          dashed: false,
          flowIds: ['flow-0'],
        },
      ],
    }

    mockChainsApi.list.mockResolvedValue({
      chains: [
        {
          id: 1,
          name: 'Song 1',
          is_active: true,
          plugins: [
            {
              uri: 'map2://juce/dynamics/compressor',
              name: 'Studio Compressor',
              position: 0,
              bypassed: false,
              parameters: {},
            },
            {
              uri: 'map2://juce/modulation/chorus',
              name: 'Alpha Chorus',
              position: 1,
              bypassed: false,
              parameters: {},
            },
          ],
        },
      ],
      active_chain_id: 1,
    })

    mockPluginsApi.discover.mockResolvedValue({
      plugins: [
        {
          uri: 'map2://juce/dynamics/compressor',
          name: 'Studio Compressor',
          category: 'Dynamics',
          parameters: [],
        },
        {
          uri: 'map2://juce/modulation/chorus',
          name: 'Alpha Chorus',
          category: 'Modulation',
          parameters: [],
        },
      ],
    })

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <JuceGridPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const selectButtons = await screen.findAllByRole('button', { name: 'Select block' })
    fireEvent.click(selectButtons[0])

    const moveLeftButton = await screen.findByRole('button', { name: 'Move selected block left' })
    fireEvent.click(moveLeftButton)

    await waitFor(() => {
      expect(mockChainsApi.reorderPlugins).toHaveBeenCalledWith(1, [
        { uri: 'map2://juce/modulation/chorus', position: 1 },
        { uri: 'map2://juce/dynamics/compressor', position: 0 },
      ])
    })

    fireEvent.keyDown(window, { key: 'ArrowLeft' })

    await waitFor(() => {
      expect(mockChainsApi.reorderPlugins).toHaveBeenCalledTimes(2)
    })
  })

  it('uses the tablet launcher and editor sheet flow without reopening the old touch toolbar', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1024,
    })
    Object.defineProperty(window.navigator, 'maxTouchPoints', {
      configurable: true,
      value: 5,
    })
    Object.defineProperty(window, 'ontouchstart', {
      configurable: true,
      writable: true,
      value: true,
    })
    localStorage.setItem('map2_juce_grid_flows_v2', JSON.stringify([
      { id: 'flow-0', chainId: 1, label: 'A', color: '#2563eb', muted: false, solo: false, dryWetMix: 100 },
      { id: 'flow-1', chainId: 1, label: 'B', color: '#60a5fa', muted: false, solo: false, dryWetMix: 100 },
    ]))
    localStorage.setItem('map2_juce_grid_active_v2', '0')

    mockLivePathLayout = {
      status: 'available',
      activeFlowIds: ['flow-0'],
      primaryFlowId: 'flow-0',
      secondaryFlowId: null,
      flowStates: {
        'flow-0': { activeAudio: true, dimmed: false, sidechainKey: false },
      },
      mobileSummary: ['Flow A live'],
      groups: [
        {
          id: 'group-0',
          kind: 'series',
          tone: 'active',
          dashed: false,
          flowIds: ['flow-0'],
        },
      ],
    }

    mockChainsApi.list.mockResolvedValue({
      chains: [
        {
          id: 1,
          name: 'Song 1',
          is_active: true,
          plugins: [
            {
              uri: 'map2://juce/modulation/chorus',
              name: 'Alpha Chorus',
              position: 0,
              bypassed: false,
              parameters: {
                mix: 50,
                depth: 0.6,
                rate: 1.2,
                delay_time: 20,
                feedback: 25,
                tone: 0.4,
                misc: 0.2,
              },
            },
          ],
        },
      ],
      active_chain_id: 1,
    })

    mockPluginsApi.discover.mockResolvedValue({
      plugins: [
        {
          uri: 'map2://juce/modulation/chorus',
          name: 'Alpha Chorus',
          category: 'Modulation',
          parameters: [
            { index: 0, name: 'Mix', symbol: 'mix', min: 0, max: 100, default: 50, is_toggled: false, is_log: false },
            { index: 1, name: 'Depth', symbol: 'depth', min: 0, max: 1, default: 0.5, is_toggled: false, is_log: false },
            { index: 2, name: 'Rate', symbol: 'rate', min: 0.1, max: 5, default: 1, is_toggled: false, is_log: false },
            { index: 3, name: 'Delay Time', symbol: 'delay_time', min: 1, max: 50, default: 20, is_toggled: false, is_log: false },
            { index: 4, name: 'Feedback', symbol: 'feedback', min: 0, max: 100, default: 25, is_toggled: false, is_log: false },
            { index: 5, name: 'Tone', symbol: 'tone', min: 0, max: 1, default: 0.4, is_toggled: false, is_log: false },
            { index: 6, name: 'Misc', symbol: 'misc', min: 0, max: 1, default: 0.2, is_toggled: false, is_log: false },
          ],
        },
      ],
    })

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          initialEntries={['/juce-grid']}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <JuceGridPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(screen.queryByRole('tablist', { name: 'Audio Grid compact workflows' })).toBeNull()
    expect(screen.queryByText('Audio Grid')).toBeNull()
    expect(screen.getByLabelText('Tablet workspace launcher')).toBeTruthy()
    expect(container.querySelector('.juce-grid-page__floating-actions')).toBeNull()

    const selectButton = (await screen.findAllByRole('button', { name: 'Select block' }))[0]
    fireEvent.click(selectButton)

    expect(screen.queryByLabelText('Block parameter editor')).toBeNull()
    expect(screen.queryByLabelText('Selected block touch actions')).toBeNull()
    expect(screen.getByRole('button', { name: 'Open editor' }).getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(screen.getByRole('button', { name: 'Open editor' }))

    await screen.findByLabelText('Block parameter editor')
    expect(container.querySelector('.juce-grid-page__tablet-editor-shell')).toBeTruthy()
  }, 15000)

  it('keeps compact workflow tabs for non-touch tablet-width layouts', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1024,
    })
    Object.defineProperty(window.navigator, 'maxTouchPoints', {
      configurable: true,
      value: 0,
    })

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <JuceGridPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await screen.findByText('Audio Grid')
    const compactTabList = screen.getByRole('tablist', { name: 'Audio Grid compact workflows' })
    expect(compactTabList).toBeTruthy()
    expect(within(compactTabList).getByRole('tab', { name: 'Grid' })).toBeTruthy()
    expect(within(compactTabList).getByRole('tab', { name: 'Editor' })).toBeTruthy()
    expect(within(compactTabList).getByRole('tab', { name: 'Routing' })).toBeTruthy()
    expect(within(compactTabList).getByRole('tab', { name: 'Presets' })).toBeTruthy()
  })

  it('uses the live plugin card router with a forced Carbon template when the strategy resolves to template mode', async () => {
    mockResolveLivePluginCardStrategy.mockReturnValue({ renderMode: 'template', template: 'modulation' })
    localStorage.setItem('map2_juce_grid_flows_v2', JSON.stringify([
      { id: 'flow-0', chainId: 1, label: 'A', color: '#2563eb', muted: false, solo: false, dryWetMix: 100 },
      { id: 'flow-1', chainId: 1, label: 'B', color: '#60a5fa', muted: false, solo: false, dryWetMix: 100 },
    ]))
    localStorage.setItem('map2_juce_grid_active_v2', '0')

    mockLivePathLayout = {
      status: 'available',
      activeFlowIds: ['flow-0'],
      primaryFlowId: 'flow-0',
      secondaryFlowId: null,
      flowStates: {
        'flow-0': { activeAudio: true, dimmed: false, sidechainKey: false },
      },
      mobileSummary: ['Flow A live'],
      groups: [
        {
          id: 'group-0',
          kind: 'series',
          tone: 'active',
          dashed: false,
          flowIds: ['flow-0'],
        },
      ],
    }

    mockChainsApi.list.mockResolvedValue({
      chains: [
        {
          id: 1,
          name: 'Song 1',
          is_active: true,
          plugins: [
            {
              uri: 'map2://juce/modulation/chorus',
              name: 'Alpha Chorus',
              position: 0,
              bypassed: false,
              parameters: {},
            },
          ],
        },
      ],
      active_chain_id: 1,
    })

    mockPluginsApi.discover.mockResolvedValue({
      plugins: [
        {
          uri: 'map2://juce/modulation/chorus',
          name: 'Alpha Chorus',
          category: 'Modulation',
          parameters: [
            { index: 0, name: 'Mix', symbol: 'mix', min: 0, max: 100, default: 50, is_toggled: false, is_log: false },
          ],
        },
      ],
    })

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <JuceGridPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const selectButton = (await screen.findAllByRole('button', { name: 'Select block' }))[0]
    fireEvent.click(selectButton)

    expect(await screen.findByLabelText('Block parameter editor')).toBeTruthy()
    expect((await screen.findByTestId('plugin-card-router')).getAttribute('data-force-template')).toBe('modulation')
    expect(screen.queryByTestId('juce-grid-parameter-editor')).toBeNull()
  })

  it('shows the mobile block screen below the supported viewport width', async () => {
    mockUseIsMobile.mockReturnValue(true)
    Object.defineProperty(window, 'ontouchstart', {
      configurable: true,
      writable: true,
      value: true,
    })

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <JuceGridPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(screen.getByText('This experience requires an iPad or larger display')).toBeTruthy()
    expect(screen.getByText('Rotate your tablet or exit Split View, then reopen Audio Grid.')).toBeTruthy()
    expect(screen.queryByText('Audio Grid')).toBeNull()
  })

  it('keeps flow controls inside the lead live-path group and removes the legacy top toolbar card', async () => {
    mockLivePathLayout = {
      status: 'available',
      activeFlowIds: ['flow-0', 'flow-1'],
      primaryFlowId: 'flow-0',
      secondaryFlowId: null,
      mobileSummary: ['Parallel: A 100%, B 100%'],
      groups: [
        {
          id: 'parallel-main',
          kind: 'parallel',
          title: 'Live parallel blend',
          flowIds: ['flow-0', 'flow-1'],
          tone: 'active',
          entryLabel: 'Input Split',
          exitLabel: 'Mix to Output',
        },
      ],
      flowStates: {
        'flow-0': {
          flowId: 'flow-0',
          activeAudio: true,
          dimmed: false,
          placeholder: false,
          annotation: 'Live branch',
          secondaryAnnotation: 'Blend 100%',
          sidechainKey: false,
        },
        'flow-1': {
          flowId: 'flow-1',
          activeAudio: true,
          dimmed: false,
          placeholder: false,
          annotation: 'Live branch',
          secondaryAnnotation: 'Blend 100%',
          sidechainKey: false,
        },
      },
    }

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <JuceGridPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const addFlowButton = await screen.findByRole('button', { name: 'Add flow' })
    const masthead = addFlowButton.closest('.juce-grid-page__thin-bar')
    expect(masthead).toBeTruthy()
    expect(within(masthead as HTMLElement).getByRole('button', { name: 'Audio Nodes' })).toBeTruthy()
    expect(within(masthead as HTMLElement).queryByRole('button', { name: 'Docs' })).toBeNull()
    expect(within(masthead as HTMLElement).getByRole('button', { name: 'Add flow' })).toBeTruthy()
    expect(within(masthead as HTMLElement).getByRole('button', { name: 'Configure routing' })).toBeTruthy()
    expect(within(masthead as HTMLElement).getByRole('button', { name: /Clear flows/i })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Place a single Flow inside a Chain' })).toBeNull()
    expect(container.querySelector('.juce-grid-page__toolbar')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Redo' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Show Audio Grid controls' })).toBeNull()
  })

  it('shows state labels while suppressing branch labels for continuing serial rows', async () => {
    localStorage.setItem('map2_juce_grid_flows_v2', JSON.stringify([
      { id: 'flow-0', chainId: 1, label: 'A', color: '#0f62fe', muted: false, solo: false, dryWetMix: 100 },
      { id: 'flow-1', chainId: 2, label: 'B', color: '#24a148', muted: false, solo: false, dryWetMix: 100 },
    ]))
    localStorage.setItem('map2_juce_grid_routing_v2', JSON.stringify({
      mode: 'series',
      activeSlotId: 'flow-0',
      blendPositions: {},
      morphProgress: 0,
      morphSourceSlotId: null,
      morphTargetSlotId: null,
      seriesOrder: ['flow-0', 'flow-1'],
    }))
    localStorage.setItem('map2_juce_grid_active_v2', '0')
    mockLivePathLayout = {
      status: 'available',
      activeFlowIds: ['flow-0'],
      primaryFlowId: 'flow-0',
      secondaryFlowId: null,
      mobileSummary: ['Series: A > B'],
      groups: [
        { id: 'series-main', kind: 'series', title: 'Place a single Flow inside a Chain', flowIds: ['flow-0'], tone: 'active' },
        { id: 'series-context', kind: 'inactive', title: 'Dimmed context', flowIds: ['flow-1'], tone: 'dim' },
      ],
      flowStates: {
        'flow-0': {
          flowId: 'flow-0',
          activeAudio: true,
          dimmed: false,
          placeholder: false,
          annotation: 'Serial stage',
          secondaryAnnotation: 'Processing live audio',
          sidechainKey: false,
        },
        'flow-1': {
          flowId: 'flow-1',
          activeAudio: false,
          dimmed: true,
          placeholder: false,
          annotation: 'Inactive branch',
          secondaryAnnotation: 'Held offline',
          sidechainKey: false,
        },
      },
    }

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <JuceGridPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await screen.findByTestId('juce-grid-live-path-entry-flow-0')

    expect(screen.getByTestId('juce-grid-live-path-entry-flow-0').textContent).toContain('Live')
    expect(screen.getByTestId('juce-grid-live-path-entry-flow-1').textContent).toContain('Dim')
    expect(screen.queryByTestId('juce-grid-live-path-branch-flow-0')).toBeNull()
    expect(screen.queryByTestId('juce-grid-live-path-branch-flow-1')).toBeNull()
    expect(screen.getByTestId('juce-grid-live-path-mobile-sliver-flow-0').textContent).toContain('Live')
    expect(screen.getByTestId('juce-grid-live-path-mobile-sliver-flow-1').textContent).toContain('Dim')
    expect(screen.queryByText('Inactive branch')).toBeNull()
  })

  it('keeps the desktop branch identity and controls together in the header above the signal canvas', async () => {
    localStorage.setItem('map2_juce_grid_flows_v2', JSON.stringify([
      { id: 'flow-0', chainId: 1, label: 'A', color: '#0f62fe', muted: false, solo: false, dryWetMix: 77 },
    ]))
    localStorage.setItem('map2_juce_grid_active_v2', '0')
    mockLivePathLayout = {
      status: 'available',
      activeFlowIds: ['flow-0'],
      primaryFlowId: 'flow-0',
      secondaryFlowId: null,
      mobileSummary: ['Flow A live'],
      groups: [
        {
          id: 'lead-flow',
          kind: 'parallel',
          title: 'Lead flow',
          flowIds: ['flow-0'],
          tone: 'active',
        },
      ],
      flowStates: {
        'flow-0': {
          flowId: 'flow-0',
          activeAudio: true,
          dimmed: false,
          placeholder: false,
          annotation: 'Live branch',
          secondaryAnnotation: 'Lead chain',
          sidechainKey: false,
        },
      },
    }

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <JuceGridPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await screen.findByText('Song 1')

    const header = container.querySelector('.juce-grid-page__flow-card.is-active .juce-grid-page__flow-card-header') as HTMLElement | null
    expect(header).toBeTruthy()

    const headerChildren = Array.from(header?.children ?? [])
    expect(headerChildren).toHaveLength(2)
    expect(headerChildren[0]?.classList.contains('juce-grid-page__flow-card-heading')).toBe(true)
    expect(headerChildren[1]?.classList.contains('juce-grid-page__flow-card-service-bar')).toBe(true)

    const serviceBar = headerChildren[1] as HTMLElement
    expect(serviceBar.getAttribute('role')).toBe('toolbar')
    expect(serviceBar.getAttribute('aria-label')).toBe('A flow services')
    expect(serviceBar.querySelector('.juce-grid-page__flow-card-action-group--routing')).toBeTruthy()
    expect(serviceBar.querySelector('.juce-grid-page__flow-card-action-group--level')).toBeTruthy()
    expect(serviceBar.querySelector('.juce-grid-page__flow-card-action-group--utility')).toBeTruthy()

    const summaryGroup = within(header as HTMLElement).getByRole('group', { name: 'A summary' })
    expect(summaryGroup.textContent).toContain('0 loaded blocks')
    expect(summaryGroup.textContent).toContain('Selected / Live path / Lead chain / 0 blocks')
    expect((header as HTMLElement).nextElementSibling?.classList.contains('juce-grid-page__flow-card-content')).toBe(true)
  })

  it('closes the plugin chooser immediately when adding a plugin', async () => {
    mockLivePathLayout = {
      status: 'available',
      activeFlowIds: ['flow-0'],
      primaryFlowId: 'flow-0',
      secondaryFlowId: null,
      mobileSummary: ['Flow A live'],
      groups: [
        {
          id: 'lead-flow',
          kind: 'parallel',
          title: 'Lead flow',
          flowIds: ['flow-0'],
          tone: 'active',
        },
      ],
      flowStates: {
        'flow-0': {
          flowId: 'flow-0',
          activeAudio: true,
          dimmed: false,
          placeholder: false,
          annotation: 'Live branch',
          secondaryAnnotation: 'Lead chain',
          sidechainKey: false,
        },
      },
    }
    localStorage.setItem('map2_juce_grid_flows_v2', JSON.stringify([
      { id: 'flow-0', chainId: 1, label: 'A', color: '#0f62fe', muted: false, solo: false, dryWetMix: 100 },
      { id: 'flow-1', chainId: null, label: 'B', color: '#24a148', muted: false, solo: false, dryWetMix: 100 },
    ]))
    localStorage.setItem('map2_juce_grid_active_v2', '0')
    mockPluginsApi.discover.mockResolvedValue({
      plugins: [
        {
          uri: 'map2://juce/modulation/chorus',
          name: 'Test Chorus',
          author: 'MAP2 Audio',
          category: 'Modulation',
          format: 'JUCE',
        },
      ],
    })
    mockChainsApi.addPlugin.mockImplementation(() => new Promise(() => {}))

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <JuceGridPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    fireEvent.keyDown(window, { key: 'a' })

    await screen.findByText('Test Chorus')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    })

    expect(mockChainsApi.addPlugin).toHaveBeenCalledWith(1, 'map2://juce/modulation/chorus')
    await waitFor(() => {
      expect(screen.queryByText('Test Chorus')).toBeNull()
    })
    expect(mockSetQueryData).toHaveBeenCalled()
  })

  it('shows the add block control only on the active flow', async () => {
    localStorage.setItem('map2_juce_grid_flows_v2', JSON.stringify([
      { id: 'flow-0', chainId: 1, label: 'A', color: '#0f62fe', muted: false, solo: false, dryWetMix: 100 },
      { id: 'flow-1', chainId: 2, label: 'B', color: '#24a148', muted: false, solo: false, dryWetMix: 100 },
    ]))
    localStorage.setItem('map2_juce_grid_routing_v2', JSON.stringify({
      mode: 'ab_switch',
      activeSlotId: 'flow-0',
      blendPositions: {},
      morphProgress: 0,
      morphSourceSlotId: null,
      morphTargetSlotId: null,
      seriesOrder: ['flow-0', 'flow-1'],
    }))
    localStorage.setItem('map2_juce_grid_active_v2', '0')
    mockLivePathLayout = {
      status: 'available',
      activeFlowIds: ['flow-0'],
      primaryFlowId: 'flow-0',
      secondaryFlowId: null,
      mobileSummary: ['Flow A live'],
      groups: [
        {
          id: 'lead-flow',
          kind: 'parallel',
          title: 'Lead flow',
          flowIds: ['flow-0', 'flow-1'],
          tone: 'active',
        },
      ],
      flowStates: {
        'flow-0': {
          flowId: 'flow-0',
          activeAudio: true,
          dimmed: false,
          placeholder: false,
          annotation: 'Live branch',
          secondaryAnnotation: 'Lead chain',
          sidechainKey: false,
        },
        'flow-1': {
          flowId: 'flow-1',
          activeAudio: false,
          dimmed: true,
          placeholder: false,
          annotation: 'Inactive branch',
          secondaryAnnotation: 'Standby chain',
          sidechainKey: false,
        },
      },
    }

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <JuceGridPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await screen.findByText('Song 1')

    const activeCard = container.querySelector('.juce-grid-page__flow-card.is-active') as HTMLElement | null
    const inactiveCard = container.querySelector('.juce-grid-page__flow-card:not(.is-active)') as HTMLElement | null

    expect(activeCard).toBeTruthy()
    expect(inactiveCard).toBeTruthy()
    expect(within(activeCard as HTMLElement).getByRole('button', { name: 'Add block' })).toBeTruthy()
    expect(within(inactiveCard as HTMLElement).queryByRole('button', { name: 'Add block' })).toBeNull()
  })

  it('keeps the add block control on the routing-active branch even when another flow is selected', async () => {
    localStorage.setItem('map2_juce_grid_flows_v2', JSON.stringify([
      { id: 'flow-0', chainId: 1, label: 'A', color: '#0f62fe', muted: false, solo: false, dryWetMix: 100 },
      { id: 'flow-1', chainId: 2, label: 'B', color: '#24a148', muted: false, solo: false, dryWetMix: 100 },
    ]))
    localStorage.setItem('map2_juce_grid_routing_v2', JSON.stringify({
      mode: 'ab_switch',
      activeSlotId: 'flow-0',
      blendPositions: {},
      morphProgress: 0,
      morphSourceSlotId: null,
      morphTargetSlotId: null,
      seriesOrder: ['flow-0', 'flow-1'],
    }))
    localStorage.setItem('map2_juce_grid_active_v2', '1')
    mockLivePathLayout = {
      status: 'available',
      activeFlowIds: ['flow-0'],
      primaryFlowId: 'flow-0',
      secondaryFlowId: null,
      mobileSummary: ['Flow A live'],
      groups: [
        {
          id: 'lead-flow',
          kind: 'parallel',
          title: 'Lead flow',
          flowIds: ['flow-0', 'flow-1'],
          tone: 'active',
        },
      ],
      flowStates: {
        'flow-0': {
          flowId: 'flow-0',
          activeAudio: true,
          dimmed: false,
          placeholder: false,
          annotation: 'Live branch',
          secondaryAnnotation: 'Lead chain',
          sidechainKey: false,
        },
        'flow-1': {
          flowId: 'flow-1',
          activeAudio: false,
          dimmed: true,
          placeholder: false,
          annotation: 'Inactive branch',
          secondaryAnnotation: 'Standby chain',
          sidechainKey: false,
        },
      },
    }

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <JuceGridPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await screen.findByText('Song 1')

    const routingActiveCard = container.querySelector('.juce-grid-page__flow-card:not(.is-active)') as HTMLElement | null
    const selectedInactiveCard = container.querySelector('.juce-grid-page__flow-card.is-active') as HTMLElement | null

    expect(routingActiveCard).toBeTruthy()
    expect(selectedInactiveCard).toBeTruthy()
    expect(within(routingActiveCard as HTMLElement).getByRole('button', { name: 'Add block' })).toBeTruthy()
    expect(within(selectedInactiveCard as HTMLElement).queryByRole('button', { name: 'Add block' })).toBeNull()
  })

  it('renders canonical MIDI mappings from midiApiV2 in the modal', async () => {
    mockMidiApiV2.getStatus.mockResolvedValue({
      enabled: true,
      input_open: true,
      output_open: false,
      input_device: 'Test Input',
      output_device: null,
      mappings_count: 1,
      commands_count: 0,
      learning: false,
      last_channel: 3,
      last_cc: 11,
      last_value: 96,
    })
    mockMidiApiV2.getMappings.mockResolvedValue({
      mappings: [
        {
          id: 77,
          channel: 0,
          cc: 11,
          chain_id: null,
          target_plugin_uri: 'map2://juce/modulation/chorus',
          target_param_index: 0,
          target_param_symbol: 'depth',
          min_val: 0,
          max_val: 1,
          curve_type: 'linear',
          invert: false,
          feedback_enabled: false,
          feedback_cc: null,
          name: 'Chorus - Depth',
          group_id: null,
          is_learned: true,
          is_enabled: true,
        },
      ],
      count: 1,
    })
    mockPluginsApi.discover.mockResolvedValue({
      plugins: [
        {
          uri: 'map2://juce/modulation/chorus',
          name: 'Chorus',
          author: 'MAP2 Audio',
          category: 'Modulation',
          format: 'JUCE',
          in_ports: 2,
          out_ports: 2,
          parameters: [
            { index: 0, name: 'Depth', symbol: 'depth', min: 0, max: 1, default: 0.5, is_toggled: false, is_log: false },
          ],
        },
      ],
    })

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <JuceGridPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    fireEvent.click(await screen.findByLabelText('Open MIDI'))
    expect(await screen.findByText('Depth')).toBeTruthy()
    expect(screen.getByText('Chorus')).toBeTruthy()
    expect(screen.getByText('CC 11')).toBeTruthy()
    expect(mockMidiApiV2.getMappings).toHaveBeenCalledWith()
  })

  it('renders the desktop selected block MIDI panel beside the editor shell', async () => {
    localStorage.setItem('map2_juce_grid_flows_v2', JSON.stringify([
      { id: 'flow-0', chainId: 1, label: 'A', color: '#2563eb', muted: false, solo: false, dryWetMix: 100 },
      { id: 'flow-1', chainId: 1, label: 'B', color: '#60a5fa', muted: false, solo: false, dryWetMix: 100 },
    ]))
    localStorage.setItem('map2_juce_grid_active_v2', '0')
    localStorage.setItem('map2_juce_grid_selected_plugin_uri', 'map2://juce/modulation/chorus')
    localStorage.setItem('map2_juce_grid_effect_modal_open', 'true')

    mockChainsApi.list.mockResolvedValue({
      chains: [
        {
          id: 1,
          name: 'Song 1',
          is_active: true,
          plugins: [
            {
              uri: 'map2://juce/modulation/chorus',
              name: 'Chorus',
              position: 0,
              bypassed: false,
              parameters: {
                depth: 0.42,
                mix: 0.58,
              },
            },
          ],
        },
      ],
      active_chain_id: 1,
    })
    mockPluginsApi.discover.mockResolvedValue({
      plugins: [
        {
          uri: 'map2://juce/modulation/chorus',
          name: 'Chorus',
          author: 'MAP2 Audio',
          category: 'Modulation',
          class_label: 'Effect',
          version: '1.0.0',
          license: 'AGPL-3.0-only',
          has_ui: false,
          in_ports: 2,
          out_ports: 2,
          format: 'JUCE',
          parameters: [
            { index: 0, name: 'Depth', symbol: 'depth', min: 0, max: 1, default: 0.5, is_toggled: false, is_log: false },
            { index: 1, name: 'Mix', symbol: 'mix', min: 0, max: 1, default: 0.5, is_toggled: false, is_log: false },
          ],
        },
      ],
    })
    mockMidiApiV2.getMappings.mockResolvedValue({
      mappings: [
        {
          id: 77,
          channel: 1,
          cc: 11,
          chain_id: 1,
          target_plugin_uri: 'map2://juce/modulation/chorus',
          target_param_index: 0,
          target_param_symbol: 'depth',
          min_val: 0,
          max_val: 1,
          curve_type: 'linear',
          invert: false,
          feedback_enabled: true,
          feedback_cc: null,
          name: 'Chorus - Depth',
          group_id: null,
          is_learned: true,
          is_enabled: true,
        },
      ],
      count: 1,
    })

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <JuceGridPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByText('Selected block MIDI')).toBeTruthy()
    expect(screen.getByText('Focused parameter')).toBeTruthy()
    expect(mockMidiApiV2.getMappings).toHaveBeenCalledWith({ plugin_uri: 'map2://juce/modulation/chorus' })
  })

  it('marks snapshot and MIDI modal rows with alternating stripe tones', async () => {
    mockFlowSnapshotsApi.list.mockResolvedValue({
      snapshots: [
        {
          id: 11,
          name: 'Verse Wash',
          description: 'Favorite snapshot A',
          updated_at: '2026-03-15T18:00:00.000Z',
          flow_slots: [{ id: 'flow-0', label: 'A', color: '#0f62fe' }],
          is_active: false,
          is_favorite: true,
          program_number: null,
        },
        {
          id: 12,
          name: 'Chorus Lift',
          description: 'Favorite snapshot B',
          updated_at: '2026-03-15T18:05:00.000Z',
          flow_slots: [{ id: 'flow-1', label: 'B', color: '#24a148' }],
          is_active: false,
          is_favorite: true,
          program_number: null,
        },
      ],
      count: 2,
      active_id: null,
    })
    mockMidiApiV2.getStatus.mockResolvedValue({
      enabled: true,
      input_open: true,
      output_open: false,
      input_device: 'Test Input',
      output_device: null,
      mappings_count: 2,
      commands_count: 0,
      learning: false,
      last_channel: 3,
      last_cc: 11,
      last_value: 96,
    })
    mockMidiApiV2.getMappings.mockResolvedValue({
      mappings: [
        {
          id: 77,
          channel: 0,
          cc: 11,
          chain_id: null,
          target_plugin_uri: 'map2://juce/modulation/chorus',
          target_param_index: 0,
          target_param_symbol: 'depth',
          min_val: 0,
          max_val: 1,
          curve_type: 'linear',
          invert: false,
          feedback_enabled: false,
          feedback_cc: null,
          name: 'Chorus - Depth',
          group_id: null,
          is_learned: true,
          is_enabled: true,
        },
        {
          id: 78,
          channel: 0,
          cc: 12,
          chain_id: null,
          target_plugin_uri: 'map2://juce/delay',
          target_param_index: 1,
          target_param_symbol: 'mix',
          min_val: 0,
          max_val: 1,
          curve_type: 'linear',
          invert: false,
          feedback_enabled: false,
          feedback_cc: null,
          name: 'Stereo Delay - Mix',
          group_id: null,
          is_learned: true,
          is_enabled: true,
        },
      ],
      count: 2,
    })
    mockPluginsApi.discover.mockResolvedValue({
      plugins: [
        {
          uri: 'map2://juce/modulation/chorus',
          name: 'Chorus',
          author: 'MAP2 Audio',
          category: 'Modulation',
          format: 'JUCE',
          in_ports: 2,
          out_ports: 2,
          parameters: [
            { index: 0, name: 'Depth', symbol: 'depth', min: 0, max: 1, default: 0.5, is_toggled: false, is_log: false },
          ],
        },
        {
          uri: 'map2://juce/delay',
          name: 'Stereo Delay',
          author: 'MAP2 Audio',
          category: 'Delay',
          format: 'JUCE',
          in_ports: 2,
          out_ports: 2,
          parameters: [
            { index: 1, name: 'Mix', symbol: 'mix', min: 0, max: 1, default: 0.5, is_toggled: false, is_log: false },
          ],
        },
      ],
    })

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <JuceGridPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    fireEvent.click(await screen.findByLabelText('Open Snapshots'))
    expect(await screen.findByText('Verse Wash')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Open MIDI'))
    expect(await screen.findByText('Depth')).toBeTruthy()

    const snapshotTiles = Array.from(
      container.querySelectorAll('.juce-grid-page__snapshot-list .juce-grid-page__snapshot-tile'),
    ) as HTMLElement[]
    const midiTiles = Array.from(
      container.querySelectorAll('.juce-grid-page__midi-tile'),
    ) as HTMLElement[]

    expect(snapshotTiles).toHaveLength(2)
    expect(snapshotTiles[0].getAttribute('data-stripe-tone')).toBe('base')
    expect(snapshotTiles[1].getAttribute('data-stripe-tone')).toBe('alt')
    expect(midiTiles).toHaveLength(2)
    expect(midiTiles[0].getAttribute('data-stripe-tone')).toBe('base')
    expect(midiTiles[1].getAttribute('data-stripe-tone')).toBe('alt')
  })

  it('queries canonical chain-scoped MIDI mappings when the active-chain filter is selected', async () => {
    localStorage.setItem('map2_juce_grid_flows_v2', JSON.stringify([
      { id: 'flow-0', chainId: 1, label: 'A', color: '#0f62fe', muted: false, solo: false, dryWetMix: 100 },
      { id: 'flow-1', chainId: null, label: 'B', color: '#24a148', muted: false, solo: false, dryWetMix: 100 },
    ]))
    localStorage.setItem('map2_juce_grid_active_v2', '0')

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <JuceGridPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    fireEvent.click(await screen.findByLabelText('Open MIDI'))
    await screen.findAllByText('MIDI mappings')

    fireEvent.click(screen.getByRole('button', { name: 'Active chain' }))

    await waitFor(() => {
      expect(mockMidiApiV2.getMappings).toHaveBeenCalledWith({ chain_id: 1 })
    })
  })

  it('stops canonical MIDI learn even when the backend is already learning before local arming', async () => {
    mockMidiApiV2.getLearnStatus.mockResolvedValue({
      learning: true,
      target: {
        parameter_symbol: 'depth',
        parameter_index: 0,
      },
    })

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <JuceGridPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    fireEvent.click(await screen.findByLabelText('Open MIDI'))
    await screen.findAllByText('Learning')
    const [midiLearnButton] = await screen.findAllByRole('button', { name: 'MIDI learn' })
    fireEvent.click(midiLearnButton)

    await waitFor(() => {
      expect(mockMidiApiV2.stopLearn).toHaveBeenCalled()
    })
  })

  it('groups featured native browser results ahead of LV2 entries without duplication', async () => {
    mockLivePathLayout = {
      status: 'available',
      activeFlowIds: ['flow-0'],
      primaryFlowId: 'flow-0',
      secondaryFlowId: null,
      mobileSummary: ['Flow A live'],
      groups: [
        {
          id: 'lead-flow',
          kind: 'parallel',
          title: 'Lead flow',
          flowIds: ['flow-0'],
          tone: 'active',
        },
      ],
      flowStates: {
        'flow-0': {
          flowId: 'flow-0',
          activeAudio: true,
          dimmed: false,
          placeholder: false,
          annotation: 'Live branch',
          secondaryAnnotation: 'Lead chain',
          sidechainKey: false,
        },
      },
    }
    localStorage.setItem('map2_juce_grid_flows_v2', JSON.stringify([
      { id: 'flow-0', chainId: 1, label: 'A', color: '#0f62fe', muted: false, solo: false, dryWetMix: 100 },
    ]))
    localStorage.setItem('map2_juce_grid_active_v2', '0')
    mockPluginsApi.discover.mockResolvedValue({
      plugins: [
        {
          uri: 'urn:test:zeta-delay',
          name: 'Zeta Delay',
          author: 'Gamma Audio',
          category: 'Delay',
          format: 'LV2',
        },
        {
          uri: 'map2://juce/nam',
          name: 'Neural Amp Modeler',
          author: 'MAP2 Audio',
          category: 'Amplifier',
          format: 'JUCE',
        },
        {
          uri: 'urn:test:alpha-delay',
          name: 'Alpha Delay',
          author: 'Beta Audio',
          category: 'Delay',
          format: 'LV2',
        },
        {
          uri: 'map2://juce/drums',
          name: 'Drums',
          author: 'MAP2 Audio',
          category: 'Instrument',
          format: 'JUCE',
        },
      ],
    })

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <JuceGridPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    fireEvent.keyDown(window, { key: 'a' })

    await screen.findByText('Alpha Delay')

    const featuredGroups = container.querySelector('.juce-grid-page__browser-featured-groups') as HTMLElement | null
    expect(featuredGroups).toBeTruthy()
    expect(within(featuredGroups as HTMLElement).getByText('Linear and Nonlinear Modeling')).toBeTruthy()
    expect(within(featuredGroups as HTMLElement).getByText('Instruments')).toBeTruthy()
    expect(within(featuredGroups as HTMLElement).getByText('Neural Amp Modeler')).toBeTruthy()
    expect(within(featuredGroups as HTMLElement).getByText('Drums')).toBeTruthy()
    expect(within(featuredGroups as HTMLElement).queryByText('Alpha Delay')).toBeNull()

    expect(screen.queryByText('Core integrated')).toBeNull()

    const browserPluginNames = Array.from(
      container.querySelectorAll('.juce-grid-page__browser-plugin-tile h3'),
    ).map((element) => element.textContent?.trim())

    expect(browserPluginNames).toEqual([
      'Neural Amp Modeler',
      'Drums',
      'Alpha Delay',
      'Zeta Delay',
    ])
  })
})
