/**
 * Page 1: LCD Event Dashboard
 * Main real-time event feed with statistics and filtering.
 */

import React, { useState } from 'react';
import { useLCDEvents, useLCDStatistics } from '../hooks/useLCDEvents';
import { LCDEventFeed } from '../components/LCDEventFeed';
import { LCDEvent, EventSeverity } from '../models/lcd_event';

export function LCDDashboardPage() {
  const { events, connected, error } = useLCDEvents();
  const { stats } = useLCDStatistics();
  
  const [filterSeverity, setFilterSeverity] = useState<EventSeverity | 'all'>('all');
  const [filterType, setFilterType] = useState<string | 'all'>('all');
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [selectedEvent, setSelectedEvent] = useState<LCDEvent | null>(null);
  
  const filteredEvents = events.filter(e => {
    if (filterSeverity !== 'all' && e.severity !== filterSeverity) return false;
    if (filterType !== 'all' && e.event_type !== filterType) return false;
    return true;
  });
  
  const pinnedEvents = events.filter(e => pinned.has(e.event_id));
  const displayedEvents = [...pinnedEvents, ...filteredEvents];
  
  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-cyan-400 mb-2">LCD Event Dashboard</h1>
        <p className="text-gray-400">Real-time distributed event monitoring</p>
        
        {/* Connection status */}
        <div className="mt-4 flex items-center gap-4">
          <div className={`flex items-center gap-2 px-3 py-1 rounded-lg ${
            connected ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
          }`}>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'} animate-pulse`}></span>
            {connected ? 'Connected' : 'Disconnected'}
          </div>
          
          {error && (
            <div className="text-red-400 text-sm">{error.message}</div>
          )}
        </div>
      </div>
      
      {/* Statistics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <StatCard label="Total Events" value={stats.total_events} color="cyan" />
        <StatCard label="Local Events" value={stats.local_events} color="green" />
        <StatCard label="Remote Events" value={stats.remote_events} color="yellow" />
        <StatCard label="Active Nodes" value={stats.active_nodes.length} color="blue" />
        <StatCard label="Connected Peers" value={stats.connected_peers.length} color="purple" />
      </div>
      
      {/* Filters */}
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 mb-6">
        <h3 className="font-semibold text-cyan-400 mb-3">Filters</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Severity filter */}
          <div>
            <label className="text-sm text-gray-300 block mb-2">Severity</label>
            <select
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value as any)}
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white"
            >
              <option value="all">All Severities</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          
          {/* Type filter */}
          <div>
            <label className="text-sm text-gray-300 block mb-2">Event Type</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white"
            >
              <option value="all">All Types</option>
              <option value="audio">Audio</option>
              <option value="system">System</option>
              <option value="network">Network</option>
              <option value="service">Service</option>
              <option value="user">User</option>
              <option value="alert">Alert</option>
            </select>
          </div>
        </div>
      </div>
      
      {/* Pinned Events Section */}
      {pinnedEvents.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-yellow-400 mb-3">📌 Pinned Events ({pinnedEvents.length})</h3>
          <LCDEventFeed
            events={pinnedEvents}
            maxHeight="200px"
            onEventClick={(e) => setSelectedEvent(e)}
          />
        </div>
      )}
      
      {/* Event Feed */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-cyan-400 mb-3">
          Event Feed ({filteredEvents.length})
        </h3>
        <LCDEventFeed
          events={filteredEvents}
          maxHeight="500px"
          onEventClick={(e) => setSelectedEvent(e)}
        />
      </div>
      
      {/* Event Details Modal */}
      {selectedEvent && (
        <EventDetailsModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onPin={() => {
            const newPinned = new Set(pinned);
            newPinned.add(selectedEvent.event_id);
            setPinned(newPinned);
          }}
          isPinned={pinned.has(selectedEvent.event_id)}
          onUnpin={() => {
            const newPinned = new Set(pinned);
            newPinned.delete(selectedEvent.event_id);
            setPinned(newPinned);
          }}
        />
      )}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  color: 'cyan' | 'green' | 'yellow' | 'blue' | 'purple';
}

function StatCard({ label, value, color }: StatCardProps) {
  const colors = {
    cyan: 'text-cyan-400 border-cyan-500 bg-cyan-900/20',
    green: 'text-green-400 border-green-500 bg-green-900/20',
    yellow: 'text-yellow-400 border-yellow-500 bg-yellow-900/20',
    blue: 'text-blue-400 border-blue-500 bg-blue-900/20',
    purple: 'text-purple-400 border-purple-500 bg-purple-900/20'
  };
  
  return (
    <div className={`border rounded-lg p-4 text-center ${colors[color]}`}>
      <div className="text-3xl font-bold">{value}</div>
      <div className="text-xs text-gray-300 mt-1">{label}</div>
    </div>
  );
}

interface EventDetailsModalProps {
  event: LCDEvent;
  onClose: () => void;
  onPin: () => void;
  onUnpin: () => void;
  isPinned: boolean;
}

function EventDetailsModal({ event, onClose, onPin, onUnpin, isPinned }: EventDetailsModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border-2 border-cyan-500 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <span className="text-4xl">{event.icon}</span>
            <div>
              <h2 className="text-2xl font-bold text-cyan-400">{event.title}</h2>
              <p className="text-gray-400 text-sm">{event.source_node}</p>
            </div>
          </div>
          
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ✕
          </button>
        </div>
        
        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Message */}
          <div>
            <label className="text-gray-400 text-sm block mb-1">Message</label>
            <p className="text-white text-lg">{event.message}</p>
          </div>
          
          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-gray-400 text-sm">Severity</label>
              <p className="text-white font-semibold">{event.severity.toUpperCase()}</p>
            </div>
            <div>
              <label className="text-gray-400 text-sm">Type</label>
              <p className="text-white font-semibold">{event.event_type.toUpperCase()}</p>
            </div>
            <div>
              <label className="text-gray-400 text-sm">Time</label>
              <p className="text-white font-mono text-sm">{new Date(event.timestamp).toLocaleString()}</p>
            </div>
            <div>
              <label className="text-gray-400 text-sm">Event ID</label>
              <p className="text-white font-mono text-sm">{event.event_id.substring(0, 12)}...</p>
            </div>
          </div>
          
          {/* Context */}
          {Object.keys(event.context).length > 0 && (
            <div>
              <label className="text-gray-400 text-sm block mb-2">Context</label>
              <pre className="bg-gray-800 p-3 rounded text-sm text-green-400 overflow-x-auto">
                {JSON.stringify(event.context, null, 2)}
              </pre>
            </div>
          )}
          
          {/* Routing info */}
          <div className="bg-gray-800 rounded p-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Broadcast:</span>
              <span className="text-white">{event.broadcast ? '✓ Yes' : '✗ No'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Sound:</span>
              <span className="text-white">{event.sound ? '🔊 Yes' : '🔇 No'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">TTL:</span>
              <span className="text-white">{event.ttl}s</span>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-gray-700">
          <button
            onClick={isPinned ? onUnpin : onPin}
            className="flex-1 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded font-semibold"
          >
            {isPinned ? '📌 Unpin' : '📌 Pin'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
