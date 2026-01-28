/**
 * SidechainPanel - Visual Sidechain Routing Management
 *
 * Displays and manages sidechain connections between plugins
 * in the audio processing chain.
 */

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link2, Unlink, Plus, ArrowRight, AlertCircle, RefreshCw } from 'lucide-react';

// Sidechain connection type
interface SidechainConnection {
  id: string;
  sourcePluginId: number;
  sourcePluginName: string;
  destPluginId: number;
  destPluginName: string;
  destBus: number;
  active: boolean;
}

// Plugin with sidechain capability
interface SidechainCapablePlugin {
  instanceId: number;
  name: string;
  numSidechainBuses: number;
  sidechainBusNames: string[];
  canBeSidechainSource: boolean;
}

interface SidechainPanelProps {
  /** Custom class name */
  className?: string;
  /** Compact mode */
  compact?: boolean;
}

export const SidechainPanel: React.FC<SidechainPanelProps> = ({
  className = '',
  compact = false,
}) => {
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [newConnection, setNewConnection] = useState<{
    sourceId: number | null;
    destId: number | null;
    destBus: number;
  }>({
    sourceId: null,
    destId: null,
    destBus: 1, // Default sidechain bus
  });

  // Fetch current sidechain connections
  const connectionsQuery = useQuery<SidechainConnection[]>({
    queryKey: ['sidechain', 'connections'],
    queryFn: async () => {
      const res = await fetch('/api/routing/sidechain');
      if (!res.ok) throw new Error('Failed to fetch sidechain connections');
      return res.json();
    },
    refetchInterval: 2000,
  });

  // Fetch plugins capable of sidechain
  const pluginsQuery = useQuery<SidechainCapablePlugin[]>({
    queryKey: ['sidechain', 'plugins'],
    queryFn: async () => {
      const res = await fetch('/api/routing/sidechain-plugins');
      if (!res.ok) throw new Error('Failed to fetch sidechain-capable plugins');
      return res.json();
    },
  });

  // Create sidechain connection
  const createMutation = useMutation({
    mutationFn: async (params: { sourceId: number; destId: number; destBus: number }) => {
      const res = await fetch('/api/routing/sidechain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error('Failed to create sidechain connection');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sidechain'] });
      setIsCreating(false);
      setNewConnection({ sourceId: null, destId: null, destBus: 1 });
    },
  });

  // Delete sidechain connection
  const deleteMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const res = await fetch(`/api/routing/sidechain/${connectionId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete sidechain connection');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sidechain'] });
    },
  });

  // Toggle connection active state
  const toggleMutation = useMutation({
    mutationFn: async (params: { connectionId: string; active: boolean }) => {
      const res = await fetch(`/api/routing/sidechain/${params.connectionId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: params.active }),
      });
      if (!res.ok) throw new Error('Failed to toggle sidechain connection');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sidechain'] });
    },
  });

  const connections = connectionsQuery.data || [];
  const plugins = pluginsQuery.data || [];

  // Filter plugins that can be sidechain sources (have audio output)
  const sourcePlugins = useMemo(() => {
    return plugins.filter(p => p.canBeSidechainSource);
  }, [plugins]);

  // Filter plugins that have sidechain inputs
  const destPlugins = useMemo(() => {
    return plugins.filter(p => p.numSidechainBuses > 0);
  }, [plugins]);

  const handleCreate = () => {
    if (newConnection.sourceId !== null && newConnection.destId !== null) {
      createMutation.mutate({
        sourceId: newConnection.sourceId,
        destId: newConnection.destId,
        destBus: newConnection.destBus,
      });
    }
  };

  return (
    <div className={className}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link2 size={18} style={{ color: '#a855f7' }} />
          <span style={{
            fontSize: 14,
            fontWeight: 600,
            color: '#f2f6ff',
          }}>
            Sidechain Routing
          </span>
          <span style={{
            fontSize: 10,
            padding: '2px 6px',
            background: 'rgba(168, 85, 247, 0.15)',
            border: '1px solid rgba(168, 85, 247, 0.3)',
            borderRadius: 10,
            color: '#a855f7',
          }}>
            {connections.length} active
          </span>
        </div>

        <button
          onClick={() => setIsCreating(!isCreating)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '6px 10px',
            fontSize: 11,
            fontWeight: 500,
            background: isCreating ? 'rgba(168, 85, 247, 0.2)' : 'rgba(255, 255, 255, 0.05)',
            border: `1px solid ${isCreating ? 'rgba(168, 85, 247, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
            borderRadius: 6,
            color: isCreating ? '#a855f7' : '#888',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          <Plus size={12} />
          New
        </button>
      </div>

      {/* Create new connection form */}
      {isCreating && (
        <div style={{
          padding: 12,
          background: 'rgba(168, 85, 247, 0.05)',
          border: '1px solid rgba(168, 85, 247, 0.2)',
          borderRadius: 8,
          marginBottom: 12,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 12,
          }}>
            {/* Source plugin */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>Source</div>
              <select
                value={newConnection.sourceId ?? ''}
                onChange={(e) => setNewConnection(prev => ({
                  ...prev,
                  sourceId: e.target.value ? Number(e.target.value) : null,
                }))}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  fontSize: 11,
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 4,
                  color: '#fff',
                }}
              >
                <option value="">Select source...</option>
                {sourcePlugins.map(p => (
                  <option key={p.instanceId} value={p.instanceId}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <ArrowRight size={16} style={{ color: '#666', flexShrink: 0, marginTop: 16 }} />

            {/* Destination plugin */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>Destination</div>
              <select
                value={newConnection.destId ?? ''}
                onChange={(e) => setNewConnection(prev => ({
                  ...prev,
                  destId: e.target.value ? Number(e.target.value) : null,
                }))}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  fontSize: 11,
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 4,
                  color: '#fff',
                }}
              >
                <option value="">Select destination...</option>
                {destPlugins.map(p => (
                  <option key={p.instanceId} value={p.instanceId}>
                    {p.name} ({p.numSidechainBuses} SC bus{p.numSidechainBuses !== 1 ? 'es' : ''})
                  </option>
                ))}
              </select>
            </div>

            {/* Destination bus */}
            <div style={{ width: 70 }}>
              <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>Bus</div>
              <select
                value={newConnection.destBus}
                onChange={(e) => setNewConnection(prev => ({
                  ...prev,
                  destBus: Number(e.target.value),
                }))}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  fontSize: 11,
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 4,
                  color: '#fff',
                }}
              >
                {[1, 2, 3, 4].map(bus => (
                  <option key={bus} value={bus}>SC {bus}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Create button */}
          <button
            onClick={handleCreate}
            disabled={newConnection.sourceId === null || newConnection.destId === null || createMutation.isPending}
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: 12,
              fontWeight: 600,
              background: 'rgba(168, 85, 247, 0.2)',
              border: '1px solid rgba(168, 85, 247, 0.4)',
              borderRadius: 6,
              color: '#a855f7',
              cursor: createMutation.isPending ? 'wait' : 'pointer',
              opacity: (newConnection.sourceId === null || newConnection.destId === null) ? 0.5 : 1,
            }}
          >
            {createMutation.isPending ? (
              <RefreshCw size={12} className="animate-spin" style={{ marginRight: 6 }} />
            ) : (
              <Link2 size={12} style={{ marginRight: 6 }} />
            )}
            Create Connection
          </button>
        </div>
      )}

      {/* Connections list */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}>
        {connectionsQuery.isLoading ? (
          <div style={{
            padding: 20,
            textAlign: 'center',
            color: '#666',
          }}>
            <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto' }} />
          </div>
        ) : connections.length === 0 ? (
          <div style={{
            padding: 20,
            textAlign: 'center',
            color: '#666',
          }}>
            <Unlink size={24} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
            <div style={{ fontSize: 12 }}>No sidechain connections</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>
              Click "New" to create a sidechain route
            </div>
          </div>
        ) : (
          connections.map((conn) => (
            <div
              key={conn.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: compact ? '8px 10px' : '10px 12px',
                background: conn.active ? 'rgba(168, 85, 247, 0.05)' : 'rgba(0, 0, 0, 0.2)',
                border: `1px solid ${conn.active ? 'rgba(168, 85, 247, 0.2)' : 'rgba(255, 255, 255, 0.1)'}`,
                borderRadius: 6,
                opacity: conn.active ? 1 : 0.6,
              }}
            >
              {/* Source */}
              <div style={{
                flex: 1,
                minWidth: 0,
                fontSize: compact ? 11 : 12,
                color: '#fff',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {conn.sourcePluginName}
              </div>

              {/* Arrow */}
              <ArrowRight size={14} style={{ color: conn.active ? '#a855f7' : '#666', flexShrink: 0 }} />

              {/* Destination */}
              <div style={{
                flex: 1,
                minWidth: 0,
                fontSize: compact ? 11 : 12,
                color: '#fff',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {conn.destPluginName}
                <span style={{ color: '#666', marginLeft: 4 }}>SC{conn.destBus}</span>
              </div>

              {/* Toggle button */}
              <button
                onClick={() => toggleMutation.mutate({ connectionId: conn.id, active: !conn.active })}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 4,
                  border: `1px solid ${conn.active ? 'rgba(168, 85, 247, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
                  background: conn.active ? 'rgba(168, 85, 247, 0.2)' : 'transparent',
                  color: conn.active ? '#a855f7' : '#666',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
                title={conn.active ? 'Disable' : 'Enable'}
              >
                <Link2 size={12} />
              </button>

              {/* Delete button */}
              <button
                onClick={() => deleteMutation.mutate(conn.id)}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 4,
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  background: 'transparent',
                  color: '#ef4444',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
                title="Delete connection"
              >
                <Unlink size={12} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Warning if no plugins support sidechain */}
      {plugins.length > 0 && destPlugins.length === 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          marginTop: 12,
          background: 'rgba(234, 179, 8, 0.1)',
          border: '1px solid rgba(234, 179, 8, 0.2)',
          borderRadius: 6,
          fontSize: 11,
          color: '#eab308',
        }}>
          <AlertCircle size={14} />
          No plugins with sidechain inputs loaded
        </div>
      )}
    </div>
  );
};

export default SidechainPanel;
