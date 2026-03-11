/**
 * PhaseCorrelationMeter - Stereo Phase Correlation Display
 *
 * Shows stereo phase correlation from -1 (out of phase) to +1 (mono)
 * with visual gauge and status indicators.
 */

import React, { useMemo } from 'react';
import { useLoudness } from '../../hooks/useLoudness';

interface PhaseCorrelationMeterProps {
  /** Show extended stereo info */
  showStereoInfo?: boolean;
  /** Orientation */
  orientation?: 'horizontal' | 'vertical';
  /** Custom class name */
  className?: string;
  /** Cluster node to target. Omit for local node. */
  nodeId?: string | null;
}

export const PhaseCorrelationMeter: React.FC<PhaseCorrelationMeterProps> = ({
  showStereoInfo = true,
  orientation = 'horizontal',
  className = '',
  nodeId,
}) => {
  const { stereo, getPhaseStatus } = useLoudness({ nodeId });

  const phaseStatus = getPhaseStatus();
  const correlation = stereo.phaseCorrelation;

  // Calculate position on the scale (0-100%)
  const position = useMemo(() => {
    // -1 to +1 mapped to 0-100%
    return ((correlation + 1) / 2) * 100;
  }, [correlation]);

  // Get status color
  const getStatusColor = () => {
    switch (phaseStatus) {
      case 'out_of_phase': return 'text-red-400';
      case 'very_wide': return 'text-yellow-400';
      case 'wide': return 'text-blue-400';
      case 'normal': return 'text-green-400';
      case 'mono': return 'text-zinc-400';
      default: return 'text-zinc-400';
    }
  };

  const getIndicatorColor = () => {
    switch (phaseStatus) {
      case 'out_of_phase': return 'bg-red-500';
      case 'very_wide': return 'bg-yellow-500';
      case 'wide': return 'bg-blue-500';
      case 'normal': return 'bg-green-500';
      case 'mono': return 'bg-zinc-400';
      default: return 'bg-zinc-400';
    }
  };

  const getStatusLabel = () => {
    switch (phaseStatus) {
      case 'out_of_phase': return 'Out of Phase';
      case 'very_wide': return 'Very Wide';
      case 'wide': return 'Wide';
      case 'normal': return 'Narrow';
      case 'mono': return 'Mono';
      default: return 'Unknown';
    }
  };

  const isVertical = orientation === 'vertical';

  return (
    <div className={`${className} space-y-3`}>
      {/* Main phase correlation meter */}
      <div className="bg-zinc-800/50 rounded-lg p-3">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-zinc-300">Phase Correlation</span>
          <span className={`text-sm font-mono ${getStatusColor()}`}>
            {correlation.toFixed(2)}
          </span>
        </div>

        {/* Gauge */}
        {isVertical ? (
          // Vertical gauge
          <div className="flex justify-center">
            <div className="relative w-4 h-32 bg-zinc-700/50 rounded-full overflow-hidden">
              {/* Background gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-red-500/30 via-yellow-500/30 to-green-500/30" />

              {/* Center line */}
              <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-zinc-500" />

              {/* Indicator */}
              <div
                className={`absolute left-0 right-0 h-2 ${getIndicatorColor()} rounded-full transition-all duration-100`}
                style={{
                  top: `${100 - position}%`,
                  transform: 'translateY(-50%)'
                }}
              />
            </div>

            {/* Labels */}
            <div className="flex flex-col justify-between ml-2 text-[10px] text-zinc-500 h-32">
              <span>+1</span>
              <span>0</span>
              <span>-1</span>
            </div>
          </div>
        ) : (
          // Horizontal gauge
          <div>
            <div className="relative h-4 bg-zinc-700/50 rounded-full overflow-hidden">
              {/* Background gradient */}
              <div className="absolute inset-0 bg-gradient-to-r from-red-500/30 via-yellow-500/30 to-green-500/30" />

              {/* Center line (0 position) */}
              <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-zinc-500" />

              {/* Indicator */}
              <div
                className={`absolute top-0 bottom-0 w-2 ${getIndicatorColor()} rounded-full transition-all duration-100`}
                style={{
                  left: `${position}%`,
                  transform: 'translateX(-50%)'
                }}
              />
            </div>

            {/* Labels */}
            <div className="flex justify-between mt-1 text-[10px] text-zinc-500">
              <span>-1</span>
              <span>0</span>
              <span>+1</span>
            </div>
          </div>
        )}

        {/* Status badge */}
        <div className="flex justify-center mt-3">
          <span className={`text-xs px-2 py-0.5 rounded ${
            phaseStatus === 'out_of_phase' ? 'bg-red-500/20 text-red-400' :
            phaseStatus === 'very_wide' ? 'bg-yellow-500/20 text-yellow-400' :
            phaseStatus === 'wide' ? 'bg-blue-500/20 text-blue-400' :
            phaseStatus === 'normal' ? 'bg-green-500/20 text-green-400' :
            'bg-zinc-500/20 text-zinc-400'
          }`}>
            {getStatusLabel()}
          </span>
        </div>
      </div>

      {/* Extended stereo info */}
      {showStereoInfo && (
        <div className="bg-zinc-800/50 rounded-lg p-3 space-y-2">
          {/* Balance */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-zinc-400">Balance</span>
              <span className="font-mono text-zinc-300">
                {stereo.balance > 0 ? `R ${(stereo.balance * 100).toFixed(0)}%` :
                 stereo.balance < 0 ? `L ${(Math.abs(stereo.balance) * 100).toFixed(0)}%` :
                 'Center'}
              </span>
            </div>
            <div className="relative h-2 bg-zinc-700/50 rounded overflow-hidden">
              {/* Center line */}
              <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-zinc-500" />

              {/* Balance indicator */}
              <div
                className="absolute top-0 h-full bg-cyan-500 transition-all duration-100"
                style={{
                  left: stereo.balance >= 0 ? '50%' : `${50 + stereo.balance * 50}%`,
                  width: `${Math.abs(stereo.balance) * 50}%`
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-zinc-500 mt-0.5">
              <span>L</span>
              <span>C</span>
              <span>R</span>
            </div>
          </div>

          {/* Width */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-zinc-400">Stereo Width</span>
              <span className="font-mono text-zinc-300">
                {(stereo.width * 100).toFixed(0)}%
              </span>
            </div>
            <div className="relative h-2 bg-zinc-700/50 rounded overflow-hidden">
              <div
                className="absolute left-0 top-0 h-full bg-purple-500 transition-all duration-100"
                style={{ width: `${stereo.width * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-zinc-500 mt-0.5">
              <span>Mono</span>
              <span>Wide</span>
            </div>
          </div>

          {/* Mid/Side info */}
          <div className="flex justify-between text-xs pt-2 border-t border-zinc-700">
            <div className="flex items-center gap-2">
              <span className="text-zinc-400">Mid</span>
              <span className="font-mono text-zinc-300">
                {(((stereo as { midLevel?: number }).midLevel ?? 0.5) * 100).toFixed(0)}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-zinc-400">Side</span>
              <span className="font-mono text-zinc-300">
                {(((stereo as { sideLevel?: number }).sideLevel ?? 0.5) * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Warning for phase issues */}
      {phaseStatus === 'out_of_phase' && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-red-400 text-sm">⚠</span>
            <span className="text-xs text-red-400">
              Stereo content may cancel in mono playback
            </span>
          </div>
        </div>
      )}

      {phaseStatus === 'very_wide' && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-yellow-400 text-sm">⚠</span>
            <span className="text-xs text-yellow-400">
              Very wide stereo - check mono compatibility
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default PhaseCorrelationMeter;
