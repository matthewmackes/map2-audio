// ============================================================================
// MAP2 Audio Platform - Audio Plugin Node Type Definitions
// TypeScript interfaces for React Flow custom audio plugin nodes
// Enhanced with sidechain routing, latency visualization, and meter panels
// ============================================================================

import { Node } from 'reactflow';
import { ChainPlugin } from '../../../types';

/**
 * Data structure for audio plugin nodes
 */
export interface AudioPluginNodeData {
  // Plugin core data
  plugin: ChainPlugin;

  // Visual state
  isSelected: boolean;
  isBypassed: boolean;
  compact?: boolean;
  meterPanelExpanded?: boolean;  // Whether the meter panel is shown
  isHardware?: boolean;          // Whether this is a hardware effect (e.g., Lexicon MPX-1)

  // Metering
  meters?: {
    input?: number;
    output?: number;
  };

  // Audio routing
  inputPorts: number;
  outputPorts: number;

  // Sidechain routing
  sidechainBuses?: number;           // Number of sidechain input buses
  sidechainBusNames?: string[];      // Names of sidechain buses
  sidechainConnections?: Array<{     // Active sidechain connections
    sourcePluginUri: string;
    busIndex: number;
  }>;

  // Performance & modulation indicators
  cpuPercent?: number;        // CPU usage percentage for this plugin
  latencySamples?: number;    // Latency in samples
  sampleRate?: number;        // Sample rate for ms calculation (default 48000)
  hasLfo?: boolean;           // Whether LFO modulation is active
  hasEnvelope?: boolean;      // Whether envelope follower is active
  hasAutomation?: boolean;    // Whether automation is recorded

  // Callbacks
  onRemove: () => void;
  onToggleBypass: () => void;
  onOpenParameters: () => void;
  onToggleMeterPanel?: () => void;   // Toggle meter panel expansion
  onSidechainConnect?: (busIndex: number) => void;  // Handle sidechain connection

  // Optional: Mini parameter display (top 2-3 parameters) and quick parameters
  keyParameters?: Array<{
    name: string;
    value: number;
    min: number;
    max: number;
  }>;
  quickParameters?: Array<{ name: string; symbol: string; value: number; min: number; max: number; index: number }>;
  onQuickParamChange?: (symbol: string, value: number, index: number) => void;
}

/**
 * Sidechain handle ID format for React Flow connections
 */
export const SIDECHAIN_HANDLE_PREFIX = 'sidechain-';

/**
 * Get sidechain handle ID for a specific bus
 */
export function getSidechainHandleId(busIndex: number): string {
  return `${SIDECHAIN_HANDLE_PREFIX}${busIndex}`;
}

/**
 * Check if a handle ID is a sidechain handle
 */
export function isSidechainHandle(handleId: string): boolean {
  return handleId.startsWith(SIDECHAIN_HANDLE_PREFIX);
}

/**
 * Extract bus index from sidechain handle ID
 */
export function getBusIndexFromHandle(handleId: string): number {
  return parseInt(handleId.replace(SIDECHAIN_HANDLE_PREFIX, ''), 10);
}

/**
 * Audio plugin node type
 */
export type AudioPluginNode = Node<AudioPluginNodeData, 'audioPlugin'>;

/**
 * Helper to create an audio plugin node
 */
export function createAudioPluginNode(
  id: string,
  data: AudioPluginNodeData,
  position?: { x: number; y: number }
): AudioPluginNode {
  return {
    id,
    type: 'audioPlugin',
    position: position || { x: 0, y: 0 },
    data,
  };
}
