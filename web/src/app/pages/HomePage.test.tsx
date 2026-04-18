import React from 'react'
import '@testing-library/jest-dom'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { HomePage } from './HomePage'
import { HOME_DESKTOP_SESSION_STORAGE_KEY } from './homeDesktopSession'
import { HOME_DESKTOP_WALLPAPER_STORAGE_KEY } from './desktopWallpaper'
import { HOME_LANDING_PREFERENCES_STORAGE_KEY } from './homeLandingPreferences'
import { resetPrefetchedRoutesForTests } from '../routePrefetch'

const originalFetch = global.fetch
const mockSpecialSettingsState = {
  settings: {
    enabled: true,
    hiddenPlugins: [],
    menuLocation: 'hidden' as const,
    pinnedRoutes: [],
    landingTiles: [
      { route: '/workspace', size: 'large' as const },
      { route: '/brain', size: 'medium' as const },
      { route: '/midi-hub', size: 'medium' as const },
      { route: '/perform', size: 'small' as const },
    ],
  },
  isLoading: false,
  error: null,
  updateSettings: jest.fn(),
  reload: jest.fn(),
}

jest.mock('../../assets/MAP2-LOGO.png', () => 'MAP2-LOGO.png')
jest.mock('../../../../branding/MAP2-LOGO-CROPPED.png', () => 'MAP2-LOGO-CROPPED.png')

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

jest.mock('../contexts/useCluster', () => ({
  useCluster: () => ({
    activeNodeId: null,
    localNodeId: 'MANAGEMENT-NODE-1',
    isClusterMode: true,
    setActiveNode: jest.fn(),
    getNodeApiPrefix: () => '',
    nodes: [
      {
        nodeId: 'MANAGEMENT-NODE-1',
        hostname: 'MAP2-TESTBED',
        isLocal: true,
        isOnline: true,
      },
      {
        nodeId: 'STAGE-NODE-2',
        hostname: 'STAGE-RACK',
        isLocal: false,
        isOnline: true,
      },
    ],
  }),
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

jest.mock('../hooks/useDeviceLocation', () => ({
  useClusterHardwareInventory: () => ({
    data: {
      nodes: {
        'MANAGEMENT-NODE-1': {
          status: 'online',
          audio_interfaces: ['RME Fireface UFX'],
          usb_audio_devices: [{ name: 'RME Fireface UFX' }],
          pipewire_devices: [],
        },
        'STAGE-NODE-2': {
          status: 'online',
          audio_interfaces: ['UA-1000'],
          usb_audio_devices: [{ description: 'Roland Edirol UA-1000' }],
          pipewire_devices: [],
        },
      },
    },
    isLoading: false,
  }),
}))

jest.mock('../hooks/useSnapshotRuntimeState', () => ({
  useClusterSnapshotRuntimeLiveState: () => ({
    data: {
      local_node_id: 'MANAGEMENT-NODE-1',
      generated_at: '2026-04-15T12:00:00Z',
      count: 2,
      nodes: [
        {
          node_id: 'MANAGEMENT-NODE-1',
          seq: 1,
          emitted_at: '2026-04-15T12:00:00Z',
          state: 'live',
          snapshot_id: 42,
          snapshot_revision: 'r7',
          snapshot_name: 'Main Show Snapshot',
          runtime_metrics: {},
          warning_threshold_seconds: 15,
          offline_threshold_seconds: 30,
          age_seconds: 1,
          is_warning: false,
          is_offline: false,
          display_state: 'live',
          display_label: 'Live',
        },
        {
          node_id: 'STAGE-NODE-2',
          seq: 1,
          emitted_at: '2026-04-15T12:00:00Z',
          state: 'live',
          snapshot_id: 42,
          snapshot_revision: 'r7',
          snapshot_name: 'Main Show Snapshot',
          runtime_metrics: {},
          warning_threshold_seconds: 15,
          offline_threshold_seconds: 30,
          age_seconds: 1,
          is_warning: false,
          is_offline: false,
          display_state: 'live',
          display_label: 'Live',
        },
      ],
    },
    isLoading: false,
  }),
}))

jest.mock('../hooks/useAvbStatus', () => ({
  useAVBDiscovery: () => ({
    data: {
      enabled: true,
      total_discovered: 2,
      talker_nodes: 1,
      listener_nodes: 2,
      nodes: [
        {
          node_id: 'MANAGEMENT-NODE-1',
          hostname: 'MAP2-TESTBED',
          addresses: ['192.168.1.10'],
          port: 8080,
          last_seen: '2026-04-15T12:00:00Z',
          avb_capabilities: {
            interface: 'enp2s0',
            stream_id: 'avb-main',
            ptp_synced: true,
            ptp_offset_ns: 30,
            tsn_configured: true,
            talker_streams: 1,
            listener_streams: 2,
            max_streams: 8,
            sample_rate: 48000,
            channels: 8,
          },
        },
      ],
    },
    isLoading: false,
  }),
  useAVBStreams: () => ({
    data: {
      available: true,
      streams: [
        {
          stream_id: 'avb-main',
          direction: 'talker',
          state: 'running',
          interface: 'enp2s0',
          dest_mac: '91:e0:f0:00:00:01',
          channels: 8,
          sample_rate: 48000,
        },
      ],
    },
    isLoading: false,
  }),
}))

jest.mock('../../map2/api', () => ({
  midiHubApi: {
    getStatusForNode: jest.fn(async (nodeId?: string | null) => ({
      ports: nodeId === 'STAGE-NODE-2'
        ? [
            { port_id: 'stage-1', name: 'MPX1 Rack MIDI In', direction: 'input', kind: 'alsa' },
            { port_id: 'stage-2', name: 'IntelFX Rack MIDI Out', direction: 'output', kind: 'alsa' },
          ]
        : [
            { port_id: 'main-1', name: 'Express 128', direction: 'duplex', kind: 'alsa' },
          ],
    })),
    getRoutesForNode: jest.fn(async (nodeId?: string | null) => ({
      routes: nodeId === 'STAGE-NODE-2'
        ? [
            {
              route_id: 'route-stage',
              source_port: 'MPX1 Rack MIDI In',
              destination_ports: ['IntelFX Rack MIDI Out'],
              enabled: true,
              priority: 100,
              route_type: 'pass_through',
              filter: { message_types: ['cc'], channels: [1], cc_range: null, note_range: null, velocity_range: null },
              transform_chain: [],
              destination_latency_ms: { 'IntelFX Rack MIDI Out': 2 },
            },
          ]
        : [
            {
              route_id: 'route-main',
              source_port: 'Express 128',
              destination_ports: ['Snapshot Engine'],
              enabled: true,
              priority: 100,
              route_type: 'mapped',
              filter: { message_types: ['program_change'], channels: [1], cc_range: null, note_range: null, velocity_range: null },
              transform_chain: [{ id: 'normalize' }],
              destination_latency_ms: {},
            },
          ],
    })),
  },
  latencyV2Api: {
    getJitterStats: jest.fn(async (nodeId?: string | null) => ({
      p50_ms: 0.08,
      p95_ms: nodeId === 'STAGE-NODE-2' ? 0.24 : 0.11,
      p99_ms: 0.4,
      max_ms: 0.9,
      rtl_p95_ms: nodeId === 'STAGE-NODE-2' ? 5.2 : 3.9,
      xrun_count: nodeId === 'STAGE-NODE-2' ? 1 : 0,
      window_seconds: 30,
      sample_count: 128,
      running: true,
    })),
  },
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
      landingTiles: [
        { route: '/workspace', size: 'large' },
        { route: '/brain', size: 'medium' },
        { route: '/midi-hub', size: 'medium' },
        { route: '/perform', size: 'small' },
      ],
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

    expect(screen.getByText('Mackes Audio Platform')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'MAP2 logo' })).toHaveAttribute('src', expect.stringMatching(/\.png$/))
    expect(screen.getByRole('status')).toHaveTextContent('Restoring your desktop')
    expect(screen.queryByText('Desktop Control Panel')).toBeNull()
    expect(screen.queryByTestId('home-shell')).toBeNull()

    finishBootSplash()

    expect(await screen.findByTestId('home-shell')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'MAP2 logo' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'MAP: Mackes Audio Platform' })).toBeInTheDocument()
    expect(window.localStorage.getItem(HOME_DESKTOP_SESSION_STORAGE_KEY)).toContain('bootCompletedAt')
  })

  it('renders the Carbon landing shell immediately by default', async () => {
    renderHome()

    expect(await screen.findByTestId('home-shell')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'MAP: Mackes Audio Platform' })).toBeInTheDocument()
    expect(screen.queryByText('Operator telemetry')).toBeNull()
    expect(screen.getByText('live nodes')).toBeInTheDocument()
    expect(screen.getByLabelText('Telemetry overview')).toBeInTheDocument()
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
    expect(screen.getByRole('heading', { name: 'MAP: Mackes Audio Platform' })).toBeInTheDocument()
  })

  it('skips the opt-in boot splash immediately when reduced motion is preferred', async () => {
    window.localStorage.setItem(
      HOME_LANDING_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ version: 1, bootSplashEnabled: true, cinematicBackdropEnabled: false }),
    )
    mockReducedEffectsPreference.prefersReducedMotion = true
    mockReducedEffectsPreference.shouldReduceEffects = true

    renderHome()

    expect(await screen.findByTestId('home-shell')).toHaveAttribute('data-reduced-effects', 'true')
    expect(screen.getByRole('heading', { name: 'MAP: Mackes Audio Platform' })).toBeInTheDocument()
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

  it('renders the unified operations table and opens node-aware destinations from table rows', async () => {
    renderHome()

    expect(await screen.findByRole('heading', { name: 'MAP: Mackes Audio Platform' })).toBeInTheDocument()
    expect(screen.getByText('Operations table')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Operations table' })).toBeInTheDocument()
    expect(screen.getByText('Surface')).toBeInTheDocument()
    expect(screen.getByText('Workspace')).toBeInTheDocument()
    expect(screen.getByText('Express 128')).toBeInTheDocument()
    expect(screen.getByText('Main Show Snapshot')).toBeInTheDocument()
    expect(screen.getByText('Fabric state')).toBeInTheDocument()
    expect(screen.getByText('MIDI connections')).toBeInTheDocument()

    const mpxRow = await screen.findByRole('link', {
      name: /Mapped MIDI MPX1 Rack MIDI In IntelFX Rack MIDI Out/i,
    })
    if (!mpxRow) {
      throw new Error('Expected MPX1 Rack MIDI In telemetry row')
    }
    fireEvent.click(mpxRow)
    expect(screen.getByTestId('location-probe').textContent).toBe('/mpx1/midi-map?node_id=STAGE-NODE-2')
  })

  it('deep-links the landing actions menu into theme settings', async () => {
    renderHome()

    fireEvent.click(await screen.findByRole('button', { name: /Options/i }))
    fireEvent.click(await screen.findByText('Display settings'))
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/platforms/theme')
  })

  it('does not render a recent-destinations strip from session-scoped route history', async () => {
    window.sessionStorage.setItem(
      'map2:home-shell-recent-routes',
      JSON.stringify([
        '/platforms/theme',
        '/brain',
        '/midi-hub/connections',
      ]),
    )

    renderHome()

    expect(await screen.findByTestId('home-shell')).toBeInTheDocument()
    expect(screen.queryByLabelText('Recent destinations')).toBeNull()
  })

  it('removes the home preference toggles from the telemetry surface', async () => {
    renderHome()

    await screen.findByTestId('home-shell')
    expect(screen.queryByRole('switch', { name: /Desktop background/i })).toBeNull()
    expect(screen.queryByRole('switch', { name: /Startup screen/i })).toBeNull()
  })

  it('removes the quick-launch hero affordance and does not open a search modal with Ctrl+K', async () => {
    renderHome()

    await screen.findByTestId('home-shell')
    expect(screen.queryByRole('button', { name: 'Quick launch' })).toBeNull()
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(screen.queryByRole('searchbox', { name: 'Search destinations' })).toBeNull()
  })

  it('shows the live telemetry content instead of the old system-summary side rail', async () => {
    renderHome()

    expect(await screen.findByText('Operations table')).toBeInTheDocument()
    expect(screen.getAllByText('AVB: operational').length).toBeGreaterThan(0)
    expect(screen.getByText('live nodes')).toBeInTheDocument()
    expect(screen.getByText('RME Fireface UFX')).toBeInTheDocument()
    expect(screen.getByText('Express 128')).toBeInTheDocument()
    expect(screen.queryByLabelText('System summary')).toBeNull()
  })
})
