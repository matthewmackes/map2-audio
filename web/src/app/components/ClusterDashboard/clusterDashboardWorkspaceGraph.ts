import dagre from 'dagre'
import { MarkerType, type Edge, type Node } from 'reactflow'

import type { NodeAudioEdge, NodeNetworkEdge, NodeSummary } from '../../types/node'
import {
  computeNodeHealthPercent,
  formatNodeDisplayName,
  getNodePresence,
  getNodePresenceAccent,
  getNodeRoleLabel,
  getNodeStatusLabel,
} from '../../utils/nodeDisplay'

export type ClusterDashboardWorkspaceAnchorId = 'cluster-dashboard-nodes'

type ClusterDashboardWorkspaceNodeKind = 'fabric' | 'node'
type ClusterDashboardWorkspaceTone = 'aligned' | 'warning' | 'critical' | 'neutral'
type ClusterDashboardWorkspaceTrafficLevel = 'idle' | 'low' | 'medium' | 'high'

type PeerAggregate = {
  leftNodeId: string
  rightNodeId: string
  activeAudioCount: number
  latenciesMs: number[]
}

export interface ClusterDashboardWorkspaceNodeData {
  kind: ClusterDashboardWorkspaceNodeKind
  eyebrow: string
  label: string
  caption: string
  metric: string
  accentColor: string
  tone: ClusterDashboardWorkspaceTone
  anchorId: ClusterDashboardWorkspaceAnchorId
  recordId: string
  contextNodeId: string | null
  selected?: boolean
  healthPercent?: number
  statusLabel?: string
  presenceLabel?: string
}

export interface ClusterDashboardWorkspaceGraphSelection {
  anchorId: ClusterDashboardWorkspaceAnchorId
  recordId: string
  contextNodeId: string | null
}

export interface ClusterDashboardWorkspaceGraphTag {
  label: string
  type: 'green' | 'warm-gray' | 'red' | 'cool-gray'
}

export interface ClusterDashboardWorkspaceGraphModel {
  nodes: Array<Node<ClusterDashboardWorkspaceNodeData>>
  edges: Edge[]
  summaryTags: ClusterDashboardWorkspaceGraphTag[]
  pulseCopy: string
}

interface BuildClusterDashboardWorkspaceGraphArgs {
  nodes: NodeSummary[]
  audioEdges: NodeAudioEdge[]
  networkEdges: NodeNetworkEdge[]
  selectedNodeId: string | null
  viewedNodeId: string | null
  deploymentMode?: string | null
}

const FABRIC_NODE_ID = 'cluster-dashboard-workspace:fabric'
const FABRIC_ACCENT = '#0f62fe'

function pairKey(leftNodeId: string, rightNodeId: string): string {
  return [leftNodeId, rightNodeId].sort().join('::')
}

function toneToTagType(tone: ClusterDashboardWorkspaceTone): ClusterDashboardWorkspaceGraphTag['type'] {
  switch (tone) {
    case 'aligned':
      return 'green'
    case 'warning':
      return 'warm-gray'
    case 'critical':
      return 'red'
    case 'neutral':
    default:
      return 'cool-gray'
  }
}

function clusterTone(nodes: NodeSummary[]): ClusterDashboardWorkspaceTone {
  if (nodes.length === 0) {
    return 'critical'
  }
  if (nodes.some((node) => node.status === 'offline' || node.status === 'critical')) {
    return 'critical'
  }
  if (nodes.some((node) => node.status === 'warn' || node.xrun_count > 0 || node.cpu_percent >= 85 || node.memory_percent >= 90)) {
    return 'warning'
  }
  return 'aligned'
}

function nodeTone(node: NodeSummary, healthPercent: number): ClusterDashboardWorkspaceTone {
  if (node.status === 'offline' || node.status === 'critical') {
    return 'critical'
  }
  if (node.status === 'warn' || node.xrun_count > 0 || healthPercent < 80) {
    return 'warning'
  }
  if (healthPercent >= 92) {
    return 'aligned'
  }
  return 'neutral'
}

function trafficLevel(activeAudioCount: number, latencyMs: number | null): ClusterDashboardWorkspaceTrafficLevel {
  const score = (activeAudioCount * 2) + (latencyMs !== null ? 1 : 0)
  if (score >= 6) {
    return 'high'
  }
  if (score >= 4) {
    return 'medium'
  }
  if (score >= 1) {
    return 'low'
  }
  return 'idle'
}

function trafficStrokeWidth(level: ClusterDashboardWorkspaceTrafficLevel) {
  switch (level) {
    case 'high':
      return 4.75
    case 'medium':
      return 3.75
    case 'low':
      return 2.5
    case 'idle':
    default:
      return 1.75
  }
}

function trafficColor(level: ClusterDashboardWorkspaceTrafficLevel, latencyMs: number | null): string {
  if (latencyMs !== null && latencyMs > 20) {
    return '#da1e28'
  }
  if (latencyMs !== null && latencyMs > 10) {
    return '#ff832b'
  }
  switch (level) {
    case 'high':
      return '#24a148'
    case 'medium':
      return '#4589ff'
    case 'low':
      return '#8a3ffc'
    case 'idle':
    default:
      return '#8d8d8d'
  }
}

function getNodeSize(kind: ClusterDashboardWorkspaceNodeKind) {
  switch (kind) {
    case 'fabric':
      return { width: 300, height: 124 }
    case 'node':
    default:
      return { width: 252, height: 124 }
  }
}

function layoutGraph(nodes: Array<Node<ClusterDashboardWorkspaceNodeData>>, edges: Edge[]) {
  if (nodes.length === 0) {
    return nodes
  }

  const graph = new dagre.graphlib.Graph()
  graph.setDefaultEdgeLabel(() => ({}))
  graph.setGraph({
    rankdir: 'TB',
    ranksep: 128,
    nodesep: 42,
    marginx: 32,
    marginy: 24,
  })

  nodes.forEach((node) => {
    graph.setNode(node.id, getNodeSize(node.data.kind))
  })

  edges.forEach((edge) => {
    graph.setEdge(edge.source, edge.target)
  })

  dagre.layout(graph)

  return nodes.map((node) => {
    const position = graph.node(node.id)
    const size = getNodeSize(node.data.kind)

    return {
      ...node,
      position: {
        x: position.x - size.width / 2,
        y: position.y - size.height / 2,
      },
    }
  })
}

function buildEdge(
  id: string,
  source: string,
  target: string,
  level: ClusterDashboardWorkspaceTrafficLevel,
  label: string,
  latencyMs: number | null,
): Edge {
  const stroke = trafficColor(level, latencyMs)

  return {
    id,
    source,
    target,
    type: 'smoothstep',
    animated: level !== 'idle',
    label,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: stroke,
    },
    style: {
      stroke,
      strokeWidth: trafficStrokeWidth(level),
    },
    labelStyle: {
      fill: 'var(--cds-text-secondary)',
      fontWeight: 600,
      fontSize: 11,
    },
  }
}

function aggregatePeerMetrics(
  nodesById: Map<string, NodeSummary>,
  audioEdges: NodeAudioEdge[],
  networkEdges: NodeNetworkEdge[],
): Map<string, PeerAggregate> {
  const aggregates = new Map<string, PeerAggregate>()

  const upsertAggregate = (leftNodeId: string, rightNodeId: string) => {
    const key = pairKey(leftNodeId, rightNodeId)
    const existing = aggregates.get(key)
    if (existing) {
      return existing
    }

    const created: PeerAggregate = {
      leftNodeId,
      rightNodeId,
      activeAudioCount: 0,
      latenciesMs: [],
    }
    aggregates.set(key, created)
    return created
  }

  for (const edge of audioEdges) {
    if (!edge.active || edge.source_node_id === edge.dest_node_id) {
      continue
    }
    if (!nodesById.has(edge.source_node_id) || !nodesById.has(edge.dest_node_id)) {
      continue
    }

    upsertAggregate(edge.source_node_id, edge.dest_node_id).activeAudioCount += 1
  }

  for (const edge of networkEdges) {
    if (edge.latency_ms === null || edge.source_node_id === edge.dest_node_id) {
      continue
    }
    if (!nodesById.has(edge.source_node_id) || !nodesById.has(edge.dest_node_id)) {
      continue
    }

    upsertAggregate(edge.source_node_id, edge.dest_node_id).latenciesMs.push(edge.latency_ms)
  }

  return aggregates
}

export function buildClusterDashboardWorkspaceGraphModel({
  nodes,
  audioEdges,
  networkEdges,
  selectedNodeId,
  viewedNodeId,
  deploymentMode,
}: BuildClusterDashboardWorkspaceGraphArgs): ClusterDashboardWorkspaceGraphModel {
  const nodesById = new Map(nodes.map((node) => [node.node_id, node]))
  const peerAggregates = aggregatePeerMetrics(nodesById, audioEdges, networkEdges)
  const onlineCount = nodes.filter((node) => node.status !== 'offline').length
  const activeAudioCount = audioEdges.filter((edge) => edge.active).length
  const observedLatencyLinks = networkEdges.filter((edge) => edge.latency_ms !== null).length
  const totalXruns = nodes.reduce((sum, node) => sum + node.xrun_count, 0)
  const overallTone = clusterTone(nodes)

  const graphNodes: Array<Node<ClusterDashboardWorkspaceNodeData>> = [
    {
      id: FABRIC_NODE_ID,
      type: 'clusterDashboardWorkspaceNode',
      position: { x: 0, y: 0 },
      draggable: false,
      selectable: false,
      data: {
        kind: 'fabric',
        eyebrow: 'Cluster fabric',
        label: deploymentMode ? `${deploymentMode} cluster` : 'Cluster topology',
        caption: `${onlineCount}/${nodes.length || 1} nodes online, ${observedLatencyLinks} live latency link${observedLatencyLinks === 1 ? '' : 's'} across the visible fabric.`,
        metric: `${activeAudioCount} active audio path${activeAudioCount === 1 ? '' : 's'} · ${totalXruns} xruns`,
        accentColor: FABRIC_ACCENT,
        tone: overallTone,
        anchorId: 'cluster-dashboard-nodes' as const,
        recordId: selectedNodeId ?? 'fabric',
        contextNodeId: selectedNodeId,
      },
    },
    ...nodes.map((node) => {
      const healthPercent = computeNodeHealthPercent(node)
      const presence = getNodePresence(node, viewedNodeId)
      const activeRoutes = audioEdges.filter((edge) => edge.active && (edge.source_node_id === node.node_id || edge.dest_node_id === node.node_id)).length
      const peerLinkCount = Array.from(peerAggregates.values()).filter(
        (aggregate) => aggregate.leftNodeId === node.node_id || aggregate.rightNodeId === node.node_id,
      ).length

      return {
        id: `node:${node.node_id}`,
        type: 'clusterDashboardWorkspaceNode',
        position: { x: 0, y: 0 },
        draggable: false,
        selectable: false,
        data: {
          kind: 'node' as const,
          eyebrow: node.is_local ? 'Local node' : getNodeRoleLabel(node.role),
          label: formatNodeDisplayName(node),
          caption: `${getNodeStatusLabel(node.status)} · ${Math.round(node.cpu_percent)}% CPU · ${Math.round(node.memory_percent)}% RAM`,
          metric: `${activeRoutes} audio path${activeRoutes === 1 ? '' : 's'} · ${peerLinkCount} peer link${peerLinkCount === 1 ? '' : 's'}`,
          accentColor: getNodePresenceAccent(presence),
          tone: nodeTone(node, healthPercent),
          anchorId: 'cluster-dashboard-nodes' as const,
          recordId: node.node_id,
          contextNodeId: node.node_id,
          selected: node.node_id === selectedNodeId,
          healthPercent,
          statusLabel: getNodeStatusLabel(node.status),
          presenceLabel: presence,
        },
      }
    }),
  ]

  const rootEdges = nodes.map((node) => buildEdge(
    `fabric:${node.node_id}`,
    FABRIC_NODE_ID,
    `node:${node.node_id}`,
    node.status === 'offline' ? 'idle' : 'low',
    getNodeRoleLabel(node.role),
    null,
  ))

  const peerEdges = Array.from(peerAggregates.values()).map((aggregate) => {
    const averageLatencyMs = aggregate.latenciesMs.length > 0
      ? aggregate.latenciesMs.reduce((sum, value) => sum + value, 0) / aggregate.latenciesMs.length
      : null
    const level = trafficLevel(aggregate.activeAudioCount, averageLatencyMs)
    const labelParts: string[] = []
    if (aggregate.activeAudioCount > 0) {
      labelParts.push(`${aggregate.activeAudioCount} audio`)
    }
    if (averageLatencyMs !== null) {
      labelParts.push(`${averageLatencyMs.toFixed(1)} ms`)
    }

    return buildEdge(
      `peer:${pairKey(aggregate.leftNodeId, aggregate.rightNodeId)}`,
      `node:${aggregate.leftNodeId}`,
      `node:${aggregate.rightNodeId}`,
      level,
      labelParts.join(' · ') || 'Peer link',
      averageLatencyMs,
    )
  })

  const summaryTags: ClusterDashboardWorkspaceGraphTag[] = [
    {
      label: `${onlineCount}/${nodes.length || 1} online`,
      type: onlineCount === nodes.length && nodes.length > 0 ? 'green' : onlineCount === 0 ? 'red' : 'warm-gray',
    },
    {
      label: `${peerEdges.length} peer latency link${peerEdges.length === 1 ? '' : 's'}`,
      type: peerEdges.length > 0 ? 'green' : 'warm-gray',
    },
    {
      label: `${activeAudioCount} active audio path${activeAudioCount === 1 ? '' : 's'}`,
      type: activeAudioCount > 0 ? 'green' : 'cool-gray',
    },
    {
      label: `XRuns ${totalXruns}`,
      type: totalXruns > 0 ? 'red' : 'green',
    },
    {
      label: deploymentMode || 'Mode unknown',
      type: toneToTagType(overallTone),
    },
  ]

  return {
    nodes: layoutGraph(graphNodes, [...rootEdges, ...peerEdges]),
    edges: [...rootEdges, ...peerEdges],
    summaryTags,
    pulseCopy: 'Animated peer edges reflect live audio path volume and current node-to-node latency telemetry across the visible cluster fabric.',
  }
}
