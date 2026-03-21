import React from 'react'
import '@testing-library/jest-dom'
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

jest.mock('../components/Platform/PlatformModal', () => ({
  PlatformModalContent: ({ initialLayer, initialPanel }: { initialLayer?: string | null; initialPanel?: string | null }) => (
    <div data-testid="platform-modal-content">{initialLayer ?? initialPanel ?? 'root'}</div>
  ),
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

describe('AppShell navigation', () => {
  beforeEach(() => {
    mockUpdateSettings.mockReset()
    mockSpecialSettings.pinnedRoutes = []
    for (const key of Object.keys(mockHardwareLocationNotes)) {
      delete mockHardwareLocationNotes[key]
    }
  })

  it('renders only Home, Platforms and Labs, and Dragon when no routes are pinned', () => {
    const { container } = renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
    )

    expect(screen.getByLabelText('Home')).toBeTruthy()
    expect(screen.getByLabelText('Mackes Audio Platform home')).toBeTruthy()
    expect(screen.getByTestId('shell-latency-pressure-readout')).toBeTruthy()
    expect(screen.getByLabelText('Open Platforms and Labs window')).toBeTruthy()
    expect(screen.getByLabelText('Open special settings')).toBeTruthy()
    expect(screen.getByLabelText('Toggle mobile menu')).toBeTruthy()
    expect(screen.queryByLabelText('Open advanced menu')).toBeNull()
    expect(screen.queryByLabelText('Open Platform panel')).toBeNull()
    expect(screen.queryByText('Guide')).toBeNull()
    expect(screen.queryByText('About')).toBeNull()
    expect(container.querySelector('.nav-active-title')).toBeNull()
    expect(container.querySelectorAll('.nav-tabs-center .nav-tab-item').length).toBe(0)
    expect(container.querySelector('.nav-tabs-left')?.contains(screen.getByTestId('shell-latency-pressure-readout'))).toBe(true)
  })

  it('opens the unified Platforms and Labs window from the shell trigger', () => {
    renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
    )

    fireEvent.click(screen.getByLabelText('Open Platforms and Labs window'))

    expect(screen.getByTestId('platform-modal-content')).toHaveTextContent('root')
    expect(screen.queryByLabelText('Open advanced menu')).toBeNull()
    expect(screen.queryByLabelText('Open Platform panel')).toBeNull()
  })

  it('renders pinned Platforms and Labs as a modal trigger anchored to the overview workspace', () => {
    mockSpecialSettings.pinnedRoutes = ['/platform']

    renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Platforms and Labs' }))

    expect(screen.getByTestId('platform-modal-content')).toHaveTextContent('overview')
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
    expect(labels).toEqual(['Platforms + Labs', 'Stage Mode', 'Audio Artifacts', 'MIDI Hub'])
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

  it('renders pinned platform deep links in the top nav and opens the requested panel target', () => {
    mockSpecialSettings.pinnedRoutes = ['platform:layer:overview']

    renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Overview' }))

    expect(screen.getByTestId('platform-modal-content')).toHaveTextContent('overview')
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
