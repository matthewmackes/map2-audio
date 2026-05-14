// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// pivot-13b cycle 3 — stream-mode tests for DevicePeakMetersOverview.
// Mocks both registry hooks so we can prove the overview reads from the
// WS hook when useStream is set.

import '@testing-library/jest-dom'

import { render, screen } from '@testing-library/react'

import { DevicePeakMetersOverview } from './DevicePeakMetersOverview'

const mockPolling = jest.fn()
const mockStream = jest.fn()
const streamArgs: unknown[] = []

jest.mock('../../../hooks/useDevicesPeakMetersRegistry', () => ({
  useDevicesPeakMetersRegistry: () => mockPolling(),
}))
jest.mock('../../../hooks/useDevicesPeakMetersStream', () => ({
  useDevicesPeakMetersStream: (...args: unknown[]) => {
    streamArgs.push(args[0])
    return mockStream()
  },
}))

describe('DevicePeakMetersOverview useStream', () => {
  beforeEach(() => {
    mockPolling.mockReturnValue({
      devices: [],
      isError: false,
      isLoading: false,
    })
    mockStream.mockReset()
  })

  it('renders rows from the stream hook when useStream is true', () => {
    const dev = {
      device_id: 'tascam-us144mkii',
      input_channels: 4,
      output_channels: 4,
      has_engine_source: true,
      snapshot: {
        input_peak_db: [-12, -150, -150, -150],
        output_peak_db: [-9, -150, -150, -150],
        source: 'engine',
        captured_at: 1715731200.0,
      },
    }
    mockStream.mockReturnValue({
      devices: [dev],
      rows: [{ ...dev, ageSeconds: 1, isStale: false }],
      hasFirstFrame: true,
      isConnected: true,
      lastError: null,
    })
    render(<DevicePeakMetersOverview useStream />)
    expect(screen.getByTestId('device-peak-meters-overview')).toBeInTheDocument()
    // Peak column auto-enables under useStream.
    expect(screen.getByText(/in -12\.0 \/ out -9\.0 dBFS/)).toBeInTheDocument()
    // Streaming swaps the local Tag for DeviceMeterSourceTag, which
    // uses an overview-stream-tag-<device_id> testid.
    expect(
      screen.getByTestId('overview-stream-tag-tascam-us144mkii'),
    ).toBeInTheDocument()
  })

  it('renders the loading state until the first frame arrives', () => {
    mockStream.mockReturnValue({
      devices: [],
      rows: [],
      hasFirstFrame: false,
      isConnected: false,
      lastError: null,
    })
    render(<DevicePeakMetersOverview useStream />)
    expect(
      screen.getByTestId('device-peak-meters-overview-loading'),
    ).toBeInTheDocument()
  })

  it('renders the error state when the socket reports an error', () => {
    mockStream.mockReturnValue({
      devices: [],
      rows: [],
      hasFirstFrame: false,
      isConnected: false,
      lastError: 'websocket error',
    })
    render(<DevicePeakMetersOverview useStream />)
    expect(
      screen.getByTestId('device-peak-meters-overview-error'),
    ).toBeInTheDocument()
  })

  it('passes deviceIds through to the stream hook for pinned-device filtering', () => {
    streamArgs.length = 0
    mockStream.mockReturnValue({
      devices: [],
      rows: [],
      hasFirstFrame: true,
      isConnected: true,
      lastError: null,
    })
    render(
      <DevicePeakMetersOverview
        useStream
        deviceIds={['edirol-ua-1000', 'tascam-us144mkii']}
      />,
    )
    expect(streamArgs.length).toBeGreaterThan(0)
    const lastOpts = streamArgs[streamArgs.length - 1] as Record<string, unknown>
    expect(lastOpts.deviceIds).toEqual([
      'edirol-ua-1000',
      'tascam-us144mkii',
    ])
    expect(lastOpts.enabled).toBe(true)
  })

  it('renders a Stale Tag for rows whose snapshot age exceeds the threshold', () => {
    const dev = {
      device_id: 'tascam-us144mkii',
      input_channels: 4,
      output_channels: 4,
      has_engine_source: true,
      snapshot: {
        input_peak_db: [-12, -150, -150, -150],
        output_peak_db: [-9, -150, -150, -150],
        source: 'engine' as const,
        captured_at: 1715731000.0, // long ago
      },
    }
    mockStream.mockReturnValue({
      devices: [dev],
      rows: [{ ...dev, ageSeconds: 90, isStale: true }],
      hasFirstFrame: true,
      isConnected: true,
      lastError: null,
    })
    render(<DevicePeakMetersOverview useStream />)
    const tag = screen.getByTestId('overview-stream-tag-tascam-us144mkii')
    expect(tag).toHaveTextContent('Stale')
  })

  it('renders a "Last seen" column under useStream with formatted age', () => {
    const dev = {
      device_id: 'edirol-ua-1000',
      input_channels: 10,
      output_channels: 10,
      has_engine_source: true,
      snapshot: {
        input_peak_db: [-6],
        output_peak_db: [-3],
        source: 'engine' as const,
        captured_at: 1715731200.0,
      },
    }
    mockStream.mockReturnValue({
      devices: [dev],
      rows: [{ ...dev, ageSeconds: 3, isStale: false }],
      hasFirstFrame: true,
      isConnected: true,
      lastError: null,
    })
    render(<DevicePeakMetersOverview useStream />)
    // Header
    expect(screen.getByText('Last seen')).toBeInTheDocument()
    // Cell with formatted age
    const cell = screen.getByTestId('overview-last-seen-edirol-ua-1000')
    expect(cell.textContent).toMatch(/3\s*s ago/)
  })

  it('formats minute-scale staleness in the Last seen column', () => {
    const dev = {
      device_id: 'tascam-us144mkii',
      input_channels: 4,
      output_channels: 4,
      has_engine_source: true,
      snapshot: {
        input_peak_db: [-12],
        output_peak_db: [-9],
        source: 'engine' as const,
        captured_at: 1715731200.0,
      },
    }
    mockStream.mockReturnValue({
      devices: [dev],
      rows: [{ ...dev, ageSeconds: 125, isStale: true }],
      hasFirstFrame: true,
      isConnected: true,
      lastError: null,
    })
    render(<DevicePeakMetersOverview useStream />)
    const cell = screen.getByTestId('overview-last-seen-tascam-us144mkii')
    expect(cell.textContent).toMatch(/2\s*m ago/)
  })

  it('renders "—" in Last seen when stream row has no ageSeconds', () => {
    const dev = {
      device_id: 'hotone-jogg',
      input_channels: 2,
      output_channels: 2,
      has_engine_source: false,
      snapshot: {
        input_peak_db: [-150],
        output_peak_db: [-150],
        source: 'placeholder' as const,
        captured_at: null,
      },
    }
    mockStream.mockReturnValue({
      devices: [dev],
      rows: [{ ...dev, ageSeconds: null, isStale: false }],
      hasFirstFrame: true,
      isConnected: true,
      lastError: null,
    })
    render(<DevicePeakMetersOverview useStream />)
    const cell = screen.getByTestId('overview-last-seen-hotone-jogg')
    expect(cell.textContent).toBe('—')
  })

  it('omits the Last seen column outside of useStream', () => {
    render(<DevicePeakMetersOverview />)
    expect(screen.queryByText('Last seen')).not.toBeInTheDocument()
  })

  it('renders the Engine unavailable Tag for engine_unavailable rows', () => {
    const dev = {
      device_id: 'edirol-ua-1000',
      input_channels: 10,
      output_channels: 10,
      has_engine_source: true,
      snapshot: {
        input_peak_db: Array(10).fill(-150),
        output_peak_db: Array(10).fill(-150),
        source: 'engine_unavailable' as const,
        captured_at: 1715731200.0,
      },
    }
    mockStream.mockReturnValue({
      devices: [dev],
      rows: [{ ...dev, ageSeconds: 1, isStale: false }],
      hasFirstFrame: true,
      isConnected: true,
      lastError: null,
    })
    render(<DevicePeakMetersOverview useStream />)
    const tag = screen.getByTestId('overview-stream-tag-edirol-ua-1000')
    expect(tag).toHaveTextContent('Engine unavailable')
  })
})
