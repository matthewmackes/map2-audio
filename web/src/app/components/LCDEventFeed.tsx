"""React component for LCD event feed"""

import React from 'react';
import { LCDEvent } from '../models/lcd_event';

interface LCDEventFeedProps {
  events: LCDEvent[];
  onEventClick?: (event: LCDEvent) => void;
  maxHeight?: string;
}

const severityColors = {
  info: 'text-green-500',
  warning: 'text-yellow-500',
  error: 'text-red-500',
  critical: 'text-red-700 font-bold'
};

const eventTypeIcons = {
  audio: '🎵',
  system: '⚙️',
  network: '🔗',
  service: '🔧',
  user: '👤',
  alert: '⚠️'
};

export function LCDEventFeed({ events, onEventClick, maxHeight = '400px' }: LCDEventFeedProps) {
  return (
    <div 
      className="bg-gray-900 border border-cyan-500 rounded-lg overflow-y-auto"
      style={{ maxHeight }}
    >
      {events.length === 0 ? (
        <div className="p-4 text-gray-400 text-center">No events</div>
      ) : (
        <div className="divide-y divide-gray-700">
          {events.map((event) => (
            <div
              key={event.event_id}
              className="p-3 hover:bg-gray-800 cursor-pointer transition-colors"
              onClick={() => onEventClick?.(event)}
            >
              <div className="flex items-start gap-3">
                <span className="text-xl">{event.icon}</span>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-white truncate">{event.title}</h4>
                    <span className={`text-xs px-2 py-1 rounded ${severityColors[event.severity]}`}>
                      {event.severity.toUpperCase()}
                    </span>
                  </div>
                  
                  <p className="text-sm text-gray-300 mt-1 line-clamp-2">{event.message}</p>
                  
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                    <span>{event.source_node}</span>
                    <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                    {event.broadcast ? (
                      <span className="text-cyan-400">📡 Broadcast</span>
                    ) : (
                      <span className="text-yellow-600">🎯 Targeted</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Compact event feed for sidebars/cards
 */
export function CompactLCDEventFeed({ events, maxItems = 5 }: { events: LCDEvent[]; maxItems?: number }) {
  return (
    <div className="space-y-2">
      {events.slice(0, maxItems).map((event) => (
        <div key={event.event_id} className="text-sm bg-gray-800 p-2 rounded border border-gray-700">
          <div className="flex items-center gap-2">
            <span>{event.icon}</span>
            <span className="font-semibold text-white flex-1 truncate">{event.title}</span>
            <span className={`text-xs ${severityColors[event.severity]}`}>
              {event.severity[0].toUpperCase()}
            </span>
          </div>
          <p className="text-gray-400 text-xs ml-6 line-clamp-1">{event.message}</p>
        </div>
      ))}
    </div>
  );
}
