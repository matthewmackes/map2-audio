import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { AppShell } from './AppShell'

const mockUpdateSettings = jest.fn()
const mockHardwareLocationNotes: Record<string, { hostname: string } | null> = {}
const mockSpecialSettings = {
  enabled: true,
  hiddenPlugins: [],
  menuLocation: 'hidden' as const,
  pinnedRoutes: [] as string[],
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

jest.mock('../../map2/hooks/useWebSocket', () => ({
  useWebSocketConnection: () => ({
    status: 'connected',
    client: null,
  }),
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

jest.mock('../components/LatencyPressureShellReadout', () => ({
  LatencyPressureShellReadout: () => <div data-testid="shell-latency-pressure-readout">09</div>,
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

describe('AppShell navigation', () => {
  beforeEach(() => {
    mockUpdateSettings.mockReset()
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

  it('renders only Home and shell controls when no routes are pinned', () => {
    const { container } = renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
    )

    expect(screen.getByLabelText('Home')).toBeTruthy()
    expect(screen.getByTestId('shell-latency-pressure-readout')).toBeTruthy()
    expect(screen.queryByLabelText('Open special settings')).toBeNull()
    expect(screen.getByLabelText('Toggle mobile menu')).toBeTruthy()
    expect(screen.queryByLabelText('Open Platforms and Labs window')).toBeNull()
    expect(screen.queryByLabelText('Open advanced menu')).toBeNull()
    expect(screen.queryByLabelText('Open Platform panel')).toBeNull()
    expect(screen.queryByText('Guide')).toBeNull()
    expect(screen.queryByText('About')).toBeNull()
    expect(container.querySelector('.topbar-pro__hero-home-mark')).toBeTruthy()
    expect(container.querySelector('.nav-active-title')).toBeNull()
    expect(container.querySelectorAll('.nav-tabs-center .nav-tab-item').length).toBe(0)
    expect(container.querySelector('.nav-tabs-right-container')?.contains(screen.getByTestId('shell-latency-pressure-readout'))).toBe(true)
  })

  it('uses the compact shell treatment only for touch-tablet /juce-grid', () => {
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

    const { container } = renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
      ['/juce-grid'],
    )

    expect(container.querySelector('.app-shell--juce-grid-tablet')).toBeTruthy()
    expect(container.querySelector('.topbar-pro--juce-grid-tablet')).toBeTruthy()
    expect(container.querySelector('.nav-tabs-right-container')?.contains(screen.getByTestId('shell-latency-pressure-readout'))).toBe(true)
    expect(container.querySelector('.nav-tabs-right')?.contains(screen.getByTestId('node-nav-bar'))).toBe(true)
  })

  it('orders pinned routes by catalog order and caps desktop pins at four items', () => {
    mockSpecialSettings.pinnedRoutes = ['/intelfx', '/juce-grid', '/midi-hub', '/perform', '/audio-artifacts', '/platform']

    const { container } = renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
      ['/intelfx'],
    )

    const labels = Array.from(container.querySelectorAll('.nav-tabs-center .nav-tab-label')).map((node) => node.textContent)
    expect(labels).toEqual(['Stage Mode', 'Audio Artifacts', 'MIDI Hub', 'IntelFX Rack'])
  })

  it('renders MPX1 as a mega-menu trigger when it is pinned', () => {
    mockSpecialSettings.pinnedRoutes = ['/mpx1']

    const { container } = renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
    )

    expect(container.querySelector('.mpx1-nav-root')).toBeTruthy()
    expect(screen.getAllByText('MPX1 Rack').length).toBeGreaterThan(0)
  })

  it('renders pinned platform deep links in the top nav as direct routed links', () => {
    mockSpecialSettings.pinnedRoutes = ['/platforms/overview']

    renderInRouter(
      <AppShell>
        <LocationProbe />
      </AppShell>,
    )

    fireEvent.click(screen.getAllByRole('link', { name: 'Overview' })[0])

    expect(screen.getByTestId('route-probe')).toHaveTextContent('/platforms/overview')
  })

  it('hides the mobile bottom tabbar on integrated platform routes', () => {
    mockSpecialSettings.pinnedRoutes = ['/platforms/overview']

    renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
      ['/platforms/overview'],
    )

    expect(screen.queryByLabelText('Mobile quick navigation')).toBeNull()
  })

  it('shows only remaining hardware-submenu items inside the Audio Interfaces submenu', () => {
    mockSpecialSettings.pinnedRoutes = ['/hardware-interfaces']
    mockHardwareLocationNotes['/hotone-jogg'] = { hostname: 'rack-b' }

    renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
    )

    fireEvent.click(screen.getByRole('button', { name: /Audio Interfaces/i }))

    expect(screen.queryByText('Edirol UA-1000')).toBeNull()
    expect(screen.queryByText('HoTone JoGG')).toBeNull()
    expect(screen.getByText('Generic Interface')).toBeTruthy()
    expect(screen.getByText('On rack-b')).toBeTruthy()
  })
})
