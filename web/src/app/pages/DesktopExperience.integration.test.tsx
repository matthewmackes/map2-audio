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
  useMPX1State: () => ({
    state: { connected: false, current_program: 0 },
    programs: [],
    shadow: {},
    setProgram: jest.fn(),
    refresh: jest.fn(),
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
            <Route path="/artifacts" element={<div data-testid="artifacts-page">Audio Artifacts Workspace</div>} />
            <Route path="/perform" element={<div data-testid="perform-page">Stage Mode</div>} />
            <Route path="/platforms/theme" element={<div data-testid="theme-page">Theme Settings</div>} />
          </Routes>
          <LocationProbe />
        </AppShell>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Desktop experience integration', () => {
  beforeEach(() => {
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
    fireEvent.click(await screen.findByRole('menuitem', { name: /Files/i }))

    expect(screen.getByTestId('route-probe')).toHaveTextContent('/artifacts')
    expect(screen.getByTestId('artifacts-page')).toBeInTheDocument()
    expect(screen.getByText('Program object')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close Artifacts' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /pinned taskbar app/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Close Artifacts' }))
    expect(container.querySelector('.app-window')).toHaveClass('is-closing')

    await act(async () => {
      jest.advanceTimersByTime(200)
    })

    expect(screen.getByTestId('route-probe')).toHaveTextContent('/')
    expect(await screen.findByTestId('home-desktop')).toBeInTheDocument()
  })

  it('opens the Start Menu, navigates through it, and closes after routing', async () => {
    renderDesktopExperience(['/artifacts'])

    fireEvent.click(screen.getByLabelText('Open platform menu'))
    expect(screen.getByRole('menu', { name: 'Platform menu' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Stage Mode/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: /Stage Mode/i }))

    expect(screen.getByTestId('route-probe')).toHaveTextContent('/perform')
    expect(screen.getByTestId('perform-page')).toBeInTheDocument()
    expect(screen.queryByRole('menu', { name: 'Platform menu' })).toBeNull()
  })

  it('runs refresh, logout, and restart actions from the Power menu', async () => {
    renderDesktopExperience(['/artifacts'])

    fireEvent.click(screen.getByLabelText('Open platform menu'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Power' }))

    fireEvent.click(within(screen.getByRole('menu', { name: 'Power actions' })).getByRole('menuitem', { name: 'Refresh Desktop' }))
    expect(mockReloadHomeDesktopShell).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByLabelText('Open platform menu'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Power' }))
    fireEvent.click(within(screen.getByRole('menu', { name: 'Power actions' })).getByRole('menuitem', { name: 'Log Out' }))
    expect(mockReturnHomeDesktopToBoot).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByLabelText('Open platform menu'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Power' }))
    fireEvent.click(within(screen.getByRole('menu', { name: 'Power actions' })).getByRole('menuitem', { name: 'Restart Backend' }))
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
    expect(screen.getByRole('button', { name: 'Close Stage' })).toBeInTheDocument()
  })
})
