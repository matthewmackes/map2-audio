import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { PipeWirePage } from './PipeWirePage'

const mockSetActiveNode = jest.fn()
const mockUseCluster = jest.fn()
const mockUsePipeWire = jest.fn()

jest.mock('../contexts/ClusterContext', () => ({
  useCluster: () => mockUseCluster(),
}))

jest.mock('../hooks/usePipeWire', () => ({
  usePipeWire: (...args: unknown[]) => mockUsePipeWire(...args),
}))

type PipeWireHookState = {
  metrics: {
    timestamp: string
  }
  overallStatus: 'ok' | 'warning' | 'error' | 'offline'
  daemonVersion: string
  totalLatencyMs: number
  effectiveQuantum: number
  effectiveRate: number
  devices: Array<{ id: number; name: string; driver: string; is_default: boolean }>
  links: Array<{ id: number; output_node: string; output_port: string; input_node: string; input_port: string; state: string }>
  streams: Array<{ id: number; client_name: string; media_name: string }>
  xruns: number
  alerts: Array<{ severity: 'warning' | 'error'; message: string }>
  defaultSink: { name: string; volume: number; muted: boolean } | null
  defaultSource: { name: string; volume: number; muted: boolean } | null
  settings: {
    clock_rate: number
    clock_force_rate: number
    clock_quantum: number
    clock_force_quantum: number
    clock_min_quantum: number
    clock_max_quantum: number
    clock_allowed_rates: number[]
  }
  graphLatencyMs: number
  driverLatencyMs: number
  isHighLatency: boolean
  isConnected: boolean
  quantumError: unknown
  rateError: unknown
  isSettingQuantum: boolean
  isSettingRate: boolean
  setQuantum: jest.Mock<Promise<void>, [number]>
  setRate: jest.Mock<Promise<void>, [number]>
}

function makePipeWireState(overrides: Partial<PipeWireHookState> = {}): PipeWireHookState {
  return {
    metrics: {
      timestamp: '2026-03-11T13:05:00Z',
    },
    overallStatus: 'ok',
    daemonVersion: '1.2.3',
    totalLatencyMs: 4.2,
    effectiveQuantum: 128,
    effectiveRate: 48000,
    devices: [
      { id: 1, name: 'Main DAC', driver: 'alsa', is_default: true },
    ],
    links: [],
    streams: [],
    xruns: 0,
    alerts: [],
    defaultSink: null,
    defaultSource: null,
    settings: {
      clock_rate: 48000,
      clock_force_rate: 0,
      clock_quantum: 128,
      clock_force_quantum: 0,
      clock_min_quantum: 32,
      clock_max_quantum: 2048,
      clock_allowed_rates: [44100, 48000, 96000],
    },
    graphLatencyMs: 1.1,
    driverLatencyMs: 2.4,
    isHighLatency: false,
    isConnected: true,
    quantumError: null,
    rateError: null,
    isSettingQuantum: false,
    isSettingRate: false,
    setQuantum: jest.fn().mockResolvedValue(undefined),
    setRate: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <PipeWirePage />
    </QueryClientProvider>,
  )
}

function makeJsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: jest.fn().mockResolvedValue(payload),
  } as unknown as Response
}

describe('PipeWirePage cluster integration', () => {
  const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>

  beforeEach(() => {
    mockSetActiveNode.mockReset()
    mockUseCluster.mockReset()
    mockUsePipeWire.mockReset()
    fetchMock.mockReset()
    ;(globalThis as { fetch?: typeof fetch }).fetch = fetchMock

    mockUseCluster.mockReturnValue({
      activeNodeId: 'node-b',
      localNodeId: 'node-local',
      nodes: [
        { nodeId: 'node-local', hostname: 'local-rack', role: 'LOCAL', isOnline: true, latencyMs: 0 },
        { nodeId: 'node-b', hostname: 'rack-b', role: 'AUDIO-NODE', isOnline: true, latencyMs: 67.2 },
      ],
      setActiveNode: mockSetActiveNode,
    })
    mockUsePipeWire.mockReturnValue(makePipeWireState())
  })

  afterEach(() => {
    delete (globalThis as { fetch?: typeof fetch }).fetch
  })

  it('targets the selected remote node and disables runtime clock overrides above 50ms latency', async () => {
    renderPage()

    expect(mockUsePipeWire).toHaveBeenCalledWith({ nodeId: 'node-b', useWebSocket: true })
    expect(screen.getByText('PipeWire Audio Server · rack-b')).toBeTruthy()
    expect(screen.getByText('Peer latency 67.2 ms')).toBeTruthy()
    expect(
      screen.getByText(
        'Runtime clock controls are disabled for this remote node because cluster latency is above 50ms. Select the node locally to apply clock changes safely.',
      ),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))

    expect(
      screen.getByText('Clock overrides are disabled for high-latency remote nodes (>50ms peer latency).'),
    ).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Auto' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Auto' }).every((button) => button.hasAttribute('disabled'))).toBe(true)
    expect(screen.getByRole('button', { name: '128' }).hasAttribute('disabled')).toBe(true)
  })

  it('renders the all-nodes summary and switches to a selected node from the cluster table', async () => {
    mockUseCluster.mockReturnValue({
      activeNodeId: 'all',
      localNodeId: 'node-local',
      nodes: [
        { nodeId: 'node-local', hostname: 'local-rack', role: 'LOCAL', isOnline: true, latencyMs: 0 },
        { nodeId: 'node-b', hostname: 'rack-b', role: 'AUDIO-NODE', isOnline: true, latencyMs: 12.3 },
      ],
      setActiveNode: mockSetActiveNode,
    })
    mockUsePipeWire.mockReturnValue(makePipeWireState())
    fetchMock.mockResolvedValueOnce(
      makeJsonResponse({
        nodes: {
          'node-local': {
            daemon: { running: true, hostname: 'local-rack' },
            settings: { clock_quantum: 128, clock_force_quantum: 0, clock_rate: 48000, clock_force_rate: 0 },
            devices: [{ id: 1 }],
            xruns: 0,
            alerts: [],
            timestamp: '2026-03-11T13:06:00Z',
          },
          'node-b': {
            daemon: { running: true, hostname: 'rack-b' },
            settings: { clock_quantum: 256, clock_force_quantum: 0, clock_rate: 96000, clock_force_rate: 0 },
            devices: [{ id: 2 }, { id: 3 }],
            xruns: 1,
            alerts: [{ severity: 'warning' }],
            timestamp: '2026-03-11T13:06:01Z',
          },
        },
      }),
    )

    renderPage()

    expect(mockUsePipeWire).toHaveBeenCalledWith({ nodeId: null, useWebSocket: false })
    expect(screen.getByText('PipeWire Audio Server · All Nodes')).toBeTruthy()

    await screen.findByText('Comparing PipeWire daemon health, clock settings, device inventory, and XRun counts across the cluster. Select a node row for the full topology view.')

    expect(fetchMock).toHaveBeenCalledWith('/api/cluster/health/extended/pipewire')
    await waitFor(() => expect(screen.queryByText('96 kHz')).toBeTruthy())
    expect(screen.getByText('local-rack')).toBeTruthy()
    expect(screen.getByText('rack-b')).toBeTruthy()
    expect(screen.getByText('12.3 ms')).toBeTruthy()

    fireEvent.click(screen.getByText('rack-b'))

    await waitFor(() => expect(mockSetActiveNode).toHaveBeenCalledWith('node-b'))
  })

  it('keeps remote clock controls enabled when peer latency stays under the safety threshold', () => {
    mockUseCluster.mockReturnValue({
      activeNodeId: 'node-b',
      localNodeId: 'node-local',
      nodes: [
        { nodeId: 'node-local', hostname: 'local-rack', role: 'LOCAL', isOnline: true, latencyMs: 0 },
        { nodeId: 'node-b', hostname: 'rack-b', role: 'AUDIO-NODE', isOnline: true, latencyMs: 12.5 },
      ],
      setActiveNode: mockSetActiveNode,
    })

    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))

    expect(
      screen.queryByText('Runtime clock controls are disabled for this remote node because cluster latency is above 50ms. Select the node locally to apply clock changes safely.'),
    ).toBeNull()
    expect(screen.queryByText('Clock overrides are disabled for high-latency remote nodes (>50ms peer latency).')).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Auto' }).some((button) => button.hasAttribute('disabled'))).toBe(false)
  })
})
