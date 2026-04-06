import React from 'react'
import '@testing-library/jest-dom'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'

import { AppShell } from './AppShell'

const mockUpdateSettings = jest.fn()
const mockRestartBackend = jest.fn()
const mockReloadHomeDesktopShell = jest.fn()
const mockReturnHomeDesktopToBoot = jest.fn()
const mockHardwareLocationNotes: Record<string, { hostname: string } | null> = {}
const mockSpecialSettings = {
  enabled: true,
  hiddenPlugins: [],
  menuLocation: 'hidden' as const,
  pinnedRoutes: [] as string[],
  landingTiles: [] as Array<{ route: string; size: 'small' | 'medium' | 'large' }>,
}

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

jest.mock('../../map2/clients/platform', () => ({
  systemApi: {
    restartBackend: (...args: unknown[]) => mockRestartBackend(...args),
  },
}))

jest.mock('../pages/homeDesktopSession', () => {
  const actual = jest.requireActual('../pages/homeDesktopSession')
  return {
    ...actual,
    reloadHomeDesktopShell: () => mockReloadHomeDesktopShell(),
    returnHomeDesktopToBoot: () => mockReturnHomeDesktopToBoot(),
  }
})

const mockUseWebSocketConnection = jest.fn()

jest.mock('../../map2/hooks/useWebSocket', () => ({
  useWebSocketConnection: () => mockUseWebSocketConnection(),
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

function renderInRouter(ui: React.ReactNode, initialEntries: string[] = ['/']) {
  return render(
    <MemoryRouter
      initialEntries={initialEntries}
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      {ui}
    </MemoryRouter>,
  )
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="route-probe">{`${location.pathname}${location.search}`}</div>
}

describe('AppShell desktop taskbar shell', () => {
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
    for (const key of Object.keys(mockHardwareLocationNotes)) {
      delete mockHardwareLocationNotes[key]
    }
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  it('renders the bottom taskbar shell on the landing route without a titlebar', () => {
    const { container } = renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
      ['/'],
    )

    expect(screen.getByLabelText('Primary navigation shell')).toBeTruthy()
    expect(screen.getByLabelText('Open Start menu')).toBeTruthy()
    expect(container.querySelector('.window-titlebar')).toBeNull()
    expect(container.querySelector('.window-taskbar')).toBeTruthy()
    expect(container.querySelector('.app-window')).toBeNull()
  })

  it('renders the taskbar shell on non-landing routes without the legacy titlebar', () => {
    const { container } = renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
      ['/intelfx'],
    )

    expect(screen.getByLabelText('Primary navigation shell')).toBeTruthy()
    expect(screen.getByLabelText('Open Start menu')).toBeTruthy()
    expect(screen.queryByLabelText(/Quick launch/i)).toBeNull()
    expect(screen.getByText('IntelFX Rack')).toBeTruthy()
    expect(screen.getByText('intelfx')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Close IntelFX Rack' })).toBeInTheDocument()
    expect(container.querySelector('.window-titlebar')).toBeNull()
    expect(container.querySelector('.app-window')).toBeTruthy()
    expect(container.querySelector('.window-taskbar__start-mark-icon')).toBeTruthy()
    expect(container.querySelector('.window-taskbar__status--nodes')?.contains(screen.getByTestId('node-nav-bar'))).toBe(true)
    expect(container.querySelector('.window-taskbar__status--latency')?.contains(screen.getByTestId('shell-latency-pressure-readout'))).toBe(true)
    expect(container.querySelector('.window-taskbar__status--clock')?.contains(screen.getByTestId('taskbar-clock'))).toBe(true)
  })

  it('closes the current app window back to the desktop route', async () => {
    const { container } = renderInRouter(
      <AppShell>
        <LocationProbe />
      </AppShell>,
      ['/intelfx'],
    )

    fireEvent.click(screen.getByRole('button', { name: 'Close IntelFX Rack' }))
    expect(container.querySelector('.app-window')).toHaveClass('is-closing')

    await act(async () => {
      jest.advanceTimersByTime(200)
    })

    expect(screen.getByTestId('route-probe')).toHaveTextContent('/')
    expect(container.querySelector('.app-window')).toBeNull()
  })

  it('starts Perform in true fullscreen and restores the taskbar on Escape', async () => {
    const { container } = renderInRouter(
      <AppShell>
        <div>perform content</div>
      </AppShell>,
      ['/perform'],
    )

    expect(container.querySelector('.window-taskbar')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Close Stage' })).toBeNull()

    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => expect(container.querySelector('.window-taskbar')).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Close Stage' })).toBeInTheDocument()
  })

  it('uses the first non-active pinned route as the quick-launch slot', () => {
    mockSpecialSettings.pinnedRoutes = ['/intelfx', '/midi-hub', '/juce-grid']

    renderInRouter(
      <AppShell>
        <LocationProbe />
      </AppShell>,
      ['/intelfx'],
    )

    fireEvent.click(screen.getByLabelText('Quick launch MIDI Hub'))

    expect(screen.getByTestId('route-probe')).toHaveTextContent('/midi-hub')
  })

  it('shows pinned routes only inside the Start menu and sorts them visually', () => {
    mockSpecialSettings.pinnedRoutes = ['/intelfx', '/juce-grid', '/midi-hub', '/perform', '/audio-artifacts', '/platform']

    const { container } = renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
      ['/intelfx'],
    )

    expect(container.querySelectorAll('.start-menu-card').length).toBe(0)

    fireEvent.click(screen.getByLabelText('Open Start menu'))

    for (const label of ['Audio Artifacts', 'Platforms', 'Workspace Catalog', 'Settings', 'Power']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }

    const labels = Array.from(container.querySelectorAll('.start-menu-card__label')).map((node) => node.textContent)
    expect(labels).toEqual(['Audio Grid', 'IntelFX Rack', 'MIDI Hub', 'Stage Mode'])
    expect(container.querySelectorAll('.start-menu-card--tile')).toHaveLength(4)
  })

  it('closes the Start menu when a static shortcut is used', () => {
    renderInRouter(
      <AppShell>
        <LocationProbe />
      </AppShell>,
      ['/intelfx'],
    )

    fireEvent.click(screen.getByLabelText('Open Start menu'))
    fireEvent.click(screen.getByRole('button', { name: 'Workspace Catalog' }))

    expect(screen.getByTestId('route-probe')).toHaveTextContent('/platforms/workspace-catalog')
    expect(screen.queryByRole('button', { name: 'Audio Artifacts' })).toBeNull()
  })

  it('shows the Workspace Catalog CTA when no Start menu tiles are pinned', () => {
    renderInRouter(
      <AppShell>
        <LocationProbe />
      </AppShell>,
      ['/intelfx'],
    )

    fireEvent.click(screen.getByLabelText('Open Start menu'))
    expect(screen.getByText('Pin apps from the Workspace Catalog.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open Workspace Catalog' }))

    expect(screen.getByTestId('route-probe')).toHaveTextContent('/platforms/workspace-catalog')
    expect(screen.queryByText('Pin apps from the Workspace Catalog.')).toBeNull()
  })

  it('opens the Power submenu and runs refresh and logout actions', () => {
    renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
      ['/intelfx'],
    )

    fireEvent.click(screen.getByLabelText('Open Start menu'))
    fireEvent.click(screen.getByRole('button', { name: 'Power' }))

    expect(screen.getByRole('button', { name: 'Restart Backend' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh Page' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log Out' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh Page' }))
    expect(mockReloadHomeDesktopShell).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByLabelText('Open Start menu'))
    fireEvent.click(screen.getByRole('button', { name: 'Power' }))
    fireEvent.click(screen.getByRole('button', { name: 'Log Out' }))
    expect(mockReturnHomeDesktopToBoot).toHaveBeenCalledTimes(1)
  })

  it('confirms backend restart from the Power submenu and shows restart progress', async () => {
    renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
      ['/intelfx'],
    )

    fireEvent.click(screen.getByLabelText('Open Start menu'))
    fireEvent.click(screen.getByRole('button', { name: 'Power' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restart Backend' }))

    expect(screen.getByText(/Audio processing will pause briefly/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm restart' }))

    await waitFor(() => expect(mockRestartBackend).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByText('Restarting backend')).toBeInTheDocument())
    expect(screen.getAllByText('Stopping engine').length).toBeGreaterThan(0)

    await act(async () => {
      jest.advanceTimersByTime(1300)
    })

    expect(screen.getAllByText('Restarting service').length).toBeGreaterThan(0)
  })

  it('renders MPX1 as a Start menu card that opens its pinned mega menu', () => {
    mockSpecialSettings.pinnedRoutes = ['/mpx1']

    renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
      ['/intelfx'],
    )

    fireEvent.click(screen.getByLabelText('Open Start menu'))
    fireEvent.click(screen.getByRole('button', { name: /MPX1 Rack/i }))

    expect(screen.getByTestId('mpx1-mega-menu')).toBeTruthy()
  })

  it('renders pinned platform deep links inside the Start menu as direct routed links', () => {
    mockSpecialSettings.pinnedRoutes = ['/platforms/overview']

    renderInRouter(
      <AppShell>
        <LocationProbe />
      </AppShell>,
      ['/intelfx'],
    )

    fireEvent.click(screen.getByLabelText('Open Start menu'))
    fireEvent.click(screen.getAllByRole('link', { name: /Overview/i })[0])

    expect(screen.getByTestId('route-probe')).toHaveTextContent('/platforms/overview')
  })

  it('shows hardware submenu entries from the Start menu card', () => {
    mockSpecialSettings.pinnedRoutes = ['/hardware-interfaces']
    mockHardwareLocationNotes['/hotone-jogg'] = { hostname: 'rack-b' }

    renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
      ['/intelfx'],
    )

    fireEvent.click(screen.getByLabelText('Open Start menu'))
    fireEvent.click(screen.getByRole('button', { name: /Audio Interfaces/i }))

    expect(screen.queryByText('Edirol UA-1000')).toBeNull()
    expect(screen.queryByText('HoTone JoGG')).toBeNull()
    expect(screen.getByText('Generic Interface')).toBeTruthy()
    expect(screen.getByText('On rack-b')).toBeTruthy()
  })

  it('renders the reconnect banner above the taskbar when websocket state degrades', () => {
    mockUseWebSocketConnection.mockReturnValue({
      status: 'reconnecting',
      client: null,
    })

    const { container } = renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
      ['/intelfx'],
    )

    expect(screen.getByRole('status')).toHaveTextContent('Connection lost - reconnecting...')
    expect(container.querySelector('.window-taskbar')?.previousElementSibling).toHaveClass('mobile-connection-banner')
  })
})
