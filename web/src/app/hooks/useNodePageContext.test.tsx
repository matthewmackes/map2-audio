import '@testing-library/jest-dom'
import { renderHook } from '@testing-library/react'

import { useNodePageContext } from './useNodePageContext'
import { useViewedNodeStore } from '../stores/viewedNodeStore'

const mockUseNodeIdentity = jest.fn()
const mockUseNodeTopology = jest.fn()

jest.mock('./useNodeTopology', () => ({
  useNodeIdentity: () => mockUseNodeIdentity(),
  useNodeTopology: () => mockUseNodeTopology(),
}))

const localNodeSummary = {
  node_id: 'node-local',
  hostname: 'local-rack',
  display_label: null,
  role: 'all_in_one' as const,
  status: 'ok' as const,
  cpu_percent: 10,
  memory_percent: 15,
  xrun_count: 0,
  audio_latency_ms: 1.2,
  services: { backend: true, juce_engine: true, pipewire: true },
  last_seen: '2026-03-23T19:00:00Z',
  is_local: true,
  is_viewed: true,
}

const remoteNodeSummary = {
  ...localNodeSummary,
  node_id: 'node-b',
  hostname: 'rack-b',
  role: 'audio_node' as const,
  is_local: false,
  is_viewed: false,
}

describe('useNodePageContext', () => {
  beforeEach(() => {
    mockUseNodeIdentity.mockReset()
    mockUseNodeTopology.mockReset()
    useViewedNodeStore.setState({ pageNodeMap: {} })

    mockUseNodeIdentity.mockReturnValue({
      data: {
        node_id: 'node-local',
        hostname: 'local-rack',
        display_label: null,
        role: 'all_in_one',
      },
    })
    mockUseNodeTopology.mockReturnValue({
      data: {
        nodes: [localNodeSummary, remoteNodeSummary],
        audio_edges: [],
        network_edges: [],
      },
    })
  })

  it('normalizes malformed topology nodes payloads to an empty list and falls back to the local node id', () => {
    useViewedNodeStore.setState({ pageNodeMap: { chains: 'node-b' } })
    mockUseNodeTopology.mockReturnValue({
      data: {
        audio_edges: [],
        network_edges: [],
      },
    })

    const { result } = renderHook(() => useNodePageContext('chains'))

    expect(result.current.topologyNodes).toEqual([])
    expect(result.current.viewedNode).toBeNull()
    expect(result.current.viewedNodeId).toBe('node-local')
  })

  it('preserves the stored viewed node when topology includes a valid node array', () => {
    useViewedNodeStore.setState({ pageNodeMap: { chains: 'node-b' } })

    const { result } = renderHook(() => useNodePageContext('chains'))

    expect(result.current.topologyNodes).toHaveLength(2)
    expect(result.current.viewedNodeId).toBe('node-b')
    expect(result.current.viewedNode?.hostname).toBe('rack-b')
  })
})
