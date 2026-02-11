// ============================================================================
// MAP2 Audio Platform - useFlowSync Hook
// Real-time synchronization between React Flow and backend
// ============================================================================

import { useEffect, useCallback, useRef } from 'react';
import { useChainUpdates } from '../../../hooks/useWebSocket';
import { AudioPluginNode } from '../nodes/AudioPluginNodeTypes';
import { flowToChainOrder } from '../utils/flowToChain';

export interface UseFlowSyncOptions {
  chainId: number;
  nodes: AudioPluginNode[];
  onReorderPlugins: (orderedUris: string[]) => Promise<void>;
  onReloadChain: () => Promise<void>;
}

/**
 * Hook for syncing React Flow with backend and WebSocket updates
 */
export function useFlowSync({
  chainId,
  nodes,
  onReorderPlugins,
  onReloadChain,
}: UseFlowSyncOptions) {
  const { lastEvent } = useChainUpdates();
  const previousOrderRef = useRef<string[]>([]);
  const isDraggingRef = useRef(false);

  // Track current plugin order
  useEffect(() => {
    const currentOrder = flowToChainOrder(nodes);
    previousOrderRef.current = currentOrder;
  }, [nodes]);

  // Handle WebSocket updates
  useEffect(() => {
    if (!lastEvent || isDraggingRef.current) return;

    const handleEvent = async () => {
      switch (lastEvent.type) {
        case 'chain_update':
        case 'plugin_added':
        case 'plugin_removed':
          // Reload entire chain
          await onReloadChain();
          break;

        case 'plugin_bypassed':
          // Could update just the node data, but reload is safer
          await onReloadChain();
          break;

        case 'parameter_changed':
          // Parameter changes don't affect flow structure
          // Could update mini-parameter display if needed
          break;

        default:
          break;
      }
    };

    handleEvent();
  }, [lastEvent, onReloadChain]);

  // Detect order changes and sync to backend
  const syncOrderToBackend = useCallback(
    async (updatedNodes: AudioPluginNode[]) => {
      const newOrder = flowToChainOrder(updatedNodes);
      const previousOrder = previousOrderRef.current;

      // Check if order actually changed
      if (
        newOrder.length === previousOrder.length &&
        newOrder.every((uri, idx) => uri === previousOrder[idx])
      ) {
        return; // No change
      }

      // Update backend
      try {
        await onReorderPlugins(newOrder);
        previousOrderRef.current = newOrder;
      } catch (error) {
        console.error('Failed to sync order to backend:', error);
        // Revert by reloading from backend
        await onReloadChain();
      }
    },
    [onReorderPlugins, onReloadChain]
  );

  // Drag state tracking
  const setIsDragging = useCallback((dragging: boolean) => {
    isDraggingRef.current = dragging;
  }, []);

  return {
    syncOrderToBackend,
    setIsDragging,
  };
}
