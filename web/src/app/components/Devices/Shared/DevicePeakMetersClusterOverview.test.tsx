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

  it('renders a Stale Tag when captured_at exceeds the threshold', () => {
    const nowSeconds = Date.now() / 1000
    mockCluster.mockReturnValue({
      local: {
        devices: [
          {
            device_id: 'edirol-ua-1000',
            input_channels: 10,
            output_channels: 10,
            has_engine_source: true,
            snapshot: {
              input_peak_db: [-6],
              output_peak_db: [-3],
              source: 'engine',
              captured_at: nowSeconds - 60, // 60 s old
            },
          },
        ],
      },
      peers: [],
      errors: {},
      isError: false,
      isLoading: false,
    })
    render(
      <DevicePeakMetersClusterOverview
        includeSnapshot
        staleThresholdSeconds={5}
      />,
    )
    const tag = screen.getByTestId(
      'cluster-overview-source-local:edirol-ua-1000',
    )
    expect(tag.textContent).toMatch(/Stale/)
    expect(tag.classList.contains('cds--tag--warm-gray')).toBe(true)
  })

  it('keeps engine rows green when fresh', () => {
    const nowSeconds = Date.now() / 1000
    mockCluster.mockReturnValue({
      local: {
        devices: [
          {
            device_id: 'edirol-ua-1000',
            input_channels: 10,
            output_channels: 10,
            has_engine_source: true,
            snapshot: {
              input_peak_db: [-6],
              output_peak_db: [-3],
              source: 'engine',
              captured_at: nowSeconds, // fresh
            },
          },
        ],
      },
      peers: [],
      errors: {},
      isError: false,
      isLoading: false,
    })
    render(
      <DevicePeakMetersClusterOverview
        includeSnapshot
        staleThresholdSeconds={5}
      />,
    )
    const tag = screen.getByTestId(
      'cluster-overview-source-local:edirol-ua-1000',
    )
    expect(tag.textContent).toBe('Live')
    expect(tag.classList.contains('cds--tag--green')).toBe(true)
  })

  it('renders a Last seen column under useStream with formatted age', () => {
    const nowSeconds = Date.now() / 1000
    mockClusterStream.mockReturnValue({
      local: {
        devices: [
          {
            device_id: 'edirol-ua-1000',
            input_channels: 10,
            output_channels: 10,
            has_engine_source: true,
            snapshot: {
              input_peak_db: [-6],
              output_peak_db: [-3],
              source: 'engine',
              captured_at: nowSeconds - 3, // 3 s old
            },
          },
        ],
      },
      peers: [],
      errors: {},
      hasFirstFrame: true,
      isConnected: true,
      lastError: null,
    })
    render(<DevicePeakMetersClusterOverview useStream />)
    expect(screen.getByText('Last seen')).toBeInTheDocument()
    const cell = screen.getByTestId(
      'cluster-overview-last-seen-local:edirol-ua-1000',
    )
    expect(cell.textContent).toMatch(/3\s*s ago/)
  })

  it('formats minute-scale staleness in the Last seen column', () => {
    const nowSeconds = Date.now() / 1000
    mockClusterStream.mockReturnValue({
      local: {
        devices: [
          {
            device_id: 'tascam-us144mkii',
            input_channels: 4,
            output_channels: 4,
            has_engine_source: true,
            snapshot: {
              input_peak_db: [-12],
              output_peak_db: [-9],
              source: 'engine',
              captured_at: nowSeconds - 125, // ~2 min
            },
          },
        ],
      },
      peers: [],
      errors: {},
      hasFirstFrame: true,
      isConnected: true,
      lastError: null,
    })
    render(
      <DevicePeakMetersClusterOverview
        useStream
        staleThresholdSeconds={5}
      />,
    )
    const cell = screen.getByTestId(
      'cluster-overview-last-seen-local:tascam-us144mkii',
    )
    expect(cell.textContent).toMatch(/2\s*m ago/)
  })

  it('renders "—" in Last seen when row has no captured_at', () => {
    mockClusterStream.mockReturnValue({
      local: {
        devices: [
          {
            device_id: 'hotone-jogg',
            input_channels: 2,
            output_channels: 2,
            has_engine_source: false,
            snapshot: {
              input_peak_db: [-150],
              output_peak_db: [-150],
              source: 'placeholder',
              captured_at: null,
            },
          },
        ],
      },
      peers: [],
      errors: {},
      hasFirstFrame: true,
      isConnected: true,
      lastError: null,
    })
    render(<DevicePeakMetersClusterOverview useStream />)
    const cell = screen.getByTestId(
      'cluster-overview-last-seen-local:hotone-jogg',
    )
    expect(cell.textContent).toBe('—')
  })

  it('omits the Last seen column outside of useStream', () => {
    render(<DevicePeakMetersClusterOverview />)
    expect(screen.queryByText('Last seen')).not.toBeInTheDocument()
  })

  it('restricts rows to a single peer when nodeFilter is set', () => {
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
        {
          node_id: 'peer-B',
          hostname: 'b.local',
          devices: [
            {
              device_id: 'lexicon-mpx1',
              input_channels: 2,
              output_channels: 2,
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
    render(<DevicePeakMetersClusterOverview nodeFilter="peer-A" />)
    expect(
      screen.getByTestId('cluster-overview-node-peer-A:tascam-us144mkii'),
    ).toBeInTheDocument()
    expect(
      screen.queryByTestId('cluster-overview-node-local:edirol-ua-1000'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('cluster-overview-node-peer-B:lexicon-mpx1'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByTestId('device-peak-meters-cluster-overview-filter-active'),
    ).toHaveTextContent('peer-A')
  })

  it('restricts rows to local devices when nodeFilter="local"', () => {
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
    render(<DevicePeakMetersClusterOverview nodeFilter="local" />)
    expect(
      screen.getByTestId('cluster-overview-node-local:edirol-ua-1000'),
    ).toBeInTheDocument()
    expect(
      screen.queryByTestId('cluster-overview-node-peer-A:tascam-us144mkii'),
    ).not.toBeInTheDocument()
  })

  it('renders per-node count Tags when showPerNodeCounts is true', () => {
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
    render(<DevicePeakMetersClusterOverview showPerNodeCounts />)
    expect(
      screen.getByTestId('device-peak-meters-cluster-overview-per-node-counts'),
    ).toBeInTheDocument()
    const localTag = screen.getByTestId('per-node-count-local')
    const peerTag = screen.getByTestId('per-node-count-a.local')
    expect(localTag.textContent).toMatch(/local: 1 device/)
    expect(localTag.textContent).toMatch(/20 ch/)
    expect(peerTag.textContent).toMatch(/a\.local: 1 device/)
    expect(peerTag.textContent).toMatch(/8 ch/)
  })

  it('omits per-node count Tags by default', () => {
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
      peers: [],
      errors: {},
      isError: false,
      isLoading: false,
    })
    render(<DevicePeakMetersClusterOverview />)
    expect(
      screen.queryByTestId(
        'device-peak-meters-cluster-overview-per-node-counts',
      ),
    ).not.toBeInTheDocument()
  })

  it('renders sortable column headers when sortable=true', () => {
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
      peers: [],
      errors: {},
      isError: false,
      isLoading: false,
    })
    render(<DevicePeakMetersClusterOverview sortable />)
    // Carbon's sortable headers render as buttons inside the header
    // cell; the easiest signal is the aria-sort attribute appearing
    // somewhere in the table.
    const table = screen.getByTestId('device-peak-meters-cluster-overview')
    expect(table.querySelector('[aria-sort]')).not.toBeNull()
  })

  it('does not render sortable headers by default', () => {
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
      peers: [],
      errors: {},
      isError: false,
      isLoading: false,
    })
    render(<DevicePeakMetersClusterOverview />)
    const table = screen.getByTestId('device-peak-meters-cluster-overview')
    expect(table.querySelector('[aria-sort]')).toBeNull()
  })

  it('renders a synthetic row for peers in errors but not peers', () => {
    mockCluster.mockReturnValue({
      local: { devices: [] },
      peers: [],
      errors: { 'peer-A': 'http 504' },
      isError: false,
      isLoading: false,
    })
    render(<DevicePeakMetersClusterOverview />)
    // Node tag for the synthetic row uses the down:<node_id> id.
    const downRow = screen.getByTestId('cluster-overview-node-down:peer-A')
    expect(downRow).toHaveTextContent('peer-A')
    const sourceTag = screen.getByTestId(
      'cluster-overview-source-down:peer-A',
    )
    expect(sourceTag).toHaveTextContent('Engine unavailable')
  })

  it('does not duplicate a node down row when the peer also appears in peers', () => {
    mockCluster.mockReturnValue({
      local: { devices: [] },
      peers: [
        {
          node_id: 'peer-A',
          hostname: 'a.local',
          devices: [
            {
              device_id: 'edirol-ua-1000',
              input_channels: 10,
              output_channels: 10,
              has_engine_source: true,
            },
          ],
          health: 'ok',
        },
      ],
      errors: { 'peer-A': 'transient blip' },
      isError: false,
      isLoading: false,
    })
    render(<DevicePeakMetersClusterOverview />)
    expect(
      screen.getByTestId('cluster-overview-node-peer-A:edirol-ua-1000'),
    ).toBeInTheDocument()
    expect(
      screen.queryByTestId('cluster-overview-node-down:peer-A'),
    ).not.toBeInTheDocument()
  })

  it('omits unrelated node-down rows when nodeFilter is set', () => {
    mockCluster.mockReturnValue({
      local: { devices: [] },
      peers: [],
      errors: { 'peer-A': 'http 504', 'peer-B': 'timeout' },
      isError: false,
      isLoading: false,
    })
    render(<DevicePeakMetersClusterOverview nodeFilter="peer-A" />)
    expect(
      screen.getByTestId('cluster-overview-node-down:peer-A'),
    ).toBeInTheDocument()
    expect(
      screen.queryByTestId('cluster-overview-node-down:peer-B'),
    ).not.toBeInTheDocument()
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

  // -------------------------------------------------------------------
  // Run-13i pick #3 — canonical node-down row test-id + red tone
  // -------------------------------------------------------------------
  // The handoff spec calls for `cluster-overview-node-down-<node_id>`
  // as the TR-level test-id so operator-tooling integration tests can
  // assert on failed peers without scraping cell-level test-ids.

  it('exposes the canonical TR test-id on synthetic node-down rows', () => {
    mockCluster.mockReturnValue({
      local: { devices: [] },
      peers: [],
      errors: { 'peer-A': 'http 504' },
      isError: false,
      isLoading: false,
    })
    render(<DevicePeakMetersClusterOverview />)
    // The canonical test-id pattern from the run-13i handoff.
    expect(
      screen.getByTestId('cluster-overview-node-down-peer-A'),
    ).toBeInTheDocument()
  })

  it('paints the node-down row Node tag in red', () => {
    mockCluster.mockReturnValue({
      local: { devices: [] },
      peers: [],
      errors: { 'peer-A': 'http 504' },
      isError: false,
      isLoading: false,
    })
    render(<DevicePeakMetersClusterOverview />)
    const downRow = screen.getByTestId('cluster-overview-node-down:peer-A')
    // Carbon Tag with type="red" applies the `.cds--tag--red` class.
    expect(downRow.className).toMatch(/cds--tag--red/)
  })

  it('does not render a TR test-id for normal (non-down) rows', () => {
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
      peers: [],
      errors: {},
      isError: false,
      isLoading: false,
    })
    render(<DevicePeakMetersClusterOverview />)
    // Live row should not carry the cluster-overview-node-down-* pattern.
    expect(
      document.querySelector(
        '[data-testid^="cluster-overview-node-down-"]',
      ),
    ).toBeNull()
  })

  it('exposes the canonical TR test-id for each down peer when multiple peers fail', () => {
    mockCluster.mockReturnValue({
      local: { devices: [] },
      peers: [],
      errors: {
        'peer-A': 'http 504',
        'peer-B': 'timeout',
        'peer-C': 'connection refused',
      },
      isError: false,
      isLoading: false,
    })
    render(<DevicePeakMetersClusterOverview />)
    expect(
      screen.getByTestId('cluster-overview-node-down-peer-A'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('cluster-overview-node-down-peer-B'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('cluster-overview-node-down-peer-C'),
    ).toBeInTheDocument()
  })
})
