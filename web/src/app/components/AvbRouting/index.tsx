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

// Types
export type * from './types';

// Components (for advanced usage)
export { RoutingGrid } from './components/RoutingGrid/RoutingGrid';
export { MatrixCell } from './components/RoutingGrid/MatrixCell';
export { StickyHeaders } from './components/RoutingGrid/StickyHeaders';
export { ConnectionHighlight } from './components/RoutingGrid/ConnectionHighlight';
export { TopBar } from './components/TopBar/TopBar';
export { InspectorPanel } from './components/Inspector/InspectorPanel';
