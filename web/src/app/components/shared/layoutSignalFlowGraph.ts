import dagre from 'dagre'
import type { Edge, Node } from 'reactflow'

/**
 * T2477 — Single dagre layout helper for the SignalFlowGraph primitive.
 *
 * Replaces the seven per-workspace `layoutGraph()` functions with one
 * call. The graph parameters (rankdir/ranksep/nodesep/marginx/marginy)
 * default to the consensus values across the migrated workspaces; the
 * per-node size lookup is supplied by the caller (`getNodeSize(node)`)
 * because each workspace has its own per-kind size table.
 */

export interface LayoutSignalFlowGraphConfig {
  rankdir?: 'LR' | 'TB' | 'RL' | 'BT'
  ranksep?: number
  nodesep?: number
  marginx?: number
  marginy?: number
}

export interface LayoutSignalFlowGraphParams<TData> {
  nodes: Array<Node<TData>>
  edges: Edge[]
  /** Per-node bounding box used by dagre to compute positions. */
  getNodeSize: (node: Node<TData>) => { width: number; height: number }
  config?: LayoutSignalFlowGraphConfig
}

/**
 * Run dagre over the supplied nodes/edges and return a new array of
 * nodes with `position` set to the top-left corner of each laid-out box.
 *
 * Returns the input array unchanged when `nodes` is empty so callers can
 * pass through trivial cases without checking.
 */
export function layoutSignalFlowGraph<TData>({
  nodes,
  edges,
  getNodeSize,
  config = {},
}: LayoutSignalFlowGraphParams<TData>): Array<Node<TData>> {
  if (nodes.length === 0) {
    return nodes
  }

  const {
    rankdir = 'LR',
    ranksep = 120,
    nodesep = 40,
    marginx = 24,
    marginy = 24,
  } = config

  const graph = new dagre.graphlib.Graph()
  graph.setDefaultEdgeLabel(() => ({}))
  graph.setGraph({ rankdir, ranksep, nodesep, marginx, marginy })

  const sizes = new Map<string, { width: number; height: number }>()
  nodes.forEach((node) => {
    const size = getNodeSize(node)
    sizes.set(node.id, size)
    graph.setNode(node.id, size)
  })

  edges.forEach((edge) => {
    graph.setEdge(edge.source, edge.target)
  })

  dagre.layout(graph)

  return nodes.map((node) => {
    const position = graph.node(node.id)
    const size = sizes.get(node.id) ?? { width: 0, height: 0 }
    return {
      ...node,
      position: {
        x: position.x - size.width / 2,
        y: position.y - size.height / 2,
      },
    }
  })
}

export default layoutSignalFlowGraph
