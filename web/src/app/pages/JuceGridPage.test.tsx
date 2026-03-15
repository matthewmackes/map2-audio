import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

const mockSideNav = jest.fn(({ children, expanded, isFixedNav, className }: any) => (
  <nav
    data-testid="juce-grid-snapshot-rail"
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

jest.mock('@carbon/react', () => {
  const actual = jest.requireActual('@carbon/react')
  return {
    ...actual,
    SideNav: (props: any) => mockSideNav(props),
    SideNavItems: ({ children, className }: any) => <ul className={className}>{children}</ul>,
    SideNavFooter: ({ assistiveText, expanded, onToggle }: any) => (
      <button
        type="button"
        data-testid="juce-grid-snapshot-rail-footer"
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
  useIsMobile: () => false,
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

jest.mock('../../map2/components/MIDI/MidiLearnButton', () => () => <button type="button">MIDI learn</button>)

jest.mock('../components/PluginDetailsModal', () => ({
  PluginDetailsModal: () => null,
}))

jest.mock('../components/Controls/NumberInput', () => ({
  NumberInput: ({ value }: { value: number }) => <input aria-label="Number input" readOnly value={value} />,
}))

jest.mock('../components/presets/PresetImportDialog', () => ({
  PresetImportDialog: () => null,
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
}))

jest.mock('./JuceGridParameterEditor', () => ({
  JuceGridParameterEditor: () => <div data-testid="juce-grid-parameter-editor">Editor</div>,
}))

jest.mock('./JuceGridRoutingVisualizer', () => ({
  JuceGridRoutingVisualizer: () => <div data-testid="juce-grid-routing-visualizer">Routing</div>,
  getJuceGridRoutingInspectorItems: () => [],
}))

jest.mock('./JuceGridSignalCanvas', () => ({
  JuceGridSignalCanvas: () => <div data-testid="juce-grid-signal-canvas">Signal canvas</div>,
}))

jest.mock('./juceGridLivePath', () => ({
  buildJuceGridLivePath: () => ({
    status: 'unavailable',
    activeFlowIds: [],
    primaryFlowId: null,
    secondaryFlowId: null,
    flowStates: {},
    mobileSummary: ['No live path available'],
    groups: [],
  }),
}))

const { JuceGridPage } = require('./JuceGridPage') as typeof import('./JuceGridPage')

describe('JuceGridPage snapshot rail layout', () => {
  beforeEach(() => {
    localStorage.clear()
    mockSideNav.mockClear()
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
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1440,
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
    delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver
    delete (globalThis as { fetch?: typeof fetch }).fetch
  })

  it('keeps the desktop snapshot rail scoped to the workspace column on first render', async () => {
    localStorage.setItem('map2_juce_grid_snapshots_panel', 'false')

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

    const rail = screen.getByTestId('juce-grid-snapshot-rail')

    expect(rail.getAttribute('data-fixed')).toBe('false')
    expect(rail.getAttribute('data-expanded')).toBe('false')
    expect(container.querySelector('.juce-grid-page__workspace.has-snapshot-rail')).toBeTruthy()
    expect(container.querySelector('.juce-grid-page__snapshot-rail-shell')).toBeTruthy()
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

  it('keeps flow controls inside the live audio path card instead of the top toolbar', async () => {
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

    const livePathSummary = await screen.findByRole('region', { name: 'Live audio path' })
    expect(within(livePathSummary).getByRole('button', { name: 'Add flow' })).toBeTruthy()
    expect(within(livePathSummary).getByRole('button', { name: /Clear flows/i })).toBeTruthy()

    const toolbarButtons = container.querySelector('.juce-grid-page__toolbar .juce-grid-page__toolbar-buttons')
    expect(toolbarButtons).toBeTruthy()
    expect(within(toolbarButtons as HTMLElement).queryByRole('button', { name: 'Add flow' })).toBeNull()
    expect(within(toolbarButtons as HTMLElement).queryByRole('button', { name: /Clear flows/i })).toBeNull()
  })

  it('closes the plugin chooser immediately when adding a plugin', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Add plugin' }))

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

  it('renders plugin browser results in a stable alphabetical order', async () => {
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
          uri: 'map2://juce/modulation/chorus',
          name: 'Chorus',
          author: 'MAP2 Audio',
          category: 'Modulation',
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
          uri: 'map2://juce/amp/amp-sim',
          name: 'Amp Sim',
          author: 'MAP2 Audio',
          category: 'Amplifier',
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

    fireEvent.click(screen.getByRole('button', { name: 'Add plugin' }))

    await screen.findByText('Alpha Delay')

    const browserPluginNames = Array.from(
      container.querySelectorAll('.juce-grid-page__browser-plugin-tile h3'),
    ).map((element) => element.textContent?.trim())

    expect(browserPluginNames).toEqual([
      'Amp Sim',
      'Chorus',
      'Alpha Delay',
      'Zeta Delay',
    ])
  })
})
