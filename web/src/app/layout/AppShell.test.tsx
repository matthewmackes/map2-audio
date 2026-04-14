import React from 'react'
import '@testing-library/jest-dom'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'

import { ShellWindowTitleStrip } from '../components/shared/ShellWindowTitleStrip'
import { AppShell } from './AppShell'

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
      <ShellWindowTitleStrip />
      <div>shell content</div>
    </>
  )
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
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  it('renders the persistent global tree rail on the landing route without a titlebar', () => {
    const { container } = renderInRouter(
      <AppShell>
        <ShellAwareContent />
      </AppShell>,
      ['/'],
    )

    expect(container.querySelector('.window-title-strip')).toBeNull()
    expect(screen.getByLabelText('Global navigation tree')).toBeInTheDocument()
    expect(screen.getByText('Control Panel')).toBeInTheDocument()
    expect(screen.getByText('Chains')).toBeInTheDocument()
    expect(screen.getByText('Snapshot Editor')).toBeInTheDocument()
    expect(screen.queryByText('DSP')).toBeNull()
    expect(screen.queryByText('CPU Performance')).toBeNull()
    expect(screen.getByRole('button', { name: 'Open node selector' })).toHaveTextContent('map2-host (Studio)')
  })

  it('renders non-landing routes with the title strip and the global tree rail', () => {
    const { container } = renderInRouter(
      <AppShell>
        <ShellAwareContent />
      </AppShell>,
      ['/intelfx/panel'],
    )

    expect(screen.getByRole('button', { name: 'Close IntelFX Rack' })).toBeInTheDocument()
    expect(container.querySelector('.window-title-strip__eyebrow')).toHaveTextContent('Workspace surface')
    expect(container.querySelector('.window-title-strip__title')).toHaveTextContent('IntelFX Rack')
    expect(screen.getByLabelText('Global navigation tree')).toBeInTheDocument()
  })

  it('closes the current app back to the desktop route', async () => {
    renderInRouter(
      <AppShell>
        <>
          <ShellWindowTitleStrip />
          <LocationProbe />
        </>
      </AppShell>,
      ['/intelfx/panel'],
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

  it('exposes footer system actions from the rail', async () => {
    renderInRouter(
      <AppShell>
        <div>shell content</div>
      </AppShell>,
      ['/brain'],
    )

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(mockReloadHomeDesktopShell).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Log Out' }))
    expect(mockReturnHomeDesktopToBoot).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Restart' }))
    expect(screen.getByText('Restart backend')).toBeInTheDocument()
  })
})
