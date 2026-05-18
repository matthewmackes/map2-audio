import React from 'react'
import '@testing-library/jest-dom'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import { AppShell } from '../layout/AppShell'
import { HomePage } from './HomePage'

const mockUpdateSettings = jest.fn()
const mockRestartBackend = jest.fn()
const mockReloadHomeDesktopShell = jest.fn()
const mockReturnHomeDesktopToBoot = jest.fn()
const mockHardwareLocationNotes: Record<string, { hostname: string } | null> = {}
const mockUseCluster = jest.fn()
const mockDeviceLocations: Record<string, { nodeId: string; hostname: string; kind: string; status: string } | null> = {
  'edirol-ua1000': { nodeId: 'node-a', hostname: 'rack-a', kind: 'usb_audio', status: 'online' },
  'hotone-jogg': null,
  'lexicon-mpx1': { nodeId: 'node-b', hostname: 'rack-b', kind: 'midi', status: 'online' },
  'rocktron-intelfx': { nodeId: 'node-c', hostname: 'rack-c', kind: 'midi', status: 'online' },
}
const mockSpecialSettings = {
  enabled: true,
  hiddenPlugins: [],
  menuLocation: 'hidden',
  pinnedRoutes: [] as string[],
  landingTiles: [] as Array<{ route: string; size: 'small' | 'medium' | 'large' }>,
}

jest.mock('../../assets/NEW-map2-landing-bg.png', () => 'NEW-map2-landing-bg.png')
jest.mock('../../assets/MAP2-LOGO.png', () => 'MAP2-LOGO.png')

jest.mock('../hooks/useSpecialSettings', () => ({
  useSpecialSettings: () => ({
    settings: mockSpecialSettings,
    isLoading: false,
    error: null,
    updateSettings: mockUpdateSettings,
    reload: jest.fn(),
  }),
}))

jest.mock('../hooks/useDeviceLocation', () => ({
  useClusterHardwareInventory: () => ({
    data: { nodes: {} },
    isLoading: false,
    error: null,
  }),
  useDeviceLocation: (deviceType: string) => ({
    location: mockDeviceLocations[deviceType] ?? null,
    isLoading: false,
    error: null,
  }),
  useHardwareMenuLocations: () => ({
    locationsByRoute: mockHardwareLocationNotes,
  }),
}))

jest.mock('../hooks/useNodePageContext', () => ({
  useNodePageContext: () => ({
    localNode: {
      node_id: 'MANAGEMENT-NODE-1',
      hostname: 'MAP2-TESTBED',
      display_label: null,
      role: 'all_in_one',
      status: 'ok',
      is_local: true,
    },
    viewedNode: {
      node_id: 'MANAGEMENT-NODE-1',
      hostname: 'MAP2-TESTBED',
      display_label: null,
      role: 'all_in_one',
      status: 'ok',
      is_local: true,
    },
    viewedNodeId: 'MANAGEMENT-NODE-1',
    topologyNodes: [
      {
        node_id: 'MANAGEMENT-NODE-1',
        hostname: 'MAP2-TESTBED',
        display_label: null,
        role: 'all_in_one',
        status: 'ok',
        is_local: true,
      },
    ],
    nodeTopologyQuery: {
      isLoading: false,
      isError: false,
    },
  }),
}))

jest.mock('../hooks/useNodeTopology', () => ({
  useNodeTopology: () => ({
    data: {
      nodes: [
        {
          node_id: 'MANAGEMENT-NODE-1',
          hostname: 'MAP2-TESTBED',
          status: 'ok',
        },
      ],
    },
  }),
}))

jest.mock('../contexts/useCluster', () => ({
  useCluster: () => mockUseCluster(),
}))

jest.mock('../hooks/useHomePlatformStatus', () => ({
  useHomePlatformStatus: () => ({
    avb: { label: 'AVB: operational', state: 'ok' },
    avdecc: { label: 'AVDECC: 1 entity', state: 'ok' },
    nodes: { label: 'Nodes: 1 active', state: 'ok' },
  }),
}))

jest.mock('../hooks/usePlatformRemediation', () => ({
  usePlatformRemediationSummary: () => ({
    data: {
      status: 'ok',
      counts: {
        adoption: {},
        sync: {},
        clone: {},
      },
      nodes: [],
      workflows: {
        sync: { available: true },
      },
    },
  }),
}))

jest.mock('../../map2/clients/platform', () => ({
  systemApi: {
    restartBackend: (...args: unknown[]) => mockRestartBackend(...args),
  },
}))

jest.mock('./homeDesktopSession', () => {
  const actual = jest.requireActual('./homeDesktopSession')
  return {
    ...actual,
    reloadHomeDesktopShell: () => mockReloadHomeDesktopShell(),
    returnHomeDesktopToBoot: () => mockReturnHomeDesktopToBoot(),
  }
})

const mockUseWebSocketConnection = jest.fn()

jest.mock('../../map2/hooks/useWebSocket', () => ({
  useWebSocketConnection: () => mockUseWebSocketConnection(),
  useWebSocketTopic: () => undefined,
}))

jest.mock('../../map2/mpx1Api', () => ({
  mpx1Api: {
    getMidiPorts: jest.fn(),
    disconnectMidi: jest.fn(),
  },
  useMPX1OverviewStatus: () => ({
    state: { connected: false, current_program: 0, rtmidi_available: false },
    error: null,
    isLoading: false,
    refresh: jest.fn(),
  }),
  useMPX1State: () => ({
    state: { connected: false, current_program: 0 },
    programs: [],
    shadow: {},
    setProgram: jest.fn(),
    refresh: jest.fn(),
  }),
}))

jest.mock('../../map2/intelfxApi', () => ({
  useIntelFXOverviewStatus: () => ({
    state: { connected: false, current_program: 0, rtmidi_available: false },
    error: null,
    isLoading: false,
    refresh: jest.fn(),
  }),
  useIntelFXState: () => ({
    state: { connected: false, current_program: 0, rtmidi_available: false },
    programs: [],
    shadow: {},
    setProgram: jest.fn(),
    refresh: jest.fn(),
    error: null,
  }),
}))

jest.mock('../components/Devices/Tesira/hooks/useTesiraApi', () => ({
  useTesiraDevices: () => ({
    data: [
      {
        device_id: 'tesira-main',
        host: '10.0.0.10',
        port: 23,
        name: 'Tesira Forte',
        connected: true,
        serial_number: 'ABC123',
        firmware_version: '1.0.0',
        fault_count: 0,
        avb_stream_count: 4,
        ptp_state: 'slave',
        source_node_id: 'node-a',
        source_hostname: 'rack-a',
      },
    ],
    isLoading: false,
    error: null,
  }),
}))

jest.mock('../components/Devices/MPX1/MPX1MegaMenu', () => ({
  MPX1MegaMenu: () => <div data-testid="mpx1-mega-menu">MPX1 menu</div>,
}))

jest.mock('../components/NodeNav/NodeMiniCard', () => ({
  NodeMiniCard: ({ node }: { node: { hostname: string } }) => (
    <div data-testid="node-mini-card">{node.hostname}</div>
  ),
}))

jest.mock('../components/NodeNav/NodeNavBar', () => ({
  NodeNavBar: () => <div data-testid="node-nav-bar" />,
}))

jest.mock('../components/PageTransition', () => ({
  PageTransition: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

jest.mock('../components/LatencyPressureShellReadout', () => ({
  LatencyPressureShellReadout: () => <div data-testid="shell-latency-pressure-readout">09</div>,
}))

jest.mock('../components/TaskbarClock', () => ({
  TaskbarClock: () => <div data-testid="taskbar-clock">9:41 AM</div>,
}))

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="route-probe">{`${location.pathname}${location.search}`}</div>
}

function ShellStubPage({
  testId,
  children,
}: {
  testId: string
  children: React.ReactNode
}) {
  return (
    <>
      <div data-testid={testId}>{children}</div>
    </>
  )
}

function renderDesktopExperience(initialEntries: string[] = ['/']) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={initialEntries}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <AppShell>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/workspace" element={<ShellStubPage testId="workspace-page">Unified Workspaces</ShellStubPage>} />
            <Route path="/workspace/artifacts" element={<ShellStubPage testId="artifacts-page">Audio Artifacts Workspace</ShellStubPage>} />
            <Route path="/workspace/platforms/management" element={<ShellStubPage testId="platform-management-page">Device(s) Manager</ShellStubPage>} />
            <Route path="/snapshot-editor" element={<ShellStubPage testId="snapshot-editor-page">Snapshot Editor</ShellStubPage>} />
            <Route path="/sequencer" element={<ShellStubPage testId="brain-page">Brain</ShellStubPage>} />
            <Route path="/perform" element={<div data-testid="perform-page">Stage Mode</div>} />
            <Route path="/devices" element={<ShellStubPage testId="devices-page">Devices Workspace</ShellStubPage>} />
            <Route path="/platforms/theme" element={<ShellStubPage testId="theme-page">Theme Settings</ShellStubPage>} />
          </Routes>
          <LocationProbe />
        </AppShell>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Desktop experience integration', () => {
  beforeEach(() => {
    mockUseCluster.mockReturnValue({
      activeNodeId: null,
      nodes: [],
      localNodeId: 'MANAGEMENT-NODE-1',
      isClusterMode: false,
      setActiveNode: jest.fn(),
      getNodeApiPrefix: jest.fn(() => ''),
      getNodeWsPrefix: jest.fn(() => ''),
    })
    jest.useFakeTimers()
    ;(globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as typeof ResizeObserver
    mockUseWebSocketConnection.mockReturnValue({
      status: 'connected',
      client: null,
    })
    mockUpdateSettings.mockReset()
    mockRestartBackend.mockReset()
    mockRestartBackend.mockResolvedValue({ status: 'restarting', message: 'Backend service is restarting...' })
    mockReloadHomeDesktopShell.mockReset()
    mockReturnHomeDesktopToBoot.mockReset()
    mockSpecialSettings.pinnedRoutes = []
    mockSpecialSettings.landingTiles = []
    window.localStorage.clear()
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1440,
    })
    Object.defineProperty(window.navigator, 'maxTouchPoints', {
      configurable: true,
      value: 0,
    })
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }),
    })
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  it('flows from boot splash to desktop to app open to close back to desktop', async () => {
    const { container } = renderDesktopExperience(['/'])

    expect(await screen.findByTestId('home-shell')).toBeInTheDocument()
    const navTree = screen.getByLabelText('Global navigation')
    fireEvent.click(within(navTree).getAllByText('Snapshot Editor')[0])

    await waitFor(() => {
      expect(screen.getByTestId('route-probe')).toHaveTextContent('/snapshot-editor')
    })
    expect(screen.getByRole('button', { name: /^Close / })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /pinned taskbar app/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /^Close / }))

    await act(async () => {
      jest.advanceTimersByTime(50)
    })

    expect(screen.getByTestId('route-probe')).toHaveTextContent('/')
    expect(await screen.findByTestId('home-shell')).toBeInTheDocument()
    expect(container.querySelector('.global-tree-nav')).toBeTruthy()
  })

  it('navigates through the persistent global tree rail', async () => {
    renderDesktopExperience(['/workspace'])

    const navTree = screen.getByLabelText('Global navigation')
    expect(navTree).toBeInTheDocument()
    fireEvent.click(within(navTree).getAllByText('Snapshot Editor')[0])

    await waitFor(() => {
      expect(screen.getByTestId('route-probe')).toHaveTextContent('/snapshot-editor')
    })
  })

  it('renders the operations-first landing shell instead of the legacy launcher tile grid', async () => {
    renderDesktopExperience(['/'])

    const homeShell = await screen.findByTestId('home-shell')

    expect(within(homeShell).getByRole('heading', { name: 'MAP: Mackes Audio Platform' })).toBeInTheDocument()
    expect(within(homeShell).queryByText('Live operations surface')).toBeNull()
    expect(within(homeShell).getByText('Operations table')).toBeInTheDocument()
    expect(within(homeShell).getByRole('table', { name: 'Operations table' })).toBeInTheDocument()
    expect(within(homeShell).queryByLabelText('Telemetry overview')).toBeNull()

    for (const label of ['Device(s) Manager', 'Advanced MIDI', 'Drum-Machine', 'SynthForge', 'Program Manager', 'Desktop Objects']) {
      expect(within(homeShell).queryByText(label)).toBeNull()
    }
  })

  it('runs refresh, logout, and restart actions from the rail footer', async () => {
    renderDesktopExperience(['/workspace'])

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(mockReloadHomeDesktopShell).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Log Out' }))
    expect(mockReturnHomeDesktopToBoot).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Restart' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm restart' }))

    await waitFor(() => expect(mockRestartBackend).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByText('Restarting backend')).toBeInTheDocument())
  })

  it('renders the perform route with the perform shell class and without a window title strip', async () => {
    const { container } = renderDesktopExperience(['/perform'])

    expect(screen.getByTestId('perform-page')).toBeInTheDocument()
    expect(container.querySelector('.app-shell--perform-route')).toBeTruthy()
    expect(container.querySelector('.shell-ws')).toBeNull()
    expect(screen.getByLabelText('Global navigation')).toBeInTheDocument()
  })
})
