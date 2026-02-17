/**
 * AVB Routing Matrix - Main Export
 *
 * Central export point for the AVB routing matrix module.
 */

// Main app component
export { AvbRoutingApp, default as default } from './AvbRoutingApp';

// Context and hooks
export {
  RoutingProvider,
  useRouting,
  useRoutingState,
  useRoutingDispatch,
  useFilteredEndpoints,
  useRoute,
  useCanUndo,
  useCanRedo,
  useAuditLog,
} from './context/RoutingContext';

// API hooks
export {
  useEndpoints,
  useConnections,
  useRoutingMatrix,
  useRouterStats,
  usePatchMutation,
  useUnpatchMutation,
  useBatchPatchMutation,
  optimisticallyUpdateConnection,
  usePrefetchEndpoints,
} from './hooks/useAvbApi';

// Feature hooks
export {
  useKeyboardNavigation,
  useFocusedCell,
} from './hooks/useKeyboardNavigation';
export { useNotifications } from './hooks/useNotifications';
export {
  useDragSelection,
  type DragSelectionState,
  type DragSelectionHandlers,
  type DragSelectionReturn,
  type CellPosition,
  type SelectionRect,
} from './hooks/useDragSelection';

// Multi-Node hooks
export {
  useNodes,
  useNode,
  usePtpStatus,
  useNetworkTopology,
  useLocalNodeId,
  useOnlineNodes,
  useOfflineNodes,
  useNodesByType,
  useUpdateNodeMetadata,
} from './hooks/useNodeApi';

// Types
export type * from './types';

// Components (for advanced usage)
export { RoutingGrid } from './components/RoutingGrid/RoutingGrid';
export { MatrixCell } from './components/RoutingGrid/MatrixCell';
export { StickyHeaders } from './components/RoutingGrid/StickyHeaders';
export { ConnectionHighlight } from './components/RoutingGrid/ConnectionHighlight';
export { CrosshairOverlay } from './components/RoutingGrid/CrosshairOverlay';
export { SelectionOverlay } from './components/RoutingGrid/SelectionOverlay';
export { TopBar } from './components/TopBar/TopBar';
export { NodeSelector } from './components/TopBar/NodeSelector';
export { NodeTree } from './components/NodeTree/NodeTree';
export { InspectorPanel } from './components/Inspector/InspectorPanel';
export { NetworkTopologyModal } from './components/NetworkTopology/NetworkTopologyModal';
