/**
 * AVB Routing Matrix - Main Application Component
 *
 * Root component for the AVB routing matrix UI.
 * Provides layout structure and coordinates all sub-components.
 *
 * Usage:
 *   <RoutingProvider>
 *     <AvbRoutingApp />
 *   </RoutingProvider>
 */

import React from 'react';
import { Box, CircularProgress, Alert, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { RoutingProvider, useRoutingState } from './context/RoutingContext';
import { TopBar } from './components/TopBar/TopBar';
import { NodeTree } from './components/NodeTree/NodeTree';
import { RoutingGrid } from './components/RoutingGrid/RoutingGrid';
import { InspectorPanel } from './components/Inspector/InspectorPanel';

/**
 * Inner app component (wrapped by provider)
 */
function AvbRoutingAppInner() {
  const state = useRoutingState();
  const theme = useTheme();
  const isCompactLayout = useMediaQuery(theme.breakpoints.down('lg'));

  // Loading state
  if (state.loading && Object.keys(state.endpoints).length === 0) {
    return (
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <CircularProgress size={60} />
        <Typography variant="h6" color="text.secondary">
          Loading AVB routing matrix...
        </Typography>
        <Typography variant="body2" color="text.disabled">
          Discovering endpoints and connections
        </Typography>
      </Box>
    );
  }

  // Error state
  if (state.error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          <Typography variant="h6">AVB Routing Error</Typography>
          <Typography variant="body2">{state.error}</Typography>
        </Alert>
        <Typography variant="body2" color="text.secondary">
          Please check:
        </Typography>
        <ul style={{ marginTop: '8px' }}>
          <li>Backend API is running (http://localhost:8080)</li>
          <li>AVB is enabled in configuration</li>
          <li>Network interfaces are configured</li>
        </ul>
      </Box>
    );
  }

  // Main layout
  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
        overflow: 'hidden',
      }}
    >
      {/* Top toolbar */}
      <TopBar />

      {/* Main content area */}
      <Box
        sx={{
          display: 'flex',
          flex: 1,
          overflow: 'hidden',
          flexDirection: { xs: 'column', lg: 'row' },
          minHeight: 0,
        }}
      >
        {/* Node tree sidebar (left) */}
        <Box
          sx={{
            flex: isCompactLayout ? '0 0 auto' : undefined,
            minHeight: 0,
          }}
        >
          <NodeTree />
        </Box>

        {/* Routing grid (center) */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            position: 'relative',
            minHeight: 0,
            minWidth: 0,
          }}
        >
          <RoutingGrid />
        </Box>

        {/* Inspector panel (right) */}
        <Box
          sx={{
            flex: isCompactLayout ? '0 0 auto' : undefined,
            minHeight: 0,
          }}
        >
          <InspectorPanel />
        </Box>
      </Box>

      {/* Status bar (optional - can be added later) */}
      {state.safePatchMode && (
        <Box
          sx={{
            height: 40,
            bgcolor: 'warning.main',
            color: 'warning.contrastText',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
            px: 2,
          }}
        >
          <Typography variant="body2" fontWeight="bold">
            ⚠️ SAFE PATCH MODE ACTIVE
          </Typography>
          <Typography variant="body2">
            ({Object.keys(state.pendingRoutes).length} pending changes)
          </Typography>
        </Box>
      )}
    </Box>
  );
}

/**
 * Main export - wraps inner component with providers
 */
export function AvbRoutingApp() {
  return (
    <RoutingProvider>
      <AvbRoutingAppInner />
    </RoutingProvider>
  );
}

export default AvbRoutingApp;
