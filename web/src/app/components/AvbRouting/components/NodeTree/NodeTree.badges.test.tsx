import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { NodeTree } from './NodeTree'
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
  useFilteredEndpoints: () => [],
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
    talker_count: 0,
    listener_count: 0,
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

function getRenderedNodeOrder(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-testid^="node-tree-item-"]'))
    .map((element) => element.getAttribute('data-testid') || '')
    .map((testId) => testId.replace('node-tree-item-', ''))
}

describe('NodeTree status badge behavior', () => {
  beforeEach(() => {
    mockDispatch.mockReset()
    mockLocalNodeId = 'node-local'
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
    mockNodes = [
      makeNode({
        node_id: 'node-local',
        name: 'Local Online',
        status: 'online',
        ptp: {
          state: 'master',
          domain: 0,
          is_master: true,
          master_clock_id: null,
          offset_ns: 0,
          last_sync: '2026-02-17T00:00:00Z',
          gptp_supported: true,
        },
      }),
      makeNode({
        node_id: 'node-degraded',
        name: 'Remote Degraded',
        type: 'map2_remote',
        status: 'degraded',
        ptp: null,
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

  it('surfaces online/degraded/offline visibility in header and status tooltips', () => {
    render(<NodeTree />)

    expect(screen.getByText('1 of 3 online')).toBeTruthy()
    expect(screen.getByText('Local Online')).toBeTruthy()
    expect(screen.getByText('Remote Degraded')).toBeTruthy()
    expect(screen.getByText('Remote Offline')).toBeTruthy()

    expect(screen.getByLabelText('Online • PTP master')).toBeTruthy()
    expect(screen.getByLabelText('Online • No PTP sync')).toBeTruthy()
    expect(screen.getByLabelText('Offline')).toBeTruthy()
  })

  it('dispatches node selection actions when a node is clicked', () => {
    render(<NodeTree />)

    fireEvent.click(screen.getByText('Remote Offline'))

    expect(mockDispatch).toHaveBeenNthCalledWith(1, {
      type: 'SELECT_NODE',
      payload: 'node-offline',
    })
    expect(mockDispatch).toHaveBeenNthCalledWith(2, {
      type: 'SET_VIEW_MODE',
      payload: 'single_node',
    })
  })

  it('hides degraded/offline nodes when show_offline is disabled', () => {
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

    render(<NodeTree />)

    expect(screen.getByText('1 of 3 online')).toBeTruthy()
    expect(screen.getByText('Local Online')).toBeTruthy()
    expect(screen.queryByText('Remote Degraded')).toBeNull()
    expect(screen.queryByText('Remote Offline')).toBeNull()
  })

  it('keeps deterministic node ordering across status transitions', () => {
    mockNodes = [
      makeNode({
        node_id: 'node-local',
        name: 'Local Node',
        status: 'online',
      }),
      makeNode({
        node_id: 'node-bravo',
        name: 'Bravo',
        type: 'map2_remote',
        status: 'online',
      }),
      makeNode({
        node_id: 'node-alpha',
        name: 'Alpha',
        type: 'map2_remote',
        status: 'degraded',
      }),
      makeNode({
        node_id: 'node-charlie',
        name: 'Charlie',
        type: 'map2_remote',
        status: 'offline',
      }),
    ]

    const { container, rerender } = render(<NodeTree />)

    expect(getRenderedNodeOrder(container)).toEqual([
      'node-local',
      'node-bravo',
      'node-alpha',
      'node-charlie',
    ])

    mockNodes = [
      makeNode({
        node_id: 'node-local',
        name: 'Local Node',
        status: 'online',
      }),
      makeNode({
        node_id: 'node-bravo',
        name: 'Bravo',
        type: 'map2_remote',
        status: 'offline',
      }),
      makeNode({
        node_id: 'node-alpha',
        name: 'Alpha',
        type: 'map2_remote',
        status: 'online',
      }),
      makeNode({
        node_id: 'node-charlie',
        name: 'Charlie',
        type: 'map2_remote',
        status: 'degraded',
      }),
    ]

    rerender(<NodeTree />)

    expect(getRenderedNodeOrder(container)).toEqual([
      'node-local',
      'node-alpha',
      'node-bravo',
      'node-charlie',
    ])
  })

  it('retains single-node selection when filtered nodes shrink and expand', () => {
    mockState = {
      network: {
        nodeSelection: {
          current_node_id: 'node-offline',
          local_node_id: 'node-local',
          view_mode: 'single_node',
          selected_node_ids: ['node-offline'],
          show_offline: true,
        },
      },
    }

    const { rerender } = render(<NodeTree />)

    expect(screen.getByTestId('node-tree-item-node-offline').getAttribute('data-selected')).toBe('true')

    mockState = {
      network: {
        nodeSelection: {
          current_node_id: 'node-offline',
          local_node_id: 'node-local',
          view_mode: 'single_node',
          selected_node_ids: ['node-offline'],
          show_offline: false,
        },
      },
    }

    rerender(<NodeTree />)

    expect(screen.queryByTestId('node-tree-item-node-offline')).toBeNull()

    mockState = {
      network: {
        nodeSelection: {
          current_node_id: 'node-offline',
          local_node_id: 'node-local',
          view_mode: 'single_node',
          selected_node_ids: ['node-offline'],
          show_offline: true,
        },
      },
    }

    rerender(<NodeTree />)

    expect(screen.getByTestId('node-tree-item-node-offline').getAttribute('data-selected')).toBe('true')
  })
})
