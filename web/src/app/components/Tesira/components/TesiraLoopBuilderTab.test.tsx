import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { TesiraLoopBuilderTab } from './TesiraLoopBuilderTab'

const mockListLoops = jest.fn()
const mockCreateLoop = jest.fn()
const mockListTemplates = jest.fn()
const mockListChains = jest.fn()
const mockListChainInsertions = jest.fn()
const mockGetMetrics = jest.fn()
const mockActivateLoop = jest.fn()
const mockBypassLoop = jest.fn()
const mockCalibrateLoop = jest.fn()
const mockDeleteLoop = jest.fn()
const mockInsertChainLoop = jest.fn()
const mockPatchChainLoop = jest.fn()
const mockDeleteChainLoop = jest.fn()

jest.mock('../../../../map2/api', () => ({
  effectsLoopsApi: {
    list: (...args: unknown[]) => mockListLoops(...args),
    create: (...args: unknown[]) => mockCreateLoop(...args),
    listTemplates: (...args: unknown[]) => mockListTemplates(...args),
    listChainInsertions: (...args: unknown[]) => mockListChainInsertions(...args),
    getMetrics: (...args: unknown[]) => mockGetMetrics(...args),
    activate: (...args: unknown[]) => mockActivateLoop(...args),
    bypass: (...args: unknown[]) => mockBypassLoop(...args),
    calibrate: (...args: unknown[]) => mockCalibrateLoop(...args),
    delete: (...args: unknown[]) => mockDeleteLoop(...args),
    insertChainLoop: (...args: unknown[]) => mockInsertChainLoop(...args),
    patchChainLoop: (...args: unknown[]) => mockPatchChainLoop(...args),
    deleteChainLoop: (...args: unknown[]) => mockDeleteChainLoop(...args),
  },
  chainsApi: {
    list: (...args: unknown[]) => mockListChains(...args),
  },
}))

jest.mock('../../../../map2/hooks/useWebSocket', () => ({
  useWebSocketConnection: jest.fn(),
  useWebSocketTopic: jest.fn(),
}))

function renderLoopBuilder() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <TesiraLoopBuilderTab deviceId="tesira-1" />
    </QueryClientProvider>,
  )
}

describe('TesiraLoopBuilderTab', () => {
  beforeAll(() => {
    if (typeof window.matchMedia !== 'function') {
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
    }

    if (typeof window.ResizeObserver === 'undefined') {
      Object.defineProperty(window, 'ResizeObserver', {
        writable: true,
        value: class ResizeObserver {
          observe() {}
          unobserve() {}
          disconnect() {}
        },
      })
    }
  })

  beforeEach(() => {
    mockListLoops.mockReset()
    mockCreateLoop.mockReset()
    mockListTemplates.mockReset()
    mockListChains.mockReset()
    mockListChainInsertions.mockReset()
    mockGetMetrics.mockReset()
    mockActivateLoop.mockReset()
    mockBypassLoop.mockReset()
    mockCalibrateLoop.mockReset()
    mockDeleteLoop.mockReset()
    mockInsertChainLoop.mockReset()
    mockPatchChainLoop.mockReset()
    mockDeleteChainLoop.mockReset()

    mockListLoops.mockResolvedValue({
      loops: [
        {
          loop_id: 'loop-1',
          name: 'Room Insert',
          channels: 2,
          topology: 'serial_insert',
          template_id: 'tpl-room',
          send_endpoint_id: 'send-main-1',
          return_endpoint_id: 'return-main-1',
          state_desired: 'active',
          state_actual: 'active',
          health_status: 'healthy',
          target_added_latency_ms: 1.25,
          measured_added_latency_ms: 1.33,
          compensation_samples: 64,
          calibration_status: 'calibrated',
        },
        {
          loop_id: 'loop-2',
          name: 'Stage Rack',
          channels: 4,
          topology: 'parallel_send_return',
          template_id: 'tpl-stage',
          send_endpoint_id: 'rack-send-1',
          return_endpoint_id: 'rack-return-1',
          state_desired: 'active',
          state_actual: 'bypassed',
          health_status: 'warning',
          health_reason: 'Clock drift detected during last calibration.',
          target_added_latency_ms: 2.5,
          measured_added_latency_ms: 2.75,
          compensation_samples: 128,
          calibration_status: 'pending',
        },
      ],
      count: 2,
    })

    mockCreateLoop.mockResolvedValue({
      loop_id: 'loop-new',
      name: 'External FX Loop',
      channels: 2,
      topology: 'serial_insert',
      state_desired: 'inactive',
      state_actual: 'inactive',
      health_status: 'healthy',
      target_added_latency_ms: 0,
      compensation_samples: 0,
      calibration_status: 'uncalibrated',
    })

    mockListTemplates.mockResolvedValue({
      templates: [
        {
          template_id: 'tpl-room',
          runtime_status: {
            drift_status: 'ok',
            alarm_count: 0,
          },
        },
        {
          template_id: 'tpl-stage',
          runtime_status: {
            drift_status: 'warning',
            alarm_count: 2,
          },
        },
      ],
      count: 2,
    })

    mockListChains.mockResolvedValue({
      chains: [
        { id: 101, name: 'Main Vocal', plugins: [] },
        { id: 202, name: 'Ambient Rack', plugins: [] },
      ],
    })

    mockListChainInsertions.mockResolvedValue({
      chain_id: 101,
      loop_insertions: [
        {
          insertion_id: 'ins-1',
          chain_id: 101,
          loop_id: 'loop-1',
          slot_index: 1,
          enabled: true,
          mode: 'serial_insert',
          blend_pct: 100,
          send_gain_db: 0,
          return_gain_db: 0,
          crossfade_ms: 12,
          band_split_hz: [],
        },
      ],
      effects_loops: [],
      count: 1,
    })

    mockGetMetrics.mockResolvedValue({
      measured_added_latency_ms: 2.345,
      compensation_samples: 96,
    })

    mockActivateLoop.mockResolvedValue({})
    mockBypassLoop.mockResolvedValue({})
    mockCalibrateLoop.mockResolvedValue({})
    mockDeleteLoop.mockResolvedValue({})
    mockInsertChainLoop.mockResolvedValue({})
    mockPatchChainLoop.mockResolvedValue({})
    mockDeleteChainLoop.mockResolvedValue({})
  })

  it('renders the Carbon loop shell, creates loops, inserts them into a chain, and updates the inspector selection', async () => {
    renderLoopBuilder()

    expect(screen.getByText('Create Tesira send and return loops')).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Room Insert' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Stage Rack' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Create loop' }))

    await waitFor(() => {
      expect(mockCreateLoop).toHaveBeenCalledWith({
        name: 'External FX Loop',
        channels: 2,
        topology: 'serial_insert',
        tesira_device_id: 'tesira-1',
        template_id: undefined,
        send_endpoint_id: undefined,
        return_endpoint_id: undefined,
      })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Insert into chain' }))

    await waitFor(() => {
      expect(mockInsertChainLoop).toHaveBeenCalledWith(101, {
        loop_id: 'loop-1',
        slot_index: 0,
        mode: 'serial_insert',
        blend_pct: 100,
      })
    })

    fireEvent.click(screen.getByRole('heading', { name: 'Stage Rack' }))

    expect(await screen.findByText('Template drift warning')).toBeTruthy()
    expect(screen.getByText('Clock drift detected during last calibration.')).toBeTruthy()
    expect(screen.getByText('rack-send-1')).toBeTruthy()
    expect(screen.getByText('rack-return-1')).toBeTruthy()
  })
})
