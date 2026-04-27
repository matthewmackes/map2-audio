import '@testing-library/jest-dom'
import * as React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
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

const mockMeasureLatency = jest.fn()
const mockListHistory = jest.fn()

jest.mock('../../../../../map2/clients/devices', () => ({
  __esModule: true,
  measureLatency: (req: unknown) => mockMeasureLatency(req),
  listMeasureLatencyHistory: (...args: unknown[]) => mockListHistory(...args),
}))

import { AudioIoTab } from './AudioIoTab'
import type { DeviceProfileDetail } from '../../../../../map2/clients/devices'

function makeProfile(withLoopback = true): DeviceProfileDetail {
  return {
    pack_id: 'edirol-ua', model: 'ua-1000', kind: 'audio',
    path: '/repo/x.yaml', hardware_id: 'usb:0582:00ed',
    document: withLoopback
      ? { loopback_ports: { playback: 'system:playback_1', capture: 'system:capture_1' } } as Record<string, unknown>
      : {} as Record<string, unknown>,
  }
}

function renderTab(overrides?: { profile?: DeviceProfileDetail }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <AudioIoTab profile={overrides?.profile ?? makeProfile()} />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  mockMeasureLatency.mockReset()
  mockListHistory.mockReset()
})

test('AudioIoTab: renders the not-available banner when loopback_ports missing', () => {
  mockListHistory.mockResolvedValue({ history: [], count: 0 })
  renderTab({ profile: makeProfile(false) })
  expect(screen.getByText('Audio I/O measurement not available')).toBeInTheDocument()
})

test('AudioIoTab: renders Measure latency button + loopback ports when declared', async () => {
  mockListHistory.mockResolvedValue({ history: [], count: 0 })
  renderTab()
  expect(screen.getByRole('button', { name: 'Measure latency' })).toBeInTheDocument()
  expect(screen.getByText('system:playback_1')).toBeInTheDocument()
  expect(screen.getByText('system:capture_1')).toBeInTheDocument()
})

test('AudioIoTab: clicking Measure calls measureLatency and renders the result', async () => {
  mockListHistory.mockResolvedValue({ history: [], count: 0 })
  mockMeasureLatency.mockResolvedValue({
    timestamp: '2026-04-27T10:00:00+00:00',
    pack_id: 'edirol-ua', model: 'ua-1000', method: 'synthetic',
    sample_rate: 48000, duration_ms: 500, tail_ms: 200,
    trials: [{ rtt_ms: 4.2, peak_correlation: 0.95, secondary_peak_ratio: 0.1 }],
    mean_rtt_ms: 4.2, p95_rtt_ms: 4.6, jitter_p95_ms: 0.2,
    notes: '', loopback_ports: { playback: 'system:playback_1', capture: 'system:capture_1' },
    evidence_path: 'docs/fit-for-purpose-evidence/20260427/edirol-ua/ua-1000/loopback-100000.json',
  })

  renderTab()
  fireEvent.click(screen.getByRole('button', { name: 'Measure latency' }))

  await waitFor(() => {
    expect(mockMeasureLatency).toHaveBeenCalledWith({
      pack_id: 'edirol-ua', model: 'ua-1000',
      trials: 3, duration_ms: 500, tail_ms: 200,
    })
  })
  await waitFor(() => {
    expect(screen.getByText('Most-recent measurement')).toBeInTheDocument()
  })
  expect(screen.getAllByText('4.20 ms').length).toBeGreaterThan(0)
  // 4.60 ms appears in both the Most-recent panel and the History table.
  expect(screen.getAllByText('4.60 ms').length).toBeGreaterThanOrEqual(1)
})

test('AudioIoTab: history rows render and Compare-to-baseline appears when >1 entries', async () => {
  mockListHistory.mockResolvedValue({
    history: [
      { evidence_path: 'a.json', timestamp: '2026-04-27T10:00:00+00:00', method: 'synthetic',
        mean_rtt_ms: 4.2, p95_rtt_ms: 4.6, jitter_p95_ms: 0.2, trial_count: 3 },
      { evidence_path: 'b.json', timestamp: '2026-04-26T10:00:00+00:00', method: 'jack',
        mean_rtt_ms: 3.9, p95_rtt_ms: 4.1, jitter_p95_ms: 0.15, trial_count: 3 },
    ],
    count: 2,
  })

  renderTab()
  await waitFor(() => {
    expect(screen.getByText('Compare to baseline')).toBeInTheDocument()
  })
  // History section heading reflects the count.
  expect(screen.getByText(/^History \(2\)$/)).toBeInTheDocument()
  // Both evidence paths render — `a.json` appears in the Most-recent
  // panel + History table, `b.json` appears once in History.
  expect(screen.getAllByText('a.json').length).toBeGreaterThanOrEqual(1)
  expect(screen.getByText('b.json')).toBeInTheDocument()
})

test('AudioIoTab: error notification surfaces when measurement throws', async () => {
  mockListHistory.mockResolvedValue({ history: [], count: 0 })
  mockMeasureLatency.mockRejectedValue(new Error('JACK server not running'))

  renderTab()
  fireEvent.click(screen.getByRole('button', { name: 'Measure latency' }))

  await waitFor(() => {
    expect(screen.getByText('Measurement failed')).toBeInTheDocument()
  })
  expect(screen.getByText(/JACK server not running/)).toBeInTheDocument()
})
