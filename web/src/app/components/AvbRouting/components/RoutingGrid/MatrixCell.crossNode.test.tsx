import React from 'react'
import { render, screen } from '@testing-library/react'
import { MatrixCell } from './MatrixCell'
import type { Endpoint, Route } from '../../types'

let mockState: any

jest.mock('../../context/RoutingContext', () => ({
  useRouting: () => ({
    state: mockState,
    dispatch: jest.fn(),
  }),
}))
jest.mock('../../hooks/useAvbApi', () => ({
  useAvbStreams: () => ({
    data: {
      streams: [],
    },
  }),
}))

function makeEndpoint(overrides: Partial<Endpoint>): Endpoint {
  return {
    endpoint_id: 'endpoint-1',
    entity_id: '001122fffe334455',
    unique_id: 1,
    direction: 'talker',
    device_type: 'map2',
    device_name: 'Endpoint',
    channels: 2,
    sample_rate: 48000,
    format: '24-bit PCM',
    mac_address: '00:11:22:33:44:55',
    node_address: 'http://127.0.0.1:8080',
    available: true,
    last_seen: '2026-02-17T00:00:00Z',
    node_id: 'node-a',
    tags: [],
    color: '#ffffff',
    group: 'Default',
    bank: 0,
    pinned: false,
    locked: false,
    ...overrides,
  }
}

function makeRoute(overrides: Partial<Route>): Route {
  return {
    id: 'talker-1→listener-1',
    talker_id: 'talker-1',
    listener_id: 'listener-1',
    state: 'connected',
    established_time: '2026-02-17T00:00:00Z',
    error_message: null,
    connection_count: 1,
    srp_reservation_id: null,
    srp_admission_id: null,
    locked: false,
    valid: true,
    messages: [],
    cross_node: true,
    ...overrides,
  }
}

describe('MatrixCell cross-node indicators', () => {
  beforeEach(() => {
    mockState = {
      network: {
        nodes: {
          'node-a': { name: 'Node A', color: '#1976d2' },
          'node-b': { name: 'Node B', color: '#4caf50' },
        },
      },
    }
  })

  it('shows cross-node link indicator for active routes spanning different nodes', () => {
    const talker = makeEndpoint({
      endpoint_id: 'talker-1',
      direction: 'talker',
      node_id: 'node-a',
    })
    const listener = makeEndpoint({
      endpoint_id: 'listener-1',
      direction: 'listener',
      unique_id: 2,
      node_id: 'node-b',
    })

    render(
      <MatrixCell
        talker={talker}
        listener={listener}
        route={makeRoute({ state: 'connected' })}
        isPending={false}
        isHovered={false}
        isFocused={false}
        onClick={() => {}}
        onHover={() => {}}
      />
    )

    expect(screen.getByLabelText('Cross-node route')).toBeTruthy()
  })

  it('does not show cross-node link indicator when talker and listener are on the same node', () => {
    const talker = makeEndpoint({
      endpoint_id: 'talker-1',
      direction: 'talker',
      node_id: 'node-a',
    })
    const listener = makeEndpoint({
      endpoint_id: 'listener-1',
      direction: 'listener',
      unique_id: 2,
      node_id: 'node-a',
    })

    render(
      <MatrixCell
        talker={talker}
        listener={listener}
        route={makeRoute({ state: 'connected', cross_node: false })}
        isPending={false}
        isHovered={false}
        isFocused={false}
        onClick={() => {}}
        onHover={() => {}}
      />
    )

    expect(screen.queryByLabelText('Cross-node route')).toBeNull()
  })
})
