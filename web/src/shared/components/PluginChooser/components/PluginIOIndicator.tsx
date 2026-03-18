// ============================================================================
// PluginChooser - Plugin I/O Indicator
// Visual representation of audio input/output configuration
// ============================================================================

import { Box, Tooltip, Stack, Typography } from '@mui/material'
import { getIODisplayName, getIOBadgeColor } from '../utils/pluginBridge'

interface PluginIOIndicatorProps {
  audioInputs: number
  audioOutputs: number
  hasMidiInput?: boolean
  hasMidiOutput?: boolean
  compact?: boolean
}

/**
 * Render audio channel dots
 */
function ChannelDots({
  count,
  color,
  label,
}: {
  count: number
  color: string
  label: string
}) {
  return (
    <Tooltip title={`${count} ${label}`} arrow>
      <Stack direction="row" spacing={0.25} alignItems="center">
        {Array.from({ length: Math.min(count, 4) }).map((_, i) => (
          <Box
            key={i}
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              bgcolor: color,
              border: '1px solid rgba(255,255,255,0.2)',
            }}
          />
        ))}
        {count > 4 && (
          <Typography
            variant="caption"
            sx={{ fontSize: '0.55rem', color: 'text.secondary', ml: 0.25 }}
          >
            +{count - 4}
          </Typography>
        )}
      </Stack>
    </Tooltip>
  )
}

export function PluginIOIndicator({
  audioInputs,
  audioOutputs,
  hasMidiInput,
  hasMidiOutput,
  compact = false,
}: PluginIOIndicatorProps) {
  const displayName = getIODisplayName(audioInputs, audioOutputs)
  const color = getIOBadgeColor(audioInputs, audioOutputs)

  if (compact) {
    // Compact mode - just show text badge
    return (
      <Tooltip title={`${audioInputs} in / ${audioOutputs} out`} arrow>
        <Box
          component="span"
          sx={{
            fontSize: '0.6rem',
            fontWeight: 600,
            color,
            bgcolor: `${color}20`,
            px: 0.5,
            py: 0.1,
            borderRadius: 0.5,
            border: `1px solid ${color}40`,
          }}
        >
          {displayName}
        </Box>
      </Tooltip>
    )
  }

  // Full mode - show dots and arrow
  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      {/* Input dots */}
      <ChannelDots
        count={audioInputs}
        color="#60A5FA"
        label={audioInputs === 1 ? 'input' : 'inputs'}
      />

      {/* Arrow */}
      <Box
        sx={{
          color: 'text.disabled',
          fontSize: '0.7rem',
          lineHeight: 1,
        }}
      >
        →
      </Box>

      {/* Output dots */}
      <ChannelDots
        count={audioOutputs}
        color="#34D399"
        label={audioOutputs === 1 ? 'output' : 'outputs'}
      />

      {/* MIDI indicators */}
      {(hasMidiInput || hasMidiOutput) && (
        <Tooltip
          title={
            hasMidiInput && hasMidiOutput
              ? 'MIDI In/Out'
              : hasMidiInput
                ? 'MIDI In'
                : 'MIDI Out'
          }
          arrow
        >
          <Box
            sx={{
              fontSize: '0.55rem',
              fontWeight: 700,
              color: '#F472B6',
              bgcolor: 'rgba(244, 114, 182, 0.15)',
              px: 0.4,
              py: 0.1,
              borderRadius: 0.5,
              border: '1px solid rgba(244, 114, 182, 0.3)',
              ml: 0.5,
            }}
          >
            MIDI
          </Box>
        </Tooltip>
      )}
    </Stack>
  )
}

/**
 * Simple I/O badge for list view
 */
export function PluginIOBadge({
  audioInputs,
  audioOutputs,
}: {
  audioInputs: number
  audioOutputs: number
}) {
  const isStereo = audioInputs >= 2 || audioOutputs >= 2
  const color = isStereo ? '#00ff41' : '#888'

  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.25,
        fontSize: '0.6rem',
        fontWeight: 600,
        fontFamily: 'var(--font-ui-tight)',
        color,
        bgcolor: `${color}15`,
        px: 0.5,
        py: 0.1,
        borderRadius: 0.5,
        border: `1px solid ${color}30`,
      }}
    >
      {audioInputs}→{audioOutputs}
    </Box>
  )
}

export default PluginIOIndicator
