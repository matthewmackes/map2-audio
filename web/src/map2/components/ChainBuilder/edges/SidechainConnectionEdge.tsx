// @ts-nocheck
// ============================================================================
// MAP2 Audio Platform - Sidechain Connection Edge Component
// Custom React Flow edge for sidechain connections with animated flow
// ============================================================================

import { memo, useMemo } from 'react';
import { getBezierPath, EdgeProps } from 'reactflow';
import { useTheme } from '@mui/material/styles';
import { SidechainConnectionEdgeData } from './SidechainConnectionEdgeTypes';

const SidechainConnectionEdge = memo(
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
  }: EdgeProps<SidechainConnectionEdgeData>) => {
    const theme = useTheme();

    const [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      curvature: 0.4, // Slightly more curved for sidechain connections
    });

    // Sidechain color - purple/magenta
    const strokeColor = selected
      ? theme.palette.secondary.light
      : theme.palette.secondary.main;

    // Animation keyframes ID for this edge
    const animationId = `sidechain-flow-${id}`;

    // Calculate path length for animation (approximate)
    const pathLength = useMemo(() => {
      const dx = targetX - sourceX;
      const dy = targetY - sourceY;
      return Math.sqrt(dx * dx + dy * dy) * 1.5; // Approximate bezier length
    }, [sourceX, sourceY, targetX, targetY]);

    return (
      <>
        {/* Animation definition */}
        <defs>
          <linearGradient id={`${animationId}-gradient`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.3" />
            <stop offset="50%" stopColor={strokeColor} stopOpacity="1" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.3" />
          </linearGradient>
        </defs>

        {/* Background path (static dashed line) */}
        <path
          id={`${id}-bg`}
          d={edgePath}
          stroke={strokeColor}
          strokeWidth={2}
          strokeDasharray="8,4"
          strokeOpacity={0.3}
          fill="none"
        />

        {/* Animated flow path */}
        <path
          id={id}
          className="react-flow__edge-path"
          d={edgePath}
          stroke={strokeColor}
          strokeWidth={2}
          strokeDasharray="8,4"
          fill="none"
          style={{
            strokeDashoffset: pathLength,
            animation: data?.isActive ? `${animationId}-dash 1.5s linear infinite` : 'none',
            transition: 'stroke 0.2s ease-in-out',
          }}
        />

        {/* Keyframe animation */}
        <style>
          {`
            @keyframes ${animationId}-dash {
              to {
                stroke-dashoffset: 0;
              }
            }
          `}
        </style>

        {/* Sidechain icon/indicator at midpoint */}
        <g transform={`translate(${labelX}, ${labelY})`}>
          {/* Background circle */}
          <circle
            r={14}
            fill={theme.palette.background.paper}
            stroke={strokeColor}
            strokeWidth={2}
            opacity={0.95}
          />
          {/* SC text */}
          <text
            x={0}
            y={1}
            textAnchor="middle"
            dominantBaseline="middle"
            style={{
              fontSize: 9,
              fontWeight: 700,
              fill: strokeColor,
              userSelect: 'none',
            }}
          >
            SC
          </text>
          {/* Bus number (if > 1) */}
          {data?.targetBusIndex !== undefined && data.targetBusIndex > 0 && (
            <text
              x={0}
              y={8}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{
                fontSize: 7,
                fill: theme.palette.text.secondary,
                userSelect: 'none',
              }}
            >
              {data.targetBusIndex + 1}
            </text>
          )}
        </g>

        {/* Tooltip area (invisible hit area for hover) */}
        <path
          d={edgePath}
          stroke="transparent"
          strokeWidth={20}
          fill="none"
          style={{ cursor: 'pointer' }}
        >
          <title>
            {`Sidechain: ${data?.sourcePluginName || 'Source'} → ${data?.targetPluginName || 'Target'} (${data?.label || 'SC'})`}
          </title>
        </path>
      </>
    );
  }
);

SidechainConnectionEdge.displayName = 'SidechainConnectionEdge';

export default SidechainConnectionEdge;
