// @ts-nocheck
// ============================================================================
// MAP2 Audio Platform - ChainBuilder Module Exports
// Re-exports for backward compatibility and new JUCE integration features
// ============================================================================

// Components
export { default as ChainFlowCanvas } from './ChainFlowCanvas';
export { default as AudioPluginNode } from './nodes/AudioPluginNode';
export { default as DeviceNode } from './nodes/DeviceNode';
export { default as RoutingNode } from './nodes/RoutingNode';
export { default as PluginMeterPanel } from './nodes/PluginMeterPanel';
export { default as AudioConnectionEdge } from './edges/AudioConnectionEdge';
export { default as SidechainConnectionEdge } from './edges/SidechainConnectionEdge';
export { default as LatencyOverlay } from './panels/LatencyOverlay';
export { default as SnapshotBar } from './panels/SnapshotBar';

// Node Types
export type { AudioPluginNodeData, AudioPluginNode as AudioPluginNodeType } from './nodes/AudioPluginNodeTypes';
export { getSidechainHandleId, isSidechainHandle, getBusIndexFromHandle, SIDECHAIN_HANDLE_PREFIX } from './nodes/AudioPluginNodeTypes';
export type { DeviceNode, DeviceNodeData, DeviceNodeKind } from './nodes/DeviceNodeTypes';
export type { RoutingNode, RoutingNodeData, RoutingNodeKind } from './nodes/RoutingNodeTypes';
export { createRoutingNode, createSplitNode, createBlendNode } from './nodes/RoutingNodeTypes';

// Edge Types
export type { AudioConnectionEdgeData, AudioConnectionEdge as AudioConnectionEdgeType } from './edges/AudioConnectionEdgeTypes';
export type { SidechainConnectionEdgeData, SidechainConnectionEdge as SidechainConnectionEdgeType } from './edges/SidechainConnectionEdgeTypes';
export { createSidechainConnectionEdge, isSidechainEdge } from './edges/SidechainConnectionEdgeTypes';

// Flow Utilities
export type { FlowCallbacks, ChainFlowData } from './utils/chainToFlow';
export { chainToFlow, hasSavedPositions } from './utils/chainToFlow';
export type { ABFlowCallbacks, ABFlowData, ABFlowNode } from './utils/chainToABFlow';
export { chainToABFlow } from './utils/chainToABFlow';
export { flowToChainOrder, getPluginPosition, hasOrderChanged } from './utils/flowToChain';
export { saveNodePositions, loadNodePositions, clearNodePositions } from './utils/positionStorage';
export { autoLayoutNodes, relayoutNodes, defaultLayoutConfig } from './layout/autoLayout';

// Hooks
export { useChainFlow } from './hooks/useChainFlow';
export { useSidechainConnections } from './hooks/useSidechainConnections';
export { usePluginMeters } from './hooks/usePluginMeters';
export type { SidechainConnection, SidechainAPI, PluginInfo } from './hooks/useSidechainConnections';
export type { PluginMetersState, UsePluginMetersOptions, UsePluginMetersReturn } from './hooks/usePluginMeters';
export type { PluginMeterData, PluginMeterPanelProps } from './nodes/PluginMeterPanel';
export type { PluginLatencyInfo, LatencyOverlayProps } from './panels/LatencyOverlay';
export type { Snapshot, SnapshotBarProps } from './panels/SnapshotBar';
