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
  Box,
  Drawer,
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
  Badge,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import InputIcon from '@mui/icons-material/Input';
import OutputIcon from '@mui/icons-material/Output';
import RouterIcon from '@mui/icons-material/Router';
import PushPinIcon from '@mui/icons-material/PushPin';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import { useNodes, useLocalNodeId } from '../../hooks/useNodeApi';
import { useRouting, useFilteredEndpoints } from '../../context/RoutingContext';
import type { AvbNode, Endpoint } from '../../types';
import { sortNodesForNavigation } from '../../utils/nodeSorting';

const DRAWER_WIDTH = 280;

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
function NodeStatusBadge({ node }: { node: AvbNode }) {
  const ptpSynced = node.ptp?.state === 'master' || node.ptp?.state === 'slave';

  let color = '#4caf50'; // Green - online + synced
  let label = '●';

  if (node.status === 'offline') {
    color = '#f44336'; // Red
    label = '●';
  } else if (node.status === 'degraded' || !ptpSynced) {
    color = '#ff9800'; // Orange
    label = '◐';
  }

  return (
    <Tooltip
      title={
        node.status === 'offline'
          ? 'Offline'
          : ptpSynced
            ? `Online • PTP ${node.ptp?.state}`
            : 'Online • No PTP sync'
      }
    >
      <FiberManualRecordIcon sx={{ fontSize: 12, color, mr: 0.5 }} />
    </Tooltip>
  );
}

/**
 * Endpoint list item
 */
interface EndpointItemProps {
  endpoint: Endpoint;
  nodeColor: string;
}

function EndpointItem({ endpoint, nodeColor }: EndpointItemProps) {
  const isTalker = endpoint.direction === 'talker';

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
          <OutputIcon sx={{ fontSize: 16, color: nodeColor }} />
        ) : (
          <InputIcon sx={{ fontSize: 16, color: nodeColor }} />
        )}
      </ListItemIcon>
      <ListItemText
        primary={endpoint.device_name}
        secondary={`${endpoint.channels}ch @ ${endpoint.sample_rate / 1000}k`}
        primaryTypographyProps={{
          fontSize: 12,
          noWrap: true,
        }}
        secondaryTypographyProps={{
          fontSize: 10,
          component: 'div',
        }}
      />
      {endpoint.pinned && <PushPinIcon sx={{ fontSize: 12, color: 'text.disabled' }} />}
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
  onSelect: () => void;
}

function NodeTreeItem({ node, isLocal, isSelected, onSelect }: NodeTreeItemProps) {
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

  const deviceIcon = node.type.startsWith('map2') ? '🎛️' : '🔌';

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
          borderLeft: `4px solid ${isSelected ? node.color : 'transparent'}`,
          bgcolor: isSelected ? `${node.color}11` : 'transparent',
          '&:hover': {
            bgcolor: isSelected ? `${node.color}22` : 'action.hover',
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
            <ExpandMoreIcon fontSize="small" />
          ) : (
            <ChevronRightIcon fontSize="small" />
          )}
        </IconButton>

        {/* Device icon + status */}
        <Box sx={{ display: 'flex', alignItems: 'center', mr: 1 }}>
          <span style={{ fontSize: 18 }}>{deviceIcon}</span>
          <NodeStatusBadge node={node} />
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
            </Box>
          }
          secondary={
            <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
              <Tooltip title={`${talkers.length} talkers`}>
                <Chip
                  icon={<OutputIcon sx={{ fontSize: 12 }} />}
                  label={talkers.length}
                  size="small"
                  variant="outlined"
                  sx={{ height: 18, fontSize: 10, borderColor: node.color }}
                />
              </Tooltip>
              <Tooltip title={`${listeners.length} listeners`}>
                <Chip
                  icon={<InputIcon sx={{ fontSize: 12 }} />}
                  label={listeners.length}
                  size="small"
                  variant="outlined"
                  sx={{ height: 18, fontSize: 10, borderColor: node.color }}
                />
              </Tooltip>
              <Tooltip title={`${node.active_routes} active routes`}>
                <Chip
                  icon={<RouterIcon sx={{ fontSize: 12 }} />}
                  label={node.active_routes}
                  size="small"
                  variant="outlined"
                  sx={{ height: 18, fontSize: 10, borderColor: node.color }}
                />
              </Tooltip>
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
                <EndpointItem key={ep.endpoint_id} endpoint={ep} nodeColor={node.color} />
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
                <EndpointItem key={ep.endpoint_id} endpoint={ep} nodeColor={node.color} />
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
  const { state, dispatch } = useRouting();
  const { data: nodes = [] } = useNodes();
  const localNodeId = useLocalNodeId();

  const {
    current_node_id: currentNodeId,
    show_offline: showOfflineNodes,
    view_mode: viewMode,
    selected_node_ids: selectedNodeIds,
  } = state.network.nodeSelection;
  const visibleNodes = showOfflineNodes ? nodes : nodes.filter((node) => node.status === 'online');

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
        },
      }}
    >
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
        <Tooltip title="Add node manually (future)">
          <ListItemButton disabled sx={{ borderRadius: 1 }}>
            <ListItemIcon sx={{ minWidth: 32 }}>
              <AddCircleOutlineIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary="Add Node"
              primaryTypographyProps={{ variant: 'body2', fontSize: 13 }}
            />
          </ListItemButton>
        </Tooltip>
      </Box>
    </Drawer>
  );
}

export default NodeTree;
