import React from 'react'
import { render, screen } from '@testing-library/react'
import { NodeSelector } from './NodeSelector'
import type { AvbNode } from '../../types'

let mockNodes: AvbNode[] = []
let mockLocalNodeId = 'node-local'
let mockState: any
const mockDispatch = jest.fn()

jest.mock('../../hooks/useNodeApi', () => ({
  useNodes: () => ({ data: mockNodes }),
  useLocalNodeId: () => mockLocalNodeId,
}))

jest.mock('../../context/RoutingContext', () => ({
  useRouting: () => ({ state: mockState, dispatch: mockDispatch }),
}))

function makeNode(overrides: Partial<AvbNode>): AvbNode {
  return {
    node_id: 'node-local',
    name: 'Local Node',
    type: 'map2_local',
    status: 'online',
    capabilities: {
      talker: true,
      listener: true,
      avdecc_controller: true,
      audio_processing: true,
      remote_control: true,
      max_talkers: 8,
      max_listeners: 8,
      sample_rates: [48000],
      formats: ['24-bit PCM'],
    },
    ptp: {
      state: 'master',
      domain: 0,
      is_master: true,
      master_clock_id: null,
      offset_ns: 0,
      last_sync: '2026-02-17T00:00:00Z',
      gptp_supported: true,
    },
    health: null,
    address: '192.168.1.10',
    api_url: 'http://192.168.1.10:8080',
    entity_id: null,
    talker_count: 1,
    listener_count: 1,
    active_routes: 0,
    version: '3.0.0',
    manufacturer: 'MAP2',
    model: 'Node',
    discovered_at: '2026-02-17T00:00:00Z',
    last_seen: '2026-02-17T00:00:00Z',
    color: '#1976d2',
    pinned: false,
    notes: '',
    ...overrides,
  }
}

describe('NodeSelector degraded/offline badge visibility', () => {
  beforeEach(() => {
    mockDispatch.mockReset()
    mockLocalNodeId = 'node-local'
    mockNodes = [
      makeNode({
        node_id: 'node-local',
        name: 'Local Online',
        status: 'online',
      }),
      makeNode({
        node_id: 'node-degraded',
        name: 'Remote Degraded',
        type: 'map2_remote',
        status: 'degraded',
        ptp: {
          state: 'listening',
          domain: 0,
          is_master: false,
          master_clock_id: 'master-1',
          offset_ns: null,
          last_sync: null,
          gptp_supported: true,
        },
      }),
      makeNode({
        node_id: 'node-offline',
        name: 'Remote Offline',
        type: 'map2_remote',
        status: 'offline',
        ptp: null,
      }),
    ]
  })

  it('shows online/degraded/offline status icons when offline visibility is enabled', () => {
    mockState = {
      network: {
        nodeSelection: {
          current_node_id: null,
          local_node_id: 'node-local',
          view_mode: 'all_nodes',
          selected_node_ids: [],
          show_offline: true,
        },
      },
    }

    render(<NodeSelector />)

    expect(screen.getByText('1 / 3 online')).toBeTruthy()
    expect(screen.getByTestId('CheckCircleIcon')).toBeTruthy()
    expect(screen.getByTestId('WarningIcon')).toBeTruthy()
    expect(screen.getByTestId('ErrorIcon')).toBeTruthy()
    expect(screen.getByText('Remote Degraded')).toBeTruthy()
    expect(screen.getByText('Remote Offline')).toBeTruthy()
  })

  it('filters degraded/offline node tabs when show_offline is disabled', () => {
    mockState = {
      network: {
        nodeSelection: {
          current_node_id: null,
          local_node_id: 'node-local',
          view_mode: 'all_nodes',
          selected_node_ids: [],
          show_offline: false,
        },
      },
    }

    render(<NodeSelector />)

    expect(screen.getByText('1 / 3 online')).toBeTruthy()
    expect(screen.queryByText('Remote Degraded')).toBeNull()
    expect(screen.queryByText('Remote Offline')).toBeNull()
    expect(screen.queryByTestId('WarningIcon')).toBeNull()
    expect(screen.queryByTestId('ErrorIcon')).toBeNull()
  })
})
