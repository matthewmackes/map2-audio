/**
 * Keyboard Navigation Hook
 *
 * Provides comprehensive keyboard navigation for the routing matrix.
 *
 * Features:
 * - Arrow keys: Navigate between cells
 * - Enter/Space: Toggle connection at focused cell
 * - Escape: Clear focus
 * - Ctrl+Z/Y: Undo/Redo
 * - Ctrl+S: Enter safe patch mode
 * - Tab: Move to next focusable element
 * - Home/End: Jump to first/last column
 * - PageUp/PageDown: Jump by 10 rows
 */

import { useEffect, useCallback, useRef } from 'react';
import { useRouting, useFilteredEndpoints } from '../context/RoutingContext';
import { usePatchMutation, useUnpatchMutation } from './useAvbApi';
import type { Endpoint } from '../types';

interface FocusedCell {
  talker_id: string;
  listener_id: string;
  talkerIndex: number;
  listenerIndex: number;
}

interface UseKeyboardNavigationOptions {
  enabled?: boolean;
  onCellFocus?: (talker_id: string, listener_id: string) => void;
  onCellBlur?: () => void;
}

/**
 * Keyboard navigation hook
 */
export function useKeyboardNavigation(options: UseKeyboardNavigationOptions = {}) {
  const { enabled = true, onCellFocus, onCellBlur } = options;
  const { state, dispatch } = useRouting();
  const talkers = useFilteredEndpoints('talker');
  const listeners = useFilteredEndpoints('listener');
  const patchMutation = usePatchMutation();
  const unpatchMutation = useUnpatchMutation();

  const focusedCellRef = useRef<FocusedCell | null>(null);

  /**
   * Set focused cell
   */
  const focusCell = useCallback(
    (talkerIndex: number, listenerIndex: number) => {
      if (talkerIndex < 0 || talkerIndex >= talkers.length) return;
      if (listenerIndex < 0 || listenerIndex >= listeners.length) return;

      const talker = talkers[talkerIndex];
      const listener = listeners[listenerIndex];

      focusedCellRef.current = {
        talker_id: talker.endpoint_id,
        listener_id: listener.endpoint_id,
        talkerIndex,
        listenerIndex,
      };

      // Update UI focus state
      dispatch({
        type: 'FOCUS_CELL',
        payload: { talker_id: talker.endpoint_id, listener_id: listener.endpoint_id },
      });

      onCellFocus?.(talker.endpoint_id, listener.endpoint_id);
    },
    [talkers, listeners, dispatch, onCellFocus]
  );

  /**
   * Clear focused cell
   */
  const blurCell = useCallback(() => {
    focusedCellRef.current = null;
    dispatch({ type: 'FOCUS_CELL', payload: null });
    onCellBlur?.();
  }, [dispatch, onCellBlur]);

  // Keep internal focus cursor aligned with reducer state and filtered endpoint banks.
  useEffect(() => {
    const focused = state.selection.focusedCell;
    if (!focused) {
      focusedCellRef.current = null;
      return;
    }

    const talkerIndex = talkers.findIndex((talker) => talker.endpoint_id === focused.talker_id);
    const listenerIndex = listeners.findIndex((listener) => listener.endpoint_id === focused.listener_id);

    if (talkerIndex < 0 || listenerIndex < 0) {
      focusedCellRef.current = null;
      dispatch({ type: 'FOCUS_CELL', payload: null });
      return;
    }

    focusedCellRef.current = {
      talker_id: focused.talker_id,
      listener_id: focused.listener_id,
      talkerIndex,
      listenerIndex,
    };
  }, [state.selection.focusedCell, talkers, listeners, dispatch]);

  /**
   * Toggle connection at focused cell
   */
  const toggleFocusedConnection = useCallback(() => {
    const focused = focusedCellRef.current;
    if (!focused) return;

    const route =
      state.liveRoutes[`${focused.talker_id}→${focused.listener_id}`] ||
      state.pendingRoutes[`${focused.talker_id}→${focused.listener_id}`];

    // If connected, disconnect
    if (route?.state === 'connected') {
      if (route.locked) {
        dispatch({
          type: 'SET_ERROR',
          payload: `Cannot disconnect locked route: ${route.id}`,
        });
        return;
      }

      if (state.safePatchMode) {
        dispatch({ type: 'UNPATCH', payload: { route_id: route.id } });
      } else {
        unpatchMutation.mutate({
          talker_id: focused.talker_id,
          listener_id: focused.listener_id,
        });
      }
      return;
    }

    // Otherwise, connect
    if (state.safePatchMode) {
      dispatch({
        type: 'PATCH',
        payload: { talker_id: focused.talker_id, listener_id: focused.listener_id },
      });
    } else {
      patchMutation.mutate({
        talker_id: focused.talker_id,
        listener_id: focused.listener_id,
      });
    }
  }, [state, dispatch, patchMutation, unpatchMutation]);

  /**
   * Keyboard event handler
   */
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      const focused = focusedCellRef.current;

      // Global shortcuts (work even without focused cell)
      if (event.ctrlKey || event.metaKey) {
        switch (event.key.toLowerCase()) {
          case 'z':
            event.preventDefault();
            if (event.shiftKey) {
              dispatch({ type: 'REDO' });
            } else {
              dispatch({ type: 'UNDO' });
            }
            return;

          case 'y':
            event.preventDefault();
            dispatch({ type: 'REDO' });
            return;

          case 's':
            event.preventDefault();
            if (!state.safePatchMode) {
              dispatch({ type: 'ENTER_SAFE_MODE' });
            }
            return;
        }
      }

      // Cell navigation (requires focused cell)
      if (!focused) {
        // If no cell focused, focus first cell on any arrow key
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
          event.preventDefault();
          focusCell(0, 0);
        }
        return;
      }

      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault();
          focusCell(focused.talkerIndex, focused.listenerIndex - 1);
          break;

        case 'ArrowDown':
          event.preventDefault();
          focusCell(focused.talkerIndex, focused.listenerIndex + 1);
          break;

        case 'ArrowLeft':
          event.preventDefault();
          focusCell(focused.talkerIndex - 1, focused.listenerIndex);
          break;

        case 'ArrowRight':
          event.preventDefault();
          focusCell(focused.talkerIndex + 1, focused.listenerIndex);
          break;

        case 'Home':
          event.preventDefault();
          if (event.ctrlKey) {
            // Ctrl+Home: Top-left cell
            focusCell(0, 0);
          } else {
            // Home: First column, same row
            focusCell(0, focused.listenerIndex);
          }
          break;

        case 'End':
          event.preventDefault();
          if (event.ctrlKey) {
            // Ctrl+End: Bottom-right cell
            focusCell(talkers.length - 1, listeners.length - 1);
          } else {
            // End: Last column, same row
            focusCell(talkers.length - 1, focused.listenerIndex);
          }
          break;

        case 'PageUp':
          event.preventDefault();
          focusCell(focused.talkerIndex, Math.max(0, focused.listenerIndex - 10));
          break;

        case 'PageDown':
          event.preventDefault();
          focusCell(focused.talkerIndex, Math.min(listeners.length - 1, focused.listenerIndex + 10));
          break;

        case 'Enter':
        case ' ':
          event.preventDefault();
          toggleFocusedConnection();
          break;

        case 'Escape':
          event.preventDefault();
          blurCell();
          break;
      }
    },
    [
      enabled,
      talkers.length,
      listeners.length,
      state.safePatchMode,
      dispatch,
      focusCell,
      blurCell,
      toggleFocusedConnection,
    ]
  );

  /**
   * Setup keyboard listeners
   */
  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, handleKeyDown]);

  return {
    focusedCell: focusedCellRef.current,
    focusCell: (talkerIndex: number, listenerIndex: number) => focusCell(talkerIndex, listenerIndex),
    blurCell,
    toggleConnection: toggleFocusedConnection,
  };
}

/**
 * Get focused cell state
 */
export function useFocusedCell() {
  const { state } = useRouting();
  return state.selection.focusedCell;
}

export default useKeyboardNavigation;
