import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppShell } from './AppShell'

const mockUpdateSettings = jest.fn()
const mockHardwareLocationNotes: Record<string, { hostname: string } | null> = {}
const mockSpecialSettings = {
  enabled: true,
  hiddenPlugins: [],
  menuLocation: 'top-nav' as const,
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

jest.mock('../components/PasswordDialog', () => ({
  PasswordDialog: () => null,
}))

jest.mock('../components/SpecialSettingsDialog', () => ({
  SpecialSettingsDialog: () => null,
}))

jest.mock('../components/MPX1/MPX1MegaMenu', () => ({
  MPX1MegaMenu: () => <div data-testid="mpx1-mega-menu">MPX1 menu</div>,
}))

jest.mock('../components/shared/NodeSelector', () => ({
  NodeSelector: () => <div data-testid="cluster-node-selector">Node selector</div>,
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

describe('AppShell navigation', () => {
  beforeEach(() => {
    mockUpdateSettings.mockReset()
    mockSpecialSettings.pinnedRoutes = []
    for (const key of Object.keys(mockHardwareLocationNotes)) {
      delete mockHardwareLocationNotes[key]
    }
  })

  it('renders only Home, Advanced, and Dragon when no routes are pinned', () => {
    const { container } = renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
    )

    expect(screen.getByLabelText('Home')).toBeTruthy()
    expect(screen.getByLabelText('Open special settings')).toBeTruthy()
    expect(screen.getByLabelText('Toggle mobile menu')).toBeTruthy()
    expect(screen.queryByText('Guide')).toBeNull()
    expect(screen.queryByText('About')).toBeNull()
    expect(container.querySelector('.nav-active-title')).toBeNull()
    expect(container.querySelectorAll('.nav-tabs-center .nav-tab-item').length).toBe(0)
  })

  it('orders pinned routes by catalog order and caps desktop pins at four items', () => {
    mockSpecialSettings.pinnedRoutes = ['/about', '/mpx1', '/welcome', '/engine', '/host-machine', '/avb-routing']

    const { container } = renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
      ['/host-machine'],
    )

    const labels = Array.from(container.querySelectorAll('.nav-tabs-center .nav-tab-label')).map((node) => node.textContent)
    expect(labels).toEqual(['Audio Engine', 'AVB Routing', 'Host Machine', 'Guide'])
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

  it('shows detected node notes inside the Audio Interfaces submenu', () => {
    mockSpecialSettings.pinnedRoutes = ['/hardware-interfaces']
    mockHardwareLocationNotes['/edirol-ua1000'] = { hostname: 'rack-b' }

    renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
    )

    fireEvent.click(screen.getByRole('button', { name: /Audio Interfaces/i }))

    expect(screen.getByText('On rack-b')).toBeTruthy()
  })
})
