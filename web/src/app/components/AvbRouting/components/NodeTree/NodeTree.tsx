/**
 * Node Tree Component
 *
 * Hierarchical sidebar showing all network nodes with expandable endpoint lists.
 * Provides quick navigation and drag-drop routing between nodes.
 *
 * Features:
 * - Collapsible node list
 * - Expandable to show endpoints per node
 * - Visual status indicators
 * - Quick stats (endpoint counts, route counts)
 * - Drag-drop endpoints for routing
 * - Filter and search integration
 */

import React, { useState } from 'react';
import {
  AddAlt,
  ChevronDown,
  ChevronRight,
  Devices,
  DotMark,
  Pin,
  PortInput,
  PortOutput,
  Router,
} from '@carbon/icons-react';
import {
  Box,
  Drawer,
  Paper,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Collapse,
  IconButton,
  Typography,
  Chip,
  Tooltip,
  Divider,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useAvbDevices, useAvbStreams } from '../../hooks/useAvbApi';
import { useNodes, useLocalNodeId } from '../../hooks/useNodeApi';
import { useRouting, useFilteredEndpoints } from '../../context/RoutingContext';
import type { AvbDiscoveredDevice, AvbNode, Endpoint, AvbStreamPayload } from '../../types';
import { sortNodesForNavigation } from '../../utils/nodeSorting';
import { getMap2StreamEndpointIds } from '../../utils/avbRouteStreams';
import { resolveAvbHostLabel } from '../../utils/avbHost';

const DRAWER_WIDTH = 280;

type NodeAvbHealthSummary = {
  totalEndpoints: number;
  syncedEndpoints: number;
  missingCacheEndpoints: number;
  unavailableEndpoints: number;
  cachedUnavailableEndpoints: number;
  issueEndpoints: number;
};

const EMPTY_NODE_HEALTH: NodeAvbHealthSummary = {
  totalEndpoints: 0,
  syncedEndpoints: 0,
  missingCacheEndpoints: 0,
  unavailableEndpoints: 0,
  cachedUnavailableEndpoints: 0,
  issueEndpoints: 0,
};

type NodeAvbFailoverSummary = {
  streamCount: number;
  policySummary: string;
  interfaceSummary: string;
  topPolicy: string;
};

const EMPTY_NODE_FAILOVER: NodeAvbFailoverSummary = {
  streamCount: 0,
  policySummary: 'No failover data',
  interfaceSummary: 'No interface candidates',
  topPolicy: 'none',
};

function summarizeFailoverCounts(counts: Record<string, number>): string {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => `${key} (${count})`)
    .join(', ') || 'No data';
}

function buildNodeAvbFailoverById(
  nodes: AvbNode[],
  endpoints: Endpoint[],
  streams: AvbStreamPayload[]
): Record<string, NodeAvbFailoverSummary> {
  const nodeIdsByEndpointId = new Map<string, string>();
  for (const endpoint of endpoints) {
    nodeIdsByEndpointId.set(endpoint.endpoint_id, endpoint.node_id);
  }

  const streamIdsByNodeId = new Map<string, AvbStreamPayload[]>();
  for (const stream of streams) {
    const endpointIds = getMap2StreamEndpointIds(stream.stream_id);
    const matchedNodeIds = new Set<string>();

    for (const endpointId of endpointIds) {
      const nodeId = nodeIdsByEndpointId.get(endpointId);
      if (nodeId) {
        matchedNodeIds.add(nodeId);
      }
    }

    for (const nodeId of matchedNodeIds) {
      const nodeStreams = streamIdsByNodeId.get(nodeId) || [];
      nodeStreams.push(stream);
      streamIdsByNodeId.set(nodeId, nodeStreams);
    }
  }

  const byNodeId: Record<string, NodeAvbFailoverSummary> = {};

  for (const node of nodes) {
    const nodeStreams = streamIdsByNodeId.get(node.node_id) || [];

    if (nodeStreams.length === 0) {
      continue;
    }

    const policyCounts: Record<string, number> = {};
    const interfaceCounts: Record<string, number> = {};

    for (const stream of nodeStreams) {
      const policy = stream.diagnostics?.effective_config.failover_policy || 'none';
      policyCounts[policy] = (policyCounts[policy] || 0) + 1;

      const candidates = stream.diagnostics?.effective_config.interface_candidates || [];
      for (const candidate of candidates) {
        interfaceCounts[candidate] = (interfaceCounts[candidate] || 0) + 1;
      }
    }

    const topPolicy = Object.entries(policyCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'none';

    byNodeId[node.node_id] = {
      streamCount: nodeStreams.length,
      policySummary: summarizeFailoverCounts(policyCounts),
      interfaceSummary: summarizeFailoverCounts(interfaceCounts),
      topPolicy,
    };
  }

  return byNodeId;
}

function buildNodeAvbHealthById(
  nodes: AvbNode[],
  endpoints: Endpoint[],
  discoveredDevices: AvbDiscoveredDevice[]
): Record<string, NodeAvbHealthSummary> {
  const discoveredByEndpointId = new Map<string, AvbDiscoveredDevice>();
  for (const device of discoveredDevices) {
    if (!device.endpoint_id) {
      continue;
    }
    discoveredByEndpointId.set(device.endpoint_id, device);
  }

  const byNodeId: Record<string, NodeAvbHealthSummary> = {};

  for (const node of nodes) {
    const nodeEndpoints = endpoints.filter((endpoint) => endpoint.node_id === node.node_id);
    let syncedEndpoints = 0;
    let missingCacheEndpoints = 0;
    let unavailableEndpoints = 0;
    let cachedUnavailableEndpoints = 0;
    let issueEndpoints = 0;

    for (const endpoint of nodeEndpoints) {
      const cachedDevice = discoveredByEndpointId.get(endpoint.endpoint_id);
      const missingFromCache = cachedDevice === undefined;
      const endpointUnavailable = !endpoint.available;
      const cachedUnavailable = cachedDevice ? !cachedDevice.available : false;

      if (cachedDevice) {
        syncedEndpoints += 1;
      } else {
        missingCacheEndpoints += 1;
      }
      if (endpointUnavailable) {
        unavailableEndpoints += 1;
      }
      if (cachedUnavailable) {
        cachedUnavailableEndpoints += 1;
      }
      if (missingFromCache || endpointUnavailable || cachedUnavailable) {
        issueEndpoints += 1;
      }
    }

    byNodeId[node.node_id] = {
      totalEndpoints: nodeEndpoints.length,
      syncedEndpoints,
      missingCacheEndpoints,
      unavailableEndpoints,
      cachedUnavailableEndpoints,
      issueEndpoints,
    };
  }

  return byNodeId;
}

function isActivationKey(key: string): boolean {
  return key === 'Enter' || key === ' ' || key === 'Spacebar';
}

function handleKeyboardActivation(
  event: React.KeyboardEvent<HTMLElement>,
  action: () => void
) {
  if (!isActivationKey(event.key)) {
    return;
  }

  event.preventDefault();
  action();
}

/**
 * Node status indicator
 */
function NodeStatusBadge({ node, avbHealth }: { node: AvbNode; avbHealth: NodeAvbHealthSummary }) {
  const ptpSynced = node.ptp?.state === 'master' || node.ptp?.state === 'slave';
  const hasAvbIssues = avbHealth.issueEndpoints > 0;

  let color = '#4caf50'; // Green - online + synced

  if (node.status === 'offline') {
    color = '#f44336'; // Red
  } else if (node.status === 'degraded' || !ptpSynced || hasAvbIssues) {
    color = '#ff9800'; // Orange
  }

  const tooltipLabel = (() => {
    if (node.status === 'offline') {
      return 'Offline';
    }

    const statusParts = [
      ptpSynced ? `PTP ${node.ptp?.state}` : 'No PTP sync',
    ];
    if (hasAvbIssues) {
      statusParts.push(`AVB issues ${avbHealth.issueEndpoints}`);
    }
    return `Online • ${statusParts.join(' • ')}`;
  })();

  return (
    <Tooltip title={tooltipLabel}>
      <DotMark size={14} style={{ color, marginRight: 4 }} />
    </Tooltip>
  );
}

/**
 * Endpoint list item
 */
interface EndpointItemProps {
  endpoint: Endpoint;
  nodeColor: string;
  hostLabel?: string;
}

function EndpointItem({ endpoint, nodeColor, hostLabel }: EndpointItemProps) {
  const isTalker = endpoint.direction === 'talker';
  const hostText = hostLabel || '';

  return (
    <ListItem
      sx={{
        pl: 6,
        py: 0.5,
        cursor: 'pointer',
        '&:hover': {
          bgcolor: 'action.hover',
        },
      }}
    >
      <ListItemIcon sx={{ minWidth: 32 }}>
        {isTalker ? (
          <PortOutput size={16} style={{ color: nodeColor }} />
        ) : (
          <PortInput size={16} style={{ color: nodeColor }} />
        )}
      </ListItemIcon>
      <ListItemText
        primary={endpoint.device_name}
        secondary={hostText
          ? `${endpoint.channels}ch @ ${endpoint.sample_rate / 1000}k • ${hostText}`
          : `${endpoint.channels}ch @ ${endpoint.sample_rate / 1000}k`}
        primaryTypographyProps={{
          fontSize: 12,
          noWrap: true,
        }}
        secondaryTypographyProps={{
          fontSize: 10,
          component: 'div',
        }}
      />
      {endpoint.pinned && (
        <Box sx={{ color: 'text.disabled', display: 'inline-flex' }}>
          <Pin size={12} />
        </Box>
      )}
    </ListItem>
  );
}

/**
 * Node tree item
 */
interface NodeTreeItemProps {
  node: AvbNode;
  isLocal: boolean;
  isSelected: boolean;
  avbHealth: NodeAvbHealthSummary;
  avbFailover: NodeAvbFailoverSummary;
  discoveredHostByEndpointId: Map<string, string>;
  onSelect: () => void;
}

function NodeTreeItem({
  node,
  isLocal,
  isSelected,
  avbHealth,
  avbFailover,
  discoveredHostByEndpointId,
  onSelect,
}: NodeTreeItemProps) {
  const [expanded, setExpanded] = useState(false);
  const endpoints = useFilteredEndpoints();
  const endpointListId = `node-tree-endpoints-${node.node_id}`;

  const handleExpandToggle = (event: React.SyntheticEvent<HTMLElement>) => {
    event.stopPropagation();
    setExpanded((value) => !value);
  };

  // Filter endpoints belonging to this node
  const nodeEndpoints = endpoints.filter((ep) => ep.node_id === node.node_id);
  const talkers = nodeEndpoints.filter((ep) => ep.direction === 'talker');
  const listeners = nodeEndpoints.filter((ep) => ep.direction === 'listener');

  const DeviceIcon = node.type === 'tesira'
    ? null
    : node.type.startsWith('map2') ? Devices : Router;

  // Biamp brand red — used for Tesira node accent
  const BIAMP_RED = '#E31837';

  return (
    <>
      <ListItemButton
        selected={isSelected}
        onClick={onSelect}
        onKeyDown={(event) => handleKeyboardActivation(event, onSelect)}
        data-testid={`node-tree-item-${node.node_id}`}
        data-selected={isSelected ? 'true' : 'false'}
        data-node-selected={isSelected ? 'true' : 'false'}
        sx={{
          py: 1,
          borderLeft: `4px solid ${isSelected ? (node.type === 'tesira' ? BIAMP_RED : node.color) : 'transparent'}`,
          bgcolor: isSelected ? `${node.type === 'tesira' ? BIAMP_RED : node.color}11` : 'transparent',
          '&:hover': {
            bgcolor: isSelected ? `${node.type === 'tesira' ? BIAMP_RED : node.color}22` : 'action.hover',
          },
        }}
      >
        {/* Expand/collapse icon */}
        <IconButton
          size="small"
          onClick={handleExpandToggle}
          onKeyDown={(event) => {
            if (!isActivationKey(event.key)) {
              return;
            }
            event.preventDefault();
            handleExpandToggle(event);
          }}
          data-testid={`node-tree-expand-${node.node_id}`}
          aria-label={`Toggle endpoints for ${node.name}`}
          aria-expanded={expanded ? 'true' : 'false'}
          aria-controls={endpointListId}
          sx={{ mr: 0.5, width: 24, height: 24 }}
        >
          {expanded ? (
            <ChevronDown size={16} />
          ) : (
            <ChevronRight size={16} />
          )}
        </IconButton>

        {/* Device icon + status */}
        <Box sx={{ display: 'flex', alignItems: 'center', mr: 1 }}>
          {node.type === 'tesira' ? (
            /* Biamp Tesira — inline SVG "b" letterform badge */
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              aria-label="Biamp Tesira"
              style={{ display: 'block' }}
            >
              <rect x="5" y="3" width="3" height="18" rx="1.5" fill={BIAMP_RED} />
              <path
                d="M8 10 C8 10 18 10 18 14.5 C18 19 8 19 8 19"
                stroke={BIAMP_RED}
                strokeWidth="3"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          ) : (
            DeviceIcon ? <DeviceIcon size={18} /> : null
          )}
          <NodeStatusBadge node={node} avbHealth={avbHealth} />
        </Box>

        {/* Node name */}
        <ListItemText
          primary={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="body2" fontWeight={isSelected ? 600 : 400} noWrap>
                {node.name}
              </Typography>
              {isLocal && (
                <Chip label="Local" size="small" sx={{ height: 16, fontSize: 9 }} />
              )}
              {node.type === 'tesira' && (
                <Chip
                  label="Tesira"
                  size="small"
                  sx={{
                    height: 16,
                    fontSize: 9,
                    bgcolor: BIAMP_RED,
                    color: '#fff',
                    '& .MuiChip-label': { px: 0.75 },
                  }}
                />
              )}
            </Box>
          }
          secondary={
            <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
              <Tooltip title={`${talkers.length} talkers`}>
                <Chip
                  icon={<PortOutput size={12} />}
                  label={talkers.length}
                  size="small"
                  variant="outlined"
                  sx={{ height: 18, fontSize: 10, borderColor: node.color }}
                />
              </Tooltip>
              <Tooltip title={`${listeners.length} listeners`}>
                <Chip
                  icon={<PortInput size={12} />}
                  label={listeners.length}
                  size="small"
                  variant="outlined"
                  sx={{ height: 18, fontSize: 10, borderColor: node.color }}
                />
              </Tooltip>
              <Tooltip title={`${node.active_routes} active routes`}>
                <Chip
                  icon={<Router size={12} />}
                  label={node.active_routes}
                  size="small"
                  variant="outlined"
                  sx={{ height: 18, fontSize: 10, borderColor: node.color }}
                />
              </Tooltip>
              <Tooltip title={`${avbHealth.syncedEndpoints}/${avbHealth.totalEndpoints} endpoints synced to engine cache`}>
                <Chip
                  label={`Sync ${avbHealth.syncedEndpoints}/${avbHealth.totalEndpoints}`}
                  size="small"
                  variant="outlined"
                  sx={{ height: 18, fontSize: 10, borderColor: node.color }}
                  data-testid={`node-tree-sync-chip-${node.node_id}`}
                />
              </Tooltip>
              <Tooltip
                title={(
                  avbHealth.issueEndpoints === 0
                    ? 'No AVB endpoint issues detected'
                    : `Issues ${avbHealth.issueEndpoints}: missing cache ${avbHealth.missingCacheEndpoints}, endpoint unavailable ${avbHealth.unavailableEndpoints}, cache unavailable ${avbHealth.cachedUnavailableEndpoints}`
                )}
              >
                <Chip
                  label={`Issues ${avbHealth.issueEndpoints}`}
                  size="small"
                  color={avbHealth.issueEndpoints > 0 ? 'warning' : 'default'}
                  variant="outlined"
                  sx={{ height: 18, fontSize: 10, borderColor: node.color }}
                  data-testid={`node-tree-issues-chip-${node.node_id}`}
                />
              </Tooltip>
              {avbFailover.streamCount > 0 && (
                <Tooltip
                  title={`Failover policies: ${avbFailover.policySummary} | Interfaces: ${avbFailover.interfaceSummary}`}
                >
                  <Chip
                    label={`Failover ${avbFailover.streamCount}`}
                    size="small"
                    color={avbFailover.topPolicy === 'none' ? 'default' : 'info'}
                    variant="outlined"
                    sx={{ height: 18, fontSize: 10, borderColor: node.color }}
                    data-testid={`node-tree-failover-chip-${node.node_id}`}
                  />
                </Tooltip>
              )}
            </Box>
          }
          secondaryTypographyProps={{
            component: 'div',
          }}
        />
      </ListItemButton>

      {/* Expandable endpoint list */}
      <Collapse id={endpointListId} in={expanded} timeout="auto" unmountOnExit>
        <List dense disablePadding>
          {/* Talkers */}
              {talkers.length > 0 && (
                <>
                  <ListItem sx={{ pl: 4, py: 0.5, bgcolor: 'action.hover' }}>
                    <Typography variant="caption" fontWeight={600} color="text.secondary">
                      Talkers ({talkers.length})
                </Typography>
              </ListItem>
              {talkers.map((ep) => (
                <EndpointItem
                  key={ep.endpoint_id}
                  endpoint={ep}
                  hostLabel={discoveredHostByEndpointId.get(ep.endpoint_id) || resolveAvbHostLabel(ep)}
                  nodeColor={node.color}
                />
              ))}
            </>
          )}

          {/* Listeners */}
          {listeners.length > 0 && (
            <>
              <ListItem sx={{ pl: 4, py: 0.5, bgcolor: 'action.hover' }}>
                <Typography variant="caption" fontWeight={600} color="text.secondary">
                  Listeners ({listeners.length})
                </Typography>
              </ListItem>
              {listeners.map((ep) => (
                <EndpointItem
                  key={ep.endpoint_id}
                  endpoint={ep}
                  hostLabel={discoveredHostByEndpointId.get(ep.endpoint_id) || resolveAvbHostLabel(ep)}
                  nodeColor={node.color}
                />
              ))}
            </>
          )}

          {nodeEndpoints.length === 0 && (
            <ListItem sx={{ pl: 6, py: 1 }}>
              <Typography variant="caption" color="text.disabled">
                No endpoints discovered
              </Typography>
            </ListItem>
          )}
        </List>
      </Collapse>
    </>
  );
}

/**
 * Node tree component
 */
export function NodeTree() {
  const theme = useTheme();
  const isCompactLayout = useMediaQuery(theme.breakpoints.down('lg'));
  const { state, dispatch } = useRouting();
  const { data: nodes = [] } = useNodes();
  const { data: avbDevicesData } = useAvbDevices();
  const { data: avbStreamsData } = useAvbStreams();
  const localNodeId = useLocalNodeId();

  const {
    current_node_id: currentNodeId,
    show_offline: showOfflineNodes,
    view_mode: viewMode,
    selected_node_ids: selectedNodeIds,
  } = state.network.nodeSelection;
  const visibleNodes = showOfflineNodes ? nodes : nodes.filter((node) => node.status === 'online');
  const allEndpoints = Object.values((state.endpoints || {}) as Record<string, Endpoint>);
  const discoveredHostByEndpointId = React.useMemo(() => {
    const hostByEndpointId = new Map<string, string>();
    const discovered = avbDevicesData?.discovered_devices || [];

    discovered.forEach((device) => {
      const hostLabel = resolveAvbHostLabel(device);
      if (hostLabel) {
        hostByEndpointId.set(device.endpoint_id, hostLabel);
      }
    });

    return hostByEndpointId;
  }, [avbDevicesData?.discovered_devices]);
  const nodeAvbHealthById = React.useMemo(
    () => buildNodeAvbHealthById(nodes, allEndpoints, avbDevicesData?.discovered_devices || []),
    [nodes, allEndpoints, avbDevicesData?.discovered_devices]
  );
  const nodeAvbFailoverById = React.useMemo(
    () => buildNodeAvbFailoverById(nodes, allEndpoints, avbStreamsData?.streams || []),
    [nodes, allEndpoints, avbStreamsData?.streams]
  );

  const sortedNodes = sortNodesForNavigation(visibleNodes, localNodeId);

  const handleNodeSelect = (nodeId: string) => {
    if (viewMode === 'multi_select') {
      dispatch({
        type: 'TOGGLE_NODE_SELECTION',
        payload: nodeId,
      });
      return;
    }

    dispatch({
      type: 'SELECT_NODE',
      payload: nodeId,
    });
    dispatch({
      type: 'SET_VIEW_MODE',
      payload: 'single_node',
    });
  };

  const content = (
    <>
      {/* Header */}
      <Box
        sx={{
          p: 2,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.default',
        }}
      >
        <Typography variant="subtitle2" fontWeight={600}>
          Network Nodes
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {nodes.filter((n) => n.status === 'online').length} of {nodes.length} online
        </Typography>
      </Box>

      {/* Node list */}
      <List sx={{ flex: 1, overflow: 'auto', py: 0 }}>
        {sortedNodes.map((node) => (
          <NodeTreeItem
            key={node.node_id}
            node={node}
            isLocal={node.node_id === localNodeId}
            avbHealth={nodeAvbHealthById[node.node_id] || EMPTY_NODE_HEALTH}
            avbFailover={nodeAvbFailoverById[node.node_id] || EMPTY_NODE_FAILOVER}
            discoveredHostByEndpointId={discoveredHostByEndpointId}
            isSelected={
              viewMode === 'single_node'
                ? currentNodeId === node.node_id
                : viewMode === 'multi_select'
                  ? selectedNodeIds.includes(node.node_id)
                  : false
            }
            onSelect={() => handleNodeSelect(node.node_id)}
          />
        ))}

        {nodes.length === 0 && (
          <ListItem>
            <ListItemText
              primary="No nodes discovered"
              secondary="Waiting for AVB discovery..."
              primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }}
              secondaryTypographyProps={{ variant: 'caption' }}
            />
          </ListItem>
        )}
      </List>

      {/* Footer */}
      <Divider />
      <Box sx={{ p: 2 }}>
        <Tooltip title="Manual node entry is not available yet">
          <ListItemButton disabled sx={{ borderRadius: 1 }}>
            <ListItemIcon sx={{ minWidth: 32 }}>
              <AddAlt size={16} />
            </ListItemIcon>
            <ListItemText
              primary="Add Node"
              primaryTypographyProps={{ variant: 'body2', fontSize: 13 }}
            />
          </ListItemButton>
        </Tooltip>
      </Box>
    </>
  );

  if (isCompactLayout) {
    return (
      <Paper
        elevation={0}
        sx={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 'clamp(170px, 28vh, 260px)',
          maxHeight: '40vh',
          overflow: 'hidden',
          borderRadius: 0,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        {content}
      </Paper>
    );
  }

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: DRAWER_WIDTH,
          boxSizing: 'border-box',
          position: 'relative',
          borderRight: 1,
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      {content}
    </Drawer>
  );
}

export default NodeTree;
