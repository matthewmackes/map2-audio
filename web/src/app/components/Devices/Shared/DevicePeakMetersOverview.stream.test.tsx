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
    mockStream.mockReturnValue({
      devices: [
        {
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
        },
      ],
      hasFirstFrame: true,
      isConnected: true,
      lastError: null,
    })
    render(<DevicePeakMetersOverview useStream />)
    expect(screen.getByTestId('device-peak-meters-overview')).toBeInTheDocument()
    // Peak column auto-enables under useStream.
    expect(screen.getByText(/in -12\.0 \/ out -9\.0 dBFS/)).toBeInTheDocument()
    expect(screen.getByTestId('overview-source-engine')).toBeInTheDocument()
  })

  it('renders the loading state until the first frame arrives', () => {
    mockStream.mockReturnValue({
      devices: [],
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
})
