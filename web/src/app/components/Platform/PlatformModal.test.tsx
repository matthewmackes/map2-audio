import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { PlatformModalContent } from './PlatformModal'

const mockUpdateSettings = jest.fn()
const mockSetAlerts = jest.fn()
const mockSetLayerHealth = jest.fn()
const mockSetSummaryMetrics = jest.fn()
const mockTriggerUpdate = jest.fn()
const mockAbortUpdate = jest.fn()
const mockUseNodeOperations = jest.fn()
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
        id: 'single-node',
        label: 'Single Node',
        shortLabel: 'Single Node',
        description: 'Single Node',
        accent: 'var(--cds-support-success)',
        health: 'healthy',
        activityLevel: 0,
        alertCount: 0,
        summaryMetrics: [],
        tableRows: [],
        tableColumns: [],
        tableTitle: 'Single Node',
        tableDescription: 'Single Node',
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

jest.mock('../../hooks/useMidiCluster', () => ({
  useMidiClusterNodes: () => ({ data: [], isLoading: false }),
  useMidiClusterConnections: () => ({ data: [], isLoading: false }),
  useMidiClusterEndpoints: () => ({ data: [], isLoading: false }),
}))

jest.mock('../../hooks/useNodeOperations', () => ({
  useNodeOperations: () => mockUseNodeOperations(),
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
    expect(screen.getByRole('button', { name: 'Open Labs workspace' })).toBeInTheDocument()
  })

  it('shows the former advanced launcher set inside the Labs workspace', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Open Labs workspace' }))

    expect(screen.getAllByText('Labs').length).toBeGreaterThan(0)
    expect(screen.getByText('MIDI Hub')).toBeTruthy()
    expect(screen.getByText('Tesira AVB')).toBeTruthy()
    expect(screen.getByText('Blocked / Lab')).toBeTruthy()
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

  it('delegates Labs route launches to the modal host callback', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Open Labs workspace' }))
    fireEvent.click(screen.getByRole('button', { name: 'MIDI Hub' }))

    expect(handleLaunchRoute).toHaveBeenCalledWith('/midi-hub')
  })

  it('opens the update progress modal and triggers the single-node update workflow', () => {
    mockActiveLayerId = 'single-node'

    render(
      <MemoryRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <PlatformModalContent onClose={() => undefined} initialLayer="single-node" />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Check for Updates' }))

    expect(mockTriggerUpdate).toHaveBeenCalledWith({ branch: 'master' })
    expect(screen.getByText('Application Update Progress')).toBeInTheDocument()
    expect(screen.getAllByText('Which update path should MAP2 use?').length).toBeGreaterThan(0)
    expect(screen.getByText('Update workflow ready')).toBeInTheDocument()
  })

  it('shows the active update question when progress is already running', () => {
    mockActiveLayerId = 'single-node'
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
        <PlatformModalContent onClose={() => undefined} initialLayer="single-node" />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'View Update Progress' }))

    expect(screen.getByText('Question 4 of 10')).toBeInTheDocument()
    expect(screen.getAllByText('Can the node prepare its local state safely?').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Stashing local changes before applying the update').length).toBeGreaterThan(0)
  })
})
