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

import React, { useCallback, useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import AutoSizer from 'react-virtualized-auto-sizer';
import { FixedSizeGrid as Grid, type GridChildComponentProps } from 'react-window';
import { useRouting, useFilteredEndpoints } from '../../context/RoutingContext';
import { usePatchMutation, useUnpatchMutation } from '../../hooks/useAvbApi';
import { useKeyboardNavigation, useFocusedCell } from '../../hooks/useKeyboardNavigation';
import { useNotifications } from '../../hooks/useNotifications';
import { MatrixCell } from './MatrixCell';
import { StickyHeaders } from './StickyHeaders';
import { ConnectionHighlight } from './ConnectionHighlight';

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
  const notify = useNotifications();

  // Keyboard navigation
  useKeyboardNavigation({ enabled: true });
  const focusedCell = useFocusedCell();

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

  const getEndpointLabel = useCallback(
    (endpointId: string): string => {
      return state.endpoints[endpointId]?.device_name || endpointId;
    },
    [state.endpoints]
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
            { talker_id, listener_id },
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
          { talker_id, listener_id },
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
    [state.liveRoutes, state.pendingRoutes, state.safePatchMode, dispatch, patchMutation, unpatchMutation, notify, getEndpointLabel]
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

      return (
        <div style={style}>
          <MatrixCell
            talker={talker}
            listener={listener}
            route={route}
            isPending={isPending}
            isHovered={isHovered}
            isFocused={isFocused}
            onClick={() => handleCellClick(talker.endpoint_id, listener.endpoint_id)}
            onHover={(hover) =>
              handleCellHover(
                hover ? talker.endpoint_id : null,
                hover ? listener.endpoint_id : null
              )
            }
          />
        </div>
      );
    },
    [talkers, listeners, state.liveRoutes, state.pendingRoutes, state.selection.hoveredCell, state.selection.focusedCell, handleCellClick, handleCellHover]
  );

  // Empty state
  if (talkers.length === 0 || listeners.length === 0) {
    return (
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 2,
          p: 4,
        }}
      >
        <Typography variant="h5" color="text.secondary">
          No Endpoints Available
        </Typography>
        <Typography variant="body2" color="text.disabled">
          {talkers.length === 0 && 'No talkers discovered'}
          {listeners.length === 0 && talkers.length > 0 && 'No listeners discovered'}
        </Typography>
        <Typography variant="caption" color="text.disabled">
          Waiting for AVB endpoint discovery...
        </Typography>
      </Box>
    );
  }

  // Main render
  return (
    <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
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
      <Box
        sx={{
          position: 'absolute',
          top: HEADER_HEIGHT,
          left: HEADER_WIDTH,
          right: 0,
          bottom: 0,
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
      </Box>

      {/* Grid info overlay (bottom right) */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          bgcolor: 'background.paper',
          borderRadius: 1,
          px: 2,
          py: 1,
          boxShadow: 1,
        }}
      >
        <Typography variant="caption" color="text.secondary">
          {talkers.length} talkers × {listeners.length} listeners
        </Typography>
      </Box>
    </Box>
  );
}

export default RoutingGrid;
