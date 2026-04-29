/**
 * Routing Grid Component
 *
 * Main routing matrix view with virtualization for performance.
 * Displays talkers (columns) × listeners (rows) with connection status.
 *
 * Features:
 * - Virtualized rendering (react-window) for 100+ endpoints
 * - Sticky headers (talker/listener labels)
 * - Click-to-patch interaction
 * - Hover effects
 * - Responsive sizing
 */

// Routing Grid — main matrix view with virtualization. T2475 (E1)
// Carbon migration: Box → semantic divs, Typography → spans;
// per-cell visuals are owned by MatrixCell. Layout/info chrome
// styled via RoutingGrid.css.

import React, { useCallback, useMemo, useState } from 'react';
import AutoSizer from 'react-virtualized-auto-sizer';
import { FixedSizeGrid as Grid, type GridChildComponentProps } from 'react-window';
import { useRouting, useFilteredEndpoints } from '../../context/RoutingContext';
import { usePatchMutation, useUnpatchMutation, useBatchPatchMutation } from '../../hooks/useAvbApi';
import { useKeyboardNavigation, useFocusedCell } from '../../hooks/useKeyboardNavigation';
import { useNotifications } from '../../hooks/useNotifications';
import { useDragSelection } from '../../hooks/useDragSelection';
import { MatrixCell } from './MatrixCell';
import { StickyHeaders } from './StickyHeaders';
import { ConnectionHighlight } from './ConnectionHighlight';
import { CrosshairOverlay } from './CrosshairOverlay';
import { SelectionOverlay } from './SelectionOverlay';
import { BatchActionsBar } from './BatchActionsBar';
import './RoutingGrid.css';

const CELL_WIDTH = 60;
const CELL_HEIGHT = 50;
const HEADER_HEIGHT = 60;
const HEADER_WIDTH = 200;

/**
 * Main routing grid component
 */
export function RoutingGrid() {
  const { state, dispatch } = useRouting();
  const talkers = useFilteredEndpoints('talker');
  const listeners = useFilteredEndpoints('listener');

  const patchMutation = usePatchMutation();
  const unpatchMutation = useUnpatchMutation();
  const batchPatchMutation = useBatchPatchMutation();
  const notify = useNotifications();

  // Batch operations loading state
  const [isBatchLoading, setIsBatchLoading] = useState(false);

  // Keyboard navigation
  useKeyboardNavigation({ enabled: true });
  const focusedCell = useFocusedCell();

  // Drag selection
  const dragSelection = useDragSelection();

  // Get focused cell indices for highlighting
  const focusedIndices = useMemo(() => {
    if (!focusedCell) return { talkerIndex: null, listenerIndex: null };
    const talkerIndex = talkers.findIndex(t => t.endpoint_id === focusedCell.talker_id);
    const listenerIndex = listeners.findIndex(l => l.endpoint_id === focusedCell.listener_id);
    return {
      talkerIndex: talkerIndex >= 0 ? talkerIndex : null,
      listenerIndex: listenerIndex >= 0 ? listenerIndex : null,
    };
  }, [focusedCell, talkers, listeners]);

  // Get hovered cell indices for crosshair overlay
  const hoveredIndices = useMemo(() => {
    const hoveredCell = state.selection.hoveredCell;
    if (!hoveredCell) return { talkerIndex: null, listenerIndex: null };
    const talkerIndex = talkers.findIndex(t => t.endpoint_id === hoveredCell.talker_id);
    const listenerIndex = listeners.findIndex(l => l.endpoint_id === hoveredCell.listener_id);
    return {
      talkerIndex: talkerIndex >= 0 ? talkerIndex : null,
      listenerIndex: listenerIndex >= 0 ? listenerIndex : null,
    };
  }, [state.selection.hoveredCell, talkers, listeners]);

  const getEndpointLabel = useCallback(
    (endpointId: string): string => {
      return state.endpoints[endpointId]?.device_name || endpointId;
    },
    [state.endpoints]
  );

  const getRouteNodeId = useCallback(
    (talkerId: string, listenerId: string): string | null => {
      const routeId = `${talkerId}→${listenerId}`;
      const route = state.liveRoutes[routeId] || state.pendingRoutes[routeId];
      return route?.talker_node_id || state.endpoints[talkerId]?.node_id || state.endpoints[listenerId]?.node_id || null;
    },
    [state.endpoints, state.liveRoutes, state.pendingRoutes]
  );

  // Handle cell click (patch/unpatch)
  const handleCellClick = useCallback(
    (talker_id: string, listener_id: string) => {
      const talkerLabel = getEndpointLabel(talker_id);
      const listenerLabel = getEndpointLabel(listener_id);
      const route = state.liveRoutes[`${talker_id}→${listener_id}`] ||
                    state.pendingRoutes[`${talker_id}→${listener_id}`];

      // If already connected, disconnect
      if (route?.state === 'connected') {
        if (route.locked) {
          dispatch({
            type: 'SET_ERROR',
            payload: `Cannot disconnect locked route: ${route.id}`,
          });
          notify.warning(`Route is locked: ${talkerLabel} -> ${listenerLabel}`);
          return;
        }

        if (state.safePatchMode) {
          dispatch({ type: 'UNPATCH', payload: { route_id: route.id } });
          notify.info(`Staged disconnect: ${talkerLabel} -> ${listenerLabel}`);
        } else {
          unpatchMutation.mutate(
            { talker_id, listener_id, node_id: getRouteNodeId(talker_id, listener_id) },
            {
              onSuccess: () => {
                notify.success(`Disconnected: ${talkerLabel} -> ${listenerLabel}`);
              },
              onError: (error) => {
                const message = error instanceof Error ? error.message : 'Disconnection failed';
                dispatch({ type: 'SET_ERROR', payload: message });
                notify.error(`Disconnect failed: ${message}`);
              },
            }
          );
        }
        return;
      }

      // Otherwise, connect
      if (state.safePatchMode) {
        dispatch({ type: 'PATCH', payload: { talker_id, listener_id } });
        notify.info(`Staged connect: ${talkerLabel} -> ${listenerLabel}`);
      } else {
        patchMutation.mutate(
          { talker_id, listener_id, node_id: getRouteNodeId(talker_id, listener_id) },
          {
            onSuccess: () => {
              notify.success(`Connected: ${talkerLabel} -> ${listenerLabel}`);
            },
            onError: (error) => {
              const message = error instanceof Error ? error.message : 'Connection failed';
              dispatch({ type: 'SET_ERROR', payload: message });
              notify.error(`Connect failed: ${message}`);
            },
          }
        );
      }
    },
    [state.liveRoutes, state.pendingRoutes, state.safePatchMode, dispatch, patchMutation, unpatchMutation, notify, getEndpointLabel, getRouteNodeId]
  );

  // Handle cell hover
  const handleCellHover = useCallback(
    (talker_id: string | null, listener_id: string | null) => {
      dispatch({
        type: 'HOVER_CELL',
        payload: talker_id && listener_id ? { talker_id, listener_id } : null,
      });
    },
    [dispatch]
  );

  // Handle batch connect all selected
  const handleBatchConnectAll = useCallback(async () => {
    const selectedCells = dragSelection.getSelectedCells();
    if (selectedCells.length === 0) return;

    setIsBatchLoading(true);

    try {
      // Build list of connections to create
      const connections = selectedCells
        .map((cell) => {
          const talker = talkers[cell.col];
          const listener = listeners[cell.row];
          if (!talker || !listener) return null;

          // Skip if already connected
          const existingRoute =
            state.liveRoutes[`${talker.endpoint_id}→${listener.endpoint_id}`];
          if (existingRoute?.state === 'connected') return null;

          return {
            talker_id: talker.endpoint_id,
            listener_id: listener.endpoint_id,
            node_id: talker.node_id || listener.node_id || null,
          };
        })
        .filter((conn): conn is { talker_id: string; listener_id: string; node_id: string | null } => conn !== null);

      if (connections.length === 0) {
        notify.info('All selected cells are already connected');
        setIsBatchLoading(false);
        return;
      }

      const operations = connections.map((connection) => ({
        ...connection,
        action: 'connect' as const,
      }));

      // Execute batch operation
      await batchPatchMutation.mutateAsync(
        operations,
        {
          onSuccess: () => {
            notify.success(`Successfully connected ${connections.length} route${connections.length === 1 ? '' : 's'}`);
            dragSelection.clearSelection();
          },
          onError: (error) => {
            const message = error instanceof Error ? error.message : 'Batch connect failed';
            dispatch({ type: 'SET_ERROR', payload: message });
            notify.error(`Batch connect failed: ${message}`);
          },
        }
      );
    } finally {
      setIsBatchLoading(false);
    }
  }, [dragSelection, talkers, listeners, state.liveRoutes, batchPatchMutation, notify, dispatch]);

  // Handle batch disconnect all selected
  const handleBatchDisconnectAll = useCallback(async () => {
    const selectedCells = dragSelection.getSelectedCells();
    if (selectedCells.length === 0) return;

    setIsBatchLoading(true);

    try {
      // Build list of connections to disconnect
      const disconnections = selectedCells
        .map((cell) => {
          const talker = talkers[cell.col];
          const listener = listeners[cell.row];
          if (!talker || !listener) return null;

          // Only disconnect if there's an active connection
          const existingRoute =
            state.liveRoutes[`${talker.endpoint_id}→${listener.endpoint_id}`];
          if (!existingRoute || existingRoute.state !== 'connected') return null;

          // Check if locked
          if (existingRoute.locked) {
            notify.warning(`Skipping locked route: ${getEndpointLabel(talker.endpoint_id)} -> ${getEndpointLabel(listener.endpoint_id)}`);
            return null;
          }

          return {
            talker_id: talker.endpoint_id,
            listener_id: listener.endpoint_id,
            node_id: existingRoute.talker_node_id || talker.node_id || listener.node_id || null,
          };
        })
        .filter((conn): conn is { talker_id: string; listener_id: string; node_id: string | null } => conn !== null);

      if (disconnections.length === 0) {
        notify.info('No connected routes to disconnect in selection');
        setIsBatchLoading(false);
        return;
      }

      // Execute batch disconnections (one at a time for now, since we don't have batch unpatch)
      let successCount = 0;
      let failCount = 0;

      for (const { talker_id, listener_id, node_id } of disconnections) {
        try {
          await unpatchMutation.mutateAsync({ talker_id, listener_id, node_id });
          successCount++;
        } catch (error) {
          failCount++;
          console.error('Failed to disconnect:', talker_id, listener_id, error);
        }
      }

      if (successCount > 0) {
        notify.success(`Successfully disconnected ${successCount} route${successCount === 1 ? '' : 's'}`);
      }
      if (failCount > 0) {
        notify.error(`Failed to disconnect ${failCount} route${failCount === 1 ? '' : 's'}`);
      }

      dragSelection.clearSelection();
    } finally {
      setIsBatchLoading(false);
    }
  }, [dragSelection, talkers, listeners, state.liveRoutes, unpatchMutation, notify, getEndpointLabel]);

  // Grid cell renderer
  const Cell = useCallback(
    ({ columnIndex, rowIndex, style }: GridChildComponentProps) => {
      const talker = talkers[columnIndex];
      const listener = listeners[rowIndex];

      if (!talker || !listener) {
        return <div style={style} />;
      }

      const route =
        state.liveRoutes[`${talker.endpoint_id}→${listener.endpoint_id}`] ||
        state.pendingRoutes[`${talker.endpoint_id}→${listener.endpoint_id}`] ||
        null;

      const isPending = !!state.pendingRoutes[`${talker.endpoint_id}→${listener.endpoint_id}`];
      const isHovered =
        state.selection.hoveredCell?.talker_id === talker.endpoint_id &&
        state.selection.hoveredCell?.listener_id === listener.endpoint_id;
      const isFocused =
        state.selection.focusedCell?.talker_id === talker.endpoint_id &&
        state.selection.focusedCell?.listener_id === listener.endpoint_id;
      const isSelected = dragSelection.isCellSelected(rowIndex, columnIndex);

      return (
        <div style={style}>
          <MatrixCell
            talker={talker}
            listener={listener}
            route={route}
            isPending={isPending}
            isHovered={isHovered}
            isFocused={isFocused}
            isSelected={isSelected}
            onClick={() => handleCellClick(talker.endpoint_id, listener.endpoint_id)}
            onHover={(hover) =>
              handleCellHover(
                hover ? talker.endpoint_id : null,
                hover ? listener.endpoint_id : null
              )
            }
            onMouseDown={(e) => dragSelection.handleMouseDown(rowIndex, columnIndex, e)}
            onMouseMove={() => dragSelection.handleMouseMove(rowIndex, columnIndex)}
          />
        </div>
      );
    },
    [talkers, listeners, state.liveRoutes, state.pendingRoutes, state.selection.hoveredCell, state.selection.focusedCell, handleCellClick, handleCellHover, dragSelection]
  );

  // Empty state
  if (talkers.length === 0 || listeners.length === 0) {
    return (
      <div className="routing-grid__empty">
        <span className="routing-grid__empty-title">No Endpoints Available</span>
        <span className="routing-grid__empty-detail">
          {talkers.length === 0 && 'No talkers discovered'}
          {listeners.length === 0 && talkers.length > 0 && 'No listeners discovered'}
        </span>
        <span className="routing-grid__empty-caption">
          Waiting for AVB endpoint discovery...
        </span>
      </div>
    );
  }

  // Main render
  return (
    <div className="routing-grid">
      {/* Crosshair overlay for hovered cell */}
      <CrosshairOverlay
        columnIndex={hoveredIndices.talkerIndex}
        rowIndex={hoveredIndices.listenerIndex}
        cellWidth={CELL_WIDTH}
        cellHeight={CELL_HEIGHT}
        headerWidth={HEADER_WIDTH}
        headerHeight={HEADER_HEIGHT}
        totalColumns={talkers.length}
        totalRows={listeners.length}
      />

      {/* Selection overlay for drag-selected cells */}
      <SelectionOverlay
        selectionRect={dragSelection.selectionRect}
        cellWidth={CELL_WIDTH}
        cellHeight={CELL_HEIGHT}
        headerWidth={HEADER_WIDTH}
        headerHeight={HEADER_HEIGHT}
        selectedCount={dragSelection.selectedCells.length}
      />

      {/* Sticky headers */}
      <StickyHeaders
        talkers={talkers}
        listeners={listeners}
        cellWidth={CELL_WIDTH}
        cellHeight={CELL_HEIGHT}
        headerWidth={HEADER_WIDTH}
        headerHeight={HEADER_HEIGHT}
      />

      {/* Virtualized grid */}
      <div
        className="routing-grid__virtual"
        style={{
          top: HEADER_HEIGHT,
          left: HEADER_WIDTH,
        }}
      >
        <AutoSizer>
          {({ height, width }) => (
            <>
              {/* Connection highlight overlay */}
              <ConnectionHighlight
                talkerIndex={focusedIndices.talkerIndex}
                listenerIndex={focusedIndices.listenerIndex}
                cellWidth={CELL_WIDTH}
                cellHeight={CELL_HEIGHT}
                headerWidth={HEADER_WIDTH}
                headerHeight={HEADER_HEIGHT}
                gridWidth={width + HEADER_WIDTH}
                gridHeight={height + HEADER_HEIGHT}
              />
              <Grid
                columnCount={talkers.length}
                columnWidth={CELL_WIDTH}
                height={height}
                rowCount={listeners.length}
                rowHeight={CELL_HEIGHT}
                width={width}
                overscanRowCount={5}
                overscanColumnCount={5}
              >
                {Cell}
              </Grid>
            </>
          )}
        </AutoSizer>
      </div>

      {/* Grid info overlay (bottom right) */}
      <div className="routing-grid__info">
        <span className="routing-grid__info-text">
          {talkers.length} talkers × {listeners.length} listeners
        </span>
      </div>

      {/* Batch actions bar */}
      <BatchActionsBar
        selectedCount={dragSelection.selectedCells.length}
        onConnectAll={handleBatchConnectAll}
        onDisconnectAll={handleBatchDisconnectAll}
        onClearSelection={dragSelection.clearSelection}
        isLoading={isBatchLoading}
      />
    </div>
  );
}

export default RoutingGrid;
