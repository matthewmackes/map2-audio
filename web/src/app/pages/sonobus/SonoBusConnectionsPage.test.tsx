/**
 * T2521-6b — SonoBusConnectionsPage tests.
 */

import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

const mockUseSonoBusBindingsMatrix = jest.fn()

jest.mock('./useSonoBusBindings', () => ({
  __esModule: true,
  useSonoBusBindingsMatrix: () => mockUseSonoBusBindingsMatrix(),
}))

import { SonoBusConnectionsPage } from './SonoBusConnectionsPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <SonoBusConnectionsPage />
    </MemoryRouter>,
  )
}

function makeBinding(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    binding_id: 'binding-1',
    consumer_type: 'sonobus_stream',
    consumer_id: 's-1',
    consumer_label: 'Stream 1',
    binding_kind: 'stream',
    source_type: 'aoo_source',
    source_descriptor: { aoo_source_id: 1001 },
    target_type: 'aoo_sink',
    target_descriptor: { listener_peer_endpoint: '10.0.0.10:10001' },
    stream_format: 'pcm_s24_48000',
    codec_profile: 'pcm',
    jitter_buffer_ms: 4,
    resend_policy: 'burst_loss_only',
    latency_target_ms: 8,
    channel_count: 2,
    group_id: 'g-1',
    session_label: 'set A',
    transport_protocol: 'udp',
    bind_interface: null,
    bind_port_local: null,
    server_endpoint: null,
    talker_node_id: 'node-alpha',
    listener_node_id: 'node-beta',
    listener_capability: 'map2',
    cluster_role: null,
    transport_priority: 'avb_preferred',
    scope: 'global',
    scope_id: null,
    enabled: true,
    source: 'test',
    metadata: {},
    created_at: '2026-05-13T00:00:00Z',
    created_by: 'test',
    modified_at: '2026-05-13T00:00:00Z',
    modified_by: 'test',
    ...overrides,
  }
}

beforeEach(() => {
  mockUseSonoBusBindingsMatrix.mockReturnValue({
    data: {
      matrix: {},
      total_bindings: 0,
      bindings: [],
    },
    isLoading: false,
    isError: false,
  })
})

describe('SonoBusConnectionsPage', () => {
  it('renders the heading and an empty state', () => {
    renderPage()
    expect(
      screen.getByRole('heading', { name: 'SonoBus Connections' }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('sonobus-connections-empty')).toBeInTheDocument()
  })

  it('renders one row per binding with kind/capability/priority tags', () => {
    mockUseSonoBusBindingsMatrix.mockReturnValue({
      data: {
        matrix: {},
        total_bindings: 2,
        bindings: [
          makeBinding(),
          makeBinding({
            binding_id: 'binding-2',
            consumer_id: 's-2',
            consumer_label: 'Stream 2',
            enabled: false,
            transport_priority: 'sonobus_only',
          }),
        ],
      },
      isLoading: false,
      isError: false,
    })
    renderPage()
    const row1 = screen.getByTestId('sonobus-connections-row-binding-1')
    const row2 = screen.getByTestId('sonobus-connections-row-binding-2')
    expect(row1).toHaveTextContent('Stream 1')
    expect(row1).toHaveTextContent('avb preferred')
    expect(row1).toHaveTextContent('Yes')
    expect(row2).toHaveTextContent('sonobus only')
    expect(row2).toHaveTextContent('No')
  })

  it('shows the matrix-unavailable tag when the query errors', () => {
    mockUseSonoBusBindingsMatrix.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    })
    renderPage()
    expect(screen.getByText('Matrix unavailable')).toBeInTheDocument()
  })

  it('reflects total and enabled counts in the summary tags', () => {
    mockUseSonoBusBindingsMatrix.mockReturnValue({
      data: {
        matrix: {},
        total_bindings: 3,
        bindings: [
          makeBinding({ binding_id: 'a' }),
          makeBinding({ binding_id: 'b', enabled: false }),
          makeBinding({ binding_id: 'c' }),
        ],
      },
      isLoading: false,
      isError: false,
    })
    renderPage()
    const summary = screen.getByTestId('sonobus-connections-summary')
    expect(summary).toHaveTextContent('Total 3')
    expect(summary).toHaveTextContent('Enabled 2')
  })
})
