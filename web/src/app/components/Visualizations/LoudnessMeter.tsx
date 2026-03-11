/**
 * LoudnessMeter - LUFS Loudness Meter Visualization
 *
 * ITU-R BS.1770-4 compliant loudness metering display with:
 * - Momentary (M), Short-term (S), Integrated (I) levels
 * - Loudness Range (LRA)
 * - True Peak (TP)
 */

import React, { useCallback } from 'react';
import { useLoudness } from '../../hooks/useLoudness';

interface LoudnessMeterProps {
  /** Target integrated loudness for compliance checking */
  targetLufs?: number;
  /** True peak limit */
  truePeakLimit?: number;
  /** Compact mode */
  compact?: boolean;
  /** Custom class name */
  className?: string;
  /** Cluster node to target. Omit for local node. */
  nodeId?: string | null;
}

// LUFS scale range
const LUFS_MIN = -60;
const LUFS_MAX = 0;

// Normalize LUFS to 0-1
const normalizeLufs = (lufs: number): number => {
  return Math.max(0, Math.min(1, (lufs - LUFS_MIN) / (LUFS_MAX - LUFS_MIN)));
};

// Format LUFS value
const formatLufs = (lufs: number): string => {
  if (lufs <= -100) return '-inf';
  return lufs.toFixed(1);
};

const LufsBar: React.FC<{
  label: string;
  value: number;
  target?: number;
  highlight?: boolean;
}> = ({ label, value, target, highlight = false }) => {
  const normalized = normalizeLufs(value);
  const targetNorm = target ? normalizeLufs(target) : null;

  // Color based on value
  const getBarColor = () => {
    if (value >= 0) return 'bg-red-500';
    if (value >= -6) return 'bg-yellow-500';
    if (value >= -12) return 'bg-green-500';
    return 'bg-green-600';
  };

  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs mb-1">
        <span className={`text-zinc-400 ${highlight ? 'font-medium' : ''}`}>{label}</span>
        <span className={`font-mono ${highlight ? 'text-white font-bold' : 'text-zinc-300'}`}>
          {formatLufs(value)} LUFS
        </span>
      </div>
      <div className="relative h-3 bg-zinc-700/50 rounded overflow-hidden">
        {/* Main bar */}
        <div
          className={`absolute left-0 top-0 h-full ${getBarColor()} transition-all duration-100`}
          style={{ width: `${normalized * 100}%` }}
        />
        {/* Target marker */}
        {targetNorm !== null && (
          <div
            className="absolute top-0 w-0.5 h-full bg-white/70"
            style={{ left: `${targetNorm * 100}%` }}
          />
        )}
      </div>
    </div>
  );
};

const TruePeakBar: React.FC<{
  left: number;
  right: number;
  limit: number;
}> = ({ left, right, limit }) => {
  const maxPeak = Math.max(left, right);
  const isClipping = maxPeak > limit;

  // Normalize for -20 to +3 dBTP range
  const normalize = (db: number) => Math.max(0, Math.min(1, (db + 20) / 23));

  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-zinc-400">True Peak</span>
        <span className={`font-mono ${isClipping ? 'text-red-400 font-bold' : 'text-zinc-300'}`}>
          {maxPeak <= -100 ? '-inf' : maxPeak.toFixed(1)} dBTP
        </span>
      </div>
      <div className="flex gap-1">
        {/* Left channel */}
        <div className="flex-1 relative h-2 bg-zinc-700/50 rounded overflow-hidden">
          <div
            className={`absolute left-0 top-0 h-full transition-all duration-50 ${
              left > limit ? 'bg-red-500' : 'bg-blue-500'
            }`}
            style={{ width: `${normalize(left) * 100}%` }}
          />
          {/* Limit marker */}
          <div
            className="absolute top-0 w-0.5 h-full bg-red-500/50"
            style={{ left: `${normalize(limit) * 100}%` }}
          />
        </div>
        {/* Right channel */}
        <div className="flex-1 relative h-2 bg-zinc-700/50 rounded overflow-hidden">
          <div
            className={`absolute left-0 top-0 h-full transition-all duration-50 ${
              right > limit ? 'bg-red-500' : 'bg-blue-500'
            }`}
            style={{ width: `${normalize(right) * 100}%` }}
          />
          <div
            className="absolute top-0 w-0.5 h-full bg-red-500/50"
            style={{ left: `${normalize(limit) * 100}%` }}
          />
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-zinc-500 mt-0.5">
        <span>L</span>
        <span>R</span>
      </div>
    </div>
  );
};

export const LoudnessMeter: React.FC<LoudnessMeterProps> = ({
  targetLufs = -14,
  truePeakLimit = -1,
  compact = false,
  className = '',
  nodeId,
}) => {
  const {
    lufs,
    stereo,
    resetIntegrated,
    isResetting,
    isWithinSpec,
    getLoudnessCategory,
    getPhaseStatus
  } = useLoudness({ targetLufs, truePeakLimit, nodeId });

  const spec = isWithinSpec();
  const category = getLoudnessCategory();
  const phaseStatus = getPhaseStatus();

  if (!lufs.running) {
    return (
      <div className={`${className} text-zinc-500 text-sm`}>
        Audio engine not running
      </div>
    );
  }

  return (
    <div className={`${className} space-y-3`}>
      {/* Main LUFS meters */}
      <div className="bg-zinc-800/50 rounded-lg p-3">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-zinc-300">Loudness</span>
          <span className={`text-xs px-2 py-0.5 rounded ${
            category === 'very_loud' ? 'bg-red-500/20 text-red-400' :
            category === 'loud' ? 'bg-yellow-500/20 text-yellow-400' :
            category === 'moderate' ? 'bg-green-500/20 text-green-400' :
            'bg-zinc-500/20 text-zinc-400'
          }`}>
            {category.replace('_', ' ')}
          </span>
        </div>

        <LufsBar label="Momentary" value={lufs.momentary} />
        <LufsBar label="Short-term" value={lufs.shortTerm} />
        <LufsBar
          label="Integrated"
          value={lufs.integrated}
          target={targetLufs}
          highlight
        />

        {/* Loudness Range */}
        <div className="flex justify-between text-xs mt-2">
          <span className="text-zinc-400">LRA</span>
          <span className="font-mono text-zinc-300">{lufs.range.toFixed(1)} LU</span>
        </div>
      </div>

      {/* True Peak */}
      <div className="bg-zinc-800/50 rounded-lg p-3">
        <TruePeakBar
          left={lufs.truePeakLeft}
          right={lufs.truePeakRight}
          limit={truePeakLimit}
        />
      </div>

      {/* Stereo Analysis */}
      {!compact && (
        <div className="bg-zinc-800/50 rounded-lg p-3">
          <div className="text-sm font-medium text-zinc-300 mb-2">Stereo</div>

          {/* Phase correlation */}
          <div className="mb-2">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-zinc-400">Phase</span>
              <span className={`font-mono ${
                phaseStatus === 'out_of_phase' ? 'text-red-400' :
                phaseStatus === 'very_wide' ? 'text-yellow-400' :
                'text-zinc-300'
              }`}>
                {stereo.phaseCorrelation.toFixed(2)}
              </span>
            </div>
            <div className="relative h-2 bg-zinc-700/50 rounded overflow-hidden">
              {/* Center marker */}
              <div className="absolute left-1/2 top-0 w-0.5 h-full bg-zinc-500" />
              {/* Correlation indicator */}
              <div
                className={`absolute top-0 h-full w-1 rounded transition-all duration-100 ${
                  phaseStatus === 'out_of_phase' ? 'bg-red-500' :
                  phaseStatus === 'very_wide' ? 'bg-yellow-500' :
                  'bg-green-500'
                }`}
                style={{
                  left: `${(stereo.phaseCorrelation + 1) / 2 * 100}%`,
                  transform: 'translateX(-50%)'
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-zinc-500 mt-0.5">
              <span>-1</span>
              <span>0</span>
              <span>+1</span>
            </div>
          </div>

          {/* Balance */}
          <div className="flex justify-between text-xs">
            <span className="text-zinc-400">Balance</span>
            <span className="font-mono text-zinc-300">
              {stereo.balance.toFixed(2)}
            </span>
          </div>

          {/* Width */}
          <div className="flex justify-between text-xs mt-1">
            <span className="text-zinc-400">Width</span>
            <span className="font-mono text-zinc-300">
              {(stereo.width * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      )}

      {/* Compliance status */}
      <div className={`rounded-lg px-3 py-2 ${
        spec.overall
          ? 'bg-green-500/10 border border-green-500/30'
          : 'bg-yellow-500/10 border border-yellow-500/30'
      }`}>
        <div className="flex items-center justify-between">
          <span className={`text-sm ${
            spec.overall ? 'text-green-400' : 'text-yellow-400'
          }`}>
            Target: {targetLufs} LUFS / {truePeakLimit} dBTP
          </span>
          <span className={`text-xs ${
            spec.overall ? 'text-green-400' : 'text-yellow-400'
          }`}>
            {spec.overall ? 'OK' : 'Check'}
          </span>
        </div>
      </div>

      {/* Reset button */}
      <button
        onClick={() => resetIntegrated()}
        disabled={isResetting}
        className="w-full text-xs text-zinc-400 hover:text-zinc-300 py-1 hover:bg-zinc-700/30 rounded transition"
      >
        {isResetting ? 'Resetting...' : 'Reset Integrated'}
      </button>
    </div>
  );
};

export default LoudnessMeter;
