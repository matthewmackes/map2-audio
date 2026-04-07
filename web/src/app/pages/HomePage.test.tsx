import React from 'react'
import '@testing-library/jest-dom'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { HomePage } from './HomePage'
import { HOME_DESKTOP_SESSION_STORAGE_KEY } from './homeDesktopSession'
import { HOME_DESKTOP_WALLPAPER_STORAGE_KEY } from './desktopWallpaper'

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
  })

  afterEach(() => {
    cleanup()
    jest.clearAllTimers()
    jest.useRealTimers()
    ;(globalThis as { fetch?: typeof fetch }).fetch = originalFetch
  })

  it('shows the boot splash on first visit, then persists desktop session state', async () => {
    renderHome()

    expect(screen.getByRole('heading', { name: 'Mackes Audio Platform' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'MAP2 logo' })).toHaveAttribute('src', 'MAP2-LOGO.png')
    expect(screen.queryByText('MAP2 Workplace Shell')).toBeNull()
    expect(screen.queryByTestId('home-desktop')).toBeNull()

    finishBootSplash()

    expect(await screen.findByTestId('home-desktop')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'MAP2 logo' })).toHaveAttribute('src', 'MAP2-LOGO.png')
    expect(screen.queryByText('MAP2 Workplace Shell')).toBeNull()
    expect(window.localStorage.getItem(HOME_DESKTOP_SESSION_STORAGE_KEY)).toContain('bootCompletedAt')
  })

  it('skips the boot splash when desktop session state already exists', async () => {
    window.localStorage.setItem(
      HOME_DESKTOP_SESSION_STORAGE_KEY,
      JSON.stringify({ version: 1, bootCompletedAt: '2026-04-06T13:00:00.000Z' }),
    )

    renderHome()

    expect(await screen.findByTestId('home-desktop')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Mackes Audio Platform' })).toBeNull()
  })

  it('renders the desktop shell with the platform status card and online node summary', async () => {
    renderHome()
    finishBootSplash()

    expect(await screen.findByTestId('home-desktop')).toHaveAttribute('data-wallpaper-mode', 'default-image')
    expect(screen.getByRole('list', { name: 'Desktop icons' })).toBeInTheDocument()
    expect(screen.getByLabelText('Open Audio Artifacts')).toBeInTheDocument()
    expect(screen.getByText('Platforms')).toBeTruthy()
    expect(screen.getByText('1 node online')).toBeTruthy()
    expect(screen.getAllByText(/MAP2-TESTBED/).length).toBeGreaterThan(0)
  })

  it('opens Audio Artifacts from the desktop icon using the canonical route', async () => {
    renderHome()
    finishBootSplash()

    fireEvent.click(await screen.findByLabelText('Open Audio Artifacts'))

    expect(screen.getByTestId('location-probe').textContent).toBe('/artifacts')
  })

  it('opens Platforms from the desktop status card using the canonical route', async () => {
    renderHome()
    finishBootSplash()

    fireEvent.click(await screen.findByRole('button', { name: 'Open Platforms overview' }))

    expect(screen.getByTestId('location-probe').textContent).toBe('/platforms/overview')
  })

  it('renders the default wallpaper image when no desktop wallpaper preference exists', async () => {
    renderHome()
    finishBootSplash()

    expect(await screen.findByTestId('home-desktop-wallpaper-image')).toHaveAttribute('src', 'NEW-map2-landing-bg.png')
  })

  it('supports a solid theme wallpaper mode without rendering the default image', async () => {
    window.localStorage.setItem(
      HOME_DESKTOP_WALLPAPER_STORAGE_KEY,
      JSON.stringify({ version: 1, mode: 'solid-theme' }),
    )

    renderHome()
    finishBootSplash()

    expect(await screen.findByTestId('home-desktop')).toHaveAttribute('data-wallpaper-mode', 'solid-theme')
    expect(screen.queryByTestId('home-desktop-wallpaper-image')).toBeNull()
  })

  it('supports an uploaded wallpaper image stored in localStorage', async () => {
    window.localStorage.setItem(
      HOME_DESKTOP_WALLPAPER_STORAGE_KEY,
      JSON.stringify({ version: 1, mode: 'uploaded-image', imageDataUrl: 'data:image/png;base64,abc123' }),
    )

    renderHome()
    finishBootSplash()

    expect(await screen.findByTestId('home-desktop-wallpaper-image')).toHaveAttribute('src', 'data:image/png;base64,abc123')
  })

  it('renders only the remaining catalog-backed desktop pins from landing tiles', async () => {
    mockSpecialSettingsState.settings.landingTiles = [
      { route: '/midi-hub', size: 'small' },
      { route: '/platforms/overview', size: 'large' },
    ]

    renderHome()
    finishBootSplash()

    const desktopIcons = await screen.findAllByRole('listitem')
    expect(desktopIcons).toHaveLength(1)
    expect(screen.getByLabelText('Open Overview')).toBeInTheDocument()
    expect(screen.queryByLabelText('Open Audio Artifacts')).toBeNull()
    expect(screen.queryByLabelText('Open MIDI Hub')).toBeNull()
  })

  it('opens the wallpaper context menu and routes its actions', async () => {
    renderHome()
    finishBootSplash()

    fireEvent.contextMenu(await screen.findByTestId('home-desktop'), { clientX: 80, clientY: 120 })

    expect(screen.getByRole('menu', { name: 'Desktop context menu' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Display settings' }))
    expect(screen.getByTestId('location-probe').textContent).toBe('/platforms/theme')
  })

  it('opens the icon context menu and unpins desktop icons through special settings', async () => {
    mockSpecialSettingsState.settings.landingTiles = [
      { route: '/artifacts', size: 'medium' },
      { route: '/perform', size: 'small' },
    ]

    renderHome()
    finishBootSplash()

    fireEvent.contextMenu(await screen.findByLabelText('Open Stage Mode'), { clientX: 24, clientY: 36 })

    expect(screen.getByRole('menu', { name: 'Desktop icon menu for Stage Mode' })).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Unpin from Desktop' }))
    })

    expect(mockSpecialSettingsState.updateSettings).toHaveBeenCalledWith({
      landingTiles: [{ route: '/artifacts', size: 'medium' }],
    })
  })

  it('shows the empty-desktop watermark and routes it to Workspace Catalog when nothing is pinned', async () => {
    mockSpecialSettingsState.settings.landingTiles = []

    renderHome()
    finishBootSplash()

    fireEvent.click(await screen.findByTestId('home-desktop-empty-watermark'))

    expect(screen.getByTestId('location-probe').textContent).toBe('/platforms/workspace-catalog')
  })

  it('shows the remediation watermark and opens the remediation workflow modal', async () => {
    ;(global.fetch as jest.MockedFunction<typeof fetch>).mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)

        if (url === '/api/platform-remediation/summary') {
          return makeJsonResponse({
            status: 'ok',
            workflows: {
              sync: { available: true },
            },
            counts: {
              adoption: {},
              sync: {
                failed: 2,
              },
              clone: {},
            },
            nodes: [
              {
                node_id: 'NODE-2',
                hostname: 'NODE-2',
                adoption_state: null,
                sync_states: ['failed'],
                clone_states: [],
              },
            ],
          })
        }

        return defaultFetchResponse(input, init)
      },
    )

    renderHome()
    finishBootSplash()

    fireEvent.click(await screen.findByTestId('home-desktop-remediation-watermark'))

    expect((await screen.findAllByText('Platforms remediation')).length).toBeGreaterThan(0)
  })

  it('routes adoption pills into the dedicated Platforms adoption workflow', async () => {
    ;(global.fetch as jest.MockedFunction<typeof fetch>).mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url === '/api/platform-remediation/summary') {
          return makeJsonResponse({
            status: 'ok',
            counts: {
              adoption: { claimable: 1 },
              sync: {},
              clone: {},
            },
            nodes: [
              {
                node_id: 'NODE-2',
                hostname: 'MAP2-REMOTE-2',
                visible: true,
                registered: false,
                is_online: true,
                adoption_state: 'claimable',
                sync_states: [],
                clone_states: [],
                is_source_of_truth: false,
                rollback_available: false,
              },
            ],
          })
        }
        return defaultFetchResponse(input, init)
      },
    )

    renderHome()
    finishBootSplash()

    fireEvent.click(await screen.findByRole('button', { name: 'Claimable: 1' }))

    expect(screen.getByTestId('location-probe').textContent).toBe('/platforms/adoption?state=claimable')
  })

  it('opens the remediation modal when a sync pill is clicked', async () => {
    ;(global.fetch as jest.MockedFunction<typeof fetch>).mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url === '/api/platform-remediation/summary') {
          return makeJsonResponse({
            status: 'ok',
            counts: {
              adoption: {},
              sync: { outdated: 1, held: 1 },
              clone: {},
            },
            manifest: {
              source_node: 'MANAGEMENT-NODE-1',
              timestamp: '2026-03-25T10:00:00Z',
            },
            nodes: [
              {
                node_id: 'NODE-2',
                hostname: 'MAP2-REMOTE-2',
                visible: true,
                registered: true,
                is_online: true,
                adoption_state: 'ready',
                version: '1.2.3',
                sync_states: ['outdated'],
                clone_states: [],
                is_source_of_truth: false,
                rollback_available: false,
              },
              {
                node_id: 'MANAGEMENT-NODE-1',
                hostname: 'MAP2-TESTBED',
                visible: true,
                registered: true,
                is_online: true,
                adoption_state: 'ready',
                version: '1.2.4',
                sync_states: ['held'],
                clone_states: [],
                is_source_of_truth: true,
                rollback_available: false,
              },
            ],
          })
        }
        return defaultFetchResponse(input, init)
      },
    )

    renderHome()
    finishBootSplash()

    fireEvent.click(await screen.findByRole('button', { name: 'Outdated: 1' }))

    expect((await screen.findAllByText('Platforms remediation')).length).toBeGreaterThan(0)
    expect(screen.getByText('Source-of-truth sync')).toBeTruthy()
    expect(screen.getByText('MAP2-REMOTE-2')).toBeTruthy()
  })

  it('shows a neutral sync unavailable indicator instead of sync remediation pills when manifest storage is unavailable', async () => {
    ;(global.fetch as jest.MockedFunction<typeof fetch>).mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url === '/api/platform-remediation/summary') {
          return makeJsonResponse({
            status: 'degraded',
            counts: {
              adoption: { ready: 1 },
              sync: { outdated: 2, held: 1 },
              clone: {},
            },
            workflows: {
              adoption: { available: true, state: 'ready' },
              sync: {
                available: false,
                state: 'unavailable',
                reason: 'read_only_filesystem',
                detail: 'Version manifest storage is unavailable at /var/lib/map2/version_manifest_history because /var/lib/map2 is mounted read-only.',
              },
              clone: { available: true, state: 'ready' },
            },
            nodes: [
              {
                node_id: 'NODE-2',
                hostname: 'MAP2-REMOTE-2',
                visible: true,
                registered: true,
                is_online: true,
                adoption_state: 'ready',
                version: '1.2.3',
                sync_states: [],
                clone_states: [],
                is_source_of_truth: false,
                rollback_available: false,
              },
            ],
          })
        }
        return defaultFetchResponse(input, init)
      },
    )

    renderHome()
    finishBootSplash()

    expect((await screen.findAllByText('Sync unavailable')).length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByRole('button', { name: 'Outdated: 2' })).toBeNull()
  })
})
