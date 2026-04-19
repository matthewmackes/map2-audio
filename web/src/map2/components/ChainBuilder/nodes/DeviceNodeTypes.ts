// ============================================================================
// MAP2 Audio Platform - Device Node Type Definitions
// Lightweight nodes representing input/output devices in the chain
// ============================================================================

import { Node } from 'reactflow';

export type DeviceNodeKind = 'input' | 'output';

export interface DeviceNodeData {
  name: string;
  channels: number;
  kind: DeviceNodeKind;
  sampleRate?: number;
  bufferSize?: number;
  isRunning?: boolean;
  chainActive?: boolean;
}

export type DeviceNode = Node<DeviceNodeData, 'deviceNode'>;

export function createDeviceNode(
  id: string,
  data: DeviceNodeData,
  position: { x: number; y: number }
): DeviceNode {
  return {
    id,
    type: 'deviceNode',
    position,
    data,
    draggable: false,
  };
}
