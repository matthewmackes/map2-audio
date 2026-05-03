import React from 'react'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'

import { App } from './App'
import { appHistory } from './history'
import { HOST_MACHINE_ROUTE } from './pages/hostMachineRoutes'

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

jest.mock('./pages/HostMachinePage', () => ({
  HostMachinePage: () => {
    const { useLocation: mockUseLocation } = jest.requireActual('react-router-dom') as typeof import('react-router-dom')
    const location = mockUseLocation()
    return <div data-testid="host-machine-route">{`${location.pathname}${location.search}`}</div>
  },
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
    const { Navigate, useLocation: mockUseLocation } = jest.requireActual('react-router-dom') as typeof import('react-router-dom')
    const location = mockUseLocation()
    if (location.pathname === '/workspace/platforms/host-machine') {
      return <Navigate to="/hardware/host-machine" replace />
    }
    return <div data-testid="workspace-platform-route">{`${location.pathname}${location.search}`}</div>
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

jest.mock('./pages/SequencerPage', () => ({
  SequencerPage: () => {
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

jest.mock('./components/Devices/DevicesShell', () => ({
  DevicesShell: () => {
    const { Outlet } = jest.requireActual('react-router-dom') as typeof import('react-router-dom')
    return <Outlet />
  },
}))

jest.mock('./components/Devices/HardwareStorePage', () => ({
  HardwareStorePage: () => {
    const { useLocation: mockUseLocation } = jest.requireActual('react-router-dom') as typeof import('react-router-dom')
    const location = mockUseLocation()
    return <div data-testid="devices-store-route">{`${location.pathname}${location.search}`}</div>
  },
}))

jest.mock('./components/Devices/IntelFX/IntelFXShell', () => ({
  IntelFXShell: () => {
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

  // Nav reorg 2026-05-03 (second pass) — canonical Node Ops mount is
  // `/node-ops/<id>`; canonical Audio Artifacts mount is `/artifacts`.
  it('redirects legacy /platform query routes into the canonical /node-ops workspace path', async () => {
    navigateTo('/platform?layer=overview')

    render(<App />)

    expect(await screen.findByTestId('workspace-platform-route')).toHaveTextContent('/node-ops/overview')
    expect(screen.getByTestId('app-shell')).toBeTruthy()
  })

  it('redirects legacy /audio-artifacts into the canonical /artifacts route', async () => {
    navigateTo('/audio-artifacts?category=lv2-plugins')

    render(<App />)

    expect(await screen.findByTestId('workspace-artifacts-route')).toHaveTextContent('/artifacts?category=lv2-plugins')
  })

  it('does not keep /audio-table as a routed surface after the platforms hard cut', async () => {
    navigateTo('/audio-table')

    render(<App />)

    expect(await screen.findByTestId('home-route')).toHaveTextContent('Home Route')
  })

  it('redirects the retired /dsp route into the canonical Node Ops overview', async () => {
    navigateTo('/dsp')

    render(<App />)

    expect(await screen.findByTestId('workspace-platform-route')).toHaveTextContent('/node-ops/overview')
  })

  it('redirects the retired /cpu-performance route into the canonical Node Ops overview', async () => {
    navigateTo('/cpu-performance')

    render(<App />)

    expect(await screen.findByTestId('workspace-platform-route')).toHaveTextContent('/node-ops/overview')
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

  it('redirects the bare /platforms route into the canonical Node Ops overview', async () => {
    navigateTo('/platforms')

    render(<App />)

    expect(await screen.findByTestId('workspace-platform-route')).toHaveTextContent('/node-ops/overview')
  })

  it('redirects the legacy Platforms adoption route into the canonical Node Ops adoption path', async () => {
    navigateTo('/platforms/adoption?state=claimable')

    render(<App />)

    expect(await screen.findByTestId('workspace-platform-route')).toHaveTextContent('/node-ops/adoption?state=claimable')
  })

  it('mounts Host Machine on the hardware-owned route', async () => {
    navigateTo(HOST_MACHINE_ROUTE)

    render(<App />)

    expect(await screen.findByTestId('host-machine-route')).toHaveTextContent(HOST_MACHINE_ROUTE)
    expect(screen.getByTestId('app-shell')).toBeTruthy()
  })

  it('redirects the legacy top-level host-machine route into the hardware-owned route', async () => {
    navigateTo('/host-machine')

    render(<App />)

    expect(await screen.findByTestId('host-machine-route')).toHaveTextContent(HOST_MACHINE_ROUTE)
  })

  it('redirects the retired platform host-machine route into the hardware-owned route', async () => {
    navigateTo('/platforms/host-machine')

    render(<App />)

    expect(await screen.findByTestId('host-machine-route')).toHaveTextContent(HOST_MACHINE_ROUTE)
  })

  it('redirects the retired workspace host-machine route into the hardware-owned route', async () => {
    navigateTo('/workspace/platforms/host-machine')

    render(<App />)

    expect(await screen.findByTestId('host-machine-route')).toHaveTextContent(HOST_MACHINE_ROUTE)
    expect(screen.queryByTestId('workspace-hub-shell')).toBeNull()
  })

  it('redirects the bare /workspace route into the canonical /node-ops mount', async () => {
    navigateTo('/workspace')

    render(<App />)

    // The bare /workspace path now lands on /node-ops; the workspace
    // hub shell scaffolding still renders the platform-route mock
    // because /node-ops mounts WorkspaceHubShell.
    expect(await screen.findByTestId('workspace-platform-route')).toHaveTextContent('/node-ops/overview')
    expect(screen.getByTestId('workspace-hub-shell')).toBeTruthy()
  })

  it('redirects the retired /workspace/outboard-hardware route into the unified /devices workspace', async () => {
    navigateTo('/workspace/outboard-hardware')

    render(<App />)

    expect(await screen.findByTestId('devices-store-route')).toHaveTextContent('/devices')
    expect(screen.queryByTestId('workspace-hub-shell')).toBeNull()
  })

  it('redirects retired /workspace/outboard-hardware/:deviceId paths into the unified /devices workspace', async () => {
    navigateTo('/workspace/outboard-hardware/lexicon-mpx1')

    render(<App />)

    expect(await screen.findByTestId('devices-store-route')).toHaveTextContent('/devices')
  })

  it('redirects the retired /workspace/physical-surfaces route into the unified /devices workspace', async () => {
    navigateTo('/workspace/physical-surfaces')

    render(<App />)

    expect(await screen.findByTestId('devices-store-route')).toHaveTextContent('/devices')
    expect(screen.queryByTestId('workspace-hub-shell')).toBeNull()
  })

  it('redirects the legacy top-level /physical-surfaces path into the unified /devices workspace', async () => {
    navigateTo('/physical-surfaces')

    render(<App />)

    expect(await screen.findByTestId('devices-store-route')).toHaveTextContent('/devices')
  })

  it('redirects the legacy /workspace/artifacts overview into the canonical /artifacts mount', async () => {
    navigateTo('/workspace/artifacts?category=lv2-plugins')

    render(<App />)

    expect(await screen.findByTestId('workspace-artifacts-route')).toHaveTextContent('/artifacts?category=lv2-plugins')
    expect(screen.getByTestId('workspace-hub-shell')).toBeTruthy()
  })

  it('redirects the legacy /workspace/artifacts/discover route into the canonical /artifacts/discover mount', async () => {
    navigateTo('/workspace/artifacts/discover?category=nam-models')

    render(<App />)

    expect(await screen.findByTestId('workspace-artifacts-discover-route')).toHaveTextContent('/artifacts/discover?category=nam-models')
    expect(screen.getByTestId('workspace-hub-shell')).toBeTruthy()
  })

  it('mounts the canonical /artifacts/discover route directly inside the artifacts hub shell', async () => {
    navigateTo('/artifacts/discover?category=nam-models')

    render(<App />)

    expect(await screen.findByTestId('workspace-artifacts-discover-route')).toHaveTextContent('/artifacts/discover?category=nam-models')
    expect(screen.getByTestId('workspace-hub-shell')).toBeTruthy()
  })

  it('redirects the legacy top-level /outboard-hardware/:deviceId path into the unified /devices workspace', async () => {
    navigateTo('/outboard-hardware/lexicon-mpx1')

    render(<App />)

    expect(await screen.findByTestId('devices-store-route')).toHaveTextContent('/devices')
  })

  it('redirects the retired Workspace Catalog route into the canonical Node Ops overview', async () => {
    navigateTo('/platforms/workspace-catalog')

    render(<App />)

    expect(await screen.findByTestId('workspace-platform-route')).toHaveTextContent('/node-ops/overview')
  })

  it('retires the legacy SynthForge route back to the desktop landing page', async () => {
    navigateTo('/synth-forge')

    render(<App />)

    expect(await screen.findByTestId('home-route')).toHaveTextContent('Home Route')
  })

  it('keeps Sequencer as a first-class routed surface', async () => {
    navigateTo('/sequencer?instance_id=17')

    render(<App />)

    expect(await screen.findByTestId('brain-route')).toHaveTextContent('/sequencer?instance_id=17')
  })

  it('keeps Ground Control Pro as a first-class routed surface', async () => {
    // T2487/T2488/T2489 (Path A revision, 2026-05-02): legacy /ground-control-pro
    // hard-redirects to the unified /midi/devices/<profile-key>/console mount.
    navigateTo('/ground-control-pro')

    render(<App />)

    expect(await screen.findByTestId('ground-control-pro-route')).toHaveTextContent('/midi/devices/voodoo-lab-ground-control-pro/console')
  })

  it('keeps IntelFX as a dedicated routed surface inside AppShell', async () => {
    // T2487/T2488/T2489 (Path A revision, 2026-05-02): legacy /intelfx and
    // /devices/intelfx/panel hard-redirect to the unified /midi/devices/<profile-key>/panel mount.
    navigateTo('/intelfx')

    render(<App />)

    expect(await screen.findByTestId('intelfx-route')).toHaveTextContent('/midi/devices/rocktron-intelfx/panel')
    expect(screen.getByTestId('app-shell')).toBeTruthy()
  })
})
