// ============================================================================
// PluginChooser - Plugin Format Badge
// Displays LV2 or VST3 format indicator with official branding
// ============================================================================

import { Box, Tooltip } from '@mui/material'
import { PluginFormat } from '../types'

interface PluginFormatBadgeProps {
  format: PluginFormat
  size?: 'small' | 'medium' | 'large'
}

// LV2 official colors - purple/blue scheme
const LV2_COLOR = '#8B5CF6'
const LV2_BG = 'rgba(139, 92, 246, 0.15)'

// VST3 colors
const VST3_COLOR = '#FF6B35'
const VST3_BG = 'rgba(255, 107, 53, 0.15)'

// Hardware colors - Lexicon gold
const HW_COLOR = '#C8A951'
const HW_BG = 'rgba(200, 169, 81, 0.15)'

export function PluginFormatBadge({ format, size = 'small' }: PluginFormatBadgeProps) {
  const isLV2 = format === 'lv2'
  const isHW = format === 'hardware'
  const color = isHW ? HW_COLOR : isLV2 ? LV2_COLOR : VST3_COLOR
  const bgColor = isHW ? HW_BG : isLV2 ? LV2_BG : VST3_BG
  const label = isHW ? 'HW' : isLV2 ? 'LV2' : 'VST3'
  const tooltip = isHW
    ? 'Hardware Effect (S/PDIF)'
    : isLV2
    ? 'LV2 Audio Plugin'
    : 'VST3 Audio Plugin'

  const sizeStyles = {
    small: { fontSize: '0.6rem', px: 0.5, py: 0.1 },
    medium: { fontSize: '0.7rem', px: 0.75, py: 0.2 },
    large: { fontSize: '0.8rem', px: 1, py: 0.25 },
  }

  const { fontSize, px, py } = sizeStyles[size]

  return (
    <Tooltip title={tooltip} arrow>
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize,
          fontWeight: 700,
          fontFamily: 'var(--font-ui-tight)',
          color,
          backgroundColor: bgColor,
          borderRadius: 0.5,
          px,
          py,
          letterSpacing: '0.02em',
          border: `1px solid ${color}`,
          textTransform: 'uppercase',
          lineHeight: 1,
          whiteSpace: 'nowrap',
          userSelect: 'none',
        }}
      >
        {label}
      </Box>
    </Tooltip>
  )
}

/**
 * LV2 Logo SVG Component
 * Based on official LV2 branding
 */
export function LV2Logo({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* LV2 stylized logo - purple hexagonal design */}
      <defs>
        <linearGradient id="lv2Gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#A78BFA" />
          <stop offset="100%" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      {/* Hexagonal background */}
      <path
        d="M50 5 L90 27.5 L90 72.5 L50 95 L10 72.5 L10 27.5 Z"
        fill="url(#lv2Gradient)"
      />
      {/* LV2 text */}
      <text
        x="50"
        y="58"
        fontSize="26"
        fontWeight="bold"
        fontFamily="monospace"
        fill="white"
        textAnchor="middle"
      >
        LV2
      </text>
    </svg>
  )
}

/**
 * VST3 Logo Component
 * Uses the existing vst.svg asset style
 */
export function VST3Logo({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* VST3 stylized logo - orange design */}
      <defs>
        <linearGradient id="vst3Gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FF8C42" />
          <stop offset="100%" stopColor="#FF5722" />
        </linearGradient>
      </defs>
      {/* Rectangular background with rounded corners */}
      <rect
        x="5"
        y="20"
        width="90"
        height="60"
        rx="8"
        fill="url(#vst3Gradient)"
      />
      {/* VST3 text */}
      <text
        x="50"
        y="58"
        fontSize="22"
        fontWeight="bold"
        fontFamily="monospace"
        fill="white"
        textAnchor="middle"
      >
        VST3
      </text>
    </svg>
  )
}

export default PluginFormatBadge
