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
import { useAvbDevices, useAvbStreams } from '../../hooks/useAvbApi';
import type { AvbDiscoveredDevice, AvbStreamPayload } from '../../types';
import { getRouteStreams } from '../../utils/avbRouteStreams';
import { resolveAvbHostLabel } from '../../utils/avbHost';

const PANEL_WIDTH = 300;

/**
 * Inspector panel component
 */
export function InspectorPanel() {
  const state = useRoutingState();
  const { data: avbDevicesData } = useAvbDevices();
  const { data: avbStreamsData } = useAvbStreams();
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
  const discoveredDevices = avbDevicesData?.discovered_devices || [];
  const discoveredDevicesByEndpointId = new Map<string, AvbDiscoveredDevice>(
    discoveredDevices.map((device) => [device.endpoint_id, device])
  );
  const selectedEndpointDiscoveredDevice = selectedEndpoint
    ? discoveredDevicesByEndpointId.get(selectedEndpoint.endpoint_id)
    : null;
  const endpointIds = Object.keys(state.endpoints);
  const missingFromEngineCache = endpointIds.filter(
    (endpointId) => !discoveredDevicesByEndpointId.has(endpointId)
  ).length;
  const engineCacheOrphans = discoveredDevices.filter(
    (device) => !state.endpoints[device.endpoint_id]
  ).length;
  const streamPayloads = avbStreamsData?.streams || [];
  const transportReadyStreams = streamPayloads.filter((stream) => stream.health?.ready).length;
  const transportIssueStreams = streamPayloads.filter((stream) => (
    stream.state === 'error' || (stream.health ? !stream.health.ready : false)
  )).length;
  const diagnosticsReadyStreams = streamPayloads.filter((stream) => Boolean(stream.diagnostics)).length;
  const ptpLockedStreams = streamPayloads.filter((stream) => stream.diagnostics?.ptp_lock.locked).length;
  const tsnFullyConfiguredStreams = streamPayloads.filter((stream) => {
    const tsn = stream.diagnostics?.tsn_qdisc;
    return Boolean(
      tsn &&
      tsn.available &&
      tsn.mqprio_configured &&
      tsn.cbs_configured &&
      tsn.etf_configured &&
      tsn.vlan_configured
    );
  }).length;
  const srpBoundStreams = streamPayloads.filter((stream) => stream.diagnostics?.srp.bound).length;
  const failoverCandidateStreams = streamPayloads.filter((stream) => (
    (stream.diagnostics?.effective_config.interface_candidates.length || 0) > 1
  )).length;

  const failoverPolicyCounts = streamPayloads.reduce<Record<string, number>>((acc, stream) => {
    const policy = stream.diagnostics?.effective_config.failover_policy || 'none';
    acc[policy] = (acc[policy] || 0) + 1;
    return acc;
  }, {});

  const failoverInterfaceCounts = streamPayloads.reduce<Record<string, number>>((acc, stream) => {
    const candidates = stream.diagnostics?.effective_config.interface_candidates || [];
    candidates.forEach((iface) => {
      acc[iface] = (acc[iface] || 0) + 1;
    });
    return acc;
  }, {});

  const topFailoverInterfaces = Object.entries(failoverInterfaceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([iface, count]) => `${iface} (${count})`)
    .join(', ') || '—';

  const failoverPolicySummary = Object.entries(failoverPolicyCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([policy, count]) => `${policy} (${count})`)
    .join(', ') || '—';
  const routeFailoverStreams: AvbStreamPayload[] = displayRoute ? getRouteStreams(displayRoute, streamPayloads) : [];

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
            <EndpointInfo
              endpoint={selectedEndpoint}
              discoveredDevice={selectedEndpointDiscoveredDevice || null}
            />
          </>
        )}

        {/* Route Details */}
        {displayRoute && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              {selectedRoute ? 'Selected Route' : 'Hovered Route'}
            </Typography>
            <RouteInfo
              route={displayRoute}
              endpoints={state.endpoints}
              failoverStreams={routeFailoverStreams}
            />
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
          <ListItem>
            <ListItemText
              primary="Engine AVB Devices"
              secondary={avbDevicesData?.count ?? 0}
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Engine Cached Endpoints"
              secondary={avbDevicesData?.discovered_count ?? 0}
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Cache Drift"
              secondary={`${missingFromEngineCache} missing, ${engineCacheOrphans} orphaned`}
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Transport Ready Streams"
              secondary={transportReadyStreams}
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Streams With Issues"
              secondary={transportIssueStreams}
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Diagnostics Coverage"
              secondary={`${diagnosticsReadyStreams}/${streamPayloads.length}`}
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="PTP Locked Streams"
              secondary={ptpLockedStreams}
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="TSN Fully Configured Streams"
              secondary={tsnFullyConfiguredStreams}
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="SRP Bound Streams"
              secondary={srpBoundStreams}
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Failover Candidate Streams"
              secondary={failoverCandidateStreams}
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Failover Policies"
              secondary={failoverPolicySummary}
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Failover Interfaces"
              secondary={topFailoverInterfaces}
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
function EndpointInfo({
  endpoint,
  discoveredDevice,
}: {
  endpoint: any;
  discoveredDevice: AvbDiscoveredDevice | null;
}) {
  const hostLabel = resolveAvbHostLabel(discoveredDevice || { node_address: endpoint.node_address });

  return (
    <List dense>
      <ListItem>
        <ListItemText primary="Name" secondary={endpoint.device_name} />
      </ListItem>
      {hostLabel && (
        <ListItem>
          <ListItemText
            primary="Host"
            secondary={hostLabel}
          />
        </ListItem>
      )}
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
      <ListItem>
        <ListItemText
          primary="Engine Cache"
          secondary={
            <Chip
              label={discoveredDevice ? 'Synced' : 'Not Indexed'}
              size="small"
              color={discoveredDevice ? 'success' : 'warning'}
            />
          }
          secondaryTypographyProps={{
            component: 'div',
          }}
        />
      </ListItem>
      {discoveredDevice && (
        <ListItem>
          <ListItemText
            primary="Cached Format"
            secondary={`${discoveredDevice.channels}ch @ ${discoveredDevice.sample_rate / 1000}kHz • ${discoveredDevice.audio_format}`}
          />
        </ListItem>
      )}
      {discoveredDevice && discoveredDevice.host && (
        <ListItem>
          <ListItemText
            primary="Cached Host"
            secondary={discoveredDevice.host}
          />
        </ListItem>
      )}
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
function RouteInfo({
  route,
  endpoints,
  failoverStreams,
}: {
  route: any;
  endpoints: Record<string, any>;
  failoverStreams: AvbStreamPayload[];
}) {
  const talker = endpoints[route.talker_id];
  const listener = endpoints[route.listener_id];

  const failoverPolicyCounts = failoverStreams.reduce<Record<string, number>>((acc, stream) => {
    const policy = stream.diagnostics?.effective_config.failover_policy || 'none';
    acc[policy] = (acc[policy] || 0) + 1;
    return acc;
  }, {});

  const failoverPolicySummary = Object.entries(failoverPolicyCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([policy, count]) => `${policy} (${count})`)
    .join(', ') || 'No policy data';

  const failoverInterfaceCounts = failoverStreams.reduce<Record<string, number>>((acc, stream) => {
    const candidates = stream.diagnostics?.effective_config.interface_candidates || [];
    candidates.forEach((iface) => {
      acc[iface] = (acc[iface] || 0) + 1;
    });
    return acc;
  }, {});

  const failoverInterfaceSummary = Object.entries(failoverInterfaceCounts)
    .map(([iface, count]) => `${iface} (${count})`)
    .join(', ') || 'None';

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
      <ListItem>
        <ListItemText
          primary="Route Failover Policies"
          secondary={failoverStreams.length > 0 ? failoverPolicySummary : 'No stream diagnostics available'}
        />
      </ListItem>
      {failoverStreams.length > 0 && (
        <ListItem>
          <ListItemText
            primary="Failover Interfaces"
            secondary={failoverInterfaceSummary}
          />
        </ListItem>
      )}
      {failoverStreams.length > 0 && (
        <ListItem>
          <ListItemText
            primary="Failover Stream(s)"
            secondary={(
              <Box component="div" sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {failoverStreams.map((stream) => {
                  const policy = stream.diagnostics?.effective_config.failover_policy || 'none';
                  const candidates = stream.diagnostics?.effective_config.interface_candidates || [];
                  const direction = stream.diagnostics?.effective_config.direction || stream.direction || 'unknown';

                  return (
                    <Box key={stream.stream_id} component="div" sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                      <Typography component="span" variant="caption" color="text.secondary">
                        {stream.stream_id} ({direction})
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        <Chip
                          size="small"
                          color={policy === 'none' ? 'default' : 'info'}
                          label={`Policy: ${policy}`}
                        />
                        <Chip
                          size="small"
                          color="primary"
                          label={`Candidates: ${candidates.length > 0 ? candidates.join(', ') : 'none'}`}
                        />
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            )}
            secondaryTypographyProps={{
              component: 'div',
            }}
          />
        </ListItem>
      )}
    </List>
  );
}

export default InspectorPanel;
