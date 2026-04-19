import dagre from 'dagre'

import type { NodeTopology } from '../../types/node'
import { buildNodeGraphEdges, buildNodeGraphNodes, clearNodeGraphLayoutCache, layoutNodeGraph } from './nodeGraphLayout'

const topology: NodeTopology = {
  nodes: [
    {
      node_id: 'node-a',
      hostname: 'node-a',
      display_label: null,
      role: 'audio_node',
      status: 'ok',
      cpu_percent: 10,
      memory_percent: 20,
      xrun_count: 0,
      audio_latency_ms: 1.2,
      services: {
        backend: true,
        juce_engine: true,
        pipewire: true,
      },
      last_seen: '2026-03-30T12:00:00Z',
      is_local: true,
      is_viewed: true,
    },
    {
      node_id: 'node-b',
      hostname: 'node-b',
      display_label: null,
      role: 'audio_node',
      status: 'ok',
      cpu_percent: 15,
      memory_percent: 24,
      xrun_count: 0,
      audio_latency_ms: 1.8,
      services: {
        backend: true,
        juce_engine: true,
        pipewire: true,
      },
      last_seen: '2026-03-30T12:00:00Z',
      is_local: false,
      is_viewed: false,
    },
  ],
  audio_edges: [
    {
      source_node_id: 'node-a',
      dest_node_id: 'node-b',
      stream_type: 'avb',
      active: true,
    },
  ],
  network_edges: [],
}

describe('nodeGraphLayout cache', () => {
  beforeEach(() => {
    clearNodeGraphLayoutCache()
  })

  it('reuses the cached dagre layout for an unchanged topology fingerprint', () => {
    const dagreLayoutSpy = jest.spyOn(dagre, 'layout')
    const onNodeClick = jest.fn()

    const nodes = buildNodeGraphNodes(topology, 'node-a', onNodeClick)
    const edges = buildNodeGraphEdges(topology)
    const firstLayout = layoutNodeGraph(nodes, edges)

    const secondNodes = buildNodeGraphNodes(topology, 'node-a', jest.fn())
    const secondEdges = buildNodeGraphEdges(topology)
    const secondLayout = layoutNodeGraph(secondNodes, secondEdges)

    expect(dagreLayoutSpy).toHaveBeenCalledTimes(1)
    expect(secondLayout[0]?.position).toEqual(firstLayout[0]?.position)

    dagreLayoutSpy.mockRestore()
  })
})
