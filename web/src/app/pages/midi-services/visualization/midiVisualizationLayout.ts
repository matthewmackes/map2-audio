/**
 * T2500-MV-C2 — three-tier layout adapter.
 *
 * Converts the backend topology shape into ReactFlow `nodes` + `edges`
 * laid out in three columns by `layoutSignalFlowGraph` (dagre LTR).
 *
 * Why "rank anchors": dagre infers ranks from edge structure; an
 * isolated mapping node with no inbound device edge would be placed
 * in rank 0 and end up in the device column. We force rank assignment
 * by injecting invisible "rank anchor" nodes at the head of each tier
 * and connecting every tier-N node to its anchor. Anchors are filtered
 * out of the rendered output.
 */

import type { Edge, Node } from 'reactflow'

import {
  layoutSignalFlowGraph,
  type LayoutSignalFlowGraphConfig,
} from '../../../components/shared/layoutSignalFlowGraph'

import type {
  MidiVisualizationEvent,
  MidiVisualizationNodeKind,
  MidiVisualizationTopology,
  MidiVisualizationTopologyEdge,
  MidiVisualizationTopologyNode,
} from './midiVisualizationTypes'

export interface MidiVisualizationNodeData {
  kind: MidiVisualizationNodeKind
  label: string
  raw: Record<string, unknown>
  /** Latest event seen on any edge incident to this node (rolling). */
  lastEventAt: number | null
  /** Events-per-second over the last second on inbound edges. */
  rateHz: number
  /** Last 50 events touching this node (newest first). */
  recentEvents: MidiVisualizationEvent[]
}

export interface MidiVisualizationEdgeData {
  /** Rolling rate (events / second over a 1 s window) for this edge. */
  rateHz: number
  /** Timestamp of the most recent event on the edge. */
  lastEventAt: number | null
  /** Total events over the buffer window — used by the heatmap. */
  totalEvents: number
}

export type MidiVisualizationNode = Node<MidiVisualizationNodeData>
export type MidiVisualizationEdge = Edge<MidiVisualizationEdgeData>

const NODE_TYPE_BY_KIND: Record<MidiVisualizationNodeKind, string> = {
  device: 'midiVisualizationDevice',
  mapping: 'midiVisualizationMapping',
  target: 'midiVisualizationTarget',
}

const NODE_SIZE_BY_KIND: Record<
  MidiVisualizationNodeKind,
  { width: number; height: number }
> = {
  device: { width: 220, height: 84 },
  mapping: { width: 220, height: 84 },
  target: { width: 240, height: 64 },
}

const TIER_ANCHOR_PREFIX = '__rank_anchor__'

const TIER_ORDER: readonly MidiVisualizationNodeKind[] = [
  'device',
  'mapping',
  'target',
] as const

const DEFAULT_LAYOUT_CONFIG: Required<LayoutSignalFlowGraphConfig> = {
  rankdir: 'LR',
  ranksep: 160,
  nodesep: 32,
  marginx: 24,
  marginy: 24,
}

export interface BuildLayoutParams {
  topology: MidiVisualizationTopology
  /** Per-edge activity (rate, last event ts, total events). */
  edgeActivity: Map<string, MidiVisualizationEdgeData>
  /** Per-node activity rollup (latest event ts, rate, recent events). */
  nodeActivity: Map<string, MidiVisualizationNodeData>
  layoutConfig?: LayoutSignalFlowGraphConfig
}

export interface BuildLayoutResult {
  nodes: MidiVisualizationNode[]
  edges: MidiVisualizationEdge[]
}

/**
 * Build laid-out ReactFlow nodes + edges from a topology + activity
 * snapshot. Pure function; no React, no DOM. Re-run on every topology
 * change (rare) — activity changes are rendered via the canvas overlay
 * without re-running this layout (see MidiEdgeOverlayCanvas).
 */
export function buildMidiVisualizationLayout({
  topology,
  edgeActivity,
  nodeActivity,
  layoutConfig,
}: BuildLayoutParams): BuildLayoutResult {
  if (topology.nodes.length === 0) {
    return { nodes: [], edges: [] }
  }

  const realNodes = topology.nodes.map((tn) => toReactFlowNode(tn, nodeActivity))
  const realEdges = topology.edges.map((e) => toReactFlowEdge(e, edgeActivity))

  // Inject one anchor node per tier + invisible edges from each anchor
  // to every tier member. This pins ranks even when a tier has no
  // organic inbound edges (e.g. an unbound device, an unused target).
  // Additionally chain the anchors (device → mapping → target) so
  // dagre orders the tier columns even when no real edge bridges
  // adjacent tiers — without this an orphan tier would collapse onto
  // the previous column.
  const anchors = TIER_ORDER.map((kind) => makeAnchorNode(kind))
  const anchorEdges: Edge[] = []
  for (let i = 0; i < TIER_ORDER.length - 1; i += 1) {
    const fromKind = TIER_ORDER[i]
    const toKind = TIER_ORDER[i + 1]
    anchorEdges.push({
      id: `${TIER_ANCHOR_PREFIX}chain:${fromKind}->${toKind}`,
      source: anchorIdFor(fromKind),
      target: anchorIdFor(toKind),
      hidden: true,
      style: { opacity: 0, pointerEvents: 'none' as const },
    })
  }
  for (const node of realNodes) {
    const data = node.data as MidiVisualizationNodeData
    anchorEdges.push({
      id: `${TIER_ANCHOR_PREFIX}${data.kind}->${node.id}`,
      source: anchorIdFor(data.kind),
      target: node.id,
      hidden: true,
      // Anchor edges must not affect rendered styling.
      style: { opacity: 0, pointerEvents: 'none' as const },
    })
  }

  // Run dagre over the combined graph.
  const allNodes: Array<Node<unknown>> = [...anchors, ...realNodes]
  const allEdges: Edge[] = [...anchorEdges, ...realEdges]
  const positioned = layoutSignalFlowGraph({
    nodes: allNodes,
    edges: allEdges,
    getNodeSize: (node) => {
      if (node.id.startsWith(TIER_ANCHOR_PREFIX)) {
        return { width: 1, height: 1 }
      }
      const data = node.data as MidiVisualizationNodeData
      return NODE_SIZE_BY_KIND[data.kind]
    },
    config: { ...DEFAULT_LAYOUT_CONFIG, ...(layoutConfig ?? {}) },
  })

  // Filter anchors back out before returning to the page.
  const filtered = positioned.filter(
    (n) => !n.id.startsWith(TIER_ANCHOR_PREFIX),
  ) as MidiVisualizationNode[]

  return { nodes: filtered, edges: realEdges }
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function toReactFlowNode(
  topologyNode: MidiVisualizationTopologyNode,
  nodeActivity: Map<string, MidiVisualizationNodeData>,
): MidiVisualizationNode {
  const data: MidiVisualizationNodeData =
    nodeActivity.get(topologyNode.id) ?? {
      kind: topologyNode.kind,
      label: topologyNode.label,
      raw: topologyNode.raw,
      lastEventAt: null,
      rateHz: 0,
      recentEvents: [],
    }
  return {
    id: topologyNode.id,
    type: NODE_TYPE_BY_KIND[topologyNode.kind],
    data: {
      ...data,
      // Always re-sync the label/kind/raw from topology so renames
      // surface immediately when the topology re-fetches.
      kind: topologyNode.kind,
      label: topologyNode.label,
      raw: topologyNode.raw,
    },
    position: { x: 0, y: 0 },  // dagre overwrites this
  }
}

function toReactFlowEdge(
  topologyEdge: MidiVisualizationTopologyEdge,
  edgeActivity: Map<string, MidiVisualizationEdgeData>,
): MidiVisualizationEdge {
  const key = edgeKey(topologyEdge.source, topologyEdge.target)
  const data: MidiVisualizationEdgeData = edgeActivity.get(key) ?? {
    rateHz: 0,
    lastEventAt: null,
    totalEvents: 0,
  }
  return {
    id: key,
    source: topologyEdge.source,
    target: topologyEdge.target,
    data,
    type: 'default',
  }
}

function makeAnchorNode(kind: MidiVisualizationNodeKind): Node<unknown> {
  return {
    id: anchorIdFor(kind),
    data: {},
    position: { x: 0, y: 0 },
    type: 'default',
    hidden: true,
    style: { opacity: 0, pointerEvents: 'none' as const, width: 1, height: 1 },
  }
}

function anchorIdFor(kind: MidiVisualizationNodeKind): string {
  return `${TIER_ANCHOR_PREFIX}${kind}`
}

export function edgeKey(source: string, target: string): string {
  return `${source}=>${target}`
}
