import '@testing-library/jest-dom'
import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AudioEnginePage } from './AudioEnginePage'

const mockUseCluster = jest.fn()
const mockUsePipeWire = jest.fn()
const mockGetSourceOfTruth = jest.fn()
const mockGetJitterStats = jest.fn()
const mockResetXruns = jest.fn()
const mockUseNodePageContext = jest.fn()
const mockUseLatencyPressure = jest.fn()

jest.mock('../contexts/ClusterContext', () => ({
  useCluster: () => mockUseCluster(),
}))

jest.mock('../hooks/usePipeWire', () => ({
  usePipeWire: (...args: unknown[]) => mockUsePipeWire(...args),
}))

jest.mock('../hooks/useNodePageContext', () => ({
  useNodePageContext: (...args: unknown[]) => mockUseNodePageContext(...args),
}))

jest.mock('../hooks/useLatencyPressure', () => ({
  useLatencyPressure: (...args: unknown[]) => mockUseLatencyPressure(...args),
}))

jest.mock('../../map2/api', () => ({
  audioApi: {
    getSourceOfTruth: (...args: unknown[]) => mockGetSourceOfTruth(...args),
  },
  latencyV2Api: {
    getJitterStats: (...args: unknown[]) => mockGetJitterStats(...args),
    resetXruns: (...args: unknown[]) => mockResetXruns(...args),
  },
}))

jest.mock('../components/AudioEngine/ClusterEngineGrid', () => ({
  ClusterEngineGrid: () => <div data-testid="cluster-engine-grid">Cluster Engine Grid Mock</div>,
}))
jest.mock('../components/Visualizations/SpectrumAnalyzer', () => ({
  SpectrumAnalyzer: () => <div>Spectrum Analyzer Mock</div>,
}))

jest.mock('../components/Visualizations/VuMeterDisplay', () => ({
  VuMeterDisplay: () => <div>VU Meter Mock</div>,
}))

jest.mock('../components/Visualizations/LoudnessMeter', () => ({
  LoudnessMeter: () => <div>Loudness Meter Mock</div>,
}))

jest.mock('../components/Visualizations/PhaseCorrelationMeter', () => ({
  PhaseCorrelationMeter: () => <div>Phase Correlation Mock</div>,
}))

jest.mock('../components/Visualizations/DynamicsMeteringPanel', () => ({
  DynamicsMeteringPanel: () => <div>Dynamics Metering Mock</div>,
}))

jest.mock('../components/Visualizations/CPUMeterPanel', () => ({
  CPUMeterPanel: () => <div>CPU Meter Panel Mock</div>,
}))

jest.mock('../components/Visualizations/LatencyDisplay', () => ({
  LatencyDisplay: () => <div>Latency Display Mock</div>,
}))

function buildPipeWireMock() {
  return {
    overallStatus: 'ok' as const,
    daemonVersion: '1.2.3',
    effectiveRate: 48000,
    effectiveQuantum: 128,
    totalLatencyMs: 4.5,
    graphLatencyMs: 1.4,
    driverLatencyMs: 3.1,
    isHighLatency: false,
    isConnected: true,
    hasXruns: false,
    xruns: 0,
    alerts: [],
    devices: [
      { id: 1, name: 'USB Rack', nick: 'USB Rack', driver: 'alsa', bus: 'USB', media_class: 'Audio/Device', is_default: true, properties: {} },
    ],
    nodes: [
      { id: 10, name: 'Main Sink', nick: 'Main Sink', description: 'Main sink', media_class: 'Audio/Sink', device_id: 1, sample_rate: 48000, channels: 2, format: 'F32', volume: 1, muted: false, is_driver: true, is_default: true, state: 'running', properties: {} },
      { id: 11, name: 'Main Source', nick: 'Main Source', description: 'Main source', media_class: 'Audio/Source', device_id: 1, sample_rate: 48000, channels: 2, format: 'F32', volume: 1, muted: false, is_driver: false, is_default: true, state: 'running', properties: {} },
    ],
    streams: [
      { id: 20, client_name: 'Engine', client_pid: 100, media_name: 'Main stream', direction: 'output', state: 'running', channels: 2, sample_rate: 48000 },
    ],
    links: [
      { id: 30, output_node: 11, output_port: 'out-L', input_node: 10, input_port: 'in-L', state: 'active' },
    ],
    settings: {
      clock_rate: 48000,
      clock_force_rate: 0,
      clock_quantum: 128,
      clock_force_quantum: 0,
      clock_min_quantum: 32,
      clock_max_quantum: 2048,
      clock_allowed_rates: [44100, 48000, 96000],
    },
    setQuantum: jest.fn(async () => undefined),
  }
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <AudioEnginePage />
    </QueryClientProvider>,
  )
}

describe('AudioEnginePage', () => {
  beforeEach(() => {
    mockUseCluster.mockReset()
    mockUsePipeWire.mockReset()
    mockGetSourceOfTruth.mockReset()
    mockGetJitterStats.mockReset()
    mockResetXruns.mockReset()
    mockUseLatencyPressure.mockReset()
    mockUseCluster.mockReturnValue({
      activeNodeId: null,
      nodes: [
        { nodeId: 'node-local', hostname: 'local-rack', role: 'Standalone', isLocal: true, isOnline: true, latencyMs: 0, lastSeen: null },
      ],
      localNodeId: 'node-local',
      isClusterMode: false,
      setActiveNode: jest.fn(),
    })
    mockUsePipeWire.mockReturnValue(buildPipeWireMock())
    mockUseNodePageContext.mockReturnValue({
      localNode: { node_id: 'node-local', hostname: 'local-rack', role: 'LOCAL', is_local: true },
      topology: { nodes: [{ node_id: 'node-local', hostname: 'local-rack', role: 'LOCAL', is_local: true }] },
      viewedNode: { node_id: 'node-local', hostname: 'local-rack', role: 'LOCAL', is_local: true },
      viewedNodeId: 'node-local',
      nodeIdentityQuery: { data: { node_id: 'node-local', hostname: 'local-rack', role: 'LOCAL', is_local: true } },
      nodeTopologyQuery: { data: { nodes: [{ node_id: 'node-local', hostname: 'local-rack', role: 'LOCAL', is_local: true }] } },
    })
    mockGetSourceOfTruth.mockResolvedValue({
      timestamp: '2026-03-15T10:15:00.000Z',
      status: 'aligned',
      profile: { selected_profile: 'Default', profile_version: '1', clock_master: 'local-rack', remarks: [] },
      configured: {
        engine_rate_hz: 48000,
        avb_stream_rate_hz: 48000,
        spdif_rate_hz: 48000,
        buffer_size_samples: 128,
        bits_per_sample: 24,
        allowed_rates_hz: [44100, 48000, 96000],
        require_hard_lock: false,
        allow_resampler: true,
        spdif: { enabled: false, device: '', transport_mode: '', allow_resampler: true, require_hard_lock: false, remarks: [] },
        avb: { enabled: false, interface: '', auto_connect: false, ptp_domain: 0, max_streams: 0 },
      },
      runtime: {
        engine: { available: true, running: true, sample_rate_hz: 48000, buffer_size_samples: 128, cpu_load_percent: 12, audio_device: 'USB Rack' },
        pipewire: { available: true, clock_rate_hz: 48000, clock_force_rate_hz: 0, clock_quantum_samples: 128, clock_force_quantum_samples: 0, clock_allowed_rates_hz: [44100, 48000], effective_rate_hz: 48000, effective_quantum_samples: 128 },
        avb: { enabled: false, interface: '', auto_connect: false, available: false, state: 'disabled', ptp: { available: false } },
      },
      consistency: { checks: {}, issues: [], issue_count: 0 },
    })
    mockGetJitterStats.mockResolvedValue({
      sample_count: 12,
      mean_ms: 0.2,
      p95_ms: 0.3,
      p99_ms: 0.4,
      max_ms: 0.5,
      stddev_ms: 0.1,
      xrun_count: 0,
      callback_count: 100,
      running: true,
      rtl_p95_ms: 4.2,
    })
    mockUseLatencyPressure.mockReturnValue({
      isAvailable: true,
      scoreDisplay: '09',
      pressurePercent: 18,
      tone: 'blue',
      toneColor: '#78a9ff',
      fillColor: 'rgba(120, 169, 255, 0.18)',
      statusLabel: 'Stable',
      helperText: 'Score 09/10 · RTL p95 4.20 ms · Jitter p95 0.300 ms · Callback 38% of budget',
      inputs: {
        effectiveLatencyMs: 4.2,
        jitterP95Ms: 0.3,
        callbackLoadPercent: 38,
        xrunCount: 0,
      },
      isResetting: false,
      resetXruns: jest.fn(),
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
    if (typeof window.ResizeObserver === 'undefined') {
      Object.defineProperty(window, 'ResizeObserver', {
        value: class ResizeObserver {
          observe() {}
          unobserve() {}
          disconnect() {}
        },
        configurable: true,
      })
    }
  })

  it('renders without crash in single-node mode and hides the cluster grid', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Single Node')).toBeInTheDocument()
    })

    expect(screen.queryByTestId('cluster-engine-grid')).not.toBeInTheDocument()
  })

  it('renders cluster mode controls and the cluster engine grid', async () => {
    mockUseCluster.mockReturnValue({
      activeNodeId: 'all',
      nodes: [
        { nodeId: 'node-local', hostname: 'local-rack', role: 'LOCAL', isLocal: true, isOnline: true, latencyMs: 0, lastSeen: null },
        { nodeId: 'node-b', hostname: 'rack-b', role: 'REMOTE', isLocal: false, isOnline: true, latencyMs: 5, lastSeen: null },
      ],
      localNodeId: 'node-local',
      isClusterMode: true,
      setActiveNode: jest.fn(),
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Cluster mode')).toBeInTheDocument()
    })

    expect(screen.getByTestId('cluster-engine-grid')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Detail node' })).toBeInTheDocument()
  })

  it('renders the live metering strip, routing tables, and diagnostics surfaces', async () => {
    const { container } = renderPage()

    await waitFor(() => {
      expect(screen.getByText('Frequency Spectrum')).toBeInTheDocument()
    })

    expect(screen.getByText('VU Meter Mock')).toBeInTheDocument()
    expect(screen.getByText('Loudness (LUFS)')).toBeInTheDocument()
    expect(screen.getByText('Phase Correlation')).toBeInTheDocument()
    expect(screen.getByText('Audio devices')).toBeInTheDocument()
    expect(screen.getByText('Sink nodes')).toBeInTheDocument()
    expect(screen.getByText('Source nodes')).toBeInTheDocument()
    expect(screen.getByText('Active streams')).toBeInTheDocument()
    expect(screen.getByText('Port connections')).toBeInTheDocument()
    expect(screen.getByText('CPU Meter Panel Mock')).toBeInTheDocument()
    expect(screen.getByText('Latency Display Mock')).toBeInTheDocument()
    expect(screen.getByText('Shared operator score driven by latency, callback budget, jitter, headroom, and xruns.')).toBeInTheDocument()
    expect(screen.getAllByText('Latency pressure').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Stable').length).toBeGreaterThanOrEqual(1)
    expect(container.querySelector('.segmented-led')?.getAttribute('aria-label')).toBe('09')
  })

  it('falls back to cluster nodes when topology omits nodes for a remote detail selection', async () => {
    mockUseCluster.mockReturnValue({
      activeNodeId: null,
      nodes: [
        { nodeId: 'node-local', hostname: 'local-rack', role: 'LOCAL', isLocal: true, isOnline: true, latencyMs: 0, lastSeen: null },
        { nodeId: 'node-b', hostname: 'rack-b', role: 'REMOTE', isLocal: false, isOnline: true, latencyMs: 5, lastSeen: null },
      ],
      localNodeId: 'node-local',
      isClusterMode: true,
      setActiveNode: jest.fn(),
    })
    mockUseNodePageContext.mockReturnValue({
      localNode: { node_id: 'node-local', hostname: 'local-rack', role: 'LOCAL', is_local: true },
      topology: { audio_edges: [], network_edges: [] },
      viewedNode: null,
      viewedNodeId: 'node-b',
      nodeIdentityQuery: { data: { node_id: 'node-local', hostname: 'local-rack', role: 'LOCAL', is_local: true } },
      nodeTopologyQuery: { data: { audio_edges: [], network_edges: [] } },
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Cluster mode')).toBeInTheDocument()
    })

    expect(screen.getAllByText('rack-b').length).toBeGreaterThan(0)
  })

  it('contains no Phosphor icon imports', () => {
    const fileContent = fs.readFileSync(path.join(__dirname, 'AudioEnginePage.tsx'), 'utf8')
    expect(fileContent).not.toMatch(/@phosphor-icons\/react/)
  })
})
