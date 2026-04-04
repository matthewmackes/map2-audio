import dagre from 'dagre'
import { MarkerType, type Edge, type Node } from 'reactflow'

import type { NodeSummary } from '../../types/node'
import { formatNodeDisplayName, getNodeRoleLabel, getNodeStatusLabel } from '../../utils/nodeDisplay'

export type NetworkDiscoveryWorkspaceAnchorId = 'network-discovery-peers'

type NetworkDiscoveryWorkspaceNodeKind = 'source' | 'fabric' | 'peer'
type NetworkDiscoveryWorkspaceTone = 'aligned' | 'warning' | 'critical' | 'neutral'
type NetworkDiscoveryWorkspaceTrafficLevel = 'idle' | 'low' | 'medium' | 'high'

export interface NetworkDiscoveryRecord {
  id: string
  label: string
  hostname: string
  host: string
  nodeMode: string
  isOnline: boolean
  visibilityState: string
  registrationRequired: boolean
  routingReady: boolean
  latencyMs: number | null
  discoverySources: string[]
}

export interface NetworkDiscoveryWorkspaceNodeData {
  kind: NetworkDiscoveryWorkspaceNodeKind
  eyebrow: string
  label: string
  caption: string
  metric: string
  accentColor: string
  tone: NetworkDiscoveryWorkspaceTone
  anchorId: NetworkDiscoveryWorkspaceAnchorId
  recordId: string
  contextNodeId: string | null
  selected?: boolean
}

export interface NetworkDiscoveryWorkspaceGraphSelection {
  anchorId: NetworkDiscoveryWorkspaceAnchorId
  recordId: string
  contextNodeId: string | null
}

export interface NetworkDiscoveryWorkspaceGraphTag {
  label: string
  type: 'green' | 'warm-gray' | 'red' | 'cool-gray'
}

export interface NetworkDiscoveryWorkspaceGraphModel {
  nodes: Array<Node<NetworkDiscoveryWorkspaceNodeData>>
  edges: Edge[]
  summaryTags: NetworkDiscoveryWorkspaceGraphTag[]
  pulseCopy: string
}

interface BuildNetworkDiscoveryWorkspaceGraphArgs {
  sourceNode: NodeSummary | null
  records: NetworkDiscoveryRecord[]
  selectedPeerId: string | null
}

const SOURCE_NODE_ID = 'network-discovery-workspace:source'
const FABRIC_NODE_ID = 'network-discovery-workspace:fabric'
const ACCENT = {
  source: '#24a148',
  fabric: '#0f62fe',
  peer: '#8a3ffc',
} as const

function toneForRecord(record: NetworkDiscoveryRecord): NetworkDiscoveryWorkspaceTone {
  if (!record.isOnline && !record.registrationRequired) {
    return 'critical'
  }
  if (record.registrationRequired || !record.routingReady) {
    return 'warning'
  }
  if ((record.latencyMs ?? 0) > 15) {
    return 'warning'
  }
  if (record.isOnline) {
    return 'aligned'
  }
  return 'neutral'
}

function toneToTagType(tone: NetworkDiscoveryWorkspaceTone): NetworkDiscoveryWorkspaceGraphTag['type'] {
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

function trafficLevel(record: NetworkDiscoveryRecord): NetworkDiscoveryWorkspaceTrafficLevel {
  if (!record.isOnline && !record.registrationRequired) {
    return 'high'
  }
  if (record.registrationRequired || (record.latencyMs ?? 0) > 15) {
    return 'medium'
  }
  if (record.isOnline) {
    return 'low'
  }
  return 'idle'
}

function trafficStrokeWidth(level: NetworkDiscoveryWorkspaceTrafficLevel) {
  switch (level) {
    case 'high':
      return 4.75
    case 'medium':
      return 3.75
    case 'low':
      return 2.5
    case 'idle':
    default:
      return 1.6
  }
}

function trafficColor(level: NetworkDiscoveryWorkspaceTrafficLevel): string {
  switch (level) {
    case 'high':
      return '#da1e28'
    case 'medium':
      return '#ff832b'
    case 'low':
      return '#24a148'
    case 'idle':
    default:
      return '#8d8d8d'
  }
}

function formatLatency(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return 'no telemetry'
  }
  return `${value.toFixed(1)} ms`
}

function getNodeSize(kind: NetworkDiscoveryWorkspaceNodeData['kind']) {
  switch (kind) {
    case 'source':
      return { width: 284, height: 128 }
    case 'fabric':
      return { width: 268, height: 116 }
    case 'peer':
    default:
      return { width: 228, height: 108 }
  }
}

function layoutGraph(nodes: Array<Node<NetworkDiscoveryWorkspaceNodeData>>, edges: Edge[]) {
  if (nodes.length === 0) {
    return nodes
  }

  const graph = new dagre.graphlib.Graph()
  graph.setDefaultEdgeLabel(() => ({}))
  graph.setGraph({
    rankdir: 'LR',
    ranksep: 116,
    nodesep: 40,
    marginx: 24,
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
  level: NetworkDiscoveryWorkspaceTrafficLevel,
  label: string,
): Edge {
  const stroke = trafficColor(level)
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

export function buildNetworkDiscoveryWorkspaceGraphModel({
  sourceNode,
  records,
  selectedPeerId,
}: BuildNetworkDiscoveryWorkspaceGraphArgs): NetworkDiscoveryWorkspaceGraphModel {
  const graphNodes: Array<Node<NetworkDiscoveryWorkspaceNodeData>> = [
    {
      id: SOURCE_NODE_ID,
      type: 'networkDiscoveryWorkspaceNode',
      position: { x: 0, y: 0 },
      draggable: false,
      selectable: false,
      data: {
        kind: 'source',
        eyebrow: 'Host source',
        label: sourceNode ? formatNodeDisplayName(sourceNode) : 'Discovery source pending',
        caption: sourceNode
          ? `${getNodeRoleLabel(sourceNode.role)} · ${getNodeStatusLabel(sourceNode.status)}`
          : 'Choose a node to recenter the discovery workspace around its management context.',
        metric: sourceNode
          ? `CPU ${Math.round(sourceNode.cpu_percent)}% · memory ${Math.round(sourceNode.memory_percent)}%`
          : 'Waiting for topology',
        accentColor: ACCENT.source,
        tone: sourceNode ? toneForRecord({
          id: sourceNode.node_id,
          label: sourceNode.hostname,
          hostname: sourceNode.hostname,
          host: sourceNode.hostname,
          nodeMode: sourceNode.role,
          isOnline: sourceNode.status !== 'offline',
          visibilityState: sourceNode.status,
          registrationRequired: false,
          routingReady: true,
          latencyMs: sourceNode.audio_latency_ms,
          discoverySources: [],
        }) : 'neutral',
        anchorId: 'network-discovery-peers',
        recordId: 'network-source',
        contextNodeId: sourceNode?.node_id ?? null,
      },
    },
    {
      id: FABRIC_NODE_ID,
      type: 'networkDiscoveryWorkspaceNode',
      position: { x: 0, y: 0 },
      draggable: false,
      selectable: false,
      data: {
        kind: 'fabric',
        eyebrow: 'Telemetry fabric',
        label: 'Visibility and heartbeat fabric',
        caption: `${records.filter((record) => record.isOnline).length}/${records.length} peers online · ${records.filter((record) => record.routingReady).length} routing ready`,
        metric: `${records.filter((record) => record.registrationRequired).length} need registration`,
        accentColor: ACCENT.fabric,
        tone: records.some((record) => toneForRecord(record) === 'critical')
          ? 'critical'
          : records.some((record) => toneForRecord(record) === 'warning')
            ? 'warning'
            : 'aligned',
        anchorId: 'network-discovery-peers',
        recordId: 'network-fabric',
        contextNodeId: sourceNode?.node_id ?? null,
      },
    },
  ]

  const edges: Edge[] = [
    buildEdge(
      `${SOURCE_NODE_ID}→${FABRIC_NODE_ID}`,
      SOURCE_NODE_ID,
      FABRIC_NODE_ID,
      sourceNode ? 'low' : 'idle',
      'telemetry',
    ),
  ]

  for (const record of records) {
    const tone = toneForRecord(record)
    const nodeId = `network-discovery-workspace:${record.id}`
    graphNodes.push({
      id: nodeId,
      type: 'networkDiscoveryWorkspaceNode',
      position: { x: 0, y: 0 },
      draggable: false,
      selectable: false,
      data: {
        kind: 'peer',
        eyebrow: 'Peer node',
        label: record.label,
        caption: `${record.visibilityState} · ${record.discoverySources.join(', ') || 'no sources'}`,
        metric: record.routingReady ? formatLatency(record.latencyMs) : 'routing gated',
        accentColor: ACCENT.peer,
        tone,
        anchorId: 'network-discovery-peers',
        recordId: record.id,
        contextNodeId: record.id,
        selected: selectedPeerId === record.id,
      },
    })
    edges.push(
      buildEdge(
        `${FABRIC_NODE_ID}→${nodeId}`,
        FABRIC_NODE_ID,
        nodeId,
        trafficLevel(record),
        record.routingReady ? formatLatency(record.latencyMs) : record.visibilityState,
      ),
    )
  }

  const laidOutNodes = layoutGraph(graphNodes, edges)
  const summaryTags: NetworkDiscoveryWorkspaceGraphTag[] = [
    {
      label: `${records.filter((record) => record.isOnline).length} peers online`,
      type: records.some((record) => !record.isOnline && !record.registrationRequired) ? 'warm-gray' : 'green',
    },
    {
      label: `${records.filter((record) => record.routingReady).length} routing ready`,
      type: records.some((record) => record.routingReady) ? 'green' : 'cool-gray',
    },
    {
      label: `${records.filter((record) => record.registrationRequired).length} need registration`,
      type: records.some((record) => record.registrationRequired) ? 'warm-gray' : 'cool-gray',
    },
  ]

  return {
    nodes: laidOutNodes,
    edges,
    summaryTags,
    pulseCopy: sourceNode
      ? `Discovery telemetry recenters on ${formatNodeDisplayName(sourceNode)} while keeping the visible heartbeat and peer-discovery fabric anchored to already collected data.`
      : 'Discovery telemetry will pulse once node topology and peer visibility data are available.',
  }
}
