import React from 'react'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'

import { App } from './App'

const mockUseHomePlatformStatus = jest.fn()

jest.mock('./layout/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}))

jest.mock('./components/ViewportPolicyGate', () => ({
  ViewportPolicyGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

jest.mock('./components/Toasts', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useToasts: () => ({
    pushToast: jest.fn(),
    dismissToast: jest.fn(),
  }),
}))

jest.mock('./contexts/ClusterContext', () => ({
  ClusterProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

jest.mock('./hooks/useHomePlatformStatus', () => ({
  useHomePlatformStatus: (...args: unknown[]) => mockUseHomePlatformStatus(...args),
}))

jest.mock('@tanstack/react-query-devtools', () => ({
  ReactQueryDevtools: () => null,
}))

jest.mock('../map2/hooks/useWebSocket', () => ({
  useWebSocketConnection: () => ({
    status: 'connected',
    client: {
      onReconnectExhausted: () => () => undefined,
      retryNow: () => undefined,
    },
  }),
}))

jest.mock('./pages/HomePage', () => ({
  HomePage: () => <div data-testid="home-route">Home Route</div>,
}))

jest.mock('./pages/PerformPage', () => ({
  PerformPage: () => {
    const { useLocation: mockUseLocation } = jest.requireActual('react-router-dom') as typeof import('react-router-dom')
    const location = mockUseLocation()
    return <div data-testid="perform-route">{`${location.pathname}${location.search}`}</div>
  },
}))

jest.mock('./pages/PlatformWorkspacePage', () => ({
  PlatformWorkspacePage: () => {
    const { useLocation: mockUseLocation } = jest.requireActual('react-router-dom') as typeof import('react-router-dom')
    const location = mockUseLocation()
    return <div data-testid="platform-route">{`${location.pathname}${location.search}`}</div>
  },
}))

jest.mock('./pages/workspace-hub/platforms/PlatformWorkspaceSection', () => ({
  PlatformWorkspaceSection: () => {
    const { useLocation: mockUseLocation } = jest.requireActual('react-router-dom') as typeof import('react-router-dom')
    const location = mockUseLocation()
    return <div data-testid="workspace-platform-route">{`${location.pathname}${location.search}`}</div>
  },
}))

jest.mock('./pages/workspace-hub/physical-surfaces/WorkspacePhysicalSurfacesOutlet', () => ({
  WorkspacePhysicalSurfacesOutlet: () => {
    const { Outlet } = jest.requireActual('react-router-dom') as typeof import('react-router-dom')
    return <Outlet />
  },
}))

jest.mock('./pages/workspace-hub/physical-surfaces/WorkspacePhysicalSurfacesOverviewPage', () => ({
  WorkspacePhysicalSurfacesOverviewPage: () => {
    const { useLocation: mockUseLocation } = jest.requireActual('react-router-dom') as typeof import('react-router-dom')
    const location = mockUseLocation()
    return <div data-testid="workspace-physical-surfaces-route">{`${location.pathname}${location.search}`}</div>
  },
}))

jest.mock('./pages/workspace-hub/physical-surfaces/WorkspacePhysicalSurfaceUnitPage', () => ({
  WorkspacePhysicalSurfaceUnitPage: () => {
    const { useLocation: mockUseLocation } = jest.requireActual('react-router-dom') as typeof import('react-router-dom')
    const location = mockUseLocation()
    return <div data-testid="workspace-physical-surface-unit-route">{`${location.pathname}${location.search}`}</div>
  },
}))

jest.mock('./pages/WorkspaceHubShell', () => ({
  WorkspaceHubShell: () => {
    const { Outlet, useLocation: mockUseLocation } = jest.requireActual('react-router-dom') as typeof import('react-router-dom')
    const location = mockUseLocation()
    return (
      <div data-testid="workspace-hub-shell">
        <div data-testid="workspace-route">{`${location.pathname}${location.search}`}</div>
        <Outlet />
      </div>
    )
  },
  WorkspaceHubIndexRedirect: () => {
    const { Navigate } = jest.requireActual('react-router-dom') as typeof import('react-router-dom')
    return <Navigate to="/workspace/platforms/overview" replace />
  },
  WorkspaceHubPlaceholder: ({ title }: { title: string }) => {
    const { useLocation: mockUseLocation } = jest.requireActual('react-router-dom') as typeof import('react-router-dom')
    const location = mockUseLocation()
    return <div data-testid="workspace-placeholder">{`${title}|${location.pathname}${location.search}`}</div>
  },
}))

jest.mock('./pages/PerformanceBrainPage', () => ({
  PerformanceBrainPage: () => {
    const { useLocation: mockUseLocation } = jest.requireActual('react-router-dom') as typeof import('react-router-dom')
    const location = mockUseLocation()
    return <div data-testid="brain-route">{`${location.pathname}${location.search}`}</div>
  },
}))

jest.mock('./pages/GroundControlProPage', () => ({
  GroundControlProPage: () => {
    const { useLocation: mockUseLocation } = jest.requireActual('react-router-dom') as typeof import('react-router-dom')
    const location = mockUseLocation()
    return <div data-testid="ground-control-pro-route">{`${location.pathname}${location.search}`}</div>
  },
}))

jest.mock('./pages/LaunchControlPage', () => ({
  LaunchControlPage: () => {
    const { useLocation: mockUseLocation } = jest.requireActual('react-router-dom') as typeof import('react-router-dom')
    const location = mockUseLocation()
    return <div data-testid="launch-control-route">{`${location.pathname}${location.search}`}</div>
  },
}))

jest.mock('./pages/MidiCommanderPage', () => ({
  MidiCommanderPage: () => {
    const { useLocation: mockUseLocation } = jest.requireActual('react-router-dom') as typeof import('react-router-dom')
    const location = mockUseLocation()
    return <div data-testid="midi-commander-route">{`${location.pathname}${location.search}`}</div>
  },
}))

jest.mock('./pages/AudioArtifactsPage', () => ({
  AudioArtifactsPage: ({ discoverMode }: { discoverMode?: boolean }) => {
    const { useLocation: mockUseLocation } = jest.requireActual('react-router-dom') as typeof import('react-router-dom')
    const location = mockUseLocation()
    return <div data-testid="artifacts-route">{`${location.pathname}${location.search}|discover=${discoverMode ? 'yes' : 'no'}`}</div>
  },
}))

describe('App routing', () => {
  beforeEach(() => {
    mockUseHomePlatformStatus.mockReset()
  })

  it('keeps /perform outside AppShell chrome', async () => {
    window.history.pushState({}, '', '/perform')

    render(<App />)

    expect(await screen.findByTestId('perform-route')).toHaveTextContent('/perform')
    expect(screen.queryByTestId('app-shell')).toBeNull()
  })

  it('redirects legacy /platform query routes into the canonical /platforms workspace path', async () => {
    window.history.pushState({}, '', '/platform?layer=overview')

    render(<App />)

    expect(await screen.findByTestId('platform-route')).toHaveTextContent('/platforms/overview')
    expect(screen.getByTestId('app-shell')).toBeTruthy()
  })

  it('redirects legacy /audio-artifacts into the canonical /artifacts route', async () => {
    window.history.pushState({}, '', '/audio-artifacts?category=lv2-plugins')

    render(<App />)

    expect(await screen.findByTestId('artifacts-route')).toHaveTextContent('/artifacts?category=lv2-plugins|discover=no')
  })

  it('does not keep /audio-table as a routed surface after the platforms hard cut', async () => {
    window.history.pushState({}, '', '/audio-table')

    render(<App />)

    expect(await screen.findByTestId('home-route')).toHaveTextContent('Home Route')
  })

  it('keeps the dedicated /launch-control route available inside AppShell', async () => {
    window.history.pushState({}, '', '/launch-control')

    render(<App />)

    expect(await screen.findByTestId('launch-control-route')).toHaveTextContent('/launch-control')
    expect(screen.getByTestId('app-shell')).toBeTruthy()
  })

  it('keeps the dedicated /midi-commander route available inside AppShell', async () => {
    window.history.pushState({}, '', '/midi-commander')

    render(<App />)

    expect(await screen.findByTestId('midi-commander-route')).toHaveTextContent('/midi-commander')
    expect(screen.getByTestId('app-shell')).toBeTruthy()
  })

  it('redirects the bare /platforms route into the overview workspace', async () => {
    window.history.pushState({}, '', '/platforms')

    render(<App />)

    expect(await screen.findByTestId('platform-route')).toHaveTextContent('/platforms/overview')
  })

  it('keeps the dedicated Platforms adoption route on the canonical workspace path', async () => {
    window.history.pushState({}, '', '/platforms/adoption?state=claimable')

    render(<App />)

    expect(await screen.findByTestId('platform-route')).toHaveTextContent('/platforms/adoption?state=claimable')
  })

  it('redirects the bare /workspace route into the workspace hub platforms overview scaffold', async () => {
    window.history.pushState({}, '', '/workspace')

    render(<App />)

    expect(await screen.findByTestId('workspace-platform-route')).toHaveTextContent('/workspace/platforms/overview')
    expect(screen.getByTestId('workspace-hub-shell')).toBeTruthy()
  })

  it('keeps the new workspace hub outboard hardware scaffold route available inside AppShell', async () => {
    window.history.pushState({}, '', '/workspace/outboard-hardware')

    render(<App />)

    expect(await screen.findByTestId('workspace-placeholder')).toHaveTextContent('Outboard Hardware|/workspace/outboard-hardware')
    expect(screen.getByTestId('workspace-hub-shell')).toBeTruthy()
  })

  it('mounts the migrated physical-surfaces overview inside the workspace hub', async () => {
    window.history.pushState({}, '', '/workspace/physical-surfaces')

    render(<App />)

    expect(await screen.findByTestId('workspace-physical-surfaces-route')).toHaveTextContent('/workspace/physical-surfaces')
    expect(screen.getByTestId('workspace-hub-shell')).toBeTruthy()
  })

  it('redirects the retired Workspace Catalog route into the overview workspace', async () => {
    window.history.pushState({}, '', '/platforms/workspace-catalog')

    render(<App />)

    expect(await screen.findByTestId('platform-route')).toHaveTextContent('/platforms/overview')
  })

  it('retires the legacy SynthForge route back to the desktop landing page', async () => {
    window.history.pushState({}, '', '/synth-forge')

    render(<App />)

    expect(await screen.findByTestId('home-route')).toHaveTextContent('Home Route')
  })

  it('keeps Performance Brain as a first-class routed surface', async () => {
    window.history.pushState({}, '', '/brain?instance_id=17')

    render(<App />)

    expect(await screen.findByTestId('brain-route')).toHaveTextContent('/brain?instance_id=17')
  })

  it('keeps Ground Control Pro as a first-class routed surface', async () => {
    window.history.pushState({}, '', '/ground-control-pro')

    render(<App />)

    expect(await screen.findByTestId('ground-control-pro-route')).toHaveTextContent('/ground-control-pro')
  })

  it('keeps platform-status polling alive and slows it outside the desktop route', async () => {
    window.history.pushState({}, '', '/intelfx')

    render(<App />)

    expect(mockUseHomePlatformStatus).toHaveBeenCalledWith({ pollMs: 30_000, staleMs: 25_000 })
  })
})
