/**
 * CPUMeterPanel - Real-time CPU Usage Visualization
 *
 * Displays total and per-plugin CPU usage with visual indicators
 * for warning and critical states.
 */

import React from 'react';
import { useCPUMetrics } from '../../hooks/useCPUMetrics';

interface CPUMeterPanelProps {
  /** Show per-plugin breakdown */
  showBreakdown?: boolean;
  /** Compact mode for smaller displays */
  compact?: boolean;
  /** Custom class name */
  className?: string;
}

const CPUBar: React.FC<{
  label: string;
  value: number;
  warningThreshold?: number;
  criticalThreshold?: number;
  compact?: boolean;
}> = ({ label, value, warningThreshold = 70, criticalThreshold = 90, compact = false }) => {
  const status = value >= criticalThreshold ? 'critical' : value >= warningThreshold ? 'warning' : 'ok';

  const barColor = {
    ok: 'bg-green-500',
    warning: 'bg-yellow-500',
    critical: 'bg-red-500'
  }[status];

  const bgColor = {
    ok: 'bg-green-500/20',
    warning: 'bg-yellow-500/20',
    critical: 'bg-red-500/20'
  }[status];

  return (
    <div className={`${compact ? 'mb-1' : 'mb-2'}`}>
      <div className="flex justify-between text-xs text-zinc-400 mb-1">
        <span className="truncate max-w-[120px]">{label}</span>
        <span className={status === 'critical' ? 'text-red-400 font-medium' : ''}>
          {value.toFixed(1)}%
        </span>
      </div>
      <div className={`h-2 rounded-full ${bgColor} overflow-hidden`}>
        <div
          className={`h-full ${barColor} transition-all duration-150`}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
    </div>
  );
};

export const CPUMeterPanel: React.FC<CPUMeterPanelProps> = ({
  showBreakdown = true,
  compact = false,
  className = ''
}) => {
  const {
    metrics,
    status,
    hasXruns,
    getTopConsumers,
    warningThreshold,
    criticalThreshold
  } = useCPUMetrics();

  if (!metrics.running) {
    return (
      <div className={`${className} text-zinc-500 text-sm`}>
        Audio engine not running
      </div>
    );
  }

  const topConsumers = showBreakdown ? getTopConsumers(5) : [];

  return (
    <div className={`${className} space-y-3`}>
      {/* Total CPU */}
      <div className="bg-zinc-800/50 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-zinc-300">Audio CPU</span>
          <span className={`text-lg font-bold ${
            status === 'critical' ? 'text-red-400' :
            status === 'warning' ? 'text-yellow-400' : 'text-green-400'
          }`}>
            {metrics.totalCpuPercent.toFixed(1)}%
          </span>
        </div>

        <CPUBar
          label="Total"
          value={metrics.totalCpuPercent}
          warningThreshold={warningThreshold}
          criticalThreshold={criticalThreshold}
          compact={compact}
        />

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mt-3 text-xs text-zinc-400">
          <div>
            <div className="text-zinc-500">Peak</div>
            <div className="font-mono">{metrics.peakCpuPercent.toFixed(1)}%</div>
          </div>
          <div>
            <div className="text-zinc-500">Avg</div>
            <div className="font-mono">{metrics.averageCpuPercent.toFixed(1)}%</div>
          </div>
          <div>
            <div className="text-zinc-500">Headroom</div>
            <div className="font-mono">{metrics.headroomPercent.toFixed(0)}%</div>
          </div>
        </div>
      </div>

      {/* XRun indicator */}
      {hasXruns && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-red-400 text-sm font-medium">XRuns</span>
            <span className="text-red-300 text-lg font-bold">{metrics.xrunCount}</span>
          </div>
          <p className="text-xs text-red-400/70 mt-1">
            Audio dropouts detected. Consider increasing buffer size.
          </p>
        </div>
      )}

      {/* Per-plugin breakdown */}
      {showBreakdown && topConsumers.length > 0 && (
        <div className="bg-zinc-800/50 rounded-lg p-3">
          <div className="text-sm font-medium text-zinc-300 mb-2">
            Plugin CPU Usage
          </div>
          {topConsumers.map(({ pluginId, cpu }) => (
            <CPUBar
              key={pluginId}
              label={`Plugin ${pluginId}`}
              value={cpu}
              warningThreshold={30}
              criticalThreshold={50}
              compact
            />
          ))}
        </div>
      )}

      {/* Callback timing */}
      {!compact && (
        <div className="text-xs text-zinc-500 flex justify-between">
          <span>Callback: {metrics.currentCallbackMs.toFixed(2)} ms</span>
          <span>Budget: {metrics.budgetMs.toFixed(2)} ms</span>
        </div>
      )}
    </div>
  );
};

export default CPUMeterPanel;
