// ============================================================================
// MAP2 Audio Platform - Chain Flow Canvas Component
// Main React Flow container for signal chain visualization
// ============================================================================

import React, { useCallback, DragEvent } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  useReactFlow,
} from 'reactflow';
import { Box, Alert } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import 'reactflow/dist/style.css';

import AudioPluginNode from './nodes/AudioPluginNode';
import DeviceNode from './nodes/DeviceNode';
import RoutingNode from './nodes/RoutingNode';
import AudioConnectionEdge from './edges/AudioConnectionEdge';
import SidechainConnectionEdge from './edges/SidechainConnectionEdge';
import { useChainFlow } from './hooks/useChainFlow';
import { AudioPluginNode as AudioPluginNodeType } from './nodes/AudioPluginNodeTypes';
import { DeviceNode as DeviceNodeType } from './nodes/DeviceNodeTypes';
import { RoutingNode as RoutingNodeType } from './nodes/RoutingNodeTypes';
import { AudioConnectionEdge as AudioConnectionEdgeType } from './edges/AudioConnectionEdgeTypes';
import { SidechainConnectionEdge as SidechainConnectionEdgeType } from './edges/SidechainConnectionEdgeTypes';

// Register custom node and edge types
const nodeTypes = {
  audioPlugin: AudioPluginNode,
  deviceNode: DeviceNode,
  routingNode: RoutingNode,
};

const edgeTypes = {
  audioConnection: AudioConnectionEdge,
  sidechainConnection: SidechainConnectionEdge,
};

export type FlowNodeType = AudioPluginNodeType | DeviceNodeType | RoutingNodeType;

export interface ChainFlowCanvasProps {
  nodes: Array<FlowNodeType>;
  edges: Array<AudioConnectionEdgeType | SidechainConnectionEdgeType>;
  sidechainEdges?: SidechainConnectionEdgeType[];
  onNodesChange: (nodes: Array<FlowNodeType>) => void;
  onNodeClick?: (node: FlowNodeType) => void;
  onNodeContextMenu?: (node: FlowNodeType, event: React.MouseEvent) => void;
  onDrop?: (pluginUri: string, position: { x: number; y: number }) => void;
  onNodeDragStop?: (nodes: Array<FlowNodeType>) => void;
  onSidechainConnect?: (connection: any) => void;
  onSidechainDisconnect?: (edgeId: string) => void;
}

function ChainFlowCanvasInner({
  nodes: initialNodes,
  edges: initialEdges,
  onNodesChange,
  onNodeClick,
  onNodeContextMenu,
  onDrop,
  onNodeDragStop,
}: ChainFlowCanvasProps) {
  const theme = useTheme();
  const reactFlowInstance = useReactFlow();
  const { nodes, edges, setNodes, setEdges, onNodesChange: handleNodesChange, onEdgesChange, onConnect } =
    useChainFlow(initialNodes, initialEdges);

  // Update parent component when nodes change
  const wrappedOnNodesChange = useCallback(
    (changes: any) => {
      handleNodesChange(changes);
      // Notify parent of node changes after a short delay
      setTimeout(() => {
        onNodesChange(nodes);
      }, 100);
    },
    [handleNodesChange, onNodesChange, nodes]
  );

  // Handle node clicks
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: FlowNodeType) => {
      if (onNodeClick) {
        onNodeClick(node);
      }
    },
    [onNodeClick]
  );

  // Handle node drag stop (for reordering)
  const handleNodeDragStop = useCallback(
    (_event: React.MouseEvent, _node: any) => {
      if (onNodeDragStop) {
        // Pass current nodes after drag completes
        setTimeout(() => {
          onNodeDragStop(nodes);
        }, 100);
      }
    },
    [onNodeDragStop, nodes]
  );

  // Drag and drop handlers
  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();

      const reactFlowBounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const data = event.dataTransfer.getData('application/reactflow');

      if (!data || !onDrop) return;

      try {
        const { pluginUri } = JSON.parse(data);

        // Calculate drop position
        const position = reactFlowInstance.project({
          x: event.clientX - reactFlowBounds.left,
          y: event.clientY - reactFlowBounds.top,
        });

        onDrop(pluginUri, position);
      } catch (error) {
        console.error('Failed to handle drop:', error);
      }
    },
    [reactFlowInstance, onDrop]
  );

  // Update nodes and edges when props change
  React.useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  React.useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: any) => {
      event.preventDefault();
      onNodeContextMenu?.(node, event);
    },
    [onNodeContextMenu]
  );

  // Empty state
  if (nodes.length === 0) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
        }}
      >
        <Alert severity="info">
          No plugins in this chain. Drag a plugin from the browser to add one.
        </Alert>
      </Box>
    );
  }

  return (
    <Box
      sx={{ height: '100%', width: '100%' }}
      onDragOver={onDragOver}
      onDrop={handleDrop}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={wrappedOnNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        onNodeContextMenu={handleNodeContextMenu}
        onNodeDragStop={handleNodeDragStop}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.25}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        style={{
          background: theme.palette.background.default,
        }}
      >
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(node: any) => {
            if (node.data?.isBypassed) return theme.palette.grey[600];
            return theme.palette.primary.main;
          }}
          maskColor="rgba(42, 42, 42, 0.8)"
          style={{
            backgroundColor: theme.palette.background.paper,
            border: `1px solid ${theme.palette.divider}`,
          }}
        />
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
      </ReactFlow>
    </Box>
  );
}
export default function ChainFlowCanvas(props: ChainFlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <ChainFlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
