/** React component for the LCD display emulator. */

import React, { useEffect, useState } from 'react';
import type { LCDFeedEntry } from '../models/lcdFeed';

interface LCDDisplayEmulatorProps {
  entry?: LCDFeedEntry;
  nodeLabel?: string;
  loading?: boolean;
}

export function LCDDisplayEmulator({ entry, nodeLabel = 'NODE-0000', loading = false }: LCDDisplayEmulatorProps) {
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
    } else if (entry) {
      const source = entry.source_node === nodeLabel ? '[LOCAL]' : '[REMOTE]';
      const line1 = `${source} ${entry.icon} ${entry.title.substring(0, 11)}`;
      const line2 = entry.message.substring(0, 20);
      const line3 = entry.message.length > 20 
        ? entry.message.substring(20, 40)
        : new Date(entry.timestamp).toLocaleTimeString();
      
      setDisplayLines([
        `MAP2 - ${nodeLabel.substring(0, 14)}`,
        line1.padEnd(20),
        line2.padEnd(20),
        line3.padEnd(20)
      ]);
    }
  }, [entry, nodeLabel, loading]);
  
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
              style={{ fontFamily: 'var(--font-ui)', letterSpacing: '0.1em' }}
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

