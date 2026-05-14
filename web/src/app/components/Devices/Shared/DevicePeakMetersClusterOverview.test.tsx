// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Pivot run-13f cycle 4 — DevicePeakMetersClusterOverview tests.

import '@testing-library/jest-dom'

import { render, screen } from '@testing-library/react'

import { DevicePeakMetersClusterOverview } from './DevicePeakMetersClusterOverview'

const mockCluster = jest.fn()
const mockClusterStream = jest.fn()

jest.mock('../../../hooks/useDevicesPeakMetersClusterRegistry', () => ({
  useDevicesPeakMetersClusterRegistry: () => mockCluster(),
}))

jest.mock('../../../hooks/useDevicesPeakMetersClusterStream', () => ({
  useDevicesPeakMetersClusterStream: () => mockClusterStream(),
}))

beforeEach(() => {
  mockCluster.mockReset()
  mockClusterStream.mockReset()
  mockCluster.mockReturnValue({
    local: { devices: [] },
    peers: [],
    errors: {},
    isError: false,
    isLoading: false,
  })
  mockClusterStream.mockReturnValue({
    local: undefined,
    peers: [],
    errors: {},
    hasFirstFrame: false,
    isConnected: false,
    lastError: null,
  })
})

describe('DevicePeakMetersClusterOverview', () => {
  it('renders an empty table when no devices anywhere', () => {
    render(<DevicePeakMetersClusterOverview />)
    expect(
      screen.getByTestId('device-peak-meters-cluster-overview'),
    ).toBeInTheDocument()
  })

  it('renders local devices first then peer devices grouped by node', () => {
    mockCluster.mockReturnValue({
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
      peers: [
        {
          node_id: 'peer-A',
          hostname: 'a.local',
          devices: [
            {
              device_id: 'tascam-us144mkii',
              input_channels: 4,
              output_channels: 4,
              has_engine_source: false,
            },
          ],
          health: 'ok',
        },
      ],
      errors: {},
      isError: false,
      isLoading: false,
    })
    render(<DevicePeakMetersClusterOverview />)
    const localNodeTag = screen.getByTestId(
      'cluster-overview-node-local:edirol-ua-1000',
    )
    const peerNodeTag = screen.getByTestId(
      'cluster-overview-node-peer-A:tascam-us144mkii',
    )
    expect(localNodeTag).toHaveTextContent('local')
    expect(localNodeTag.classList.contains('cds--tag--blue')).toBe(true)
    expect(peerNodeTag).toHaveTextContent('a.local')
    expect(peerNodeTag.classList.contains('cds--tag--cool-gray')).toBe(true)
  })

  it('renders an Engine unavailable Tag for engine_unavailable rows', () => {
    mockCluster.mockReturnValue({
      local: {
        devices: [
          {
            device_id: 'edirol-ua-1000',
            input_channels: 10,
            output_channels: 10,
            has_engine_source: true,
            snapshot: {
              input_peak_db: [-150],
              output_peak_db: [-150],
              source: 'engine_unavailable',
              captured_at: 1.0,
            },
          },
        ],
      },
      peers: [],
      errors: {},
      isError: false,
      isLoading: false,
    })
    render(<DevicePeakMetersClusterOverview includeSnapshot />)
    const tag = screen.getByTestId(
      'cluster-overview-source-local:edirol-ua-1000',
    )
    expect(tag).toHaveTextContent('Engine unavailable')
  })

  it('renders an error Tag when the cluster endpoint fails', () => {
    mockCluster.mockReturnValue({
      local: undefined,
      peers: [],
      errors: {},
      isError: true,
      isLoading: false,
    })
    render(<DevicePeakMetersClusterOverview />)
    expect(
      screen.getByTestId('device-peak-meters-cluster-overview-error'),
    ).toBeInTheDocument()
  })

  it('surfaces failed peers via an inline warning notification', () => {
    mockCluster.mockReturnValue({
      local: { devices: [] },
      peers: [],
      errors: { 'peer-A': 'http 504', 'peer-B': 'timeout' },
      isError: false,
      isLoading: false,
    })
    render(<DevicePeakMetersClusterOverview />)
    const banner = screen.getByTestId(
      'device-peak-meters-cluster-overview-errors',
    )
    expect(banner).toBeInTheDocument()
    expect(banner.textContent).toContain('peer-A')
    expect(banner.textContent).toContain('peer-B')
  })

  it('shows a loading tag before the first response', () => {
    mockCluster.mockReturnValue({
      local: undefined,
      peers: [],
      errors: {},
      isError: false,
      isLoading: true,
    })
    render(<DevicePeakMetersClusterOverview />)
    expect(
      screen.getByTestId('device-peak-meters-cluster-overview-loading'),
    ).toBeInTheDocument()
  })

  it('reads from the WS hook when useStream is true', () => {
    mockClusterStream.mockReturnValue({
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
      peers: [
        {
          node_id: 'peer-A',
          hostname: 'a.local',
          devices: [],
          health: 'ok',
        },
      ],
      errors: {},
      hasFirstFrame: true,
      isConnected: true,
      lastError: null,
    })
    render(<DevicePeakMetersClusterOverview useStream />)
    // Polling hook still returns empty; the streamed entry should
    // show up — confirms the source swap landed.
    expect(
      screen.getByTestId('cluster-overview-node-local:edirol-ua-1000'),
    ).toBeInTheDocument()
  })

  it('renders a loading tag while useStream waits for the first frame', () => {
    mockClusterStream.mockReturnValue({
      local: undefined,
      peers: [],
      errors: {},
      hasFirstFrame: false,
      isConnected: false,
      lastError: null,
    })
    render(<DevicePeakMetersClusterOverview useStream />)
    expect(
      screen.getByTestId('device-peak-meters-cluster-overview-loading'),
    ).toBeInTheDocument()
  })

  it('renders error state when useStream reports a socket error', () => {
    mockClusterStream.mockReturnValue({
      local: undefined,
      peers: [],
      errors: {},
      hasFirstFrame: false,
      isConnected: false,
      lastError: 'websocket error',
    })
    render(<DevicePeakMetersClusterOverview useStream />)
    expect(
      screen.getByTestId('device-peak-meters-cluster-overview-error'),
    ).toBeInTheDocument()
  })

  it('mounts a Peak column when includeSnapshot is true', () => {
    mockCluster.mockReturnValue({
      local: {
        devices: [
          {
            device_id: 'edirol-ua-1000',
            input_channels: 10,
            output_channels: 10,
            has_engine_source: true,
            snapshot: {
              input_peak_db: [-6, -150, -150, -150, -150, -150, -150, -150, -150, -150],
              output_peak_db: [-3, -150, -150, -150, -150, -150, -150, -150, -150, -150],
              source: 'engine',
              captured_at: 1.0,
            },
          },
        ],
      },
      peers: [],
      errors: {},
      isError: false,
      isLoading: false,
    })
    render(<DevicePeakMetersClusterOverview includeSnapshot />)
    expect(screen.getByText('Peak (dBFS)')).toBeInTheDocument()
    expect(screen.getByText(/in -6\.0 \/ out -3\.0 dBFS/)).toBeInTheDocument()
  })
})
