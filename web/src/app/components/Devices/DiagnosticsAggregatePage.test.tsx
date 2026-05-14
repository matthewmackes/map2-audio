import '@testing-library/jest-dom'
import * as React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

beforeAll(() => {
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      writable: true, configurable: true,
      value: (query: string) => ({
        matches: false, media: query, onchange: null,
        addEventListener: () => undefined, removeEventListener: () => undefined,
        addListener: () => undefined, removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    })
  }
})

const mockListDiagnostics = jest.fn()

jest.mock('../../../map2/clients/devices', () => ({
  __esModule: true,
  listDeviceDiagnostics: (...args: unknown[]) => mockListDiagnostics(...args),
}))

// Mock the registry hook so the overview tile mounted on this page
// doesn't issue a real fetch. The hook is covered by its own test.
const mockUseDevicesPeakMetersRegistry = jest.fn()
jest.mock('../../hooks/useDevicesPeakMetersRegistry', () => ({
  useDevicesPeakMetersRegistry: () => mockUseDevicesPeakMetersRegistry(),
}))

// Pivot-13d cycle 1 — the pinned-devices streaming overview also
// mounts on this page when at least one pinned device is metered.
const mockUseDevicesPeakMetersStream = jest.fn()
jest.mock('../../hooks/useDevicesPeakMetersStream', () => ({
  useDevicesPeakMetersStream: () => mockUseDevicesPeakMetersStream(),
}))

// Run-13f cycle 4 — cluster-wide overview tile also mounts on this
// page. Stub its hook with the same empty defaults so tests stay tight.
const mockUseDevicesPeakMetersClusterRegistry = jest.fn()
jest.mock('../../hooks/useDevicesPeakMetersClusterRegistry', () => ({
  useDevicesPeakMetersClusterRegistry: () =>
    mockUseDevicesPeakMetersClusterRegistry(),
}))

// Run-13g cycle 5 — diagnostics page now uses the streaming variant
// of the cluster overview. Stub the WS hook too.
const mockUseDevicesPeakMetersClusterStream = jest.fn()
jest.mock('../../hooks/useDevicesPeakMetersClusterStream', () => ({
  useDevicesPeakMetersClusterStream: () =>
    mockUseDevicesPeakMetersClusterStream(),
}))

const mockUsePinnedDevices = jest.fn<readonly string[], []>()
jest.mock('../../state/uiSettings', () => ({
  __esModule: true,
  usePinnedDevices: () => mockUsePinnedDevices(),
  // Other named exports the page doesn't use but the module exposes.
  getPinnedDeviceIds: () => [],
  pinDevice: jest.fn(),
  unpinDevice: jest.fn(),
}))

import { DiagnosticsAggregatePage } from './DiagnosticsAggregatePage'

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <DiagnosticsAggregatePage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

afterEach(() => mockListDiagnostics.mockReset())

beforeEach(() => {
  mockUseDevicesPeakMetersRegistry.mockReturnValue({
    devices: [],
    isError: false,
    isLoading: false,
  })
  mockUseDevicesPeakMetersStream.mockReturnValue({
    devices: [],
    rows: [],
    hasFirstFrame: true,
    isConnected: false,
    lastError: null,
  })
  mockUseDevicesPeakMetersClusterRegistry.mockReturnValue({
    local: { devices: [] },
    peers: [],
    errors: {},
    isError: false,
    isLoading: false,
  })
  mockUseDevicesPeakMetersClusterStream.mockReturnValue({
    local: { devices: [] },
    peers: [],
    errors: {},
    hasFirstFrame: true,
    isConnected: false,
    lastError: null,
  })
  mockUsePinnedDevices.mockReturnValue([])
})

test('DiagnosticsAggregatePage: renders header + counts when data loads', async () => {
  mockListDiagnostics.mockResolvedValue({
    diagnostics: [
      { severity: 'error', source: 'profile_registry', code: 'pack_degraded',
        detail: 'broken yaml', pack_id: 'brokenco', file: '/x.yaml', ts: 1.0 },
      { severity: 'warning', source: 'controller_host', code: 'host_unhealthy',
        detail: 'restart count up', ts: 2.0 },
    ],
    count: 2,
    counts_by_severity: { info: 0, warning: 1, error: 1 },
  })

  renderPage()
  expect(await screen.findByText('Bench-wide diagnostics')).toBeInTheDocument()
  await waitFor(() => {
    expect(screen.getByText('1 error')).toBeInTheDocument()
  })
  expect(screen.getByText('1 warning')).toBeInTheDocument()
  // Both rows in the table.
  expect(screen.getByText('pack_degraded')).toBeInTheDocument()
  expect(screen.getByText('host_unhealthy')).toBeInTheDocument()
})

test('DiagnosticsAggregatePage: empty state when no rows', async () => {
  mockListDiagnostics.mockResolvedValue({
    diagnostics: [], count: 0,
    counts_by_severity: { info: 0, warning: 0, error: 0 },
  })

  renderPage()
  await waitFor(() => {
    expect(screen.getByText(/Bench is healthy/)).toBeInTheDocument()
  })
})

test('DiagnosticsAggregatePage: error InlineNotification on failure', async () => {
  mockListDiagnostics.mockRejectedValue(new Error('500'))

  renderPage()
  await waitFor(() => {
    expect(screen.getByText('Diagnostics unavailable')).toBeInTheDocument()
  })
})

test('DiagnosticsAggregatePage: mounts the per-device metering overview', async () => {
  mockListDiagnostics.mockResolvedValue({
    diagnostics: [], count: 0,
    counts_by_severity: { info: 0, warning: 0, error: 0 },
  })
  mockUseDevicesPeakMetersRegistry.mockReturnValue({
    devices: [
      { device_id: 'tascam-us144mkii', input_channels: 4, output_channels: 4, has_engine_source: false },
      { device_id: 'lexicon-mpx1', input_channels: 2, output_channels: 2, has_engine_source: true },
    ],
    isError: false,
    isLoading: false,
  })

  renderPage()
  await waitFor(() => {
    expect(screen.getByTestId('dx-meters-overview')).toBeInTheDocument()
  })
  // The overview section header should appear.
  expect(screen.getByText('Per-device metering')).toBeInTheDocument()
  // Both rows rendered through the table.
  expect(screen.getByText('tascam-us144mkii')).toBeInTheDocument()
  expect(screen.getByText('lexicon-mpx1')).toBeInTheDocument()
})

test('DiagnosticsAggregatePage: pack_id column links to device profile', async () => {
  mockListDiagnostics.mockResolvedValue({
    diagnostics: [
      { severity: 'error', source: 'profile_registry', code: 'pack_degraded',
        detail: 'x', pack_id: 'edirol-ua', ts: 1.0 },
    ],
    count: 1,
    counts_by_severity: { info: 0, warning: 0, error: 1 },
  })

  renderPage()
  await waitFor(() => {
    expect(screen.getByText('edirol-ua')).toBeInTheDocument()
  })
  const link = screen.getByText('edirol-ua').closest('a')
  expect(link?.getAttribute('href')).toBe('/devices/profile/edirol-ua/?from=diagnostics')
})

test('DiagnosticsAggregatePage: omits pinned-streaming overview when no devices pinned', async () => {
  mockListDiagnostics.mockResolvedValue({
    diagnostics: [], count: 0,
    counts_by_severity: { info: 0, warning: 0, error: 0 },
  })
  mockUsePinnedDevices.mockReturnValue([])

  renderPage()
  await waitFor(() => {
    expect(screen.getByTestId('dx-meters-overview')).toBeInTheDocument()
  })
  expect(screen.queryByTestId('dx-meters-overview-pinned')).not.toBeInTheDocument()
})

test('DiagnosticsAggregatePage: mounts pinned-streaming overview when metered pin exists', async () => {
  mockListDiagnostics.mockResolvedValue({
    diagnostics: [], count: 0,
    counts_by_severity: { info: 0, warning: 0, error: 0 },
  })
  // 'edirol-ua1000' is in the pinned namespace; the translator rewrites
  // it to 'edirol-ua-1000' in the registry namespace.
  mockUsePinnedDevices.mockReturnValue(['edirol-ua1000', 'lcd'])
  mockUseDevicesPeakMetersStream.mockReturnValue({
    devices: [
      {
        device_id: 'edirol-ua-1000',
        input_channels: 10,
        output_channels: 10,
        has_engine_source: true,
        snapshot: {
          input_peak_db: [-6.0],
          output_peak_db: [-3.0],
          source: 'engine',
          captured_at: 1715731200.0,
        },
      },
    ],
    rows: [
      {
        device_id: 'edirol-ua-1000',
        input_channels: 10,
        output_channels: 10,
        has_engine_source: true,
        snapshot: {
          input_peak_db: [-6.0],
          output_peak_db: [-3.0],
          source: 'engine',
          captured_at: 1715731200.0,
        },
        ageSeconds: 1,
        isStale: false,
      },
    ],
    hasFirstFrame: true,
    isConnected: true,
    lastError: null,
  })

  renderPage()
  await waitFor(() => {
    expect(screen.getByTestId('dx-meters-overview-pinned')).toBeInTheDocument()
  })
  // Pinned overview title should appear.
  expect(screen.getByText('Pinned devices (live)')).toBeInTheDocument()
})

test('DiagnosticsAggregatePage: mounts the cluster-wide overview tile', async () => {
  mockListDiagnostics.mockResolvedValue({
    diagnostics: [], count: 0,
    counts_by_severity: { info: 0, warning: 0, error: 0 },
  })
  // The diagnostics page mounts the streaming variant of the cluster
  // overview (run-13g cycle 5); stub the WS hook with sample data so
  // the table renders a row.
  mockUseDevicesPeakMetersClusterStream.mockReturnValue({
    local: {
      devices: [
        {
          device_id: 'edirol-ua-1000',
          input_channels: 10,
          output_channels: 10,
          has_engine_source: true,
        },
      ],
    },
    peers: [],
    errors: {},
    hasFirstFrame: true,
    isConnected: true,
    lastError: null,
  })

  renderPage()
  await waitFor(() => {
    expect(screen.getByTestId('dx-meters-cluster-overview')).toBeInTheDocument()
  })
  expect(screen.getByText('Cluster-wide metering (live)')).toBeInTheDocument()
})

test('DiagnosticsAggregatePage: omits pinned overview when pins are non-metered surfaces', async () => {
  mockListDiagnostics.mockResolvedValue({
    diagnostics: [], count: 0,
    counts_by_severity: { info: 0, warning: 0, error: 0 },
  })
  mockUsePinnedDevices.mockReturnValue(['lcd', 'maschine-mk1', 'ableton-push'])

  renderPage()
  await waitFor(() => {
    expect(screen.getByTestId('dx-meters-overview')).toBeInTheDocument()
  })
  expect(screen.queryByTestId('dx-meters-overview-pinned')).not.toBeInTheDocument()
})
