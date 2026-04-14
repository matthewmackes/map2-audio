import React from 'react'
import '@testing-library/jest-dom'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { HomePage } from './HomePage'
import { HOME_DESKTOP_SESSION_STORAGE_KEY } from './homeDesktopSession'
import { HOME_DESKTOP_WALLPAPER_STORAGE_KEY } from './desktopWallpaper'
import { HOME_LANDING_PREFERENCES_STORAGE_KEY } from './homeLandingPreferences'
import { MAP2_PLATFORM_VERSION } from '../components/branding/map2Branding'
import { resetPrefetchedRoutesForTests } from '../routePrefetch'

const originalFetch = global.fetch
const mockSpecialSettingsState = {
  settings: {
    enabled: true,
    hiddenPlugins: [],
    menuLocation: 'hidden' as const,
    pinnedRoutes: [],
    landingTiles: [] as Array<{ route: string; size: 'small' | 'medium' | 'large' }>,
  },
  isLoading: false,
  error: null,
  updateSettings: jest.fn(),
  reload: jest.fn(),
}

jest.mock('../../assets/NEW-map2-landing-bg.png', () => 'NEW-map2-landing-bg.png')
jest.mock('../../assets/MAP2-LOGO.png', () => 'MAP2-LOGO.png')

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const mockNodePageContext = {
  localNode: {
    node_id: 'MANAGEMENT-NODE-1',
    hostname: 'MAP2-TESTBED',
    display_label: null,
    role: 'all_in_one' as const,
  },
}

const mockReducedEffectsPreference = {
  reducedEffectsEnabled: false,
  pageTransitionPreset: 'fade',
  prefersReducedMotion: false,
  shouldReduceEffects: false,
  setReducedEffectsEnabled: jest.fn(),
  setPageTransitionPreset: jest.fn(),
  resolvedPageTransitionMode: 'fade',
}

jest.mock('../hooks/useNodePageContext', () => ({
  useNodePageContext: () => mockNodePageContext,
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

jest.mock('../../map2/hooks/useWebSocket', () => ({
  useWebSocketConnection: () => ({
    status: 'connected',
    client: {
      onReconnectExhausted: () => () => undefined,
      retryNow: () => undefined,
    },
  }),
  useWebSocketTopic: () => undefined,
}))

jest.mock('../hooks/useSpecialSettings', () => ({
  useSpecialSettings: () => mockSpecialSettingsState,
}))

jest.mock('../hooks/useReducedEffectsPreference', () => ({
  useReducedEffectsPreference: () => mockReducedEffectsPreference,
}))

jest.mock('../hooks/useHomePlatformStatus', () => ({
  useHomePlatformStatus: () => ({
    avb: { label: 'AVB: operational', state: 'ok' },
    avdecc: { label: 'AVDECC: 1 entity', state: 'ok' },
    nodes: { label: 'Nodes: 1 active', state: 'ok' },
  }),
}))

jest.mock('../hooks/useHostMachine', () => ({
  useHostMachineInfo: () => ({
    data: {
      hostname: 'map2-host',
      kernel_version: '6.9.0-rt',
      os_version: 'Fedora Linux 42',
    },
  }),
}))

jest.mock('../hooks/usePushConfirmation', () => ({
  usePushConfirmation: () => ({
    data: {
      pending_confirmation: null,
    },
  }),
}))

jest.mock('../layout/useLauncherInterfaceSummary', () => ({
  useLauncherInterfaceSummary: () => ({
    audioInterfaces: ['RME Fireface UFX'],
    midiInterfaces: ['Express 128'],
    isLoading: false,
  }),
}))

jest.mock('../components/NodeNav/NodeNavBar', () => ({
  NodeNavBar: () => <div data-testid="node-nav-bar" />,
}))

jest.mock('../components/LatencyPressureShellReadout', () => ({
  LatencyPressureShellReadout: () => <div data-testid="shell-latency-pressure-readout">09</div>,
}))

jest.mock('../components/TaskbarClock', () => ({
  TaskbarClock: () => <div data-testid="taskbar-clock">9:41 AM</div>,
}))

function makeJsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as Response
}

function defaultFetchResponse(input: RequestInfo | URL, init?: RequestInit): Response {
  const url = String(input)

  if (url === '/api/platform-remediation/summary') {
    return makeJsonResponse({
      status: 'ok',
      counts: {
        adoption: {},
        sync: {},
        clone: {},
      },
      nodes: [],
    })
  }

  if (url === '/api/platform-remediation/sync/history') {
    return makeJsonResponse({
      status: 'ok',
      items: [],
    })
  }

  if (url === '/api/adoption/candidates') {
    return makeJsonResponse({ items: [] })
  }

  if (url.includes('/api/adoption/') && init?.method === 'POST') {
    return makeJsonResponse({ status: 'ok' })
  }

  return makeJsonResponse({})
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>
}

function renderHome(initialEntries: string[] = ['/']) {
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
        <Routes>
          <Route
            path="*"
            element={(
              <>
                <HomePage />
                <LocationProbe />
              </>
            )}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function finishBootSplash() {
  act(() => {
    jest.advanceTimersByTime(4000)
  })
}

describe('HomePage landing', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    ;(globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserverMock }).ResizeObserver = ResizeObserverMock
    ;(globalThis as { fetch?: typeof fetch }).fetch = jest.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => defaultFetchResponse(input, init),
    ) as typeof fetch
    window.localStorage.clear()
    mockSpecialSettingsState.settings = {
      enabled: true,
      hiddenPlugins: [],
      menuLocation: 'hidden',
      pinnedRoutes: [],
      landingTiles: [],
    }
    mockSpecialSettingsState.isLoading = false
    mockSpecialSettingsState.updateSettings.mockReset()
    mockReducedEffectsPreference.prefersReducedMotion = false
    mockReducedEffectsPreference.shouldReduceEffects = false
    window.sessionStorage.clear()
    resetPrefetchedRoutesForTests()
  })

  afterEach(() => {
    cleanup()
    jest.clearAllTimers()
    jest.useRealTimers()
    ;(globalThis as { fetch?: typeof fetch }).fetch = originalFetch
  })

  it('shows the boot splash only when the landing preference opts into it', async () => {
    window.localStorage.setItem(
      HOME_LANDING_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ version: 1, bootSplashEnabled: true, cinematicBackdropEnabled: false }),
    )

    renderHome()

    expect(screen.getByRole('heading', { name: 'Mackes Audio Platform' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'MAP2 logo' })).toHaveAttribute('src', 'MAP2-LOGO.png')
    expect(screen.getByRole('status')).toHaveTextContent('Restoring workplace shell')
    expect(screen.queryByText('MAP2 Workplace Shell')).toBeNull()
    expect(screen.queryByTestId('home-shell')).toBeNull()

    finishBootSplash()

    expect(await screen.findByTestId('home-shell')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'MAP2 logo' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'MAP2 Workplace Shell' })).toBeInTheDocument()
    expect(window.localStorage.getItem(HOME_DESKTOP_SESSION_STORAGE_KEY)).toContain('bootCompletedAt')
  })

  it('renders the Carbon landing shell immediately by default', async () => {
    renderHome()

    expect(await screen.findByTestId('home-shell')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Mackes Audio Platform' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'MAP2 Workplace Shell' })).toBeInTheDocument()
    expect(screen.getByText('Carbon landing')).toBeInTheDocument()
    expect(window.localStorage.getItem(HOME_DESKTOP_SESSION_STORAGE_KEY)).toContain('bootCompletedAt')
  })

  it('skips the opt-in boot splash when desktop session state already exists', async () => {
    window.localStorage.setItem(
      HOME_LANDING_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ version: 1, bootSplashEnabled: true, cinematicBackdropEnabled: false }),
    )
    window.localStorage.setItem(
      HOME_DESKTOP_SESSION_STORAGE_KEY,
      JSON.stringify({ version: 1, bootCompletedAt: '2026-04-06T13:00:00.000Z' }),
    )

    renderHome()

    expect(await screen.findByTestId('home-shell')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Mackes Audio Platform' })).toBeNull()
  })

  it('skips the opt-in boot splash immediately when reduced motion is preferred', async () => {
    window.localStorage.setItem(
      HOME_LANDING_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ version: 1, bootSplashEnabled: true, cinematicBackdropEnabled: false }),
    )
    mockReducedEffectsPreference.prefersReducedMotion = true
    mockReducedEffectsPreference.shouldReduceEffects = true

    renderHome()

    expect(await screen.findByTestId('home-shell')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Mackes Audio Platform' })).toBeNull()
    expect(window.localStorage.getItem(HOME_DESKTOP_SESSION_STORAGE_KEY)).toContain('bootCompletedAt')
  })

  it('renders the landing shell without the legacy desktop object surface', async () => {
    renderHome()

    expect(await screen.findByTestId('home-shell')).toHaveAttribute('data-wallpaper-mode', 'minimal')
    expect(screen.queryByText('Program Manager')).toBeNull()
    expect(screen.queryByText('System Setup')).toBeNull()
    expect(screen.queryByText('Desktop Objects')).toBeNull()
    expect(screen.queryByText('Selected Desktop Object')).toBeNull()
    expect(screen.queryByText('Pinned Object Directory')).toBeNull()
    expect(screen.queryByText('Industrial Audio Workstation')).toBeNull()
    expect(screen.queryByText('MAP2 desktop session')).toBeNull()
    expect(screen.queryByText('Operator shortcuts')).toBeNull()
    expect(screen.queryByText('Program Catalog')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open platform menu' })).toBeNull()
  })

  it('renders the minimal product shell by default without cinematic wallpaper assets', async () => {
    renderHome()

    expect(await screen.findByTestId('home-shell')).toHaveAttribute('data-wallpaper-mode', 'minimal')
    expect(screen.queryByTestId('home-desktop-default-wallpaper-image')).toBeNull()
    expect(screen.queryByTestId('home-desktop-wallpaper-image')).toBeNull()
  })

  it('renders the default wallpaper hero treatment only when the cinematic backdrop preference is enabled', async () => {
    window.localStorage.setItem(
      HOME_LANDING_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ version: 1, bootSplashEnabled: false, cinematicBackdropEnabled: true }),
    )

    renderHome()

    expect(await screen.findByTestId('home-shell')).toHaveAttribute('data-wallpaper-mode', 'default-image')
    expect(screen.getByTestId('home-desktop-default-wallpaper-image')).toBeInTheDocument()
    expect(screen.queryByTestId('home-desktop-wallpaper-image')).toBeNull()
  })

  it('supports a solid theme wallpaper mode when the cinematic backdrop preference is enabled', async () => {
    window.localStorage.setItem(
      HOME_LANDING_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ version: 1, bootSplashEnabled: false, cinematicBackdropEnabled: true }),
    )
    window.localStorage.setItem(
      HOME_DESKTOP_WALLPAPER_STORAGE_KEY,
      JSON.stringify({ version: 1, mode: 'solid-theme' }),
    )

    renderHome()

    expect(await screen.findByTestId('home-shell')).toHaveAttribute('data-wallpaper-mode', 'solid-theme')
    expect(screen.queryByTestId('home-desktop-wallpaper-image')).toBeNull()
    expect(screen.queryByTestId('home-desktop-default-wallpaper-image')).toBeNull()
  })

  it('supports an uploaded wallpaper image stored in localStorage when the cinematic backdrop preference is enabled', async () => {
    window.localStorage.setItem(
      HOME_LANDING_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ version: 1, bootSplashEnabled: false, cinematicBackdropEnabled: true }),
    )
    window.localStorage.setItem(
      HOME_DESKTOP_WALLPAPER_STORAGE_KEY,
      JSON.stringify({ version: 1, mode: 'uploaded-image', imageDataUrl: 'data:image/png;base64,abc123' }),
    )

    renderHome()

    expect(await screen.findByTestId('home-desktop-wallpaper-image')).toHaveAttribute('src', 'data:image/png;base64,abc123')
  })

  it('renders the workspace launch grid and navigates through the hero actions', async () => {
    renderHome()

    expect(await screen.findByRole('heading', { name: 'MAP2 Workplace Shell' })).toBeInTheDocument()
    expect(screen.getByText('Workspace')).toBeInTheDocument()
    expect(screen.getByText('Performance')).toBeInTheDocument()
    expect(screen.getByText('MIDI')).toBeInTheDocument()
    expect(screen.getByText('Device Operations')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Device\(s\) Manager/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Snapshot Editor/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Advanced MIDI/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open Workspace' }))
    expect(screen.getByTestId('location-probe').textContent).toBe('/workspace/platforms/overview')
  })

  it('deep-links the landing system-status rail card into the workspace surfaces', async () => {
    renderHome()

    fireEvent.click(await screen.findByRole('link', { name: /Node, interfaces, and platform health/i }))
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/workspace/platforms/overview')
  })

  it('deep-links the landing preferences rail card into theme settings', async () => {
    renderHome()

    fireEvent.click(await screen.findByRole('button', { name: /Open theme settings/i }))
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/platforms/theme')
  })

  it('marks the most recently active workspace tile when returning home', async () => {
    window.sessionStorage.setItem('map2:home-shell-recent-route', '/snapshot-editor')

    renderHome()

    const snapshotTile = await screen.findByRole('link', { name: /Snapshot Editor/i })
    expect(snapshotTile).toHaveAttribute('data-recent-route', 'true')
    expect(snapshotTile).toHaveTextContent('Recent')
  })

  it('persists operator-facing landing preferences from the home rail toggles', async () => {
    renderHome()

    const backdropToggle = await screen.findByRole('switch', { name: /Cinematic backdrop/i })
    const splashToggle = screen.getByRole('switch', { name: /Boot splash/i })

    fireEvent.click(backdropToggle)
    fireEvent.click(splashToggle)

    expect(JSON.parse(window.localStorage.getItem(HOME_LANDING_PREFERENCES_STORAGE_KEY) ?? '{}')).toMatchObject({
      cinematicBackdropEnabled: true,
      bootSplashEnabled: true,
    })
    expect(screen.getByText(/Cinematic default-image/i)).toBeInTheDocument()
    expect(screen.getByText('Enabled for this browser')).toBeInTheDocument()
  })

  it('shows the shared system summary in the landing side rail', async () => {
    renderHome()

    expect(await screen.findByLabelText('System summary')).toBeInTheDocument()
    expect(screen.getByText(`Platform ${MAP2_PLATFORM_VERSION}`)).toBeInTheDocument()
    expect(screen.getByText('Fedora Linux 42')).toBeInTheDocument()
    expect(screen.getByText('map2-host')).toBeInTheDocument()
    expect(screen.getByText('AVB: operational')).toBeInTheDocument()
    expect(screen.getByText('AVDECC: 1 entity')).toBeInTheDocument()
    expect(screen.getByText('Nodes: 1 active')).toBeInTheDocument()
    expect(screen.getByText('RME Fireface UFX')).toBeInTheDocument()
    expect(screen.getByText('Express 128')).toBeInTheDocument()
    expect(screen.getByTestId('node-nav-bar')).toBeInTheDocument()
    expect(screen.getByTestId('taskbar-clock')).toBeInTheDocument()
  })
})
