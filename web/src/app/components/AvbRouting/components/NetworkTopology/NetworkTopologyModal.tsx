/**
 * Network Topology Modal
 *
 * Interactive graph visualization of the AVB/TSN network topology.
 * Shows nodes as vertices, connections as edges, and PTP hierarchy.
 *
 * Features:
 * - Interactive pan/zoom with reactflow
 * - Color-coded nodes by type and status
 * - PTP master/slave hierarchy visualization
 * - Active route highlighting
 * - Node details on click
 * - Auto-layout with dagre algorithm
 */

import React, { useMemo, useCallback, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Paper,
  Chip,
  Stack,
  IconButton,
  Tooltip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  ReactFlowProvider,
  Panel,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import { useRouting } from '../../context/RoutingContext';
import { useNodes, usePtpStatus } from '../../hooks/useNodeApi';
import type { AvbNode } from '../../types';

interface NetworkTopologyModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Custom node component for AVB nodes
 */
function AvbNodeComponent({ data }: { data: AvbNode & { selected: boolean } }) {
  const statusColor = data.status === 'online' ? '#4caf50' : data.status === 'degraded' ? '#ff9800' : '#f44336';
  const isPtpMaster = data.ptp?.role === 'master';

  return (
    <Paper
      elevation={data.selected ? 8 : 3}
      sx={{
        p: 2,
        minWidth: 200,
        bgcolor: 'background.paper',
        border: `3px solid ${data.color}`,
        borderStyle: data.selected ? 'solid' : 'solid',
        position: 'relative',
        '&:hover': {
          boxShadow: 6,
        },
      }}
    >
      {/* PTP Master Badge */}
      {isPtpMaster && (
        <Box
          sx={{
            position: 'absolute',
            top: -10,
            right: -10,
            bgcolor: '#ffd700',
            color: '#000',
            borderRadius: '50%',
            width: 24,
            height: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 'bold',
            border: '2px solid white',
          }}
          title="PTP Master"
        >
          M
        </Box>
      )}

      {/* Node Name */}
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.5 }}>
        {data.name}
      </Typography>

      {/* Node Type */}
      <Chip
        label={data.type.toUpperCase()}
        size="small"
        sx={{
          bgcolor: `${data.color}40`,
          color: data.color,
          fontWeight: 600,
          fontSize: 10,
          height: 20,
          mb: 1,
        }}
      />

      {/* Status Indicator */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: statusColor,
          }}
        />
        <Typography variant="caption" color="text.secondary">
          {data.status}
        </Typography>
      </Stack>

      {/* Endpoint Counts */}
      <Typography variant="caption" color="text.secondary">
        {data.talker_count} talkers · {data.listener_count} listeners
      </Typography>

      {/* Active Routes */}
      {data.active_routes > 0 && (
        <Typography variant="caption" color="primary" display="block" sx={{ mt: 0.5 }}>
          {data.active_routes} active route{data.active_routes !== 1 ? 's' : ''}
        </Typography>
      )}

      {/* PTP Sync Info */}
      {data.ptp && data.ptp.status === 'synced' && (
        <Typography variant="caption" color="success.main" display="block" sx={{ mt: 0.5 }}>
          ⏱ {data.ptp.offset_ns}ns offset
        </Typography>
      )}
    </Paper>
  );
}

const nodeTypes = {
  avbNode: AvbNodeComponent,
};

/**
 * Auto-layout nodes using dagre
 */
function getLayoutedElements(nodes: Node[], edges: Edge[], direction = 'TB') {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, ranksep: 100, nodesep: 80 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: 220, height: 160 });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.position = {
      x: nodeWithPosition.x - 110,
      y: nodeWithPosition.y - 80,
    };
  });

  return { nodes, edges };
}

/**
 * Inner component with ReactFlow context
 */
function NetworkTopologyContent({ onClose }: { onClose: () => void }) {
  const { state } = useRouting();
  const { data: nodesData = [] } = useNodes();
  const { data: ptpStatus } = usePtpStatus();
  const { fitView } = useReactFlow();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Convert AVB nodes to ReactFlow nodes
  const { nodes, edges } = useMemo(() => {
    const flowNodes: Node[] = nodesData.map((node) => ({
      id: node.node_id,
      type: 'avbNode',
      data: { ...node, selected: node.node_id === selectedNodeId },
      position: { x: 0, y: 0 }, // Will be calculated by layout
    }));

    const flowEdges: Edge[] = [];

    // Add PTP hierarchy edges (master -> slave)
    nodesData.forEach((node) => {
      if (node.ptp?.master_node_id && node.ptp.master_node_id !== node.node_id) {
        flowEdges.push({
          id: `ptp-${node.ptp.master_node_id}-${node.node_id}`,
          source: node.ptp.master_node_id,
          target: node.node_id,
          type: 'smoothstep',
          animated: node.ptp.status === 'synced',
          label: 'PTP',
          style: { stroke: '#ffd700', strokeWidth: 2 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#ffd700',
          },
          labelStyle: { fontSize: 10, fontWeight: 600, fill: '#ffd700' },
        });
      }
    });

    // Add route edges (cross-node routes)
    Object.values(state.network.crossNodeRoutes).forEach((route) => {
      const edgeId = `route-${route.talker_node_id}-${route.listener_node_id}`;

      // Check if edge already exists
      if (!flowEdges.find((e) => e.id === edgeId)) {
        flowEdges.push({
          id: edgeId,
          source: route.talker_node_id,
          target: route.listener_node_id,
          type: 'smoothstep',
          animated: route.state === 'connected',
          label: `${route.active_connections} route${route.active_connections !== 1 ? 's' : ''}`,
          style: {
            stroke: route.state === 'connected' ? '#2196f3' : '#9e9e9e',
            strokeWidth: Math.min(2 + route.active_connections, 6),
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: route.state === 'connected' ? '#2196f3' : '#9e9e9e',
          },
          labelStyle: { fontSize: 10, fill: '#2196f3' },
        });
      }
    });

    return getLayoutedElements(flowNodes, flowEdges);
  }, [nodesData, state.network.crossNodeRoutes, selectedNodeId]);

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id === selectedNodeId ? null : node.id);
  }, [selectedNodeId]);

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.2, duration: 800 });
  }, [fitView]);

  const onlineCount = nodesData.filter((n) => n.status === 'online').length;
  const totalRoutes = Object.values(state.network.crossNodeRoutes).reduce(
    (sum, r) => sum + r.active_connections,
    0
  );

  return (
    <>
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography variant="h6" component="span">
              Network Topology
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
              <Chip
                label={`${onlineCount}/${nodesData.length} nodes online`}
                size="small"
                color={onlineCount === nodesData.length ? 'success' : 'warning'}
              />
              {totalRoutes > 0 && (
                <Chip label={`${totalRoutes} cross-node routes`} size="small" color="primary" />
              )}
              {ptpStatus?.ptp_enabled && (
                <Chip label="PTP Sync Active" size="small" color="info" />
              )}
            </Stack>
          </Box>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent sx={{ p: 0, height: '70vh', bgcolor: 'grey.100' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={handleNodeClick}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
          maxZoom={2}
        >
          <Background />
          <Controls />
          <MiniMap
            nodeColor={(node) => {
              const avbNode = nodesData.find((n) => n.node_id === node.id);
              return avbNode?.color || '#1976d2';
            }}
            nodeBorderRadius={4}
          />
          <Panel position="top-right">
            <Tooltip title="Fit to view">
              <IconButton
                onClick={handleFitView}
                sx={{
                  bgcolor: 'background.paper',
                  '&:hover': { bgcolor: 'background.paper' },
                  boxShadow: 2,
                }}
                size="small"
              >
                <FitScreenIcon />
              </IconButton>
            </Tooltip>
          </Panel>
          <Panel position="bottom-left">
            <Paper sx={{ p: 1.5, maxWidth: 300 }}>
              <Typography variant="caption" fontWeight={600} display="block" gutterBottom>
                Legend
              </Typography>
              <Stack spacing={0.5}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Box sx={{ width: 20, height: 2, bgcolor: '#ffd700' }} />
                  <Typography variant="caption">PTP Sync (gold)</Typography>
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Box sx={{ width: 20, height: 2, bgcolor: '#2196f3' }} />
                  <Typography variant="caption">Active Routes (blue)</Typography>
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Box
                    sx={{
                      width: 16,
                      height: 16,
                      bgcolor: '#ffd700',
                      color: '#000',
                      borderRadius: '50%',
                      fontSize: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                    }}
                  >
                    M
                  </Box>
                  <Typography variant="caption">PTP Master</Typography>
                </Stack>
              </Stack>
            </Paper>
          </Panel>
        </ReactFlow>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} variant="contained">
          Close
        </Button>
      </DialogActions>
    </>
  );
}

/**
 * Main modal component with ReactFlow provider
 */
export function NetworkTopologyModal({ open, onClose }: NetworkTopologyModalProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth>
      <ReactFlowProvider>
        <NetworkTopologyContent onClose={onClose} />
      </ReactFlowProvider>
    </Dialog>
  );
}

export default NetworkTopologyModal;
