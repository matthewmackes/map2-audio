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
    expect(screen.queryByRole('img', { name: 'MAP2 logo' })).toBeNull()
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

  it('renders the landing shell without the legacy desktop object surface', async () => {
    renderHome()
    finishBootSplash()

    expect(await screen.findByTestId('home-desktop')).toHaveAttribute('data-wallpaper-mode', 'default-image')
    expect(screen.queryByText('Program Manager')).toBeNull()
    expect(screen.queryByText('System Setup')).toBeNull()
    expect(screen.queryByText('Platforms')).toBeNull()
    expect(screen.queryByText('1 node online')).toBeNull()
    expect(screen.queryByRole('img', { name: 'MAP2 logo' })).toBeNull()
    expect(screen.queryByText('Desktop Objects')).toBeNull()
    expect(screen.queryByText('Selected Desktop Object')).toBeNull()
    expect(screen.queryByText('Pinned Object Directory')).toBeNull()
    expect(screen.queryByText('Industrial Audio Workstation')).toBeNull()
    expect(screen.queryByText('MAP2 desktop session')).toBeNull()
    expect(screen.queryByText('Operator shortcuts')).toBeNull()
    expect(screen.queryByText('Program Catalog')).toBeNull()
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

  it('opens the wallpaper context menu and routes its actions', async () => {
    renderHome()
    finishBootSplash()

    fireEvent.contextMenu(await screen.findByTestId('home-desktop'), { clientX: 80, clientY: 120 })

    expect(screen.getByRole('menu', { name: 'Desktop context menu' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Display settings' }))
    expect(screen.getByTestId('location-probe').textContent).toBe('/platforms/theme')
  })

})
