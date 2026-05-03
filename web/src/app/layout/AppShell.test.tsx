import React from 'react'
import '@testing-library/jest-dom'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'

import { AppShell } from './AppShell'
import { HOST_MACHINE_ROUTE } from '../pages/hostMachineRoutes'
import { NODE_PAGE_KEYS } from '../utils/nodeDisplay'

const mockRestartBackend = jest.fn()
const mockReloadHomeDesktopShell = jest.fn()
const mockReturnHomeDesktopToBoot = jest.fn()
const mockSetViewedNode = jest.fn()
const mockUseWebSocketConnection = jest.fn()

jest.mock('../../map2/clients/platform', () => ({
  systemApi: {
    restartBackend: (...args: unknown[]) => mockRestartBackend(...args),
  },
}))

jest.mock('../pages/homeDesktopSession', () => ({
  readHomeDesktopSession: () => ({ runningRoutes: [] }),
  updateHomeDesktopSession: jest.fn(),
  reloadHomeDesktopShell: () => mockReloadHomeDesktopShell(),
  returnHomeDesktopToBoot: () => mockReturnHomeDesktopToBoot(),
}))

jest.mock('../../map2/hooks/useWebSocket', () => ({
  useWebSocketConnection: () => mockUseWebSocketConnection(),
  useWebSocketTopic: () => undefined,
}))

jest.mock('../hooks/useNodePageContext', () => ({
  useNodePageContext: () => ({
    localNode: {
      node_id: 'node-local',
      hostname: 'map2-host',
      display_label: 'Studio',
      role: 'all_in_one',
      status: 'ok',
      is_local: true,
    },
    viewedNode: {
      node_id: 'node-local',
      hostname: 'map2-host',
      display_label: 'Studio',
      role: 'all_in_one',
      status: 'ok',
      is_local: true,
    },
    viewedNodeId: 'node-local',
    topologyNodes: [
      {
        node_id: 'node-local',
        hostname: 'map2-host',
        display_label: 'Studio',
        role: 'all_in_one',
        status: 'ok',
        is_local: true,
      },
      {
        node_id: 'node-remote',
        hostname: 'stage-rack',
        display_label: 'Stage',
        role: 'audio_node',
        status: 'warn',
        is_local: false,
      },
    ],
    nodeTopologyQuery: {
      isLoading: false,
      isError: false,
    },
  }),
}))

jest.mock('../stores/viewedNodeStore', () => ({
  useViewedNodeStore: (selector: (state: { setViewedNode: typeof mockSetViewedNode }) => unknown) => (
    selector({ setViewedNode: mockSetViewedNode })
  ),
}))

jest.mock('../components/NodeNav/NodeMiniCard', () => ({
  NodeMiniCard: ({ node }: { node: { hostname: string } }) => (
    <div data-testid="node-mini-card">{node.hostname}</div>
  ),
}))

jest.mock('../components/PageTransition', () => ({
  PageTransition: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

function renderInRouter(ui: React.ReactNode, initialEntries: string[] = ['/']) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
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
        {ui}
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="route-probe">{`${location.pathname}${location.search}`}</div>
}

function ShellAwareContent() {
  return (
    <>
      <div>shell content</div>
    </>
  )
}

function expectInDocumentOrder(labels: string[]) {
  const elements = labels.map((label) => {
    const matches = screen.getAllByText(label)
    return matches[0]
  })

  for (let index = 0; index < elements.length - 1; index += 1) {
    const current = elements[index]
    const next = elements[index + 1]
    expect(current.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  }
}

describe('AppShell global tree navigation', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    ;(globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as typeof ResizeObserver
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
    mockUseWebSocketConnection.mockReturnValue({
      status: 'connected',
      client: null,
    })
    mockRestartBackend.mockReset()
    mockRestartBackend.mockResolvedValue({ status: 'restarting', message: 'Backend service is restarting...' })
    mockReloadHomeDesktopShell.mockReset()
    mockReturnHomeDesktopToBoot.mockReset()
    mockSetViewedNode.mockReset()
    window.localStorage.clear()
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  it('renders the persistent global tree rail on the landing route without a titlebar', () => {
    // Pre-pin two devices so the nav tree exposes the pinned rows the assertions rely on.
    window.localStorage.setItem(
      'map2.ui.settings',
      JSON.stringify({ version: 1, pinnedDevices: ['tesira', 'intelfx'] }),
    )

    const { container } = renderInRouter(
      <AppShell>
        <ShellAwareContent />
      </AppShell>,
      ['/'],
    )

    expect(container.querySelector('.window-title-strip')).toBeNull()
    const navTree = screen.getByLabelText('Global navigation')
    expect(navTree).toBeInTheDocument()
    // Nav reorg 2026-05-03 (second pass) — top-level order is the
    // pure canonical service hierarchy with no shortcut row and no
    // separators. MIDI Assignments folded into MIDI Services. Audio
    // Artifacts is its own top-level service group. Chains and
    // Settings are top-level leaves. Platform Guide is at /about.
    expectInDocumentOrder([
      'Home',
      'Snapshot Editor',
      'MIDI Services',
      'AVB',
      'Node Ops',
      'Audio Artifacts',
      'Sequencer',
      'Hardware',
      // Nav reorg 2026-05-03 — /chains removed from top-level; folded
      // into /node-ops/audio-engine.
      'Settings',
      'Platform Guide',
    ])
    expect(container.querySelectorAll('.global-tree-nav__separator-line')).toHaveLength(0)
    expect(screen.getAllByText('Node Ops')).toHaveLength(1)
    expect(screen.getByText('Snapshot Editor')).toBeInTheDocument()
    expect(within(navTree).getByText('Signal Editor')).toBeInTheDocument()
    expect(within(navTree).getByText('Live')).toBeInTheDocument()
    expect(screen.getByText('Sequencer')).toBeInTheDocument()
    expect(screen.getByText('Audio Artifacts')).toBeInTheDocument()
    expect(screen.getByText('Platform Guide')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.getAllByText('Hardware').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Devices').length).toBeGreaterThan(0)
    // T2490 (AVB) + T2491 (MIDI cleanup) — both AVB Services and MIDI
    // Advanced parent sections expose a "Connections" child, so the
    // assertion uses getAllByText now.
    expect(within(navTree).getAllByText('Connections').length).toBeGreaterThan(0)
    expect(within(navTree).getAllByText('Presets').length).toBeGreaterThan(0)
    expect(within(navTree).getAllByText('Overview').length).toBeGreaterThan(1)
    expect(within(navTree).getByText('Midpoint')).toBeInTheDocument()
    expect(within(navTree).getByText('LV2 Plugins')).toBeInTheDocument()
    expect(within(navTree).getByText('NAM Models')).toBeInTheDocument()
    expect(within(navTree).getAllByText('Discover').length).toBeGreaterThan(0)
    expect(within(navTree).getAllByText('Biamp Tesira').length).toBeGreaterThan(0)
    expect(screen.queryByText('Files')).toBeNull()
    // The node identity card surfaces the display name plus the host/role plate.
    const nodeCard = screen.getByRole('button', { name: /Node map2-host \(Studio\)/i })
    expect(nodeCard).toHaveTextContent('map2-host')
    expect(nodeCard).toHaveTextContent('ALL-IN-ONE')
  })

  it('renders non-landing routes with the page header controls and the global tree rail', () => {
    // Pre-pin the IntelFX device so the nav tree exposes a pinned device row under Devices.
    window.localStorage.setItem(
      'map2.ui.settings',
      JSON.stringify({ version: 1, pinnedDevices: ['intelfx'] }),
    )

    const { container } = renderInRouter(
      <AppShell>
        <ShellAwareContent />
      </AppShell>,
      // T2491 — render at the unified canonical /midi/devices/rocktron-intelfx/panel
      // mount (T2485-5 Q1=A) since /intelfx/panel hard-redirects there but the
      // redirect lives in App.tsx and this unit test only mounts AppShell.
      ['/midi/devices/rocktron-intelfx/panel'],
    )

    expect(screen.getByRole('button', { name: 'Close IntelFX Rack' })).toBeInTheDocument()
    // Blue context bar was retired in T2447 — workspace name now owns the title surface.
    expect(container.querySelector('.shell-ctx')).toBeNull()
    expect(screen.getByRole('toolbar', { name: 'Workspace actions' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'IntelFX Rack' })).toBeInTheDocument()
    const navTree = screen.getByLabelText('Global navigation')
    expect(navTree).toBeInTheDocument()
    expect(within(navTree).getAllByText('Hardware').length).toBeGreaterThan(0)
    expect(within(navTree).getAllByText('Devices').length).toBeGreaterThan(0)
  })

  it('closes the current app back to the desktop route', async () => {
    renderInRouter(
      <AppShell>
        <>
          <LocationProbe />
        </>
      </AppShell>,
      // T2491 — render at the unified canonical /midi/devices/rocktron-intelfx/panel
      // mount (T2485-5 Q1=A) since /intelfx/panel hard-redirects there but the
      // redirect lives in App.tsx and this unit test only mounts AppShell.
      ['/midi/devices/rocktron-intelfx/panel'],
    )

    fireEvent.click(screen.getByRole('button', { name: 'Close IntelFX Rack' }))

    await act(async () => {
      jest.advanceTimersByTime(50)
    })

    expect(screen.getByTestId('route-probe')).toHaveTextContent('/')
  })

  it('navigates through the global tree rail', async () => {
    renderInRouter(
      <AppShell>
        <LocationProbe />
      </AppShell>,
      ['/'],
    )

    fireEvent.click(screen.getByText('Snapshot Editor'))

    await waitFor(() => {
      expect(screen.getByTestId('route-probe')).toHaveTextContent('/snapshot-editor')
    })
  })

  it('routes the Host Machine entry from the Hardware branch to the hardware-owned path', async () => {
    renderInRouter(
      <AppShell>
        <LocationProbe />
      </AppShell>,
      ['/'],
    )

    fireEvent.click(screen.getByText('Host Machine'))

    await waitFor(() => {
      expect(screen.getByTestId('route-probe')).toHaveTextContent(HOST_MACHINE_ROUTE)
    })
  })

  it('routes the Midpoint entry from Node Ops to the canonical /node-ops path', async () => {
    renderInRouter(
      <AppShell>
        <LocationProbe />
      </AppShell>,
      ['/'],
    )

    fireEvent.click(screen.getByText('Midpoint'))

    await waitFor(() => {
      // Nav reorg 2026-05-03 (second pass) — canonical mount is /node-ops/midpoint.
      expect(screen.getByTestId('route-probe')).toHaveTextContent('/node-ops/midpoint')
    })
  })

  it('uses the breadcrumb host root to switch viewed host across all node page scopes', async () => {
    renderInRouter(
      <AppShell>
        <>
          <div>shell content</div>
          <LocationProbe />
        </>
      </AppShell>,
      ['/node-ops/overview'],
    )

    fireEvent.click(screen.getByRole('button', { name: /current host map2-host/i }))
    const hostSwitchButtons = screen.getAllByRole('button', { name: /stage-rack/i })
    const breadcrumbHostOption = hostSwitchButtons.find((element) => (
      element.className.includes('shell-kicker__host-switcher-option')
    ))
    expect(breadcrumbHostOption).toBeDefined()
    fireEvent.click(breadcrumbHostOption as HTMLElement)

    await waitFor(() => {
      // Nav reorg 2026-05-03 (second pass) — canonical Node Ops Overview mount.
      expect(screen.getByTestId('route-probe')).toHaveTextContent('/node-ops/overview?viewedHost=node-remote')
    })

    const expectedPageKeys = Array.from(new Set(Object.values(NODE_PAGE_KEYS)))
    const remoteHostCalls = mockSetViewedNode.mock.calls.filter((call) => call[1] === 'node-remote')
    const remoteHostPageKeys = new Set(remoteHostCalls.map((call) => call[0]))
    expect(remoteHostCalls.length).toBeGreaterThanOrEqual(expectedPageKeys.length)
    expect(remoteHostPageKeys).toEqual(new Set(expectedPageKeys))
  })

  it('hydrates viewed host scope from the viewedHost query parameter', async () => {
    renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
      ['/node-ops/overview?viewedHost=node-remote'],
    )

    await waitFor(() => {
      const expectedPageKeys = Array.from(new Set(Object.values(NODE_PAGE_KEYS)))
      const remoteHostCalls = mockSetViewedNode.mock.calls.filter((call) => call[1] === 'node-remote')
      const remoteHostPageKeys = new Set(remoteHostCalls.map((call) => call[0]))
      expect(remoteHostCalls.length).toBeGreaterThanOrEqual(expectedPageKeys.length)
      expect(remoteHostPageKeys).toEqual(new Set(expectedPageKeys))
    })
  })

  it('exposes footer system actions from the rail', async () => {
    renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
      ['/sequencer'],
    )

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(mockReloadHomeDesktopShell).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Log Out' }))
    expect(mockReturnHomeDesktopToBoot).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Restart' }))
    expect(screen.getByText('Restart backend')).toBeInTheDocument()
  })

  it('lets the operator unpin and re-pin the global navigation rail', async () => {
    const { container } = renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
      ['/sequencer'],
    )

    fireEvent.click(screen.getByRole('button', { name: 'Collapse global navigation' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('Global navigation')).toBeNull()
      expect(screen.getByLabelText('Collapsed navigation rail')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Expand global navigation' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Expand global navigation' }))

    await waitFor(() => {
      expect(screen.getByLabelText('Global navigation')).toBeInTheDocument()
      expect(container.querySelector('.global-tree-nav')).toBeTruthy()
    })
  })

  it('uses the explicit Snapshot Editor shell naming on the snapshot editor route', () => {
    renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
      ['/snapshot-editor'],
    )

    expect(screen.getByText('Platform / Snapshot Editor')).toBeInTheDocument()
    expect(screen.getAllByText('Snapshot Editor').length).toBeGreaterThan(0)
    expect(screen.queryByText('Platform / Workspace')).toBeNull()
  })
})
