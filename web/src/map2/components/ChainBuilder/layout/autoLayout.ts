// ============================================================================
// MAP2 Audio Platform - React Flow Auto-Layout
// Automatic node positioning for signal chains
// ============================================================================

import { Node, Edge } from 'reactflow';
import dagre from 'dagre';

export interface LayoutConfig {
  direction: 'LR' | 'TB'; // Left-Right or Top-Bottom
  nodeWidth: number;
  nodeHeight: number;
  horizontalSpacing: number;
  verticalSpacing: number;
}

export const defaultLayoutConfig: LayoutConfig = {
  direction: 'LR',
  nodeWidth: 240,
  nodeHeight: 140,
  horizontalSpacing: 100,
  verticalSpacing: 80,
};

/**
 * Auto-layout nodes based on chain structure
 * For linear chains, uses simple horizontal layout
 * For complex graphs (future), uses Dagre hierarchical layout
 */
export function autoLayoutNodes<T = any>(
  nodes: Node<T>[],
  edges: Edge[],
  config: LayoutConfig = defaultLayoutConfig
): Node<T>[] {
  // For linear chains (most common case), use simple horizontal layout
  if (edges.length === nodes.length - 1 && isLinearChain(nodes, edges)) {
    return linearLayout(nodes, config);
  }

  // For complex graphs, use Dagre
  return dagreLayout(nodes, edges, config);
}

/**
 * Check if the graph represents a linear chain (no branches)
 */
function isLinearChain(nodes: Node[], edges: Edge[]): boolean {
  if (nodes.length === 0) return true;
  if (nodes.length === 1) return true;
  if (edges.length !== nodes.length - 1) return false;

  // Build adjacency map
  const outgoing = new Map<string, number>();
  const incoming = new Map<string, number>();

  edges.forEach((edge) => {
    outgoing.set(edge.source, (outgoing.get(edge.source) || 0) + 1);
    incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1);
  });

  // Linear chain: each node has at most 1 outgoing and 1 incoming
  for (const node of nodes) {
    if ((outgoing.get(node.id) || 0) > 1) return false;
    if ((incoming.get(node.id) || 0) > 1) return false;
  }

  return true;
}

/**
 * Simple horizontal left-to-right layout for linear chains
 */
function linearLayout<T>(
  nodes: Node<T>[],
  config: LayoutConfig
): Node<T>[] {
  return nodes.map((node, index) => ({
    ...node,
    position: {
      x: index * (config.nodeWidth + config.horizontalSpacing),
      y: 100, // Center vertically with padding
    },
  }));
}

/**
 * Dagre hierarchical layout for complex graphs
 */
function dagreLayout<T>(
  nodes: Node<T>[],
  edges: Edge[],
  config: LayoutConfig
): Node<T>[] {
  const g = new dagre.graphlib.Graph();

  g.setGraph({
    rankdir: config.direction,
    nodesep: config.horizontalSpacing,
    ranksep: config.verticalSpacing,
    marginx: 20,
    marginy: 20,
  });

  g.setDefaultEdgeLabel(() => ({}));

  // Add nodes to dagre graph
  nodes.forEach((node) => {
    g.setNode(node.id, {
      width: config.nodeWidth,
      height: config.nodeHeight,
    });
  });

  // Add edges to dagre graph
  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  // Calculate layout
  dagre.layout(g);

  // Apply calculated positions to nodes
  return nodes.map((node) => {
    const nodeWithPosition = g.node(node.id);

    return {
      ...node,
      position: {
        x: nodeWithPosition.x - config.nodeWidth / 2,
        y: nodeWithPosition.y - config.nodeHeight / 2,
      },
    };
  });
}

/**
 * Re-layout existing nodes (preserve node data, update positions only)
 */
export function relayoutNodes<T>(
  nodes: Node<T>[],
  edges: Edge[],
  config?: LayoutConfig
): Node<T>[] {
  return autoLayoutNodes(nodes, edges, config);
}
