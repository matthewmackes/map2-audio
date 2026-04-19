/** React component for the LCD feed panel. */

import React from 'react';
import {
  Activity,
  Information,
  Link,
  Notification,
  SettingsAdjust,
  User,
  WarningAlt,
  WirelessCheckout,
} from '@carbon/icons-react';
import type { LCDFeedEntry } from '../models/lcdFeed';

interface LCDFeedProps {
  entries: LCDFeedEntry[];
  onEntryClick?: (entry: LCDFeedEntry) => void;
  maxHeight?: string;
}

const severityColors = {
  info: 'text-green-500',
  warning: 'text-yellow-500',
  error: 'text-red-500',
  critical: 'text-red-700 font-bold'
};

const eventTypeIcons = {
  audio: Activity,
  system: SettingsAdjust,
  network: Link,
  service: WirelessCheckout,
  user: User,
  alert: WarningAlt,
} as const;

export function LCDFeed({ entries, onEntryClick, maxHeight = '400px' }: LCDFeedProps) {
  return (
    <div 
      className="bg-[#0a0a0a] border border-blue-600 rounded-lg overflow-y-auto"
      style={{ maxHeight }}
    >
      {entries.length === 0 ? (
        <div className="p-4 text-[#9ca3af] text-center">No events</div>
      ) : (
        <div className="divide-y divide-gray-700">
          {entries.map((entry) => {
            const EventTypeIcon = eventTypeIcons[entry.category] || Information;
            return (
              <div
                key={entry.event_id}
                className="p-3 hover:bg-gray-800 cursor-pointer transition-colors"
                onClick={() => onEntryClick?.(entry)}
              >
                <div className="flex items-start gap-3">
                  <span className="text-xl"><EventTypeIcon size={20} /></span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-white truncate">{entry.title}</h4>
                      <span className={`text-xs px-2 py-1 rounded ${severityColors[entry.severity]}`}>
                        {entry.severity.toUpperCase()}
                      </span>
                    </div>

                    <p className="text-sm text-gray-300 mt-1 line-clamp-2">{entry.message}</p>

                    <div className="flex items-center gap-3 mt-2 text-xs text-[#9ca3af]">
                      <span>{entry.source_node}</span>
                      <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                      {entry.broadcast ? (
                        <span className="text-blue-400 inline-flex items-center gap-1"><Notification size={14} /> Broadcast</span>
                      ) : (
                        <span className="text-yellow-600 inline-flex items-center gap-1"><Information size={14} /> Targeted</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Compact event feed for sidebars/cards
 */
export function CompactLCDFeed({ entries, maxItems = 5 }: { entries: LCDFeedEntry[]; maxItems?: number }) {
  return (
    <div className="space-y-2">
      {entries.slice(0, maxItems).map((entry) => {
        const EventTypeIcon = eventTypeIcons[entry.category] || Information;
        return (
          <div key={entry.event_id} className="text-sm bg-gray-800 p-2 rounded border border-gray-700">
            <div className="flex items-center gap-2">
              <EventTypeIcon size={14} />
              <span className="font-semibold text-white flex-1 truncate">{entry.title}</span>
              <span className={`text-xs ${severityColors[entry.severity]}`}>
                {entry.severity[0].toUpperCase()}
              </span>
            </div>
            <p className="text-[#9ca3af] text-xs ml-6 line-clamp-1">{entry.message}</p>
          </div>
        );
      })}
    </div>
  );
}
