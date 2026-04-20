import React from 'react'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'

import { App } from './App'
import { appHistory } from './history'

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
  NotificationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useToasts: () => ({
    pushToast: jest.fn(),
    dismissToast: jest.fn(),
  }),
  useNotifications: () => ({
    notifications: [],
    pushNotification: jest.fn(),
    dismissNotification: jest.fn(),
    clearNotifications: jest.fn(),
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

jest.mock('./pages/workspace-hub/artifacts/WorkspaceArtifactsOverviewPage', () => ({
  WorkspaceArtifactsOverviewPage: () => {
    const { useLocation: mockUseLocation } = jest.requireActual('react-router-dom') as typeof import('react-router-dom')
    const location = mockUseLocation()
    return <div data-testid="workspace-artifacts-route">{`${location.pathname}${location.search}`}</div>
  },
}))

jest.mock('./pages/workspace-hub/artifacts/WorkspaceArtifactsDiscoverPage', () => ({
  WorkspaceArtifactsDiscoverPage: () => {
    const { useLocation: mockUseLocation } = jest.requireActual('react-router-dom') as typeof import('react-router-dom')
    const location = mockUseLocation()
    return <div data-testid="workspace-artifacts-discover-route">{`${location.pathname}${location.search}`}</div>
  },
}))

jest.mock('./pages/workspace-hub/outboard-hardware/WorkspaceOutboardHardwareOutlet', () => ({
  WorkspaceOutboardHardwareOutlet: () => {
    const { Outlet } = jest.requireActual('react-router-dom') as typeof import('react-router-dom')
    return <Outlet />
  },
}))

jest.mock('./pages/workspace-hub/outboard-hardware/WorkspaceOutboardHardwareOverviewPage', () => ({
  WorkspaceOutboardHardwareOverviewPage: () => {
    const { useLocation: mockUseLocation } = jest.requireActual('react-router-dom') as typeof import('react-router-dom')
    const location = mockUseLocation()
    return <div data-testid="workspace-outboard-hardware-route">{`${location.pathname}${location.search}`}</div>
  },
}))

jest.mock('./pages/workspace-hub/outboard-hardware/WorkspaceOutboardHardwareDevicePage', () => ({
  WorkspaceOutboardHardwareDevicePage: () => {
    const { useLocation: mockUseLocation } = jest.requireActual('react-router-dom') as typeof import('react-router-dom')
    const location = mockUseLocation()
    return <div data-testid="workspace-outboard-hardware-device-route">{`${location.pathname}${location.search}`}</div>
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

jest.mock('./pages/IntelFXPage', () => ({
  IntelFXPage: () => {
    const { useLocation: mockUseLocation } = jest.requireActual('react-router-dom') as typeof import('react-router-dom')
    const location = mockUseLocation()
    return <div data-testid="intelfx-route">{`${location.pathname}${location.search}`}</div>
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
    appHistory.push('/')
  })

  function navigateTo(path: string) {
    appHistory.push(path)
  }

  it('keeps /perform outside AppShell chrome', async () => {
    navigateTo('/perform')

    render(<App />)

    expect(await screen.findByTestId('perform-route')).toHaveTextContent('/perform')
    expect(screen.queryByTestId('app-shell')).toBeNull()
  })

  it('redirects legacy /platform query routes into the canonical /workspace/platforms workspace path', async () => {
    navigateTo('/platform?layer=overview')

    render(<App />)

    expect(await screen.findByTestId('workspace-platform-route')).toHaveTextContent('/workspace/platforms/overview')
    expect(screen.getByTestId('app-shell')).toBeTruthy()
  })

  it('redirects legacy /audio-artifacts into the canonical /workspace/artifacts route', async () => {
    navigateTo('/audio-artifacts?category=lv2-plugins')

    render(<App />)

    expect(await screen.findByTestId('workspace-artifacts-route')).toHaveTextContent('/workspace/artifacts?category=lv2-plugins')
  })

  it('does not keep /audio-table as a routed surface after the platforms hard cut', async () => {
    navigateTo('/audio-table')

    render(<App />)

    expect(await screen.findByTestId('home-route')).toHaveTextContent('Home Route')
  })

  it('redirects the retired /dsp route into the canonical workspace hub overview', async () => {
    navigateTo('/dsp')

    render(<App />)

    expect(await screen.findByTestId('workspace-platform-route')).toHaveTextContent('/workspace/platforms/overview')
  })

  it('redirects the retired /cpu-performance route into the canonical workspace hub overview', async () => {
    navigateTo('/cpu-performance')

    render(<App />)

    expect(await screen.findByTestId('workspace-platform-route')).toHaveTextContent('/workspace/platforms/overview')
  })

  it('keeps the dedicated /launch-control route available inside AppShell', async () => {
    navigateTo('/launch-control')

    render(<App />)

    expect(await screen.findByTestId('launch-control-route')).toHaveTextContent('/launch-control')
    expect(screen.getByTestId('app-shell')).toBeTruthy()
  })

  it('keeps the dedicated /midi-commander route available inside AppShell', async () => {
    navigateTo('/midi-commander')

    render(<App />)

    expect(await screen.findByTestId('midi-commander-route')).toHaveTextContent('/midi-commander')
    expect(screen.getByTestId('app-shell')).toBeTruthy()
  })

  it('redirects the bare /platforms route into the canonical workspace hub overview', async () => {
    navigateTo('/platforms')

    render(<App />)

    expect(await screen.findByTestId('workspace-platform-route')).toHaveTextContent('/workspace/platforms/overview')
  })

  it('redirects the legacy Platforms adoption route into the workspace hub path', async () => {
    navigateTo('/platforms/adoption?state=claimable')

    render(<App />)

    expect(await screen.findByTestId('workspace-platform-route')).toHaveTextContent('/workspace/platforms/adoption?state=claimable')
  })

  it('redirects the bare /workspace route into the workspace hub platforms overview scaffold', async () => {
    navigateTo('/workspace')

    render(<App />)

    expect(await screen.findByTestId('workspace-platform-route')).toHaveTextContent('/workspace/platforms/overview')
    expect(screen.getByTestId('workspace-hub-shell')).toBeTruthy()
  })

  it('keeps the new workspace hub outboard hardware scaffold route available inside AppShell', async () => {
    navigateTo('/workspace/outboard-hardware')

    render(<App />)

    expect(await screen.findByTestId('workspace-outboard-hardware-route')).toHaveTextContent('/workspace/outboard-hardware')
    expect(screen.getByTestId('workspace-hub-shell')).toBeTruthy()
  })

  it('mounts the migrated outboard-hardware device route inside the workspace hub', async () => {
    navigateTo('/workspace/outboard-hardware/lexicon-mpx1')

    render(<App />)

    expect(await screen.findByTestId('workspace-outboard-hardware-device-route')).toHaveTextContent('/workspace/outboard-hardware/lexicon-mpx1')
    expect(screen.getByTestId('workspace-hub-shell')).toBeTruthy()
  })

  it('mounts the migrated physical-surfaces overview inside the workspace hub', async () => {
    navigateTo('/workspace/physical-surfaces')

    render(<App />)

    expect(await screen.findByTestId('workspace-physical-surfaces-route')).toHaveTextContent('/workspace/physical-surfaces')
    expect(screen.getByTestId('workspace-hub-shell')).toBeTruthy()
  })

  it('redirects the legacy physical-surfaces overview into the workspace hub path', async () => {
    navigateTo('/physical-surfaces')

    render(<App />)

    expect(await screen.findByTestId('workspace-physical-surfaces-route')).toHaveTextContent('/workspace/physical-surfaces')
    expect(screen.getByTestId('workspace-hub-shell')).toBeTruthy()
  })

  it('mounts the migrated audio-artifacts overview inside the workspace hub', async () => {
    navigateTo('/workspace/artifacts?category=lv2-plugins')

    render(<App />)

    expect(await screen.findByTestId('workspace-artifacts-route')).toHaveTextContent('/workspace/artifacts?category=lv2-plugins')
    expect(screen.getByTestId('workspace-hub-shell')).toBeTruthy()
  })

  it('mounts the migrated audio-artifacts discover route inside the workspace hub', async () => {
    navigateTo('/workspace/artifacts/discover?category=nam-models')

    render(<App />)

    expect(await screen.findByTestId('workspace-artifacts-discover-route')).toHaveTextContent('/workspace/artifacts/discover?category=nam-models')
    expect(screen.getByTestId('workspace-hub-shell')).toBeTruthy()
  })

  it('redirects the legacy artifacts discover route into the workspace hub path', async () => {
    navigateTo('/artifacts/discover?category=nam-models')

    render(<App />)

    expect(await screen.findByTestId('workspace-artifacts-discover-route')).toHaveTextContent('/workspace/artifacts/discover?category=nam-models')
    expect(screen.getByTestId('workspace-hub-shell')).toBeTruthy()
  })

  it('redirects the legacy outboard-hardware device route into the workspace hub path', async () => {
    navigateTo('/outboard-hardware/lexicon-mpx1')

    render(<App />)

    expect(await screen.findByTestId('workspace-outboard-hardware-device-route')).toHaveTextContent('/workspace/outboard-hardware/lexicon-mpx1')
    expect(screen.getByTestId('workspace-hub-shell')).toBeTruthy()
  })

  it('redirects the retired Workspace Catalog route into the canonical workspace hub overview', async () => {
    navigateTo('/platforms/workspace-catalog')

    render(<App />)

    expect(await screen.findByTestId('workspace-platform-route')).toHaveTextContent('/workspace/platforms/overview')
  })

  it('retires the legacy SynthForge route back to the desktop landing page', async () => {
    navigateTo('/synth-forge')

    render(<App />)

    expect(await screen.findByTestId('home-route')).toHaveTextContent('Home Route')
  })

  it('keeps Performance Brain as a first-class routed surface', async () => {
    navigateTo('/brain?instance_id=17')

    render(<App />)

    expect(await screen.findByTestId('brain-route')).toHaveTextContent('/brain?instance_id=17')
  })

  it('keeps Ground Control Pro as a first-class routed surface', async () => {
    navigateTo('/ground-control-pro')

    render(<App />)

    expect(await screen.findByTestId('ground-control-pro-route')).toHaveTextContent('/ground-control-pro')
  })

  it('keeps IntelFX as a dedicated routed surface inside AppShell', async () => {
    navigateTo('/intelfx')

    render(<App />)

    expect(await screen.findByTestId('intelfx-route')).toHaveTextContent('/intelfx')
    expect(screen.getByTestId('app-shell')).toBeTruthy()
  })
})
