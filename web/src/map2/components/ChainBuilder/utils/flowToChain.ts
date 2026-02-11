// ============================================================================
// MAP2 Audio Platform - React Flow to Chain Transformer
// Extracts plugin order from React Flow node positions
// ============================================================================

import { AudioPluginNode } from '../nodes/AudioPluginNodeTypes';
import { DeviceNode } from '../nodes/DeviceNodeTypes';

/**
 * Extract plugin order from React Flow nodes based on X position
 * (left to right = first to last in chain)
 */
export type ChainFlowNode = AudioPluginNode | DeviceNode;

export function flowToChainOrder(nodes: ChainFlowNode[]): string[] {
  // Only consider audio plugin nodes for ordering
  const pluginNodes = nodes.filter((n): n is AudioPluginNode => n.type === 'audioPlugin');

  // Sort nodes by X position (left to right)
  const sortedNodes = [...pluginNodes].sort((a, b) => a.position.x - b.position.x);

  // Extract plugin URIs in order
  return sortedNodes.map((node) => node.data.plugin.uri);
}

/**
 * Get the position index of a specific plugin URI
 */
export function getPluginPosition(
  nodes: ChainFlowNode[],
  pluginUri: string
): number {
  const orderedUris = flowToChainOrder(nodes);
  return orderedUris.indexOf(pluginUri);
}

/**
 * Check if node order has changed (useful for detecting when to sync with backend)
 */
export function hasOrderChanged(
  previousNodes: ChainFlowNode[],
  currentNodes: ChainFlowNode[]
): boolean {
  const prevOrder = flowToChainOrder(previousNodes);
  const currOrder = flowToChainOrder(currentNodes);

  if (prevOrder.length !== currOrder.length) return true;

  return !prevOrder.every((uri, index) => uri === currOrder[index]);
}
