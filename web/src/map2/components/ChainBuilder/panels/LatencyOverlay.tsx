// ============================================================================
// MAP2 Audio Platform - Latency Overlay Component
// Displays cumulative latency visualization for the signal chain
// Uses plain HTML/CSS to be compatible with any styling system
// ============================================================================

import { memo, useMemo } from 'react';
import { getDisplayPluginName } from '../../../displayNames';

// ============================================================================
// Types
// ============================================================================

export interface PluginLatencyInfo {
  uri: string;
  name: string;
  latencySamples: number;
  isCompensated?: boolean;
}

export interface LatencyOverlayProps {
  /** Plugin latency information in chain order */
  plugins: PluginLatencyInfo[];
  /** Sample rate for ms calculation */
  sampleRate?: number;
  /** Whether to show the detailed breakdown */
  showBreakdown?: boolean;
  /** Position: 'top' | 'bottom' | 'floating' */
  position?: 'top' | 'bottom' | 'floating';
  /** Whether PDC is enabled */
  pdcEnabled?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

function samplesToMs(samples: number, sampleRate: number): number {
  return (samples / sampleRate) * 1000;
}

function formatLatency(samples: number, sampleRate: number): string {
  const ms = samplesToMs(samples, sampleRate);
  if (samples === 0) return '0';
  if (ms < 1) return `${samples} smp`;
  if (ms < 10) return `${ms.toFixed(2)}ms`;
  return `${ms.toFixed(1)}ms`;
}

function getLatencyColor(ms: number): string {
  if (ms < 3) return '#4caf50'; // Green - excellent
  if (ms < 10) return '#8bc34a'; // Light green - good
  if (ms < 20) return '#ffeb3b'; // Yellow - acceptable
  if (ms < 50) return '#ff9800'; // Orange - noticeable
  return '#f44336'; // Red - high
}

// ============================================================================
// Latency Segment Component
// ============================================================================

interface LatencySegmentProps {
  plugin: PluginLatencyInfo;
  percentage: number;
  sampleRate: number;
  isLast?: boolean;
}

const LatencySegment = memo(({ plugin, percentage, sampleRate, isLast }: LatencySegmentProps) => {
  const ms = samplesToMs(plugin.latencySamples, sampleRate);
  const color = getLatencyColor(ms);
  const displayName = getDisplayPluginName(plugin.name, plugin.uri);

  return (
    <div
      title={`${displayName}: ${plugin.latencySamples} samples (${formatLatency(plugin.latencySamples, sampleRate)})${plugin.isCompensated ? ' - PDC Compensated' : ''}`}
      style={{
        width: `${Math.max(percentage, 2)}%`,
        height: '100%',
        backgroundColor: color,
        borderRight: isLast ? 'none' : '1px solid rgba(0,0,0,0.2)',
        transition: 'width var(--map2-dur-slow-01) var(--map2-ease-productive-standard)',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        (e.target as HTMLDivElement).style.filter = 'brightness(1.2)';
      }}
      onMouseLeave={(e) => {
        (e.target as HTMLDivElement).style.filter = 'none';
      }}
    />
  );
});

LatencySegment.displayName = 'LatencySegment';

// ============================================================================
// Main LatencyOverlay Component
// ============================================================================

const LatencyOverlay = memo(({
  plugins,
  sampleRate = 48000,
  showBreakdown = false,
  position = 'bottom',
  pdcEnabled = true,
}: LatencyOverlayProps) => {
  // Calculate total latency
  const totalSamples = useMemo(() => {
    return plugins.reduce((sum, p) => sum + p.latencySamples, 0);
  }, [plugins]);

  const totalMs = samplesToMs(totalSamples, sampleRate);
  const totalColor = getLatencyColor(totalMs);

  // Filter plugins with latency for the bar
  const pluginsWithLatency = useMemo(() => {
    return plugins.filter((p) => p.latencySamples > 0);
  }, [plugins]);

  const containerStyles: React.CSSProperties = {
    padding: 8,
    backgroundColor: 'rgba(30, 30, 30, 0.95)',
    borderTop: position === 'bottom' ? '1px solid rgba(255,255,255,0.1)' : 'none',
    borderBottom: position === 'top' ? '1px solid rgba(255,255,255,0.1)' : 'none',
    borderRadius: position === 'floating' ? 4 : 0,
    ...(position === 'floating' ? {
      position: 'absolute' as const,
      bottom: 16,
      right: 16,
      width: 280,
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    } : {}),
  };

  return (
    <div style={containerStyles}>
      {/* Header with total latency */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        {/* Clock icon */}
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>Total Latency:</span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: 4,
            backgroundColor: `${totalColor}33`,
            color: totalColor,
            border: `1px solid ${totalColor}`,
          }}
        >
          {formatLatency(totalSamples, sampleRate)}
        </span>
        <span style={{ fontSize: 10, color: '#6b7280' }}>
          ({totalSamples} samples @ {sampleRate / 1000}kHz)
        </span>
        {pdcEnabled && (
          <span
            style={{
              fontSize: 9,
              padding: '1px 6px',
              borderRadius: 4,
              backgroundColor: 'rgba(76, 175, 80, 0.15)',
              color: '#4caf50',
              border: '1px solid #4caf50',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
            title="Plugin Delay Compensation enabled"
          >
            <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            PDC
          </span>
        )}
      </div>

      {/* Cumulative latency bar */}
      <div
        style={{
          height: 14,
          backgroundColor: 'rgba(255,255,255,0.05)',
          borderRadius: 4,
          overflow: 'hidden',
          display: 'flex',
        }}
      >
        {pluginsWithLatency.length > 0 ? (
          pluginsWithLatency.map((plugin, idx) => (
            <LatencySegment
              key={plugin.uri}
              plugin={plugin}
              percentage={(plugin.latencySamples / totalSamples) * 100}
              sampleRate={sampleRate}
              isLast={idx === pluginsWithLatency.length - 1}
            />
          ))
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: 10, color: '#6b7280' }}>
              No latency-inducing plugins
            </span>
          </div>
        )}
      </div>

      {/* Breakdown list */}
      {showBreakdown && pluginsWithLatency.length > 0 && (
        <div style={{ marginTop: 8, maxHeight: 120, overflowY: 'auto' }}>
          {[...pluginsWithLatency]
            .sort((a, b) => b.latencySamples - a.latencySamples)
            .map((plugin) => {
              const ms = samplesToMs(plugin.latencySamples, sampleRate);
              const percentage = totalSamples > 0 ? (plugin.latencySamples / totalSamples) * 100 : 0;
              const color = getLatencyColor(ms);

              return (
                <div
                  key={plugin.uri}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 10,
                    padding: '2px 0',
                  }}
                >
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      backgroundColor: color,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#e5e7eb' }}>
                    {getDisplayPluginName(plugin.name, plugin.uri)}
                  </span>
                  <span style={{ color: '#9ca3af', flexShrink: 0 }}>
                    {formatLatency(plugin.latencySamples, sampleRate)}
                  </span>
                  <span style={{ color: '#6b7280', flexShrink: 0, width: 35, textAlign: 'right' }}>
                    {percentage.toFixed(0)}%
                  </span>
                  {plugin.isCompensated && (
                    <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#4caf50" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
});

LatencyOverlay.displayName = 'LatencyOverlay';

export default LatencyOverlay;
