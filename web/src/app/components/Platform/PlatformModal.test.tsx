import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { PlatformModalContent } from './PlatformModal'

const mockUpdateSettings = jest.fn()
const mockSetAlerts = jest.fn()
const mockSetLayerHealth = jest.fn()
const mockSetSummaryMetrics = jest.fn()
const mockTriggerUpdate = jest.fn()
const mockAbortUpdate = jest.fn()
const mockUseNodeOperations = jest.fn()
const mockUseNodeTopology = jest.fn()
const mockUseViewedNode = jest.fn()
let mockActiveLayerId: string | null = null

const makeApplicationStatus = (overrides: Record<string, unknown> = {}) => ({
  status: 'idle',
  mode: 'git',
  environment: 'development',
  running: false,
  current_version: '20260326',
  target_version: 'master',
  current_step_key: null,
  current_step_index: null,
  message: 'No update in progress',
  error: null,
  started_at: null,
  completed_at: null,
  last_update: null,
  steps: [
    {
      key: 'detect-mode',
      question: 'Which update path should MAP2 use?',
      detail: 'Determine whether this node should update through Git or RPM.',
      status: 'pending',
    },
    {
      key: 'identify-current-build',
      question: 'What build is currently installed?',
      detail: 'Read the currently installed commit or package version before changing anything.',
      status: 'pending',
    },
    {
      key: 'validate-source',
      question: 'Is the update source healthy?',
      detail: 'Validate that the selected repository or package source is usable.',
      status: 'pending',
    },
    {
      key: 'prepare-local-state',
      question: 'Can the node prepare its local state safely?',
      detail: 'Prepare the working tree or mark why that step is not needed for this mode.',
      status: 'pending',
    },
    {
      key: 'fetch-update-payload',
      question: 'Can MAP2 fetch the requested update payload?',
      detail: 'Reach the remote branch or package metadata needed for the update.',
      status: 'pending',
    },
    {
      key: 'apply-target-version',
      question: 'Can the target application version be applied?',
      detail: 'Checkout the requested branch or install the requested package.',
      status: 'pending',
    },
    {
      key: 'refresh-runtime-dependencies',
      question: 'Can runtime dependencies be refreshed?',
      detail: 'Refresh Python or packaged runtime dependencies required by the updated build.',
      status: 'pending',
    },
    {
      key: 'refresh-frontend-dependencies',
      question: 'Can frontend dependencies be refreshed?',
      detail: 'Refresh frontend dependencies when the update mode requires a rebuild.',
      status: 'pending',
    },
    {
      key: 'rebuild-frontend-assets',
      question: 'Can the frontend bundle be rebuilt cleanly?',
      detail: 'Rebuild the production frontend assets if they are not shipped prebuilt.',
      status: 'pending',
    },
    {
      key: 'validate-and-finalize',
      question: 'Does validation confirm the update is safe to keep?',
      detail: 'Run post-update validation and publish the final result back to the operator.',
      status: 'pending',
    },
  ],
  ...overrides,
})

const makeNodeOperations = (overrides: Record<string, unknown> = {}) => ({
  version: {
    product: 'MAP2',
    version: '20260326',
    build_date: '2026-03-26',
    build_time: '09:00',
    build_channel: '01',
    build_timestamp: '202603260900',
    api_version: 'v1',
    dirty: false,
  },
  deploymentMode: { mode: 'ALL-IN-ONE' },
  deploymentStatus: {
    mode: 'ALL-IN-ONE',
    services: {
      backend: { status: 'running' },
      juce_engine: { status: 'running' },
      pipewire: { status: 'running' },
    },
  },
  updateStatus: { status: 'idle', message: 'No update in progress' },
  applicationStatus: makeApplicationStatus(),
  hybridVersion: { version: '20260326', mode: 'git', branch: 'master' },
  backupStatus: { total_backups: 0 },
  backups: [],
  health: { status: 'healthy', uptime_seconds: 3600, services: {} },
  remediation: {
    status: 'ok',
    counts: { adoption: {}, sync: {}, clone: {} },
    workflows: {
      adoption: { available: true, state: 'ready' },
      sync: { available: true, state: 'ready' },
      clone: { available: true, state: 'ready' },
    },
  },
  manifestDrift: { status: 'ok', available: true, drifted: false, nodes: [] },
  isLoading: false,
  errors: [],
  triggerUpdate: mockTriggerUpdate,
  triggerBackup: jest.fn(),
  restoreBackup: jest.fn(),
  switchDeploymentMode: jest.fn(),
  triggerRemediation: jest.fn(),
  captureManifest: jest.fn(),
  enforceManifest: jest.fn(),
  abortUpdate: mockAbortUpdate,
  isUpdating: false,
  isBackingUp: false,
  isRestoring: false,
  isSwitchingMode: false,
  isRemediating: false,
  ...overrides,
})

jest.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    section: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => <section {...props}>{children}</section>,
  },
}))

jest.mock('../../hooks/useSpecialSettings', () => ({
  useSpecialSettings: () => ({
    settings: { pinnedRoutes: [], enabled: true, hiddenPlugins: [], menuLocation: 'hidden' },
    isLoading: false,
    error: null,
    updateSettings: mockUpdateSettings,
  }),
}))

jest.mock('../../hooks/useDeviceLocation', () => ({
  useHardwareMenuLocations: () => ({
    locationsByRoute: {},
  }),
}))

jest.mock('../../hooks/useNodeTopology', () => ({
  useNodeTopology: () => mockUseNodeTopology(),
}))

jest.mock('../../stores/viewedNodeStore', () => ({
  useViewedNode: (...args: unknown[]) => mockUseViewedNode(...args),
}))

jest.mock('../../hooks/usePlatformShellData', () => ({
  usePlatformShellData: () => ({
    layers: [
      {
        id: 'overview',
        label: 'Overview',
        shortLabel: 'Overview',
        description: 'Overview',
        accent: 'var(--cds-support-warning)',
        health: 'healthy',
        activityLevel: 0,
        alertCount: 0,
        summaryMetrics: [],
        tableRows: [],
        tableColumns: [],
        tableTitle: 'Overview',
        tableDescription: 'Overview',
        gridItems: [],
        notifications: [],
        isLoading: false,
        error: null,
      },
      {
        id: 'avb-routing',
        label: 'AVB Routing',
        shortLabel: 'AVB',
        description: 'AVB Routing',
        accent: 'var(--cds-support-info)',
        health: 'healthy',
        activityLevel: 0,
        alertCount: 0,
        summaryMetrics: [],
        tableRows: [],
        tableColumns: [],
        tableTitle: 'AVB Routing',
        tableDescription: 'AVB Routing',
        gridItems: [],
        notifications: [],
        isLoading: false,
        error: null,
      },
      {
        id: 'cluster-dashboard',
        label: 'Cluster Dashboard',
        shortLabel: 'Cluster',
        description: 'Cluster Dashboard',
        accent: 'var(--cds-text-primary)',
        health: 'healthy',
        activityLevel: 0,
        alertCount: 0,
        summaryMetrics: [],
        tableRows: [],
        tableColumns: [],
        tableTitle: 'Cluster Dashboard',
        tableDescription: 'Cluster Dashboard',
        gridItems: [],
        notifications: [],
        isLoading: false,
        error: null,
      },
      {
        id: 'management',
        label: 'Management',
        shortLabel: 'Management',
        description: 'Management',
        accent: 'var(--cds-support-success)',
        health: 'healthy',
        activityLevel: 0,
        alertCount: 0,
        summaryMetrics: [],
        tableRows: [],
        tableColumns: [],
        tableTitle: 'Management',
        tableDescription: 'Management',
        gridItems: [],
        notifications: [],
        isLoading: false,
        error: null,
      },
      {
        id: 'network-discovery',
        label: 'Network Discovery',
        shortLabel: 'Discovery',
        description: 'Network Discovery',
        accent: 'var(--cds-support-info)',
        health: 'healthy',
        activityLevel: 0,
        alertCount: 0,
        summaryMetrics: [],
        tableRows: [],
        tableColumns: [],
        tableTitle: 'Network Discovery',
        tableDescription: 'Network Discovery',
        gridItems: [],
        notifications: [],
        isLoading: false,
        error: null,
      },
    ],
    layerHealth: {},
    summaryMetrics: [],
    alerts: [],
  }),
}))

jest.mock('../../stores/platformStore', () => ({
  usePlatformView: () => 'stack',
  usePlatformActiveLayer: () => mockActiveLayerId,
  usePlatformLayerHealth: () => ({}),
  usePlatformAlerts: () => [],
  usePlatformAnimationState: () => ({ expandingLayer: null, collapsingLayer: null }),
  usePlatformSummaryMetrics: () => [],
  usePlatformActions: () => ({
    openLayer: jest.fn((id: string) => {
      mockActiveLayerId = id
    }),
    closeLayer: jest.fn(),
    clearAnimation: jest.fn(),
    setAlerts: mockSetAlerts,
    setLayerHealth: mockSetLayerHealth,
    setSummaryMetrics: mockSetSummaryMetrics,
    dismissAlert: jest.fn(),
  }),
}))

jest.mock('../../hooks/useNodeOperations', () => ({
  useNodeOperations: () => mockUseNodeOperations(),
}))

jest.mock('../AvbRouting/AvbRoutingWorkspace', () => ({
  AvbRoutingWorkspace: () => <div data-testid="avb-routing-workspace">AVB Routing Workspace Mock</div>,
}))

jest.mock('../ClusterDashboard/ClusterDashboardWorkspace', () => ({
  ClusterDashboardWorkspace: () => <div data-testid="cluster-dashboard-workspace">Cluster Dashboard Workspace Mock</div>,
}))

jest.mock('../ManagementWorkspace/ManagementWorkspace', () => ({
  ManagementWorkspace: () => <div data-testid="management-workspace">Management Workspace Mock</div>,
}))

jest.mock('../NetworkDiscovery/NetworkDiscoveryWorkspace', () => ({
  NetworkDiscoveryWorkspace: () => <div data-testid="network-discovery-workspace">Network Discovery Workspace Mock</div>,
}))

describe('PlatformModalContent', () => {
  beforeEach(() => {
    mockUpdateSettings.mockReset()
    mockSetAlerts.mockReset()
    mockSetLayerHealth.mockReset()
    mockSetSummaryMetrics.mockReset()
    mockTriggerUpdate.mockReset()
    mockTriggerUpdate.mockResolvedValue({ status: 'ok', message: 'Update started' })
    mockAbortUpdate.mockReset()
    mockUseNodeOperations.mockReset()
    mockUseNodeOperations.mockReturnValue(makeNodeOperations())
    mockUseNodeTopology.mockReset()
    mockUseNodeTopology.mockReturnValue({
      data: {
        nodes: [
          {
            node_id: 'node-local',
            hostname: 'local-rack',
            display_label: 'Stage',
            role: 'all_in_one',
            status: 'ok',
            cpu_percent: 18,
            memory_percent: 32,
            xrun_count: 0,
            audio_latency_ms: 2.2,
            services: { backend: true, juce_engine: true, pipewire: true },
            last_seen: '2026-04-03T22:00:00.000Z',
            is_local: true,
            is_viewed: false,
          },
          {
            node_id: 'node-remote',
            hostname: 'remote-rack',
            display_label: null,
            role: 'audio_node',
            status: 'warn',
            cpu_percent: 61,
            memory_percent: 57,
            xrun_count: 1,
            audio_latency_ms: 4.9,
            services: { backend: true, juce_engine: true, pipewire: false },
            last_seen: '2026-04-03T22:00:03.000Z',
            is_local: false,
            is_viewed: true,
          },
        ],
      },
      isLoading: false,
      error: null,
    })
    mockUseViewedNode.mockReset()
    mockUseViewedNode.mockReturnValue('node-local')
    mockActiveLayerId = null

    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    Object.defineProperty(window, 'ResizeObserver', {
      writable: true,
      value: ResizeObserverMock,
    })
    Object.defineProperty(global, 'ResizeObserver', {
      writable: true,
      value: ResizeObserverMock,
    })

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    })
  })

  it('renders the primary platform control-panel entries in the rail', () => {
    render(
      <MemoryRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <PlatformModalContent onClose={() => undefined} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Open Overview' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Theme' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Workspace Catalog' })).toBeInTheDocument()
  })

  it('keeps utility workspaces grouped at the bottom of the rail with utility styling', () => {
    render(
      <MemoryRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <PlatformModalContent onClose={() => undefined} />
      </MemoryRouter>,
    )

    const nav = screen.getByLabelText('Platforms interface navigation')
    const navLabels = within(nav).getAllByRole('link').map((link) => link.getAttribute('aria-label'))

    expect(navLabels.slice(0, 2)).toEqual(['Open Overview', 'Open Audio Engine'])
    expect(navLabels.slice(-4)).toEqual([
      'Open Host Machine',
      'Open Theme',
      'Open Platform Guide',
      'Open Workspace Catalog',
    ])

    for (const label of ['Open Host Machine', 'Open Theme', 'Open Platform Guide', 'Open Workspace Catalog']) {
      expect(screen.getByRole('link', { name: label }).closest('.workspace-side-nav__item')).toHaveClass('is-utility')
    }
    expect(screen.getByRole('link', { name: 'Open Audio Engine' }).closest('.workspace-side-nav__item')).not.toHaveClass('is-utility')
  })

  it('shows the workspace catalog launcher organizer section', () => {
    render(
      <MemoryRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <PlatformModalContent onClose={() => undefined} />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('link', { name: 'Open Workspace Catalog' }))

    expect(screen.getAllByText('Workspace Catalog').length).toBeGreaterThan(0)
    expect(screen.getAllByText('MIDI Hub').length).toBeGreaterThan(0)
  })

  it('removes the launcher organizer entry from the Platforms rail', () => {
    render(
      <MemoryRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <PlatformModalContent onClose={() => undefined} />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('link', { name: 'Open Launchers' })).not.toBeInTheDocument()
  })

  it('delegates workspace-catalog route launches to the modal host callback', () => {
    const handleLaunchRoute = jest.fn()

    render(
      <MemoryRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <PlatformModalContent onClose={() => undefined} onLaunchRoute={handleLaunchRoute} />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('link', { name: 'Open Workspace Catalog' }))
    fireEvent.click(screen.getByRole('button', { name: 'Launch MIDI Hub' }))

    expect(handleLaunchRoute).toHaveBeenCalledWith('/midi-hub')
  })

  it('opens the update progress modal and triggers the management update workflow', () => {
    mockActiveLayerId = 'management'

    render(
      <MemoryRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <PlatformModalContent onClose={() => undefined} initialLayer="management" />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('management-workspace')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Check for Updates' }))

    expect(mockTriggerUpdate).toHaveBeenCalledWith({ branch: 'master' })
    expect(screen.getByText('Application Update Progress')).toBeInTheDocument()
    expect(screen.getAllByText('Which update path should MAP2 use?').length).toBeGreaterThan(0)
    expect(screen.getByText('Update workflow ready')).toBeInTheDocument()
  })

  it('shows the active update question when progress is already running', () => {
    mockActiveLayerId = 'management'
    mockUseNodeOperations.mockReturnValue(
      makeNodeOperations({
        applicationStatus: makeApplicationStatus({
          status: 'running',
          running: true,
          current_step_key: 'prepare-local-state',
          current_step_index: 3,
          message: 'Stashing local changes before applying the update',
          steps: makeApplicationStatus().steps.map((step: any, index: number) => (
            index < 3
              ? { ...step, status: 'completed' }
              : index === 3
                ? { ...step, status: 'running', result: 'Stashing local changes before applying the update' }
                : step
          )),
        }),
      }),
    )

    render(
      <MemoryRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <PlatformModalContent onClose={() => undefined} initialLayer="management" />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'View Update Progress' }))

    expect(screen.getByText('Question 4 of 10')).toBeInTheDocument()
    expect(screen.getAllByText('Can the node prepare its local state safely?').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Stashing local changes before applying the update').length).toBeGreaterThan(0)
  })

  it('renders the dedicated management workspace when the management layer is active', () => {
    mockActiveLayerId = 'management'

    render(
      <MemoryRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <PlatformModalContent onClose={() => undefined} initialLayer="management" />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('management-workspace')).toBeInTheDocument()
  })

  it('renders the dedicated AVB workspace when the avb-routing layer is active', () => {
    mockActiveLayerId = 'avb-routing'

    render(
      <MemoryRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <PlatformModalContent onClose={() => undefined} initialLayer="avb-routing" />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('avb-routing-workspace')).toBeInTheDocument()
  })

  it('renders the dedicated network discovery workspace when the network-discovery layer is active', () => {
    mockActiveLayerId = 'network-discovery'

    render(
      <MemoryRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <PlatformModalContent onClose={() => undefined} initialLayer="network-discovery" />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('network-discovery-workspace')).toBeInTheDocument()
  })

  it('renders the dedicated cluster workspace when the cluster-dashboard layer is active', () => {
    mockActiveLayerId = 'cluster-dashboard'

    render(
      <MemoryRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <PlatformModalContent onClose={() => undefined} initialLayer="cluster-dashboard" />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('cluster-dashboard-workspace')).toBeInTheDocument()
  })
})
