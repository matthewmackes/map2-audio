// @ts-nocheck
// ============================================================================
// MAP2 Audio Platform - Routing Node Type Definitions
// Nodes for A/B split and blend routing visualization
// ============================================================================

import { Node } from 'reactflow';

export type RoutingNodeKind = 'split' | 'blend';

export interface RoutingNodeData {
  kind: RoutingNodeKind;
  channels: number;
  /** For blend nodes: current blend position 0-100 (0=100% A, 100=100% B) */
  blendPosition?: number;
  /** Labels for the paths */
  pathALabel?: string;
  pathBLabel?: string;
}

export type RoutingNode = Node<RoutingNodeData, 'routingNode'>;

export function createRoutingNode(
  id: string,
  data: RoutingNodeData,
  position: { x: number; y: number }
): RoutingNode {
  return {
    id,
    type: 'routingNode',
    position,
    data,
    draggable: false,
  };
}

/**
 * Create a split node that divides signal into A and B paths
 */
export function createSplitNode(
  id: string,
  channels: number,
  position: { x: number; y: number },
  pathALabel = 'Chain A',
  pathBLabel = 'Chain B'
): RoutingNode {
  return createRoutingNode(id, {
    kind: 'split',
    channels,
    pathALabel,
    pathBLabel,
  }, position);
}

/**
 * Create a blend node that mixes A and B paths
 */
export function createBlendNode(
  id: string,
  channels: number,
  position: { x: number; y: number },
  blendPosition: number,
  pathALabel = 'Chain A',
  pathBLabel = 'Chain B'
): RoutingNode {
  return createRoutingNode(id, {
    kind: 'blend',
    channels,
    blendPosition,
    pathALabel,
    pathBLabel,
  }, position);
}
