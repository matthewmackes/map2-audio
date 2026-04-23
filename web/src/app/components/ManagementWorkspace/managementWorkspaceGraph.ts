import dagre from 'dagre'
import { MarkerType, type Edge, type Node } from 'reactflow'

import type { PlatformSummaryMetric, PlatformTableRow } from '../../platform/model'
import type { NodeSummary } from '../../types/node'
import {
  computeNodeHealthPercent,
  formatNodeDisplayName,
  getNodeRoleLabel,
  getNodeStatusLabel,
} from '../../utils/nodeDisplay'

export type ManagementWorkspaceAnchorId = 'management-services'

type ManagementWorkspaceNodeKind = 'hub' | 'service'
type ManagementWorkspaceTone = 'aligned' | 'warning' | 'critical' | 'neutral'
type ManagementWorkspaceTrafficLevel = 'idle' | 'low' | 'medium' | 'high'

export interface ManagementWorkspaceNodeData {
  kind: ManagementWorkspaceNodeKind
  eyebrow: string
  label: string
  caption: string
  metric: string
  accentColor: string
  tone: ManagementWorkspaceTone
  anchorId: ManagementWorkspaceAnchorId
  recordId: string
  contextNodeId: string | null
  selected?: boolean
}

export interface ManagementWorkspaceGraphSelection {
  anchorId: ManagementWorkspaceAnchorId
  recordId: string
  contextNodeId: string | null
}

export interface ManagementWorkspaceGraphTag {
  label: string
  type: 'green' | 'warm-gray' | 'red' | 'cool-gray'
}

export interface ManagementWorkspaceGraphModel {
  nodes: Array<Node<ManagementWorkspaceNodeData>>
  edges: Edge[]
  summaryTags: ManagementWorkspaceGraphTag[]
  pulseCopy: string
}

interface BuildManagementWorkspaceGraphArgs {
  selectedNode: NodeSummary | null
  tableRows: PlatformTableRow[]
  summaryMetrics: PlatformSummaryMetric[]
  selectedRowId: string | null
}

const HUB_NODE_ID = 'management-workspace:hub'
const HUB_ACCENT = 'var(--cds-support-success)'
const SERVICE_ACCENT = 'var(--cds-link-primary)'

function healthTone(value: string | number | boolean | null | undefined): ManagementWorkspaceTone {
  const normalized = String(value ?? '').toLowerCase()
  if (normalized === 'critical' || normalized === 'error' || normalized === 'offline' || normalized === 'down') {
    return 'critical'
  }
  if (normalized === 'warning' || normalized === 'warn' || normalized.includes('xrun') || normalized.includes('drift')) {
    return 'warning'
  }
  if (normalized === 'healthy' || normalized === 'running' || normalized === 'clear' || normalized === 'ok') {
    return 'aligned'
  }
  return 'neutral'
}

function trafficLevel(row: PlatformTableRow): ManagementWorkspaceTrafficLevel {
  const statusTone = healthTone(row.status)
  const alerts = String(row.alerts ?? '').toLowerCase()
  if (statusTone === 'critical') {
    return 'high'
  }
  if (statusTone === 'warning' || (alerts && alerts !== 'clear')) {
    return 'medium'
  }
  if (statusTone === 'aligned') {
    return 'low'
  }
  return 'idle'
}

function trafficStrokeWidth(level: ManagementWorkspaceTrafficLevel) {
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

function trafficColor(level: ManagementWorkspaceTrafficLevel): string {
  switch (level) {
    case 'high':
      return 'var(--cds-support-error)'
    case 'medium':
      return 'var(--cds-support-warning)'
    case 'low':
      return 'var(--cds-support-success)'
    case 'idle':
    default:
      return 'var(--cds-icon-secondary)'
  }
}

function toneToTagType(tone: ManagementWorkspaceTone): ManagementWorkspaceGraphTag['type'] {
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

function getNodeSize(kind: ManagementWorkspaceNodeData['kind']) {
  switch (kind) {
    case 'hub':
      return { width: 290, height: 132 }
    case 'service':
    default:
      return { width: 232, height: 108 }
  }
}

function layoutGraph(nodes: Array<Node<ManagementWorkspaceNodeData>>, edges: Edge[]) {
  if (nodes.length === 0) {
    return nodes
  }

  const graph = new dagre.graphlib.Graph()
  graph.setDefaultEdgeLabel(() => ({}))
  graph.setGraph({
    rankdir: 'LR',
    ranksep: 110,
    nodesep: 36,
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
  level: ManagementWorkspaceTrafficLevel,
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

export function buildManagementWorkspaceGraphModel({
  selectedNode,
  tableRows,
  summaryMetrics,
  selectedRowId,
}: BuildManagementWorkspaceGraphArgs): ManagementWorkspaceGraphModel {
  const nodeHealthPercent = selectedNode ? computeNodeHealthPercent(selectedNode) : 0
  const graphNodes: Array<Node<ManagementWorkspaceNodeData>> = [
    {
      id: HUB_NODE_ID,
      type: 'managementWorkspaceNode',
      position: { x: 0, y: 0 },
      draggable: false,
      selectable: false,
      data: {
        kind: 'hub',
        eyebrow: 'Management host',
        label: selectedNode ? formatNodeDisplayName(selectedNode) : 'Management telemetry pending',
        caption: selectedNode
          ? `${getNodeRoleLabel(selectedNode.role)} · ${getNodeStatusLabel(selectedNode.status)} · last seen ${new Date(selectedNode.last_seen).toLocaleTimeString()}`
          : 'Select a node to center the management workspace on its current platform posture.',
        metric: selectedNode
          ? `CPU ${Math.round(selectedNode.cpu_percent)}% · latency ${selectedNode.audio_latency_ms.toFixed(1)} ms · health ${Math.round(nodeHealthPercent)}%`
          : 'Waiting for node topology',
        accentColor: HUB_ACCENT,
        tone: selectedNode ? healthTone(selectedNode.status) : 'neutral',
        anchorId: 'management-services',
        recordId: 'management-hub',
        contextNodeId: selectedNode?.node_id ?? null,
      },
    },
  ]

  const edges: Edge[] = []

  for (const row of tableRows) {
    const level = trafficLevel(row)
    const tone = healthTone(row.status)
    const metric1 = row.metric1 == null ? 'n/a' : String(row.metric1)
    const metric2 = row.metric2 == null ? 'n/a' : String(row.metric2)
    const alerts = row.alerts == null ? 'Clear' : String(row.alerts)
    const nodeId = `management-workspace:${row.id}`

    graphNodes.push({
      id: nodeId,
      type: 'managementWorkspaceNode',
      position: { x: 0, y: 0 },
      draggable: false,
      selectable: false,
      data: {
        kind: 'service',
        eyebrow: 'Service lane',
        label: String(row.name ?? row.id),
        caption: `${metric1} · ${metric2}`,
        metric: alerts,
        accentColor: SERVICE_ACCENT,
        tone,
        anchorId: 'management-services',
        recordId: row.id,
        contextNodeId: selectedNode?.node_id ?? null,
        selected: selectedRowId === row.id,
      },
    })

    edges.push(
      buildEdge(
        `${HUB_NODE_ID}→${nodeId}`,
        HUB_NODE_ID,
        nodeId,
        level,
        level === 'high'
          ? 'needs action'
          : level === 'medium'
            ? 'watch'
            : level === 'low'
              ? 'steady'
              : 'idle',
      ),
    )
  }

  const laidOutNodes = layoutGraph(graphNodes, edges)
  const summaryTags = summaryMetrics.slice(0, 4).map((metric) => ({
    label: `${metric.label}: ${metric.value}`,
    type: toneToTagType(healthTone(metric.tone)),
  }))

  return {
    nodes: laidOutNodes,
    edges,
    summaryTags,
    pulseCopy: selectedNode
      ? `Management telemetry centers ${formatNodeDisplayName(selectedNode)} and pulses the service lanes that currently need operator attention.`
      : 'Management telemetry will pulse active service lanes once node topology data becomes available.',
  }
}
