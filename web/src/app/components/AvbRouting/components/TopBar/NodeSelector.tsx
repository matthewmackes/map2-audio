/**
 * Node Selector Component
 *
 * Tab-based node selector showing all discovered nodes with status indicators.
 * Allows quick switching between nodes for focused control.
 *
 * Features:
 * - Tab for each discovered node
 * - Status badges (online, offline, degraded)
 * - PTP sync indicators
 * - Endpoint/route counts
 * - Color-coded by node
 * - "All Nodes" view option
 */

import React from 'react';
import {
  Box,
  Tabs,
  Tab,
  Chip,
  Tooltip,
  Badge,
  IconButton,
  Menu,
  MenuItem,
} from '@mui/material';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import DevicesIcon from '@mui/icons-material/Devices';
import RouterIcon from '@mui/icons-material/Router';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import { useNodes, useLocalNodeId } from '../../hooks/useNodeApi';
import { useRouting } from '../../context/RoutingContext';
import type { AvbNode, NodeStatus } from '../../types';
import { sortNodesForNavigation } from '../../utils/nodeSorting';

/**
 * Get status icon for node
 */
function getStatusIcon(status: NodeStatus, ptpSynced: boolean) {
  if (status === 'offline') {
    return <ErrorIcon fontSize="small" sx={{ color: '#f44336' }} />;
  }
  if (status === 'degraded' || !ptpSynced) {
    return <WarningIcon fontSize="small" sx={{ color: '#ff9800' }} />;
  }
  return <CheckCircleIcon fontSize="small" sx={{ color: '#4caf50' }} />;
}

/**
 * Get device icon for node type
 */
function getDeviceIcon(node: AvbNode) {
  if (node.type === 'map2_local' || node.type === 'map2_remote') {
    return '🎛️';
  }
  if (node.type === 'avdecc') {
    return '🔌';
  }
  return '❓';
}

/**
 * Node tab component
 */
interface NodeTabProps {
  node: AvbNode;
  isLocal: boolean;
  highlighted: boolean;
  tabValue: number;
  onClick: () => void;
}

function NodeTab({ node, isLocal, highlighted, tabValue, onClick }: NodeTabProps) {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);

  const handleMenuClick = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const ptpSynced = node.ptp?.state === 'master' || node.ptp?.state === 'slave';
  const totalEndpoints = node.talker_count + node.listener_count;

  return (
    <>
      <Tooltip
        title={
          <div>
            <div style={{ fontWeight: 'bold' }}>
              {node.name} {isLocal && '(Local)'}
            </div>
            <div>Type: {node.type.toUpperCase()}</div>
            <div>Address: {node.address}</div>
            <div>
              Endpoints: {node.talker_count} talkers, {node.listener_count} listeners
            </div>
            <div>Active Routes: {node.active_routes}</div>
            {node.ptp && (
              <div>
                PTP: {node.ptp.state} {node.ptp.is_master && '(Master)'}
              </div>
            )}
            {node.health && (
              <>
                <div>CPU: {node.health.cpu_usage.toFixed(1)}%</div>
                <div>Latency: {node.health.latency_ms.toFixed(1)}ms</div>
              </>
            )}
          </div>
        }
        placement="bottom"
      >
        <Tab
          label={
            <Box
              data-testid={`node-selector-label-${node.node_id}`}
              data-node-selected={highlighted ? 'true' : 'false'}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                px: 1,
              }}
            >
              {/* Device icon */}
              <span style={{ fontSize: 16 }}>{getDeviceIcon(node)}</span>

              {/* Status indicator */}
              {getStatusIcon(node.status, ptpSynced)}

              {/* Node name */}
              <Box
                component="span"
                sx={{
                  fontSize: 13,
                  fontWeight: highlighted ? 600 : 400,
                  maxWidth: 100,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {node.name}
                {isLocal && (
                  <Box
                    component="span"
                    sx={{
                      ml: 0.5,
                      fontSize: 10,
                      opacity: 0.7,
                    }}
                  >
                    (local)
                  </Box>
                )}
              </Box>

              <Box
                component="span"
                data-testid={`node-selector-selected-marker-${node.node_id}`}
                sx={{ display: 'none' }}
              >
                {highlighted ? 'selected' : 'unselected'}
              </Box>

              {/* Endpoint count badge */}
              <Chip
                label={totalEndpoints}
                size="small"
                sx={{
                  height: 18,
                  fontSize: 10,
                  bgcolor: highlighted ? node.color : 'transparent',
                  color: highlighted ? '#fff' : 'text.secondary',
                  border: `1px solid ${node.color}`,
                  '& .MuiChip-label': { px: 0.75 },
                }}
              />

              {/* Menu trigger (span avoids nested-button DOM in Tab) */}
              <Box
                component="span"
                role="button"
                tabIndex={0}
                onClick={handleMenuClick}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    handleMenuClick(event as unknown as React.MouseEvent<HTMLElement>)
                  }
                }}
                sx={{
                  ml: 0.5,
                  width: 20,
                  height: 20,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%',
                  opacity: 0.5,
                  '&:hover': { opacity: 1, bgcolor: 'action.hover' },
                }}
              >
                <MoreVertIcon sx={{ fontSize: 14 }} />
              </Box>
            </Box>
          }
          value={tabValue}
          onClick={onClick}
          data-testid={`node-selector-tab-${node.node_id}`}
          data-selected={highlighted ? 'true' : 'false'}
          data-node-selected={highlighted ? 'true' : 'false'}
          sx={{
            minHeight: 48,
            textTransform: 'none',
            borderBottom: highlighted ? `3px solid ${node.color}` : 'none',
            opacity: node.status === 'offline' ? 0.5 : 1,
          }}
        />
      </Tooltip>

      {/* Node context menu */}
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
        <MenuItem onClick={handleMenuClose} disabled>
          View Details
        </MenuItem>
        <MenuItem onClick={handleMenuClose} disabled>
          Pin to Top
        </MenuItem>
        <MenuItem onClick={handleMenuClose} disabled>
          Edit Name
        </MenuItem>
        <MenuItem onClick={handleMenuClose} disabled>
          Change Color
        </MenuItem>
      </Menu>
    </>
  );
}

/**
 * Node selector component
 */
export function NodeSelector() {
  const { state, dispatch } = useRouting();
  const { data: nodes = [] } = useNodes();
  const localNodeId = useLocalNodeId();

  const currentNodeId = state.network.nodeSelection.current_node_id;
  const viewMode = state.network.nodeSelection.view_mode;
  const selectedNodeIds = state.network.nodeSelection.selected_node_ids;

  // Filter to online nodes by default (configurable)
  const visibleNodes = state.network.nodeSelection.show_offline
    ? nodes
    : nodes.filter((n) => n.status === 'online');
  const sortedVisibleNodes = sortNodesForNavigation(visibleNodes, localNodeId);
  const selectedNodeIsVisible = currentNodeId
    ? sortedVisibleNodes.some((node) => node.node_id === currentNodeId)
    : false;
  const selectedNodeIndex = currentNodeId
    ? sortedVisibleNodes.findIndex((node) => node.node_id === currentNodeId)
    : -1;

  const handleNodeSelect = (nodeId: string | null) => {
    dispatch({
      type: 'SELECT_NODE',
      payload: nodeId,
    });
  };

  const handleViewModeChange = (mode: 'all_nodes' | 'single_node') => {
    dispatch({
      type: 'SET_VIEW_MODE',
      payload: mode,
    });
  };

  // Selected value for tabs
  const selectedValue = viewMode === 'all_nodes' || !selectedNodeIsVisible
    ? 'all'
    : selectedNodeIndex >= 0
      ? selectedNodeIndex + 1
      : 'all';

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      {/* View mode selector */}
      <Tooltip title="View all nodes simultaneously">
        <IconButton
          size="small"
          onClick={() => handleViewModeChange('all_nodes')}
          sx={{
            ml: 1,
            bgcolor: viewMode === 'all_nodes' ? 'primary.main' : 'transparent',
            color: viewMode === 'all_nodes' ? 'primary.contrastText' : 'text.secondary',
            '&:hover': {
              bgcolor: viewMode === 'all_nodes' ? 'primary.dark' : 'action.hover',
            },
          }}
        >
          <NetworkCheckIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      {/* Node tabs */}
      <Tabs
        value={selectedValue}
        onChange={(_, value) => {
          if (value === 'all') {
            handleViewModeChange('all_nodes');
          }
        }}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          flex: 1,
          minHeight: 48,
          '& .MuiTabs-indicator': {
            display: 'none', // Use custom border-bottom on tabs
          },
        }}
      >
        {/* "All Nodes" tab */}
        <Tab
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <DevicesIcon fontSize="small" />
              <span style={{ fontSize: 13 }}>All Nodes</span>
              <Chip
                label={visibleNodes.length}
                size="small"
                color={viewMode === 'all_nodes' ? 'primary' : 'default'}
                sx={{ height: 18, fontSize: 10 }}
              />
            </Box>
          }
          value="all"
          sx={{
            minHeight: 48,
            textTransform: 'none',
            borderBottom: viewMode === 'all_nodes' ? '3px solid' : 'none',
            borderColor: 'primary.main',
          }}
        />

        {/* Individual node tabs */}
        {sortedVisibleNodes.map((node, index) => {
          const isNodeSelected =
            viewMode === 'single_node'
              ? currentNodeId === node.node_id
              : viewMode === 'multi_select'
                ? selectedNodeIds.includes(node.node_id)
                : false;

          return (
          <NodeTab
            key={node.node_id}
            node={node}
            isLocal={node.node_id === localNodeId}
            highlighted={isNodeSelected}
            tabValue={index + 1}
            onClick={() => {
              handleViewModeChange('single_node');
              handleNodeSelect(node.node_id);
            }}
          />
          );
        })}
      </Tabs>

      {/* Network stats */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mr: 2,
          fontSize: 12,
          color: 'text.secondary',
        }}
      >
        <RouterIcon fontSize="small" />
        <span>
          {visibleNodes.filter((n) => n.status === 'online').length} / {nodes.length} online
        </span>
      </Box>
    </Box>
  );
}

export default NodeSelector;
