// @ts-nocheck
// ============================================================================
// MAP2 Audio Platform - Audio Connection Edge Component
// Custom React Flow edge for audio connections with channel indicators
// Enhanced with PDC (Plugin Delay Compensation) visualization
// ============================================================================

import { memo, useMemo } from 'react';
import { getBezierPath, EdgeProps } from 'reactflow';
import { useTheme } from '@mui/material/styles';
import { AudioConnectionEdgeData } from './AudioConnectionEdgeTypes';

const AudioConnectionEdge = memo(
  ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    selected,
  }: EdgeProps<AudioConnectionEdgeData>) => {
    const theme = useTheme();

    const [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });

    // Determine stroke color based on channel mismatch and selection
    const strokeColor = useMemo(() => {
      if (selected) return theme.palette.primary.light;
      if (data?.hasChannelMismatch) return theme.palette.warning.main;
      if (data?.pdcActive) return theme.palette.info.main;
      return theme.palette.primary.main;
    }, [selected, data?.hasChannelMismatch, data?.pdcActive, theme]);

    // Determine stroke width based on channel count
    const strokeWidth = (data?.sourceChannels || 1) >= 2 ? 3 : 2;

    // Apply dashed stroke for mismatches
    const strokeDasharray = data?.hasChannelMismatch ? '5,5' : 'none';

    // Calculate midpoint offset for PDC indicator
    const pdcIndicatorOffset = 25;

    return (
      <>
        {/* Edge Path */}
        <path
          id={id}
          className="react-flow__edge-path"
          d={edgePath}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDasharray}
          fill="none"
          style={{
            transition: 'stroke 0.2s ease-in-out',
          }}
        />

        {/* Edge Label (channel info) */}
        {data?.label && (
          <g>
            {/* Background rect for better readability */}
            <rect
              x={labelX - 20}
              y={labelY - 10}
              width={40}
              height={20}
              fill={theme.palette.background.paper}
              stroke={theme.palette.divider}
              strokeWidth={1}
              rx={4}
              opacity={0.9}
            />
            {/* Label Text */}
            <text
              x={labelX}
              y={labelY}
              className="react-flow__edge-text"
              style={{
                fontSize: 11,
                fontWeight: 600,
                fill: data.hasChannelMismatch
                  ? theme.palette.warning.main
                  : theme.palette.text.primary,
                textAnchor: 'middle',
                dominantBaseline: 'middle',
              }}
            >
              {data.label}
            </text>
          </g>
        )}

        {/* PDC Indicator - shows when delay compensation is active */}
        {data?.pdcActive && data?.pdcCompensationSamples && data.pdcCompensationSamples > 0 && (
          <g transform={`translate(${labelX}, ${labelY + pdcIndicatorOffset})`}>
            {/* PDC badge background */}
            <rect
              x={-18}
              y={-8}
              width={36}
              height={16}
              fill={theme.palette.info.dark}
              stroke={theme.palette.info.main}
              strokeWidth={1}
              rx={3}
              opacity={0.95}
            />
            {/* PDC icon (delay line symbol) */}
            <g transform="translate(-14, -3)">
              <line
                x1={0}
                y1={3}
                x2={6}
                y2={3}
                stroke={theme.palette.info.light}
                strokeWidth={1.5}
              />
              <circle
                cx={9}
                cy={3}
                r={2}
                fill="none"
                stroke={theme.palette.info.light}
                strokeWidth={1.5}
              />
            </g>
            {/* PDC samples text */}
            <text
              x={5}
              y={1}
              style={{
                fontSize: 8,
                fontWeight: 600,
                fill: theme.palette.info.contrastText,
                textAnchor: 'middle',
                dominantBaseline: 'middle',
              }}
            >
              +{data.pdcCompensationSamples}
            </text>
          </g>
        )}

        {/* Cumulative latency indicator (smaller, positioned above) */}
        {data?.cumulativeLatency !== undefined && data.cumulativeLatency > 0 && (
          <g transform={`translate(${labelX + 25}, ${labelY - 5})`}>
            <text
              style={{
                fontSize: 8,
                fill: theme.palette.text.disabled,
                textAnchor: 'start',
                dominantBaseline: 'middle',
              }}
            >
              Σ{data.cumulativeLatency}
            </text>
          </g>
        )}

        {/* Invisible hit area for hover/selection */}
        <path
          d={edgePath}
          stroke="transparent"
          strokeWidth={15}
          fill="none"
          style={{ cursor: 'pointer' }}
        >
          <title>
            {data?.pdcActive
              ? `Audio connection (${data.label}) - PDC: +${data.pdcCompensationSamples} samples`
              : `Audio connection (${data?.label || 'stereo'})`}
          </title>
        </path>
      </>
    );
  }
);

AudioConnectionEdge.displayName = 'AudioConnectionEdge';

export default AudioConnectionEdge;
