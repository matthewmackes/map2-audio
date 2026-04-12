/**
 * LatencyDisplay - Chain Latency Breakdown Visualization
 *
 * Displays total latency and per-plugin latency breakdown
 * with visual representation of the audio processing chain.
 */

import React from 'react';
import { useLatency } from '../../hooks/useLatency';
import { sanitizeRestrictedDisplayText } from '../../../map2/displayNames';
import { EmptyState } from '../shared/EmptyState'
import { LoadingState } from '../shared/LoadingState'

interface LatencyDisplayProps {
  /** Show detailed per-plugin breakdown */
  showBreakdown?: boolean;
  /** Compact mode */
  compact?: boolean;
  /** Custom class name */
  className?: string;
  /** Cluster node to target. Omit for local node. */
  nodeId?: string | null;
}

const LatencyBar: React.FC<{
  name: string;
  samples: number;
  ms: number;
  percentage: number;
  isTotal?: boolean;
}> = ({ name, samples, ms, percentage, isTotal = false }) => {
  // Color based on latency impact
  const getBarColor = () => {
    if (percentage >= 50) return 'bg-red-500';
    if (percentage >= 25) return 'bg-yellow-500';
    return 'bg-blue-500';
  };

  return (
    <div className={`mb-2 ${isTotal ? 'pt-2 border-t border-zinc-700' : ''}`}>
      <div className="flex justify-between text-xs mb-1">
        <span className={`text-zinc-400 truncate max-w-[60%] ${isTotal ? 'font-medium text-zinc-300' : ''}`}>
          {name}
        </span>
        <span className={`font-mono ${isTotal ? 'text-white font-bold' : 'text-zinc-300'}`}>
          {ms.toFixed(2)}ms
          <span className="text-zinc-500 ml-1">({samples})</span>
        </span>
      </div>
      {!isTotal && (
        <div className="relative h-1.5 bg-zinc-700/50 rounded overflow-hidden">
          <div
            className={`absolute left-0 top-0 h-full ${getBarColor()} transition-all duration-300`}
            style={{ width: `${Math.min(100, percentage)}%` }}
          />
        </div>
      )}
    </div>
  );
};

export const LatencyDisplay: React.FC<LatencyDisplayProps> = ({
  showBreakdown = true,
  compact = false,
  className = '',
  nodeId,
}) => {
  const {
    latency,
    isLoading,
    formatLatency,
    getPluginLatency
  } = useLatency({ nodeId });

  if (isLoading) {
    return <LoadingState className={className} description="Loading latency info" />;
  }

  if (!latency) {
    return (
      <div className={`${className} text-zinc-500 text-sm`}>
        Latency data unavailable
      </div>
    );
  }

  const totalMs = latency.totalMs;
  const breakdown = latency.breakdown || [];

  // Calculate percentage of total for each plugin
  const pluginsWithPercentage = breakdown.map(plugin => ({
    ...plugin,
    percentage: totalMs > 0 ? (plugin.latencyMs / totalMs) * 100 : 0
  }));

  // Sort by latency descending
  const sortedPlugins = [...pluginsWithPercentage].sort(
    (a, b) => b.latencyMs - a.latencyMs
  );

  return (
    <div className={`${className} space-y-3`}>
      {/* Header with total latency */}
      <div className="bg-zinc-800/50 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-zinc-300">Total Latency</span>
          <div className="text-right">
            <span className="text-lg font-mono font-bold text-white">
              {formatLatency(totalMs)}
            </span>
            <span className="text-xs text-zinc-500 ml-2">
              ({latency.totalSamples} samples)
            </span>
          </div>
        </div>

        {/* Latency quality indicator */}
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            totalMs <= 5 ? 'bg-green-500' :
            totalMs <= 10 ? 'bg-yellow-500' :
            totalMs <= 20 ? 'bg-orange-500' :
            'bg-red-500'
          }`} />
          <span className={`text-xs ${
            totalMs <= 5 ? 'text-green-400' :
            totalMs <= 10 ? 'text-yellow-400' :
            totalMs <= 20 ? 'text-orange-400' :
            'text-red-400'
          }`}>
            {totalMs <= 5 ? 'Excellent' :
             totalMs <= 10 ? 'Good' :
             totalMs <= 20 ? 'Moderate' :
             'High latency'}
          </span>
        </div>
      </div>

      {/* Plugin breakdown */}
      {showBreakdown && breakdown.length > 0 && (
        <div className="bg-zinc-800/50 rounded-lg p-3">
          <div className="text-sm font-medium text-zinc-300 mb-3">
            Plugin Latency Breakdown
          </div>

          {compact ? (
            // Compact: show top 3 contributors
            <>
              {sortedPlugins.slice(0, 3).map((plugin) => (
                <LatencyBar
                  key={plugin.pluginId}
                  name={sanitizeRestrictedDisplayText(plugin.pluginName) || 'Processor'}
                  samples={plugin.latencySamples}
                  ms={plugin.latencyMs}
                  percentage={plugin.percentage}
                />
              ))}
              {sortedPlugins.length > 3 && (
                <div className="text-xs text-zinc-500 mt-1">
                  +{sortedPlugins.length - 3} more plugins
                </div>
              )}
            </>
          ) : (
            // Full: show all plugins
            sortedPlugins.map((plugin) => (
              <LatencyBar
                key={plugin.pluginId}
                name={sanitizeRestrictedDisplayText(plugin.pluginName) || 'Processor'}
                samples={plugin.latencySamples}
                ms={plugin.latencyMs}
                percentage={plugin.percentage}
              />
            ))
          )}

          {breakdown.length === 0 && (
            <EmptyState
              compact
              className={className}
              title="No plugins with reported latency"
              description="Latency data will appear here when the active chain reports per-plugin values."
            />
          )}
        </div>
      )}

      {/* Visual chain representation */}
      {!compact && breakdown.length > 0 && (
        <div className="bg-zinc-800/50 rounded-lg p-3">
          <div className="text-sm font-medium text-zinc-300 mb-3">
            Processing Chain
          </div>
          <div className="flex items-center overflow-x-auto pb-2">
            {/* Input */}
            <div className="flex-shrink-0 px-2 py-1 bg-green-500/20 rounded text-xs text-green-400">
              IN
            </div>

            {breakdown.map((plugin, index) => (
              <React.Fragment key={plugin.pluginId}>
                {/* Arrow */}
                <div className="flex-shrink-0 mx-1 text-zinc-600">→</div>

                {/* Plugin block */}
                <div
                  className="flex-shrink-0 px-2 py-1 bg-zinc-700/50 rounded text-xs"
                  title={`${sanitizeRestrictedDisplayText(plugin.pluginName) || 'Processor'}: ${plugin.latencyMs.toFixed(2)}ms`}
                >
                  <div className="text-zinc-300 truncate max-w-[80px]">
                    {sanitizeRestrictedDisplayText(plugin.pluginName) || 'Processor'}
                  </div>
                  <div className="text-zinc-500 text-[10px]">
                    {plugin.latencyMs.toFixed(1)}ms
                  </div>
                </div>
              </React.Fragment>
            ))}

            {/* Arrow to output */}
            <div className="flex-shrink-0 mx-1 text-zinc-600">→</div>

            {/* Output */}
            <div className="flex-shrink-0 px-2 py-1 bg-blue-500/20 rounded text-xs text-blue-400">
              OUT
            </div>
          </div>
        </div>
      )}

      {/* PDC status */}
      <div className="flex items-center justify-between text-xs px-1">
        <span className="text-zinc-500">Plugin Delay Compensation</span>
        <span className="text-green-400">Active</span>
      </div>
    </div>
  );
};

export default LatencyDisplay;
