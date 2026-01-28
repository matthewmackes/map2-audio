// @ts-nocheck
// ============================================================================
// MAP2 Audio Platform - Audio Connection Edge Type Definitions
// TypeScript interfaces for React Flow custom audio connection edges
// ============================================================================

import { Edge } from 'reactflow';

/**
 * Data structure for audio connection edges
 */
export interface AudioConnectionEdgeData {
  // Channel information
  sourceChannels: number;
  targetChannels: number;

  // Visual state
  hasChannelMismatch: boolean;
  isHighlighted?: boolean;

  // Label (e.g., "2 ch" or "2→1")
  label?: string;

  // PDC (Plugin Delay Compensation) information
  pdcCompensationSamples?: number;  // Delay added for compensation
  pdcActive?: boolean;              // Whether PDC is actively compensating
  cumulativeLatency?: number;       // Cumulative latency up to this point in samples
}

/**
 * Audio connection edge type
 */
export type AudioConnectionEdge = Edge<AudioConnectionEdgeData>;

/**
 * Helper to create an audio connection edge
 */
export function createAudioConnectionEdge(
  id: string,
  source: string,
  target: string,
  sourceChannels: number,
  targetChannels: number,
  sourceHandle?: string,
  targetHandle?: string
): AudioConnectionEdge {
  const hasChannelMismatch = sourceChannels !== targetChannels;
  const label =
    sourceChannels === targetChannels
      ? `${sourceChannels} ch`
      : `${sourceChannels}→${targetChannels}`;

  const edge: AudioConnectionEdge = {
    id,
    source,
    target,
    type: 'audioConnection',
    data: {
      sourceChannels,
      targetChannels,
      hasChannelMismatch,
      label,
    },
  };

  // Add handle IDs if specified (for routing nodes with multiple handles)
  if (sourceHandle) {
    edge.sourceHandle = sourceHandle;
  }
  if (targetHandle) {
    edge.targetHandle = targetHandle;
  }

  return edge;
}
