import dagre from 'dagre'
import { MarkerType, type Edge, type Node } from 'reactflow'

import type { NodeTopology } from '../../types/node'
import { getNodePresence } from '../../utils/nodeDisplay'
import type { NodeGraphCardData } from './NodeGraphCard'

const NODE_WIDTH = 260
const NODE_HEIGHT = 92
const MAX_LAYOUT_CACHE_ENTRIES = 32
const layoutCache = new Map<string, Array<{ id: string; position: { x: number; y: number } }>>()

function buildEdgeData(topology: NodeTopology | undefined): Edge[] {
  const audioEdges = Array.isArray(topology?.audio_edges) ? topology.audio_edges : []
  const networkEdges = Array.isArray(topology?.network_edges) ? topology.network_edges : []

  return [
    ...audioEdges.map((edge) => ({
      id: `audio:${edge.source_node_id}:${edge.dest_node_id}:${edge.stream_type}`,
      source: edge.source_node_id,
      target: edge.dest_node_id,
      type: 'smoothstep',
      animated: edge.active,
      label: edge.stream_type.toUpperCase(),
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--cds-interactive)' },
      style: { stroke: '#0f62fe', strokeWidth: 2 },
      labelStyle: { fill: '#0f62fe', fontWeight: 600 },
    })),
    ...networkEdges.map((edge) => ({
      id: `network:${edge.source_node_id}:${edge.dest_node_id}`,
      source: edge.source_node_id,
      target: edge.dest_node_id,
      type: 'smoothstep',
      label: edge.latency_ms == null ? '' : `${edge.latency_ms.toFixed(1)}ms`,
      style: { stroke: '#8d8d8d', strokeDasharray: '6 3', strokeWidth: 1.5 },
      labelStyle: { fill: '#8d8d8d', fontWeight: 500 },
    })),
  ]
}

function layoutFingerprint(nodes: Node<NodeGraphCardData>[], edges: Edge[]) {
  return JSON.stringify({
    nodes: nodes.map((node) => node.id),
    edges: edges.map((edge) => [edge.id, edge.source, edge.target, edge.label ?? '', edge.animated ?? false]),
  })
}

function trimLayoutCache() {
  while (layoutCache.size > MAX_LAYOUT_CACHE_ENTRIES) {
    const oldestKey = layoutCache.keys().next().value
    if (!oldestKey) {
      return
    }

    layoutCache.delete(oldestKey)
  }
}

export function clearNodeGraphLayoutCache() {
  layoutCache.clear()
}

export function buildNodeGraphEdges(topology: NodeTopology | undefined): Edge[] {
  return buildEdgeData(topology)
}

export function buildNodeGraphNodes(
  topology: NodeTopology | undefined,
  viewedNodeId: string | null | undefined,
  onNodeClick: (nodeId: string) => void,
): Node<NodeGraphCardData>[] {
  const nodeRecords = Array.isArray(topology?.nodes) ? topology.nodes : []
  return nodeRecords.map((node) => ({
    id: node.node_id,
    type: 'nodeCard',
    position: { x: 0, y: 0 },
    data: {
      node,
      presence: getNodePresence(node, viewedNodeId),
      onSelect: onNodeClick,
    },
    draggable: false,
    selectable: false,
  }))
}

export function layoutNodeGraph(nodes: Node<NodeGraphCardData>[], edges: Edge[]) {
  if (nodes.length <= 1) {
    return nodes.map((node) => ({
      ...node,
      position: { x: 160, y: 140 },
    }))
  }

  const fingerprint = layoutFingerprint(nodes, edges)
  const cached = layoutCache.get(fingerprint)
  if (cached) {
    const cachedPositions = new Map(cached.map((entry) => [entry.id, entry.position]))
    return nodes.map((node) => ({
      ...node,
      position: cachedPositions.get(node.id) ?? node.position,
    }))
  }

  const graph = new dagre.graphlib.Graph()
  graph.setDefaultEdgeLabel(() => ({}))
  graph.setGraph({ rankdir: 'LR', ranksep: 150, nodesep: 70 })

  nodes.forEach((node) => {
    graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  })

  edges.forEach((edge) => {
    graph.setEdge(edge.source, edge.target)
  })

  dagre.layout(graph)

  const positionedNodes = nodes.map((node) => {
    const position = graph.node(node.id)
    return {
      ...node,
      position: {
        x: position.x - NODE_WIDTH / 2,
        y: position.y - NODE_HEIGHT / 2,
      },
    }
  })

  layoutCache.set(
    fingerprint,
    positionedNodes.map((node) => ({ id: node.id, position: node.position })),
  )
  trimLayoutCache()
  return positionedNodes
}
