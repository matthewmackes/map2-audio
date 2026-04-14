import React from 'react'
import '@testing-library/jest-dom'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import { ShellWindowTitleStrip } from '../components/shared/ShellWindowTitleStrip'
import { AppShell } from '../layout/AppShell'
import { HomePage } from './HomePage'
import { OutboardHardwareDevicePage } from './OutboardHardwareDevicePage'
import { OutboardHardwareOverviewPage } from './OutboardHardwareOverviewPage'
import { WorkspaceOutboardHardwareOutlet } from './workspace-hub/outboard-hardware/WorkspaceOutboardHardwareOutlet'

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

jest.mock('../components/Tesira/hooks/useTesiraApi', () => ({
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

jest.mock('../components/MPX1/MPX1MegaMenu', () => ({
  MPX1MegaMenu: () => <div data-testid="mpx1-mega-menu">MPX1 menu</div>,
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
      <ShellWindowTitleStrip />
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
            <Route path="/perform" element={<div data-testid="perform-page">Stage Mode</div>} />
            <Route path="/workspace/outboard-hardware" element={<WorkspaceOutboardHardwareOutlet />}>
              <Route index element={<OutboardHardwareOverviewPage />} />
              <Route path=":deviceId" element={<OutboardHardwareDevicePage />} />
            </Route>
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

    expect(screen.getByRole('heading', { name: 'Mackes Audio Platform' })).toBeInTheDocument()
    expect(screen.queryByTestId('home-desktop')).toBeNull()

    await act(async () => {
      jest.advanceTimersByTime(4000)
    })

    fireEvent.click(screen.getByLabelText('Open platform menu'))
    fireEvent.click(await screen.findByRole('menuitem', { name: /Workspaces/i }))

    expect(screen.getByTestId('route-probe')).toHaveTextContent('/workspace')
    expect(screen.getByTestId('workspace-page')).toBeInTheDocument()
    expect(screen.getByText('Unified Workspaces')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close Workspaces' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /pinned taskbar app/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Close Workspaces' }))

    await act(async () => {
      jest.advanceTimersByTime(50)
    })

    expect(screen.getByTestId('route-probe')).toHaveTextContent('/')
    expect(await screen.findByTestId('home-desktop')).toBeInTheDocument()
    expect(container.querySelector('.shell-launcher')).toBeNull()
  })

  it('opens the Start Menu, navigates through it, and closes after routing', async () => {
    renderDesktopExperience(['/workspace'])

    fireEvent.click(screen.getByLabelText('Open platform menu'))
    expect(screen.getByRole('menu', { name: 'Platform menu' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Stage Mode/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: /Stage Mode/i }))

    expect(screen.getByTestId('route-probe')).toHaveTextContent('/perform')
    expect(screen.getByTestId('perform-page')).toBeInTheDocument()
    expect(screen.queryByRole('menu', { name: 'Platform menu' })).toBeNull()
  })

  it('keeps grouped workspace section launchers out of the Start Menu once Workspaces becomes canonical', async () => {
    renderDesktopExperience(['/'])

    await act(async () => {
      jest.advanceTimersByTime(4000)
    })

    fireEvent.click(screen.getByLabelText('Open platform menu'))
    expect(screen.queryByText('Outboard Hardware')).toBeNull()
    expect(screen.queryByText('Audio Artifacts')).toBeNull()
    expect(screen.queryByText('Physical Surfaces')).toBeNull()
    expect(screen.getByRole('menuitem', { name: /Workspaces/i })).toBeInTheDocument()

    for (const label of ['Tesira AVB', 'Edirol UA-1000', 'HoTone JoGG', 'MPX1 Rack', 'IntelFX Rack']) {
      expect(screen.queryByRole('menuitem', { name: new RegExp(label, 'i') })).toBeNull()
    }
  })

  it('runs refresh, logout, and restart actions from the Power menu', async () => {
    renderDesktopExperience(['/workspace'])

    fireEvent.click(screen.getByLabelText('Open platform menu'))
    fireEvent.click(screen.getByRole('button', { name: 'Power actions' }))

    fireEvent.click(within(document.querySelector('.cds--overflow-menu-options') as HTMLElement).getByText('Refresh desktop'))
    expect(mockReloadHomeDesktopShell).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByLabelText('Open platform menu'))
    fireEvent.click(screen.getByRole('button', { name: 'Power actions' }))
    fireEvent.click(within(document.querySelector('.cds--overflow-menu-options') as HTMLElement).getByText('Log out'))
    expect(mockReturnHomeDesktopToBoot).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByLabelText('Open platform menu'))
    fireEvent.click(screen.getByRole('button', { name: 'Power actions' }))
    fireEvent.click(within(document.querySelector('.cds--overflow-menu-options') as HTMLElement).getByText('Restart backend'))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm restart' }))

    await waitFor(() => expect(mockRestartBackend).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByText('Restarting backend')).toBeInTheDocument())
  })

  it('starts Perform in fullscreen and restores the launcher after Escape', async () => {
    const { container } = renderDesktopExperience(['/perform'])

    expect(screen.getByTestId('perform-page')).toBeInTheDocument()
    expect(container.querySelector('.shell-launcher')).toBeNull()

    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => expect(container.querySelector('.shell-launcher')).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'Close Stage' })).toBeNull()
  })
})
