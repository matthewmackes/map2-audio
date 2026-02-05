"""React component for LCD display emulator"""

import React, { useEffect, useState } from 'react';
import { LCDEvent } from '../models/lcd_event';

interface LCDEmulatorProps {
  event?: LCDEvent;
  nodeLabel?: string;
  loading?: boolean;
}

export function LCDEmulator({ event, nodeLabel = 'NODE-0000', loading = false }: LCDEmulatorProps) {
  const [displayLines, setDisplayLines] = useState<string[]>([
    `MAP2 - ${nodeLabel.substring(0, 14)}`,
    'Initializing...',
    '',
    ''
  ]);
  
  useEffect(() => {
    if (loading) {
      setDisplayLines([
        `MAP2 - ${nodeLabel.substring(0, 14)}`,
        'Loading...',
        '',
        ''
      ]);
    } else if (event) {
      const source = event.source_node === nodeLabel ? '[LOCAL]' : '[REMOTE]';
      const line1 = `${source} ${event.icon} ${event.title.substring(0, 11)}`;
      const line2 = event.message.substring(0, 20);
      const line3 = event.message.length > 20 
        ? event.message.substring(20, 40)
        : new Date(event.timestamp).toLocaleTimeString();
      
      setDisplayLines([
        `MAP2 - ${nodeLabel.substring(0, 14)}`,
        line1.padEnd(20),
        line2.padEnd(20),
        line3.padEnd(20)
      ]);
    }
  }, [event, nodeLabel, loading]);
  
  return (
    <div className="bg-black border-4 border-amber-900 rounded-lg p-4 font-mono text-amber-100 shadow-2xl"
         style={{ width: '480px', aspectRatio: '16/9' }}>
      {/* LCD Screen */}
      <div className="bg-amber-50 rounded-sm p-3 h-full flex flex-col justify-between border-2 border-amber-900">
        {/* Display Lines */}
        <div className="space-y-2">
          {displayLines.map((line, i) => (
            <div
              key={i}
              className="text-base leading-none text-amber-900"
              style={{ fontFamily: 'Courier New, monospace', letterSpacing: '0.1em' }}
            >
              {line}
            </div>
          ))}
        </div>
        
        {/* Status indicators */}
        <div className="flex justify-between items-center text-xs text-amber-900 border-t border-amber-900 pt-2">
          <div className="flex gap-2">
            <span className="w-2 h-2 bg-green-600 rounded-full"></span>
            <span>Power</span>
          </div>
          <div className="text-center">4x20 LCD</div>
          <div className="w-4 h-3 bg-amber-900 rounded-sm"></div>
        </div>
      </div>
      
      {/* Control buttons */}
      <div className="flex justify-between mt-4 px-2">
        <button className="px-3 py-1 bg-gray-700 text-gray-300 rounded text-xs border border-gray-600 hover:bg-gray-600">
          MENU
        </button>
        <button className="px-3 py-1 bg-gray-700 text-gray-300 rounded text-xs border border-gray-600 hover:bg-gray-600">
          ◀
        </button>
        <button className="px-3 py-1 bg-gray-700 text-gray-300 rounded text-xs border border-gray-600 hover:bg-gray-600">
          ▶
        </button>
      </div>
    </div>
  );
}

/**
 * Mini LCD emulator for cards/sidebars
 */
export function MiniLCDEmulator({ event, nodeLabel = 'NODE' }: { event?: LCDEvent; nodeLabel?: string }) {
  const source = event?.source_node === nodeLabel ? 'L' : 'R';
  
  return (
    <div className="bg-black border-2 border-gray-700 rounded-lg p-2 font-mono text-gray-300 text-xs"
         style={{ width: '200px' }}>
      <div className="bg-gray-900 rounded p-1 space-y-px">
        <div>{nodeLabel.substring(0, 12)}</div>
        <div className="text-cyan-400">
          [{source}] {event?.icon} {event?.title.substring(0, 8)}
        </div>
        <div className="text-green-400">{event?.message.substring(0, 14)}</div>
        <div className="text-yellow-600 text-xs">
          {event ? new Date(event.timestamp).toLocaleTimeString() : '00:00:00'}
        </div>
      </div>
    </div>
  );
}
