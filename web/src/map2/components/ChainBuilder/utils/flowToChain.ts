// ============================================================================
// MAP2 Audio Platform - React Flow to Chain Transformer
// Extracts plugin order from React Flow node positions
// ============================================================================

import { AudioPluginNode } from '../nodes/AudioPluginNodeTypes';
import { DeviceNode } from '../nodes/DeviceNodeTypes';
import type { PluginOrderRef } from '../../../types';
import { buildPluginOrderRef, getPluginIdentityKey } from '../../../utils/pluginIdentity';

/**
 * Extract plugin order from React Flow nodes based on X position
 * (left to right = first to last in chain)
 */
export type ChainFlowNode = AudioPluginNode | DeviceNode;

export function flowToChainOrder(nodes: ChainFlowNode[]): PluginOrderRef[] {
  // Only consider audio plugin nodes for ordering
  const pluginNodes = nodes.filter((n): n is AudioPluginNode => n.type === 'audioPlugin');

  // Sort nodes by X position (left to right)
  const sortedNodes = [...pluginNodes].sort((a, b) => a.position.x - b.position.x);

  // Extract current plugin refs in order
  return sortedNodes.map((node) => buildPluginOrderRef(node.data.plugin));
}

/**
 * Get the position index of a specific plugin URI
 */
export function getPluginPosition(
  nodes: ChainFlowNode[],
  pluginRef: PluginOrderRef
): number {
  const pluginKey = getPluginIdentityKey(pluginRef);
  return flowToChainOrder(nodes).findIndex((entry) => getPluginIdentityKey(entry) === pluginKey);
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

  return !prevOrder.every((pluginRef, index) => (
    getPluginIdentityKey(pluginRef) === getPluginIdentityKey(currOrder[index])
  ));
}
