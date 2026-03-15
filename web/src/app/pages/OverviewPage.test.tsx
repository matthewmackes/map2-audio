import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { OverviewPage } from './OverviewPage'

const mockUsePipeWire = jest.fn()
const mockUseAVBStatus = jest.fn()
const mockUseCPUMetrics = jest.fn()

jest.mock('../components/CPUStatusOverview', () => ({
  CPUStatusOverview: () => <div>CPU overview</div>,
}))

jest.mock('../components/PlatformCapabilities', () => ({
  PlatformCapabilities: () => <div>Platform capabilities</div>,
}))

jest.mock('../components/SystemArchitectureFlow', () => ({
  SystemArchitectureFlow: () => <div>System architecture</div>,
}))

jest.mock('../hooks/usePipeWire', () => ({
  usePipeWire: () => mockUsePipeWire(),
}))

jest.mock('../hooks/useAvbStatus', () => ({
  useAVBStatus: () => mockUseAVBStatus(),
}))

jest.mock('../hooks/useCPUMetrics', () => ({
  useCPUMetrics: () => mockUseCPUMetrics(),
}))

function renderOverviewPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <OverviewPage />
    </MemoryRouter>,
  )
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

const defaultNetworkStatus = {
  smb_enabled: true,
  smb_port_445: true,
  smb_port_139: true,
  local_ip: '10.0.0.55',
  shares: [
    {
      name: 'Sessions',
      path: '/srv/map2/sessions',
      description: 'Session exports and collaboration handoff',
      accessible: true,
      writable: true,
    },
  ],
  access_urls: {
    windows: '\\\\10.0.0.55\\Sessions',
    linux: 'smb://10.0.0.55/Sessions',
    mac: 'smb://10.0.0.55/Sessions',
  },
}

describe('OverviewPage', () => {
  beforeEach(() => {
    mockUsePipeWire.mockReturnValue({
      isDaemonRunning: true,
      overallStatus: 'ok',
      hasXruns: false,
      xruns: 0,
      totalLatencyMs: 3.2,
      effectiveQuantum: 128,
      effectiveRate: 48_000,
      clientCount: 3,
      devices: [{ id: 1 }],
      streams: [{ id: 1 }, { id: 2 }],
    })
    mockUseAVBStatus.mockReturnValue({
      data: {
        available: true,
        state: 'operational',
        interface: 'enp11s0',
        ptp: { state: 'LOCKED' },
        reason: '',
      },
      isLoading: false,
    })
    mockUseCPUMetrics.mockReturnValue({
      metrics: {
        totalCpuPercent: 24,
        xrunCount: 0,
        headroomPercent: 76,
        running: true,
      },
      status: 'ok',
      hasXruns: false,
    })
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => defaultNetworkStatus,
    }) as jest.Mock
  })

  it('renders the IBM-style hierarchy, real KPI values, and direct actions', async () => {
    renderOverviewPage()

    expect(screen.getByText('Node overview')).toBeTruthy()
    expect(screen.getByText('Node health')).toBeTruthy()
    expect(screen.getByText('Audio path readiness')).toBeTruthy()
    expect(screen.getByText('Audio runtime')).toBeTruthy()
    expect(screen.getByText('AVB readiness')).toBeTruthy()
    expect(screen.getByText('CPU and engine')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Content access' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open audio engine' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open AVB routing' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open chains' })).toBeTruthy()

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/folders/network-shares')
    })

    expect(await screen.findByText('Sessions')).toBeTruthy()
    expect(screen.getByText('1/1 shares reachable')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy SMB root' })).toBeTruthy()
  })

  it('renders an explicit network loading state', async () => {
    const deferred = createDeferred<{ ok: boolean; json: () => Promise<typeof defaultNetworkStatus> }>()
    global.fetch = jest.fn().mockReturnValue(deferred.promise) as jest.Mock

    renderOverviewPage()

    expect(screen.getByText('Checking SMB shares and access URLs...')).toBeTruthy()

    deferred.resolve({
      ok: true,
      json: async () => defaultNetworkStatus,
    })

    expect(await screen.findByText('Sessions')).toBeTruthy()
  })

  it('renders an explicit disabled SMB state', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...defaultNetworkStatus,
        smb_enabled: false,
        shares: [],
      }),
    }) as jest.Mock

    renderOverviewPage()

    expect(await screen.findByText('SMB file sharing is currently disabled for this node.')).toBeTruthy()
  })

  it('renders an explicit empty-share state', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...defaultNetworkStatus,
        shares: [],
      }),
    }) as jest.Mock

    renderOverviewPage()

    expect(await screen.findByText('No SMB shares are currently published.')).toBeTruthy()
  })

  it('renders an explicit network error state', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as jest.Mock

    renderOverviewPage()

    expect(await screen.findByText('Network access unavailable')).toBeTruthy()
  })
})
