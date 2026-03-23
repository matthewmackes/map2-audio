import React from 'react'
import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockUseAVBStatus = jest.fn()
const mockUseAVBStreams = jest.fn()
const mockUseAVBDiscovery = jest.fn()
const mockUsePTPStatus = jest.fn()
const mockUseTsnStatus = jest.fn()
const mockUseAvbRealtimeSync = jest.fn()

const mockUseAvbDevices = jest.fn()
const mockUseAvdeccEntities = jest.fn()
const mockUseAvdeccStats = jest.fn()

const mockFetch = jest.fn()

jest.mock('./TopologyGraph', () => ({
  TopologyGraph: () => <div data-testid="topology-graph">Topology graph</div>,
}))

jest.mock('../../hooks/useAvbStatus', () => ({
  useAVBStatus: (...args: unknown[]) => mockUseAVBStatus(...args),
  useAVBStreams: (...args: unknown[]) => mockUseAVBStreams(...args),
  useAVBDiscovery: (...args: unknown[]) => mockUseAVBDiscovery(...args),
  usePTPStatus: (...args: unknown[]) => mockUsePTPStatus(...args),
  useTsnStatus: (...args: unknown[]) => mockUseTsnStatus(...args),
  useAvbRealtimeSync: (...args: unknown[]) => mockUseAvbRealtimeSync(...args),
}))

jest.mock('../AvbRouting/hooks/useAvbApi', () => ({
  useAvbDevices: (...args: unknown[]) => mockUseAvbDevices(...args),
  useAvdeccEntities: (...args: unknown[]) => mockUseAvdeccEntities(...args),
  useAvdeccStats: (...args: unknown[]) => mockUseAvdeccStats(...args),
}))

import { AVBNetworkTab } from './AVBNetworkTab'

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <AVBNetworkTab />
    </QueryClientProvider>,
  )
}

describe('AVBNetworkTab', () => {
  beforeEach(() => {
    mockUseAVBStatus.mockReset()
    mockUseAVBStreams.mockReset()
    mockUseAVBDiscovery.mockReset()
    mockUsePTPStatus.mockReset()
    mockUseTsnStatus.mockReset()
    mockUseAvbRealtimeSync.mockReset()
    mockUseAvbDevices.mockReset()
    mockUseAvdeccEntities.mockReset()
    mockUseAvdeccStats.mockReset()
    mockFetch.mockReset()

    if (typeof window.matchMedia !== 'function') {
      Object.defineProperty(window, 'matchMedia', {
        value: jest.fn().mockImplementation((query: string) => ({
          matches: query.includes('max-width') ? false : false,
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
        configurable: true,
      })
    }

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

    Object.defineProperty(global, 'fetch', {
      value: mockFetch,
      configurable: true,
      writable: true,
    })

    mockFetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/api/cluster/nodes')) {
        return {
          ok: true,
          json: async () => ({
            nodes: [
              {
                node_id: 'node-a',
                hostname: 'Node A',
                role: 'AUDIO-NODE',
                status: 'ONLINE',
                health_score: 98.2,
                total_memory_gb: 16,
              },
            ],
          }),
        }
      }
      if (url.includes('/api/cluster/metrics')) {
        return {
          ok: true,
          json: async () => ({
            metrics: [
              {
                node_id: 'node-a',
                timestamp: '2026-03-12T12:00:00Z',
                cpu_percent: 24.5,
                memory_percent: 41.1,
                dsp_load_percent: 8.3,
                xrun_count: 0,
                latency_ms: 1.3,
              },
            ],
          }),
        }
      }
      throw new Error(`Unhandled fetch URL: ${url}`)
    })

    mockUseAVBStatus.mockReturnValue({
      data: { enabled: true, available: true, interface: 'eth0' },
      error: null,
    })
    mockUseAVBStreams.mockReturnValue({
      data: {
        available: true,
        streams: [
          {
            stream_id: 'talker-1',
            direction: 'talker',
            state: 'running',
            channels: 2,
            sample_rate: 48000,
            interface: 'eth0',
            stats: {
              frames_sent: 1200,
              frames_received: 1200,
              receive_errors: 0,
            },
            health: {
              ready: true,
              issues: [],
              ptp: { locked: true, state: 'locked' },
              tsn: { available: true, interface: 'eth0' },
            },
          },
        ],
      },
    })
    mockUseAVBDiscovery.mockReturnValue({
      data: { nodes: [], talker_nodes: 1, listener_nodes: 1, total_discovered: 1 },
    })
    mockUsePTPStatus.mockReturnValue({
      data: { available: true, state: 'locked', offset_ns: 1000, mean_path_delay_ns: 2000 },
    })
    mockUseTsnStatus.mockReturnValue({
      data: { available: true, interface: 'eth0', mqprio_configured: true, cbs_configured: true },
    })
    mockUseAvbDevices.mockReturnValue({
      data: { count: 1, device_names: ['AVB Core'], discovered_count: 1, discovered_devices: [] },
    })
    mockUseAvdeccEntities.mockReturnValue({
      data: { enabled: true, entities: [] },
    })
    mockUseAvdeccStats.mockReturnValue({
      data: {
        connections_active: 0,
        entities_discovered: 0,
        adp: { messages_sent: 0, messages_received: 0 },
        acmp: { messages_sent: 0, messages_received: 0 },
        aecp: { messages_sent: 0, messages_received: 0 },
      },
    })
  })

  it('renders stream and node rows using carbon table primitives', async () => {
    renderTab()

    expect(await screen.findByText('talker-1')).toBeInTheDocument()
    expect(await screen.findByText('Node A')).toBeInTheDocument()
    expect(await screen.findByText('Frames sent')).toBeInTheDocument()
    expect(screen.getByText('Readiness')).toBeInTheDocument()
    expect(await screen.findByText('ONLINE')).toBeInTheDocument()
    expect(screen.getByTestId('topology-graph')).toBeInTheDocument()

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/cluster/nodes')
      expect(mockFetch).toHaveBeenCalledWith('/api/cluster/metrics')
    })
  })

  it('shows empty stream message when stream list is empty', async () => {
    mockUseAVBStreams.mockReturnValue({
      data: { available: true, streams: [] },
    })

    renderTab()

    expect(await screen.findByText('No active AVB streams detected for this node.')).toBeInTheDocument()
  })
})
