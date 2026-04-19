import React from 'react'
import '@testing-library/jest-dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AppShell } from '../layout/AppShell'
import { HomePage } from './HomePage'
import { HOME_DESKTOP_SESSION_STORAGE_KEY } from './homeDesktopSession'

const mockUpdateSettings = jest.fn()
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
  useClusterHardwareInventory: () => ({
    data: { devices: [] },
    isLoading: false,
    error: null,
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
    restartBackend: jest.fn(),
  },
}))

jest.mock('../../map2/hooks/useWebSocket', () => ({
  useWebSocketConnection: () => ({
    status: 'connected',
    client: null,
  }),
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

function renderSnapshotHarness(initialEntries: string[] = ['/']) {
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
            <Route path="/workspace/artifacts" element={<div data-testid="artifacts-page">Audio Artifacts Workspace</div>} />
          </Routes>
        </AppShell>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Desktop experience visual snapshots', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    ;(globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as typeof ResizeObserver
    mockUpdateSettings.mockReset()
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

  it('matches the boot splash shell', () => {
    const { container } = renderSnapshotHarness(['/'])
    expect(container.firstChild).toMatchSnapshot()
  })

  it('matches the desktop shell after boot completes', async () => {
    const { container } = renderSnapshotHarness(['/'])

    await act(async () => {
      jest.advanceTimersByTime(4000)
    })

    expect(await screen.findByTestId('home-desktop')).toBeInTheDocument()
    expect(container.firstChild).toMatchSnapshot()
  })

  it('matches the desktop wallpaper context menu', async () => {
    window.localStorage.setItem(
      HOME_DESKTOP_SESSION_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        bootCompletedAt: '2026-04-06T13:00:00.000Z',
        runningRoutes: [],
        currentRoute: '/',
      }),
    )

    const { container } = renderSnapshotHarness(['/'])
    fireEvent.contextMenu(await screen.findByTestId('home-desktop'), { clientX: 80, clientY: 120 })

    expect(screen.getByRole('menu', { name: 'Desktop context menu' })).toBeInTheDocument()
    expect(container.firstChild).toMatchSnapshot()
  })

  it('matches the taskbar and Start Menu shell', () => {
    const { container } = renderSnapshotHarness(['/workspace/artifacts'])
    fireEvent.click(screen.getByLabelText('Open platform menu'))

    expect(screen.getByRole('menu', { name: 'Platform menu' })).toBeInTheDocument()
    expect(container.firstChild).toMatchSnapshot()
  })
})
