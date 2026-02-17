import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NodeSelector } from './NodeSelector'
import { NodeTree } from '../NodeTree/NodeTree'
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

function getRenderedTabOrder(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-testid^="node-selector-tab-"]'))
    .map((element) => element.getAttribute('data-testid') || '')
    .map((testId) => testId.replace('node-selector-tab-', ''))
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

  it('falls back to all-nodes view when selected node is filtered out', () => {
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

    render(<NodeSelector />)

    const allNodesTab = screen.getByRole('tab', { name: /All Nodes/i })
    expect(allNodesTab.getAttribute('aria-selected')).toBe('true')
    expect(screen.queryByText('Remote Offline')).toBeNull()
  })

  it('keeps deterministic node tab ordering across status transitions', async () => {
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

    const { container, rerender } = render(<NodeSelector />)

    await waitFor(() => {
      expect(getRenderedTabOrder(container)).toEqual([
        'node-local',
        'node-bravo',
        'node-alpha',
        'node-charlie',
      ])
    })

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

    rerender(<NodeSelector />)

    await waitFor(() => {
      expect(getRenderedTabOrder(container)).toEqual([
        'node-local',
        'node-alpha',
        'node-bravo',
        'node-charlie',
      ])
    })
  })

  it('keeps NodeSelector and NodeTree aligned after node churn and API resync', async () => {
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
        node_id: 'node-charlie',
        name: 'Charlie',
        type: 'map2_remote',
        status: 'degraded',
      }),
    ]

    const { rerender } = render(
      <>
        <NodeSelector />
        <NodeTree />
      </>,
    )

    expect(screen.getByTestId('node-selector-tab-node-bravo')).toBeTruthy()
    expect(screen.getByTestId('node-tree-item-node-bravo')).toBeTruthy()

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
        node_id: 'node-charlie',
        name: 'Charlie',
        type: 'map2_remote',
        status: 'online',
      }),
    ]

    rerender(
      <>
        <NodeSelector />
        <NodeTree />
      </>,
    )

    await waitFor(() => {
      const allNodesTab = screen.getByRole('tab', { name: /All Nodes/i })
      expect(allNodesTab.getAttribute('aria-selected')).toBe('true')
      expect(screen.queryByTestId('node-selector-tab-node-bravo')).toBeNull()
      expect(screen.queryByTestId('node-tree-item-node-bravo')).toBeNull()
      expect(screen.getByTestId('node-selector-tab-node-charlie')).toBeTruthy()
      expect(screen.getByTestId('node-tree-item-node-charlie')).toBeTruthy()
    })
  })

  it('re-selects retained node when filtered tabs expand again', async () => {
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

    const { rerender } = render(<NodeSelector />)

    await waitFor(() => {
      expect(screen.getByTestId('node-selector-selected-marker-node-offline').textContent).toBe('selected')
    })

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

    rerender(<NodeSelector />)

    await waitFor(() => {
      const allNodesTab = screen.getByRole('tab', { name: /All Nodes/i })
      expect(allNodesTab.getAttribute('aria-selected')).toBe('true')
      expect(screen.queryByTestId('node-selector-tab-node-offline')).toBeNull()
    })

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

    rerender(<NodeSelector />)

    await waitFor(() => {
      expect(screen.getByTestId('node-selector-selected-marker-node-offline').textContent).toBe('selected')
    })
  })

  it('dispatches single-node selection for clicked tab under filtered and sorted ordering', () => {
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

    mockNodes = [
      makeNode({
        node_id: 'node-local',
        name: 'Local Node',
        status: 'online',
      }),
      makeNode({
        node_id: 'node-zulu',
        name: 'Zulu',
        type: 'map2_remote',
        status: 'online',
      }),
      makeNode({
        node_id: 'node-alpha',
        name: 'Alpha',
        type: 'map2_remote',
        status: 'online',
      }),
      makeNode({
        node_id: 'node-hidden-offline',
        name: 'Offline Hidden',
        type: 'map2_remote',
        status: 'offline',
      }),
    ]

    render(<NodeSelector />)

    expect(screen.queryByTestId('node-selector-tab-node-hidden-offline')).toBeNull()

    fireEvent.click(screen.getByTestId('node-selector-tab-node-zulu'))

    expect(mockDispatch).toHaveBeenNthCalledWith(1, {
      type: 'SET_VIEW_MODE',
      payload: 'single_node',
    })
    expect(mockDispatch).toHaveBeenNthCalledWith(2, {
      type: 'SELECT_NODE',
      payload: 'node-zulu',
    })
  })

  it('dispatches all-nodes mode when all-nodes tab is selected', () => {
    mockState = {
      network: {
        nodeSelection: {
          current_node_id: 'node-degraded',
          local_node_id: 'node-local',
          view_mode: 'single_node',
          selected_node_ids: ['node-degraded'],
          show_offline: true,
        },
      },
    }

    render(<NodeSelector />)

    fireEvent.click(screen.getByRole('tab', { name: /All Nodes/i }))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_VIEW_MODE',
      payload: 'all_nodes',
    })
  })

  it('dispatches all-nodes mode from keyboard activation on all-nodes control', () => {
    mockState = {
      network: {
        nodeSelection: {
          current_node_id: 'node-degraded',
          local_node_id: 'node-local',
          view_mode: 'single_node',
          selected_node_ids: ['node-degraded'],
          show_offline: true,
        },
      },
    }

    render(<NodeSelector />)

    fireEvent.keyDown(screen.getByTestId('node-selector-all-nodes-toggle'), { key: 'Enter' })

    expect(mockDispatch).toHaveBeenCalledTimes(1)
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_VIEW_MODE',
      payload: 'all_nodes',
    })
  })

  it('enters multi-select mode from top-bar control and seeds current node selection', () => {
    mockState = {
      network: {
        nodeSelection: {
          current_node_id: 'node-degraded',
          local_node_id: 'node-local',
          view_mode: 'single_node',
          selected_node_ids: [],
          show_offline: true,
        },
      },
    }

    render(<NodeSelector />)

    fireEvent.click(screen.getByTestId('node-selector-multi-select-toggle'))

    expect(mockDispatch).toHaveBeenNthCalledWith(1, {
      type: 'SET_VIEW_MODE',
      payload: 'multi_select',
    })
    expect(mockDispatch).toHaveBeenNthCalledWith(2, {
      type: 'TOGGLE_NODE_SELECTION',
      payload: 'node-degraded',
    })
  })

  it('enters multi-select mode from keyboard activation on top-bar control', () => {
    mockState = {
      network: {
        nodeSelection: {
          current_node_id: 'node-degraded',
          local_node_id: 'node-local',
          view_mode: 'single_node',
          selected_node_ids: [],
          show_offline: true,
        },
      },
    }

    render(<NodeSelector />)

    fireEvent.keyDown(screen.getByTestId('node-selector-multi-select-toggle'), { key: 'Enter' })

    expect(mockDispatch).toHaveBeenNthCalledWith(1, {
      type: 'SET_VIEW_MODE',
      payload: 'multi_select',
    })
    expect(mockDispatch).toHaveBeenNthCalledWith(2, {
      type: 'TOGGLE_NODE_SELECTION',
      payload: 'node-degraded',
    })
  })

  it('exits multi-select mode from top-bar control', () => {
    mockState = {
      network: {
        nodeSelection: {
          current_node_id: null,
          local_node_id: 'node-local',
          view_mode: 'multi_select',
          selected_node_ids: ['node-local', 'node-degraded'],
          show_offline: true,
        },
      },
    }

    render(<NodeSelector />)

    fireEvent.click(screen.getByTestId('node-selector-multi-select-toggle'))

    expect(mockDispatch).toHaveBeenCalledTimes(1)
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_VIEW_MODE',
      payload: 'all_nodes',
    })
  })

  it('dispatches multi-select toggle when clicking node tabs in multi-select mode', () => {
    mockState = {
      network: {
        nodeSelection: {
          current_node_id: null,
          local_node_id: 'node-local',
          view_mode: 'multi_select',
          selected_node_ids: ['node-local'],
          show_offline: true,
        },
      },
    }

    render(<NodeSelector />)

    fireEvent.click(screen.getByTestId('node-selector-tab-node-offline'))

    expect(mockDispatch).toHaveBeenCalledTimes(1)
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'TOGGLE_NODE_SELECTION',
      payload: 'node-offline',
    })
  })

  it('dispatches multi-select toggle when node tab is keyboard-activated in multi-select mode', () => {
    mockState = {
      network: {
        nodeSelection: {
          current_node_id: null,
          local_node_id: 'node-local',
          view_mode: 'multi_select',
          selected_node_ids: ['node-local'],
          show_offline: true,
        },
      },
    }

    render(<NodeSelector />)

    fireEvent.keyDown(screen.getByTestId('node-selector-tab-node-offline'), { key: 'Enter' })

    expect(mockDispatch).toHaveBeenCalledTimes(1)
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'TOGGLE_NODE_SELECTION',
      payload: 'node-offline',
    })
  })

  it('opens node context menu from keyboard activation without dispatching selection', async () => {
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

    fireEvent.keyDown(screen.getByTestId('node-selector-menu-trigger-node-offline'), { key: 'Enter' })

    await waitFor(() => {
      expect(screen.getByText('View Details')).toBeTruthy()
    })
    expect(mockDispatch).toHaveBeenCalledTimes(0)
  })

  it('opens node context menu from Space key in multi-select mode without toggling node membership', async () => {
    mockState = {
      network: {
        nodeSelection: {
          current_node_id: null,
          local_node_id: 'node-local',
          view_mode: 'multi_select',
          selected_node_ids: ['node-local'],
          show_offline: true,
        },
      },
    }

    render(<NodeSelector />)

    fireEvent.keyDown(screen.getByTestId('node-selector-menu-trigger-node-offline'), { key: ' ' })

    await waitFor(() => {
      expect(screen.getByText('View Details')).toBeTruthy()
    })
    expect(mockDispatch).toHaveBeenCalledTimes(0)
  })

  it('aligns multi-select selected node ids across NodeSelector and NodeTree', () => {
    mockState = {
      network: {
        nodeSelection: {
          current_node_id: null,
          local_node_id: 'node-local',
          view_mode: 'multi_select',
          selected_node_ids: ['node-local', 'node-degraded'],
          show_offline: true,
        },
      },
    }

    render(
      <>
        <NodeSelector />
        <NodeTree />
      </>,
    )

    expect(screen.getByTestId('node-selector-selected-marker-node-local').textContent).toBe('selected')
    expect(screen.getByTestId('node-selector-selected-marker-node-degraded').textContent).toBe('selected')
    expect(screen.getByTestId('node-selector-selected-marker-node-offline').textContent).toBe('unselected')

    expect(screen.getByTestId('node-tree-item-node-local').getAttribute('data-node-selected')).toBe('true')
    expect(screen.getByTestId('node-tree-item-node-degraded').getAttribute('data-node-selected')).toBe('true')
    expect(screen.getByTestId('node-tree-item-node-offline').getAttribute('data-node-selected')).toBe('false')
  })

  it('renders deterministic highlights and tab order with duplicate unsorted multi-select ids', async () => {
    mockState = {
      network: {
        nodeSelection: {
          current_node_id: null,
          local_node_id: 'node-local',
          view_mode: 'multi_select',
          selected_node_ids: ['node-offline', 'node-local', 'node-offline'],
          show_offline: true,
        },
      },
    }

    const { container } = render(
      <>
        <NodeSelector />
        <NodeTree />
      </>,
    )

    await waitFor(() => {
      expect(getRenderedTabOrder(container)).toEqual([
        'node-local',
        'node-degraded',
        'node-offline',
      ])
    })

    expect(screen.getByTestId('node-selector-selected-marker-node-local').textContent).toBe('selected')
    expect(screen.getByTestId('node-selector-selected-marker-node-offline').textContent).toBe('selected')
    expect(screen.getByTestId('node-selector-selected-marker-node-degraded').textContent).toBe('unselected')

    expect(screen.getByTestId('node-tree-item-node-local').getAttribute('data-node-selected')).toBe('true')
    expect(screen.getByTestId('node-tree-item-node-offline').getAttribute('data-node-selected')).toBe('true')
    expect(screen.getByTestId('node-tree-item-node-degraded').getAttribute('data-node-selected')).toBe('false')
  })
})
