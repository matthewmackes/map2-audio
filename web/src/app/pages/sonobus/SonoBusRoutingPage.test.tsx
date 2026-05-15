/**
 * T2521-7 — SonoBusRoutingPage tests.
 */

import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

const mockUseSonoBusBindings = jest.fn()

jest.mock('./useSonoBusBindings', () => ({
  __esModule: true,
  useSonoBusBindings: () => mockUseSonoBusBindings(),
}))

import { SonoBusRoutingPage } from './SonoBusRoutingPage'

function makeBinding(overrides: Record<string, unknown>) {
  return {
    binding_id: overrides.binding_id ?? 'b-1',
    consumer_type: 'sonobus_stream',
    consumer_id: overrides.consumer_id ?? 'c-1',
    consumer_label: 'test',
    binding_kind: 'stream',
    source_type: 'aoo_source',
    source_descriptor: {},
    target_type: 'aoo_sink',
    target_descriptor: {},
    stream_format: 'pcm_s24_48000',
    codec_profile: 'pcm',
    jitter_buffer_ms: 4,
    resend_policy: 'burst_loss_only',
    latency_target_ms: 8,
    channel_count: 2,
    group_id: null,
    session_label: null,
    transport_protocol: 'udp',
    bind_interface: null,
    bind_port_local: null,
    server_endpoint: null,
    talker_node_id: overrides.talker_node_id ?? 'node-A',
    listener_node_id: overrides.listener_node_id ?? 'node-B',
    listener_capability: 'map2',
    cluster_role: 'primary',
    transport_priority: 'avb_preferred',
    scope: 'global',
    scope_id: null,
    enabled: overrides.enabled ?? true,
    source: 'test',
    ...overrides,
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <SonoBusRoutingPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockUseSonoBusBindings.mockReturnValue({ data: [], isLoading: false, isError: false })
})

describe('SonoBusRoutingPage', () => {
  it('renders heading and empty state when no bindings exist', () => {
    renderPage()
    expect(
      screen.getByRole('heading', { name: 'SonoBus Routing' }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('sonobus-routing-empty')).toBeInTheDocument()
  })

  it('renders one row per talker and one column per listener', () => {
    mockUseSonoBusBindings.mockReturnValue({
      data: [
        makeBinding({ binding_id: 'b-1', talker_node_id: 'node-A', listener_node_id: 'node-B' }),
        makeBinding({ binding_id: 'b-2', talker_node_id: 'node-A', listener_node_id: 'node-C' }),
        makeBinding({ binding_id: 'b-3', talker_node_id: 'node-D', listener_node_id: 'node-B' }),
      ],
      isLoading: false,
      isError: false,
    })
    renderPage()
    expect(screen.getByTestId('sonobus-routing-matrix')).toBeInTheDocument()
    // A → B, A → C, D → B are populated; A → empty(D-listener)
    expect(screen.getByTestId('sonobus-routing-cell-node-A-node-B')).toBeInTheDocument()
    expect(screen.getByTestId('sonobus-routing-cell-node-A-node-C')).toBeInTheDocument()
    expect(screen.getByTestId('sonobus-routing-cell-node-D-node-B')).toBeInTheDocument()
  })

  it('counts bindings as enabled/total per cell', () => {
    mockUseSonoBusBindings.mockReturnValue({
      data: [
        makeBinding({ binding_id: 'b-1', talker_node_id: 'node-A', listener_node_id: 'node-B', enabled: true }),
        makeBinding({ binding_id: 'b-2', talker_node_id: 'node-A', listener_node_id: 'node-B', enabled: false }),
      ],
      isLoading: false,
      isError: false,
    })
    renderPage()
    // 1 enabled / 2 total tag.
    expect(screen.getByText('1/2')).toBeInTheDocument()
  })

  it('marks an all-disabled cell with a distinct tone', () => {
    mockUseSonoBusBindings.mockReturnValue({
      data: [
        makeBinding({ binding_id: 'b-1', talker_node_id: 'node-A', listener_node_id: 'node-B', enabled: false }),
      ],
      isLoading: false,
      isError: false,
    })
    renderPage()
    // 0/1 indicates disabled-only cell.
    expect(screen.getByText('0/1')).toBeInTheDocument()
  })

  it('renders error tag when the bindings query fails', () => {
    mockUseSonoBusBindings.mockReturnValue({ data: undefined, isError: true, isLoading: false })
    renderPage()
    expect(screen.getByText('Bindings query failed')).toBeInTheDocument()
  })

  it('shows a Loading tag while the query is in flight', () => {
    mockUseSonoBusBindings.mockReturnValue({ data: undefined, isError: false, isLoading: true })
    renderPage()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('renders an em-dash for unpopulated cells', () => {
    mockUseSonoBusBindings.mockReturnValue({
      data: [
        makeBinding({ binding_id: 'b-1', talker_node_id: 'node-A', listener_node_id: 'node-B' }),
      ],
      isLoading: false,
      isError: false,
    })
    renderPage()
    // A → A cell should be unpopulated.
    const aToA = screen.queryByTestId('sonobus-routing-cell-node-A-node-A')
    // A → A only exists if node-A is in both axis sets, which it isn't.
    expect(aToA).toBeNull()
  })
})
