// ============================================================================
// MAP2 Audio Platform - Sidechain Connections Hook
// Manages sidechain routing state and API interactions
// ============================================================================

import { useState, useCallback, useEffect } from 'react';
import { Connection, Edge } from 'reactflow';
import { isSidechainHandle, getBusIndexFromHandle } from '../nodes/AudioPluginNodeTypes';
import {
  SidechainConnectionEdge,
  createSidechainConnectionEdge,
} from '../edges/SidechainConnectionEdgeTypes';

/**
 * Sidechain connection data from the backend
 */
export interface SidechainConnection {
  sourceInstanceId: number;
  sourcePluginUri: string;
  sourcePluginName: string;
  destInstanceId: number;
  destPluginUri: string;
  destPluginName: string;
  destBusIndex: number;
  destBusName?: string;
}

/**
 * API functions for sidechain management
 */
export interface SidechainAPI {
  connect: (sourceId: number, destId: number, busIndex: number) => Promise<void>;
  disconnect: (destId: number, busIndex: number) => Promise<void>;
  getConnections: () => Promise<SidechainConnection[]>;
}

/**
 * Plugin info for sidechain routing
 */
export interface PluginInfo {
  uri: string;
  name: string;
  instanceId: number;
  nodeId: string;
}

interface UseSidechainConnectionsOptions {
  api?: SidechainAPI;
  plugins: PluginInfo[];
  onError?: (error: Error) => void;
}

interface UseSidechainConnectionsReturn {
  // State
  connections: SidechainConnection[];
  edges: SidechainConnectionEdge[];
  isLoading: boolean;
  error: Error | null;

  // Actions
  handleConnect: (connection: Connection) => Promise<boolean>;
  handleDisconnect: (edgeId: string) => Promise<boolean>;
  refreshConnections: () => Promise<void>;

  // Helpers
  isSidechainConnection: (connection: Connection) => boolean;
  getPluginByNodeId: (nodeId: string) => PluginInfo | undefined;
}

/**
 * Hook for managing sidechain connections
 */
export function useSidechainConnections(
  options: UseSidechainConnectionsOptions
): UseSidechainConnectionsReturn {
  const { api, plugins, onError } = options;

  const [connections, setConnections] = useState<SidechainConnection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Get plugin by node ID
  const getPluginByNodeId = useCallback(
    (nodeId: string): PluginInfo | undefined => {
      // Node IDs are in format "plugin-{uri}-{index}"
      const match = nodeId.match(/^plugin-(.+)-\d+$/);
      if (!match) return undefined;
      const uri = match[1];
      return plugins.find((p) => p.uri === uri);
    },
    [plugins]
  );

  // Check if a connection is a sidechain connection
  const isSidechainConnection = useCallback((connection: Connection): boolean => {
    if (!connection.targetHandle) return false;
    return isSidechainHandle(connection.targetHandle);
  }, []);

  // Fetch connections from backend
  const refreshConnections = useCallback(async () => {
    if (!api) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await api.getConnections();
      setConnections(data);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch sidechain connections');
      setError(error);
      onError?.(error);
    } finally {
      setIsLoading(false);
    }
  }, [api, onError]);

  // Handle new sidechain connection
  const handleConnect = useCallback(
    async (connection: Connection): Promise<boolean> => {
      if (!api) return false;
      if (!isSidechainConnection(connection)) return false;

      const sourcePlugin = getPluginByNodeId(connection.source!);
      const targetPlugin = getPluginByNodeId(connection.target!);

      if (!sourcePlugin || !targetPlugin) {
        console.error('Could not find plugins for sidechain connection');
        return false;
      }

      const busIndex = getBusIndexFromHandle(connection.targetHandle!);

      setIsLoading(true);
      setError(null);

      try {
        await api.connect(sourcePlugin.instanceId, targetPlugin.instanceId, busIndex);
        await refreshConnections();
        return true;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to create sidechain connection');
        setError(error);
        onError?.(error);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [api, isSidechainConnection, getPluginByNodeId, refreshConnections, onError]
  );

  // Handle sidechain disconnection
  const handleDisconnect = useCallback(
    async (edgeId: string): Promise<boolean> => {
      if (!api) return false;

      // Find the connection by edge ID
      // Edge IDs are in format "sidechain-{sourceUri}-{targetUri}-bus{index}"
      const match = edgeId.match(/^sidechain-(.+)-(.+)-bus(\d+)$/);
      if (!match) return false;

      const [, sourceUri, targetUri, busIndexStr] = match;
      const busIndex = parseInt(busIndexStr, 10);

      const targetPlugin = plugins.find((p) => p.uri === targetUri);
      if (!targetPlugin) {
        console.error('Could not find target plugin for sidechain disconnection');
        return false;
      }

      setIsLoading(true);
      setError(null);

      try {
        await api.disconnect(targetPlugin.instanceId, busIndex);
        await refreshConnections();
        return true;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to remove sidechain connection');
        setError(error);
        onError?.(error);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [api, plugins, refreshConnections, onError]
  );

  // Convert connections to React Flow edges
  const edges: SidechainConnectionEdge[] = connections.map((conn) => {
    // Find node IDs for source and target plugins
    const sourceNodeId = plugins.find((p) => p.uri === conn.sourcePluginUri)?.nodeId;
    const targetNodeId = plugins.find((p) => p.uri === conn.destPluginUri)?.nodeId;

    if (!sourceNodeId || !targetNodeId) {
      console.warn('Could not find node IDs for sidechain connection', conn);
      return null;
    }

    return createSidechainConnectionEdge(
      sourceNodeId,
      targetNodeId,
      conn.sourcePluginUri,
      conn.sourcePluginName,
      conn.destPluginUri,
      conn.destPluginName,
      conn.destBusIndex,
      conn.destBusName
    );
  }).filter((edge): edge is SidechainConnectionEdge => edge !== null);

  // Fetch connections on mount
  useEffect(() => {
    refreshConnections();
  }, [refreshConnections]);

  return {
    connections,
    edges,
    isLoading,
    error,
    handleConnect,
    handleDisconnect,
    refreshConnections,
    isSidechainConnection,
    getPluginByNodeId,
  };
}

export default useSidechainConnections;
