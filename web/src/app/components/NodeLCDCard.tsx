"""React component for node status card"""

import React from 'react';

interface NodeStatus {
  nodeId: string;
  status: 'online' | 'offline' | 'local';
  lastEvent?: string;
  eventCount: number;
  cpu?: number;
  memory?: number;
}

interface NodeLCDCardProps {
  node: NodeStatus;
  onClick?: () => void;
  selected?: boolean;
}

export function NodeLCDCard({ node, onClick, selected = false }: NodeLCDCardProps) {
  const statusColor = {
    online: 'bg-green-900 border-green-500 text-green-400',
    offline: 'bg-yellow-900 border-yellow-500 text-yellow-400',
    local: 'bg-blue-900 border-blue-500 text-blue-400'
  }[node.status];
  
  const statusLabel = {
    online: '✓ ONLINE',
    offline: '⚠ OFFLINE',
    local: '◆ LOCAL'
  }[node.status];
  
  return (
    <div
      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
        selected 
          ? 'ring-2 ring-cyan-400 shadow-lg shadow-cyan-500/50' 
          : 'hover:border-cyan-400'
      } ${statusColor}`}
      onClick={onClick}
    >
      {/* Node ID */}
      <h3 className="text-lg font-bold truncate">{node.nodeId}</h3>
      
      {/* Status badge */}
      <div className="mt-2 inline-block text-xs px-2 py-1 rounded bg-black/50">
        {statusLabel}
      </div>
      
      {/* Stats grid */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-xs opacity-75">Last Event</span>
          <div className="font-mono text-xs">{node.lastEvent || '—'}</div>
        </div>
        
        <div>
          <span className="text-xs opacity-75">Events</span>
          <div className="font-bold">{node.eventCount}</div>
        </div>
        
        {node.cpu !== undefined && (
          <div>
            <span className="text-xs opacity-75">CPU</span>
            <div className="font-mono text-xs">{node.cpu.toFixed(1)}%</div>
          </div>
        )}
        
        {node.memory !== undefined && (
          <div>
            <span className="text-xs opacity-75">Memory</span>
            <div className="font-mono text-xs">{node.memory.toFixed(1)}%</div>
          </div>
        )}
      </div>
      
      {/* Health bar */}
      {node.cpu !== undefined && (
        <div className="mt-3 space-y-1">
          <div className="text-xs opacity-75">CPU Usage</div>
          <div className="h-2 bg-black/50 rounded overflow-hidden">
            <div
              className={`h-full transition-all ${
                node.cpu > 80 ? 'bg-red-500' : node.cpu > 50 ? 'bg-yellow-500' : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(node.cpu, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Grid of node cards
 */
export function NodeLCDGrid({ 
  nodes, 
  selectedNode, 
  onNodeSelect 
}: { 
  nodes: NodeStatus[]; 
  selectedNode?: string; 
  onNodeSelect?: (nodeId: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {nodes.map((node) => (
        <NodeLCDCard
          key={node.nodeId}
          node={node}
          selected={node.nodeId === selectedNode}
          onClick={() => onNodeSelect?.(node.nodeId)}
        />
      ))}
    </div>
  );
}
