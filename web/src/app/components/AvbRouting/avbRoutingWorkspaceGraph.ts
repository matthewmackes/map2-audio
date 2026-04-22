import dagre from 'dagre'
import { MarkerType, type Edge, type Node } from 'reactflow'

import type { TesiraDeviceSummary } from '../Devices/Tesira/types'
import type { AvbNode } from './types'

export type AvbRoutingWorkspaceAnchorId = 'avb-routing-nodes'
export type AvbRoutingWorkspaceSelectionKind = 'node' | 'tesira'

type AvbRoutingWorkspaceTone = 'aligned' | 'warning' | 'critical' | 'neutral'
type AvbRoutingWorkspaceTrafficLevel = 'idle' | 'low' | 'medium' | 'high'

type AggregatedRouteEdge = {
  sourceNodeId: string
  targetNodeId: string
  routeCount: number
}

type NodeSummaryById = Record<string, {
  endpointCount: number
  routeCount: number
  tesiraCount: number
}>

type TesiraDevicesByNodeId = Record<string, TesiraDeviceSummary[]>

export interface AvbRoutingWorkspaceNodeData {
  kind: 'fabric' | 'node' | 'tesira'
  eyebrow: string
  label: string
  caption: string
  metric: string
  accentColor: string
  tone: AvbRoutingWorkspaceTone
  anchorId: AvbRoutingWorkspaceAnchorId
  recordId: string
  selectionKind: AvbRoutingWorkspaceSelectionKind
  contextNodeId: string | null
  selected?: boolean
}

export interface AvbRoutingWorkspaceGraphSelection {
  anchorId: AvbRoutingWorkspaceAnchorId
  recordId: string
  selectionKind: AvbRoutingWorkspaceSelectionKind
  contextNodeId: string | null
}

export interface AvbRoutingWorkspaceGraphTag {
  label: string
  type: 'green' | 'warm-gray' | 'red' | 'cool-gray'
}

export interface AvbRoutingWorkspaceGraphModel {
  nodes: Array<Node<AvbRoutingWorkspaceNodeData>>
  edges: Edge[]
  summaryTags: AvbRoutingWorkspaceGraphTag[]
  pulseCopy: string
}

interface BuildAvbRoutingWorkspaceGraphArgs {
  nodes: AvbNode[]
  aggregatedRouteEdges: AggregatedRouteEdge[]
  tesiraDevices: TesiraDeviceSummary[]
  ptpMasterNodeId: string | null
  selectedNodeId: string | null
  selectedTesiraDeviceId: string | null
  focusedEntityId: string | null
  summaryByNodeId: NodeSummaryById
  tesiraDevicesByNodeId: TesiraDevicesByNodeId
}

const FABRIC_NODE_ID = 'avb-routing-workspace:fabric'

const ACCENT = {
  fabric: '#0f62fe',
  node: '#1192e8',
  tesira: '#24a148',
} as const

function nodeTone(node: AvbNode): AvbRoutingWorkspaceTone {
  if (node.status === 'offline') {
    return 'critical'
  }

  if (node.status === 'degraded') {
    return 'warning'
  }

  if (node.ptp?.state === 'master' || node.ptp?.state === 'slave') {
    return 'aligned'
  }

  if (node.status === 'online') {
    return 'neutral'
  }

  return 'warning'
}

function tesiraTone(device: TesiraDeviceSummary): AvbRoutingWorkspaceTone {
  if (device.connected) {
    return 'aligned'
  }

  return 'warning'
}

function trafficLevel(routeCount: number): AvbRoutingWorkspaceTrafficLevel {
  if (routeCount >= 6) {
    return 'high'
  }
  if (routeCount >= 3) {
    return 'medium'
  }
  if (routeCount >= 1) {
    return 'low'
  }
  return 'idle'
}

function trafficStrokeWidth(level: AvbRoutingWorkspaceTrafficLevel) {
  switch (level) {
    case 'high':
      return 5
    case 'medium':
      return 4
    case 'low':
      return 2.75
    case 'idle':
    default:
      return 1.75
  }
}

function trafficColor(level: AvbRoutingWorkspaceTrafficLevel) {
  switch (level) {
    case 'high':
      return '#24a148'
    case 'medium':
      return '#ff832b'
    case 'low':
      return '#0f62fe'
    case 'idle':
    default:
      return '#8d8d8d'
  }
}

function getNodeSize(kind: AvbRoutingWorkspaceNodeData['kind']) {
  switch (kind) {
    case 'fabric':
      return { width: 280, height: 120 }
    case 'tesira':
      return { width: 232, height: 104 }
    case 'node':
    default:
      return { width: 244, height: 110 }
  }
}

function layoutGraph(nodes: Array<Node<AvbRoutingWorkspaceNodeData>>, edges: Edge[]) {
  if (nodes.length === 0) {
    return nodes
  }

  const graph = new dagre.graphlib.Graph()
  graph.setDefaultEdgeLabel(() => ({}))
  graph.setGraph({
    rankdir: 'LR',
    ranksep: 140,
    nodesep: 44,
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
  level: AvbRoutingWorkspaceTrafficLevel,
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

export function buildAvbRoutingWorkspaceGraphModel({
  nodes,
  aggregatedRouteEdges,
  tesiraDevices,
  ptpMasterNodeId,
  selectedNodeId,
  selectedTesiraDeviceId,
  focusedEntityId,
  summaryByNodeId,
  tesiraDevicesByNodeId,
}: BuildAvbRoutingWorkspaceGraphArgs): AvbRoutingWorkspaceGraphModel {
  const totalActiveRoutes = aggregatedRouteEdges.reduce((sum, edge) => sum + edge.routeCount, 0)
  const connectedTesiraDevices = tesiraDevices.filter((device) => device.connected).length
  const masterNode = nodes.find((node) => node.node_id === ptpMasterNodeId) ?? null

  const graphNodes: Array<Node<AvbRoutingWorkspaceNodeData>> = [
    {
      id: FABRIC_NODE_ID,
      type: 'avbRoutingWorkspaceNode',
      position: { x: 0, y: 0 },
      draggable: false,
      selectable: false,
      data: {
        kind: 'fabric',
        eyebrow: 'Clock & fabric',
        label: masterNode ? `PTP master ${masterNode.name}` : 'AVB fabric',
        caption: masterNode
          ? `${masterNode.name} is driving transport timing for the visible fabric.`
          : 'Transport timing is visible even when the grandmaster is unresolved.',
        metric: `${nodes.length} nodes · ${totalActiveRoutes} active route${totalActiveRoutes === 1 ? '' : 's'}`,
        accentColor: ACCENT.fabric,
        tone: nodes.length > 0 ? 'aligned' : 'critical',
        anchorId: 'avb-routing-nodes' as const,
        recordId: selectedNodeId ?? 'fabric',
        selectionKind: 'node' as const,
        contextNodeId: selectedNodeId,
      },
    },
    ...nodes.map((node) => {
      const summary = summaryByNodeId[node.node_id] ?? { endpointCount: 0, routeCount: 0, tesiraCount: 0 }

      return {
        id: `node:${node.node_id}`,
        type: 'avbRoutingWorkspaceNode',
        position: { x: 0, y: 0 },
        draggable: false,
        selectable: false,
        data: {
          kind: 'node' as const,
          eyebrow: node.type === 'map2_local' ? 'Local node' : node.type.replace(/_/g, ' '),
          label: node.name,
          caption: `${summary.endpointCount} endpoint${summary.endpointCount === 1 ? '' : 's'} · ${summary.routeCount} route${summary.routeCount === 1 ? '' : 's'} · ${node.ptp?.state ?? 'PTP pending'}`,
          metric: summary.tesiraCount > 0
            ? `${summary.tesiraCount} Tesira device${summary.tesiraCount === 1 ? '' : 's'}`
            : node.api_url ?? node.address,
          accentColor: node.color || ACCENT.node,
          tone: nodeTone(node),
          anchorId: 'avb-routing-nodes' as const,
          recordId: node.node_id,
          selectionKind: 'node' as const,
          contextNodeId: node.node_id,
          selected: node.node_id === selectedNodeId,
        },
      }
    }),
    ...tesiraDevices.map((device) => {
      const contextNodeId = device.source_node_id ?? null
      const caption = device.connected
        ? `${device.host}:${device.port} · ${device.ptp_state ?? 'PTP pending'}`
        : `${device.host}:${device.port} · needs reconnect`

      return {
        id: `tesira:${device.device_id}`,
        type: 'avbRoutingWorkspaceNode',
        position: { x: 0, y: 0 },
        draggable: false,
        selectable: false,
        data: {
          kind: 'tesira' as const,
          eyebrow: 'Tesira AVB',
          label: device.name || device.host,
          caption,
          metric: `${device.avb_stream_count} AVB stream${device.avb_stream_count === 1 ? '' : 's'}`,
          accentColor: ACCENT.tesira,
          tone: tesiraTone(device),
          anchorId: 'avb-routing-nodes' as const,
          recordId: device.device_id,
          selectionKind: 'tesira' as const,
          contextNodeId,
          selected: device.device_id === selectedTesiraDeviceId,
        },
      }
    }),
  ]

  const graphEdges: Edge[] = [
    ...nodes.map((node) => {
      const summary = summaryByNodeId[node.node_id] ?? { endpointCount: 0, routeCount: 0, tesiraCount: 0 }
      const label = node.node_id === ptpMasterNodeId ? 'Grandmaster' : (node.ptp?.state ?? 'PTP')
      return buildEdge(
        `fabric:${node.node_id}`,
        FABRIC_NODE_ID,
        `node:${node.node_id}`,
        trafficLevel(Math.max(summary.routeCount, summary.endpointCount > 0 ? 1 : 0)),
        label,
      )
    }),
    ...aggregatedRouteEdges.map((edge) => buildEdge(
      `route:${edge.sourceNodeId}:${edge.targetNodeId}`,
      `node:${edge.sourceNodeId}`,
      `node:${edge.targetNodeId}`,
      trafficLevel(edge.routeCount),
      `${edge.routeCount} route${edge.routeCount === 1 ? '' : 's'}`,
    )),
    ...Object.entries(tesiraDevicesByNodeId).flatMap(([nodeId, devices]) => devices.map((device) => buildEdge(
      `tesira:${nodeId}:${device.device_id}`,
      `node:${nodeId}`,
      `tesira:${device.device_id}`,
      trafficLevel(Math.max(device.avb_stream_count, 1)),
      `${device.avb_stream_count} stream${device.avb_stream_count === 1 ? '' : 's'}`,
    ))),
  ]

  const summaryTags: AvbRoutingWorkspaceGraphTag[] = [
    { label: `${nodes.filter((node) => node.status === 'online').length}/${nodes.length} nodes online`, type: nodes.every((node) => node.status === 'online') ? 'green' : 'warm-gray' },
    { label: `${totalActiveRoutes} active route${totalActiveRoutes === 1 ? '' : 's'}`, type: totalActiveRoutes > 0 ? 'green' : 'cool-gray' },
    { label: `${connectedTesiraDevices}/${tesiraDevices.length} Tesira ready`, type: tesiraDevices.length === 0 ? 'cool-gray' : connectedTesiraDevices === tesiraDevices.length ? 'green' : 'warm-gray' },
  ]

  if (focusedEntityId) {
    summaryTags.push({
      label: `Entity ${focusedEntityId.slice(0, 12)}${focusedEntityId.length > 12 ? '…' : ''}`,
      type: 'cool-gray',
    })
  }

  return {
    nodes: layoutGraph(graphNodes, graphEdges),
    edges: graphEdges,
    summaryTags,
    pulseCopy: masterNode
      ? `${masterNode.name} is the current grandmaster. Route pulses show active AVB transport pressure and Tesira attachments stay bound to their owning node context.`
      : 'Route pulses show active AVB transport pressure and Tesira attachments stay bound to their owning node context.',
  }
}

export default buildAvbRoutingWorkspaceGraphModel
