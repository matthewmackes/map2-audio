// @ts-nocheck
// ============================================================================
// MAP2 Audio Platform - useChainFlow Hook
// State management for React Flow nodes and edges
// ============================================================================

import { useState, useCallback } from 'react';
import {
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
  Connection,
} from 'reactflow';
import { AudioPluginNode } from '../nodes/AudioPluginNodeTypes';
import { DeviceNode } from '../nodes/DeviceNodeTypes';
import { AudioConnectionEdge } from '../edges/AudioConnectionEdgeTypes';

export interface UseChainFlowReturn {
  nodes: Array<AudioPluginNode | DeviceNode>;
  edges: AudioConnectionEdge[];
  setNodes: React.Dispatch<React.SetStateAction<Array<AudioPluginNode | DeviceNode>>>;
  setEdges: React.Dispatch<React.SetStateAction<AudioConnectionEdge[]>>;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
}

/**
 * Custom hook for managing React Flow state
 */
export function useChainFlow(
  initialNodes: Array<AudioPluginNode | DeviceNode> = [],
  initialEdges: AudioConnectionEdge[] = []
): UseChainFlowReturn {
  const [nodes, setNodes] = useState<Array<AudioPluginNode | DeviceNode>>(initialNodes);
  const [edges, setEdges] = useState<AudioConnectionEdge[]>(initialEdges);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds) as Array<AudioPluginNode | DeviceNode>);
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds) as AudioConnectionEdge[]);
  }, []);

  // For linear chains, we don't allow manual edge connections
  // Edges are auto-generated based on plugin order
  const onConnect = useCallback((connection: Connection) => {
    // Log for debugging, but don't create edge
    console.log('Manual connection not supported in linear chain mode', connection);
  }, []);

  return {
    nodes,
    edges,
    setNodes,
    setEdges,
    onNodesChange,
    onEdgesChange,
    onConnect,
  };
}
