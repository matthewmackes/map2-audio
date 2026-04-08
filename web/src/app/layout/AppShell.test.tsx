import React from 'react'
import '@testing-library/jest-dom'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'

import { AppShell } from './AppShell'

const mockRestartBackend = jest.fn()
const mockReloadHomeDesktopShell = jest.fn()
const mockReturnHomeDesktopToBoot = jest.fn()

jest.mock('../hooks/useHostMachine', () => ({
  useHostMachineInfo: () => ({
    data: {
      hostname: 'map2-host',
      kernel_version: '6.9.0-rt',
      os_version: 'Fedora Linux 42',
    },
  }),
}))

jest.mock('../hooks/useHomePlatformStatus', () => ({
  useHomePlatformStatus: () => ({
    avb: { label: 'AVB: operational', state: 'ok' },
    avdecc: { label: 'AVDECC: 2 entities', state: 'ok' },
    nodes: { label: 'Nodes: 1 active', state: 'ok' },
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

jest.mock('../components/NodeNav/NodeNavBar', () => ({
  NodeNavBar: () => <div data-testid="node-nav-bar">Nodes</div>,
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

describe('AppShell floating launcher shell', () => {
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
    mockRestartBackend.mockReset()
    mockRestartBackend.mockResolvedValue({ status: 'restarting', message: 'Backend service is restarting...' })
    mockReloadHomeDesktopShell.mockReset()
    mockReturnHomeDesktopToBoot.mockReset()
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

  it('renders the floating launcher on the landing route without a titlebar', () => {
    const { container } = renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
      ['/'],
    )

    expect(screen.getByLabelText('Open platform menu')).toBeInTheDocument()
    expect(container.querySelector('.window-titlebar')).toBeNull()
    expect(container.querySelector('.shell-launcher')).toBeTruthy()
    expect(container.querySelector('.app-window')).toBeNull()
  })

  it('renders non-landing routes inside window chrome with the floating launcher', () => {
    const { container } = renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
      ['/intelfx'],
    )

    expect(screen.getByLabelText('Open platform menu')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close IntelFX Rack' })).toBeInTheDocument()
    expect(container.querySelector('.window-titlebar__title')).toHaveTextContent('IntelFX Rack')
    expect(container.querySelector('.shell-launcher__button-icon')).toBeTruthy()
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

  it('starts Perform in true fullscreen and restores the launcher on Escape', async () => {
    const { container } = renderInRouter(
      <AppShell>
        <div>perform content</div>
      </AppShell>,
      ['/perform'],
    )

    expect(container.querySelector('.shell-launcher')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Close Stage' })).toBeNull()

    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => expect(container.querySelector('.shell-launcher')).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Close Stage' })).toBeInTheDocument()
  })

  it('shows the merged floating menu with header, system summary, and launcher tiles', () => {
    renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
      ['/intelfx'],
    )

    fireEvent.click(screen.getByLabelText('Open platform menu'))

    expect(screen.getByText('Mackes Audio Platform')).toBeInTheDocument()
    expect(screen.getByText('Platform 0000000000000001')).toBeInTheDocument()
    expect(screen.getByText('Fedora Linux 42')).toBeInTheDocument()
    expect(screen.getByText('map2-host')).toBeInTheDocument()
    expect(screen.getByTestId('node-nav-bar')).toBeInTheDocument()
    expect(screen.getByTestId('shell-latency-pressure-readout')).toBeInTheDocument()
    expect(screen.getByTestId('taskbar-clock')).toBeInTheDocument()
    expect(screen.getByText('AVB: operational')).toBeInTheDocument()
    expect(screen.getByText('AVDECC: 2 entities')).toBeInTheDocument()
    expect(screen.getByText('Nodes: 1 active')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Show more launchers/i })).not.toBeInTheDocument()
    expect(screen.getAllByRole('link').length).toBeGreaterThan(6)
  })

  it('routes launcher tiles as direct links', () => {
    renderInRouter(
      <AppShell>
        <LocationProbe />
      </AppShell>,
      ['/intelfx'],
    )

    fireEvent.click(screen.getByLabelText('Open platform menu'))
    fireEvent.click(screen.getByRole('link', { name: /Home/i }))

    expect(screen.getByTestId('route-probe')).toHaveTextContent('/')
  })

  it('opens the power menu and runs refresh and logout actions', () => {
    renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
      ['/intelfx'],
    )

    fireEvent.click(screen.getByLabelText('Open platform menu'))
    fireEvent.click(screen.getByRole('button', { name: 'Power' }))

    const powerMenu = screen.getByRole('menu', { name: 'Power actions' })
    expect(within(powerMenu).getByRole('button', { name: 'Restart Backend' })).toBeInTheDocument()
    expect(within(powerMenu).getByRole('button', { name: 'Refresh Desktop' })).toBeInTheDocument()
    expect(within(powerMenu).getByRole('button', { name: 'Log Out' })).toBeInTheDocument()

    fireEvent.click(within(powerMenu).getByRole('button', { name: 'Refresh Desktop' }))
    expect(mockReloadHomeDesktopShell).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByLabelText('Open platform menu'))
    fireEvent.click(screen.getByRole('button', { name: 'Power' }))
    fireEvent.click(within(screen.getByRole('menu', { name: 'Power actions' })).getByRole('button', { name: 'Log Out' }))
    expect(mockReturnHomeDesktopToBoot).toHaveBeenCalledTimes(1)
  })

  it('confirms backend restart from the power menu and shows restart progress', async () => {
    renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
      ['/intelfx'],
    )

    fireEvent.click(screen.getByLabelText('Open platform menu'))
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

  it('renders the reconnect banner above the floating launcher when websocket state degrades', () => {
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
    expect(container.querySelector('.shell-launcher')?.previousElementSibling).toHaveClass('mobile-connection-banner')
  })
})
