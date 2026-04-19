// ============================================================================
// MAP2 Audio Platform - Sidechain Connection Edge Type Definitions
// TypeScript interfaces for React Flow custom sidechain connection edges
// ============================================================================

import { Edge } from 'reactflow';

/**
 * Data structure for sidechain connection edges
 */
export interface SidechainConnectionEdgeData {
  // Source plugin information
  sourcePluginUri: string;
  sourcePluginName: string;

  // Target sidechain bus information
  targetPluginUri: string;
  targetPluginName: string;
  targetBusIndex: number;
  targetBusName?: string;

  // Visual state
  isActive?: boolean;
  isHighlighted?: boolean;

  // Label (e.g., "SC 1" or bus name)
  label?: string;
}

/**
 * Sidechain connection edge type
 */
export type SidechainConnectionEdge = Edge<SidechainConnectionEdgeData>;

/**
 * Helper to create a sidechain connection edge
 */
export function createSidechainConnectionEdge(
  source: string,
  target: string,
  sourcePluginUri: string,
  sourcePluginName: string,
  targetPluginUri: string,
  targetPluginName: string,
  targetBusIndex: number,
  targetBusName?: string
): SidechainConnectionEdge {
  const id = `sidechain-${sourcePluginUri}-${targetPluginUri}-bus${targetBusIndex}`;
  const label = targetBusName || `SC ${targetBusIndex + 1}`;

  return {
    id,
    source,
    target,
    sourceHandle: 'audio-out', // Connect from plugin's audio output
    targetHandle: `sidechain-${targetBusIndex}`, // Connect to sidechain input handle
    type: 'sidechainConnection',
    data: {
      sourcePluginUri,
      sourcePluginName,
      targetPluginUri,
      targetPluginName,
      targetBusIndex,
      targetBusName,
      isActive: true,
      label,
    },
  };
}

/**
 * Check if an edge is a sidechain connection
 */
export function isSidechainEdge(edge: Edge): edge is SidechainConnectionEdge {
  return edge.type === 'sidechainConnection';
}
