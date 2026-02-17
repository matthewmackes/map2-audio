/**
 * Inspector Panel Component
 *
 * Right sidebar showing details about selected endpoints and routes.
 * Displays connection status, validation warnings, and actions.
 */

import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Divider,
  List,
  ListItem,
  ListItemText,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import { useRoutingState } from '../../context/RoutingContext';

const PANEL_WIDTH = 300;

/**
 * Inspector panel component
 */
export function InspectorPanel() {
  const state = useRoutingState();
  const { view_mode, current_node_id, selected_node_ids } = state.network.nodeSelection;

  const selectedEndpointIds = state.selection.selectedEndpoints;
  const selectedRouteIds = state.selection.selectedRoutes;
  const hoveredCell = state.selection.hoveredCell;

  const isNodeInActiveContext = (nodeId: string | undefined): boolean => {
    if (!nodeId) return false;

    if (view_mode === 'single_node' && current_node_id) {
      return nodeId === current_node_id;
    }

    if (view_mode === 'multi_select' && selected_node_ids.length > 0) {
      return selected_node_ids.includes(nodeId);
    }

    return true;
  };

  const isEndpointInActiveContext = (endpoint: any): boolean => {
    if (!endpoint) return false;
    return isNodeInActiveContext(endpoint.node_id);
  };

  const isRouteInActiveContext = (route: any): boolean => {
    if (!route) return false;

    const talkerNodeId = state.endpoints[route.talker_id]?.node_id || route.talker_node_id;
    const listenerNodeId = state.endpoints[route.listener_id]?.node_id || route.listener_node_id;

    if (view_mode === 'single_node' && current_node_id) {
      return talkerNodeId === current_node_id || listenerNodeId === current_node_id;
    }

    if (view_mode === 'multi_select' && selected_node_ids.length > 0) {
      return (talkerNodeId ? selected_node_ids.includes(talkerNodeId) : false) ||
        (listenerNodeId ? selected_node_ids.includes(listenerNodeId) : false);
    }

    return true;
  };

  // Get selected endpoint
  const selectedEndpointCandidate = selectedEndpointIds.length === 1
    ? state.endpoints[selectedEndpointIds[0]]
    : null;
  const selectedEndpoint = isEndpointInActiveContext(selectedEndpointCandidate)
    ? selectedEndpointCandidate
    : null;

  // Get selected route
  const selectedRouteCandidate = selectedRouteIds.length === 1
    ? (state.liveRoutes[selectedRouteIds[0]] || state.pendingRoutes[selectedRouteIds[0]])
    : null;
  const selectedRoute = isRouteInActiveContext(selectedRouteCandidate)
    ? selectedRouteCandidate
    : null;

  // Get hovered route
  const hoveredRouteCandidate = hoveredCell
    ? (state.liveRoutes[`${hoveredCell.talker_id}→${hoveredCell.listener_id}`] ||
       state.pendingRoutes[`${hoveredCell.talker_id}→${hoveredCell.listener_id}`])
    : null;
  const hoveredRoute = isRouteInActiveContext(hoveredRouteCandidate)
    ? hoveredRouteCandidate
    : null;

  const displayRoute = selectedRoute || hoveredRoute;

  return (
    <Paper
      elevation={2}
      sx={{
        width: PANEL_WIDTH,
        minWidth: PANEL_WIDTH,
        maxWidth: PANEL_WIDTH,
        height: '100%',
        overflow: 'auto',
        borderRadius: 0,
        borderLeft: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          Inspector
        </Typography>

        {/* Selected Endpoint */}
        {selectedEndpoint && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Selected Endpoint
            </Typography>
            <EndpointInfo endpoint={selectedEndpoint} />
          </>
        )}

        {/* Route Details */}
        {displayRoute && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              {selectedRoute ? 'Selected Route' : 'Hovered Route'}
            </Typography>
            <RouteInfo route={displayRoute} endpoints={state.endpoints} />
          </>
        )}

        {/* Empty state */}
        {!selectedEndpoint && !displayRoute && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="body2" color="text.disabled">
              Click an endpoint or route to see details
            </Typography>
          </Box>
        )}

        {/* Connection Statistics */}
        <Divider sx={{ my: 1.5 }} />
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Statistics
        </Typography>
        <List dense>
          <ListItem>
            <ListItemText
              primary="Total Endpoints"
              secondary={Object.keys(state.endpoints).length}
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Active Connections"
              secondary={Object.values(state.liveRoutes).filter(r => r.state === 'connected').length}
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Pending Changes"
              secondary={Object.keys(state.pendingRoutes).length}
            />
          </ListItem>
        </List>
      </Box>
    </Paper>
  );
}

/**
 * Endpoint information display
 */
function EndpointInfo({ endpoint }: { endpoint: any }) {
  return (
    <List dense>
      <ListItem>
        <ListItemText primary="Name" secondary={endpoint.device_name} />
      </ListItem>
      <ListItem>
        <ListItemText primary="Type" secondary={endpoint.device_type.toUpperCase()} />
      </ListItem>
      <ListItem>
        <ListItemText primary="Direction" secondary={endpoint.direction} />
      </ListItem>
      <ListItem>
        <ListItemText
          primary="Format"
          secondary={`${endpoint.channels}ch @ ${endpoint.sample_rate / 1000}kHz`}
        />
      </ListItem>
      <ListItem>
        <ListItemText
          primary="Status"
          secondary={
            <Chip
              label={endpoint.available ? 'Available' : 'Offline'}
              size="small"
              color={endpoint.available ? 'success' : 'error'}
            />
          }
          secondaryTypographyProps={{
            component: 'div',
          }}
        />
      </ListItem>
      {endpoint.mac_address && (
        <ListItem>
          <ListItemText primary="MAC Address" secondary={endpoint.mac_address} />
        </ListItem>
      )}
      {endpoint.tags.length > 0 && (
        <ListItem>
          <ListItemText
            primary="Tags"
            secondary={endpoint.tags.join(', ')}
          />
        </ListItem>
      )}
    </List>
  );
}

/**
 * Route information display
 */
function RouteInfo({ route, endpoints }: { route: any; endpoints: Record<string, any> }) {
  const talker = endpoints[route.talker_id];
  const listener = endpoints[route.listener_id];

  const getStateColor = (state: string) => {
    switch (state) {
      case 'connected': return 'success';
      case 'connecting': return 'info';
      case 'disconnecting': return 'warning';
      case 'error': return 'error';
      default: return 'default';
    }
  };

  return (
    <List dense>
      <ListItem>
        <ListItemText
          primary="Talker"
          secondary={talker?.device_name || route.talker_id}
        />
      </ListItem>
      <ListItem>
        <ListItemText
          primary="Listener"
          secondary={listener?.device_name || route.listener_id}
        />
      </ListItem>
      <ListItem>
        <ListItemText
          primary="State"
          secondary={
            <Chip
              label={route.state}
              size="small"
              color={getStateColor(route.state)}
            />
          }
          secondaryTypographyProps={{
            component: 'div',
          }}
        />
      </ListItem>
      {route.established_time && (
        <ListItem>
          <ListItemText
            primary="Connected At"
            secondary={new Date(route.established_time).toLocaleString()}
          />
        </ListItem>
      )}
      {route.error_message && (
        <ListItem>
          <ListItemText
            primary="Error"
            secondary={route.error_message}
            secondaryTypographyProps={{ color: 'error' }}
          />
        </ListItem>
      )}
      {route.locked && (
        <ListItem>
          <ListItemText
            primary="Locked"
            secondary={route.lock_reason || 'Protected route'}
            secondaryTypographyProps={{ color: 'warning.main' }}
          />
        </ListItem>
      )}
      {route.srp_reservation_id && (
        <ListItem>
          <ListItemText
            primary="SRP Reservation"
            secondary={route.srp_reservation_id}
          />
        </ListItem>
      )}
    </List>
  );
}

export default InspectorPanel;
