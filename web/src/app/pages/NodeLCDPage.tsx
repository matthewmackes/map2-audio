/**
 * Page 2: Per-Node LCD Display
 * Monitor individual node LCD displays with detailed status.
 */

import React, { useState } from 'react';
import { useLCDEventHistory } from '../hooks/useLCDEvents';
import { LCDEmulator } from '../components/LCDEmulator';
import { NodeLCDGrid } from '../components/NodeLCDCard';
import { LCDEventFeed, CompactLCDEventFeed } from '../components/LCDEventFeed';
import { LCDEvent } from '../models/lcd_event';

interface MockNodeStatus {
  nodeId: string;
  status: 'online' | 'offline' | 'local';
  lastEvent?: string;
  eventCount: number;
  cpu?: number;
  memory?: number;
}

export function NodeLCDPage() {
  const [selectedNode, setSelectedNode] = useState<string>('NODE-0000');
  
  // Mock nodes (in real app, fetch from API)
  const [nodes] = useState<MockNodeStatus[]>([
    {
      nodeId: 'AUDIO-NODE-A1B2',
      status: 'online',
      eventCount: 42,
      lastEvent: '14:32:15',
      cpu: 65,
      memory: 48
    },
    {
      nodeId: 'AUDIO-NODE-C3D4',
      status: 'online',
      eventCount: 38,
      lastEvent: '14:32:08',
      cpu: 52,
      memory: 41
    },
    {
      nodeId: 'CONTROL-NODE-E5F6',
      status: 'local',
      eventCount: 127,
      lastEvent: '14:32:22'
    },
    {
      nodeId: 'AUDIO-NODE-G7H8',
      status: 'offline',
      eventCount: 25,
      lastEvent: '14:15:43'
    }
  ]);
  
  const { events: nodeEvents } = useLCDEventHistory(50, undefined, undefined, 'local');
  
  const selectedNodeData = nodes.find(n => n.nodeId === selectedNode);
  const currentEvent = nodeEvents[0];
  
  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-cyan-400 mb-2">Per-Node LCD Display</h1>
        <p className="text-gray-400">Monitor individual audio node LCD displays</p>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Node Grid */}
        <div className="lg:col-span-1">
          <h2 className="text-xl font-semibold text-cyan-400 mb-4">Audio Nodes</h2>
          <NodeLCDGrid
            nodes={nodes}
            selectedNode={selectedNode}
            onNodeSelect={setSelectedNode}
          />
        </div>
        
        {/* Right: LCD Display & Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* LCD Preview */}
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-cyan-400 mb-4">LCD Preview</h3>
            <div className="flex justify-center">
              <LCDEmulator
                event={currentEvent}
                nodeLabel={selectedNode}
                loading={!selectedNodeData}
              />
            </div>
          </div>
          
          {/* Node Details */}
          {selectedNodeData && (
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-cyan-400 mb-4">Node Status</h3>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                <DetailItem 
                  label="Node ID" 
                  value={selectedNodeData.nodeId}
                  mono
                />
                <DetailItem 
                  label="Status" 
                  value={selectedNodeData.status.toUpperCase()}
                  color={selectedNodeData.status === 'online' ? 'text-green-400' : 
                         selectedNodeData.status === 'offline' ? 'text-red-400' : 'text-blue-400'}
                />
                <DetailItem 
                  label="Last Event" 
                  value={selectedNodeData.lastEvent || '—'}
                  mono
                />
                <DetailItem 
                  label="Event Count" 
                  value={String(selectedNodeData.eventCount)}
                  color="text-cyan-400"
                />
                {selectedNodeData.cpu !== undefined && (
                  <DetailItem 
                    label="CPU Usage" 
                    value={`${selectedNodeData.cpu.toFixed(1)}%`}
                    color={selectedNodeData.cpu > 80 ? 'text-red-400' : 
                           selectedNodeData.cpu > 50 ? 'text-yellow-400' : 'text-green-400'}
                  />
                )}
                {selectedNodeData.memory !== undefined && (
                  <DetailItem 
                    label="Memory Usage" 
                    value={`${selectedNodeData.memory.toFixed(1)}%`}
                    color={selectedNodeData.memory > 80 ? 'text-red-400' : 
                           selectedNodeData.memory > 50 ? 'text-yellow-400' : 'text-green-400'}
                  />
                )}
              </div>
              
              {/* Health Bars */}
              {selectedNodeData.cpu !== undefined && (
                <HealthBar 
                  label="CPU Load" 
                  value={selectedNodeData.cpu}
                />
              )}
              {selectedNodeData.memory !== undefined && (
                <HealthBar 
                  label="Memory" 
                  value={selectedNodeData.memory}
                />
              )}
            </div>
          )}
          
          {/* Recent Events for This Node */}
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-cyan-400 mb-4">Recent Events (10)</h3>
            <LCDEventFeed
              events={nodeEvents.slice(0, 10)}
              maxHeight="300px"
            />
          </div>
        </div>
      </div>
      
      {/* All Nodes Overview */}
      <div className="mt-8 bg-gray-900 border border-gray-700 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-cyan-400 mb-4">Cluster Overview</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {nodes.map((node) => (
            <NodeOverviewCard key={node.nodeId} node={node} />
          ))}
        </div>
      </div>
    </div>
  );
}

interface DetailItemProps {
  label: string;
  value: string;
  color?: string;
  mono?: boolean;
}

function DetailItem({ label, value, color = 'text-white', mono = false }: DetailItemProps) {
  return (
    <div>
      <p className="text-gray-400 text-sm mb-1">{label}</p>
      <p className={`font-bold ${color} ${mono ? 'font-mono text-sm' : ''}`}>{value}</p>
    </div>
  );
}

interface HealthBarProps {
  label: string;
  value: number;
}

function HealthBar({ label, value }: HealthBarProps) {
  const getColor = () => {
    if (value > 80) return 'bg-red-600';
    if (value > 50) return 'bg-yellow-600';
    return 'bg-green-600';
  };
  
  return (
    <div className="mb-4">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-400">{label}</span>
        <span className="text-white font-semibold">{value.toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-gray-800 rounded overflow-hidden">
        <div
          className={`h-full transition-all ${getColor()}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  );
}

function NodeOverviewCard({ node }: { node: MockNodeStatus }) {
  const statusColor = {
    online: 'border-green-500',
    offline: 'border-yellow-500',
    local: 'border-blue-500'
  }[node.status];
  
  return (
    <div className={`border-2 ${statusColor} rounded-lg p-3 bg-gray-800/50`}>
      <h4 className="font-semibold text-sm truncate">{node.nodeId}</h4>
      <p className="text-xs text-gray-400 mt-1">
        {node.status === 'online' ? '✓ Online' : 
         node.status === 'offline' ? '⚠ Offline' : '◆ Local'}
      </p>
      <p className="text-xs mt-2">
        <span className="text-cyan-400">{node.eventCount}</span> events
      </p>
      {node.cpu !== undefined && (
        <p className="text-xs text-yellow-400">CPU: {node.cpu.toFixed(0)}%</p>
      )}
    </div>
  );
}
