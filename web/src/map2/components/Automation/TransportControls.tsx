// ============================================================================
// MAP2 Audio Platform - Transport Controls Component
// Play, Stop, Record, Loop controls for automation playback
// ============================================================================

import { memo } from 'react';
import {
  Stack,
  IconButton,
  Tooltip,
  Typography,
  Box,
} from '@mui/material';
import { NumberInput } from '../NumberInput';
import {
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  FiberManualRecord as RecordIcon,
  Repeat as LoopIcon,
  SkipPrevious as RewindIcon,
  FastForward as ForwardIcon,
} from '@mui/icons-material';
import { useTheme, alpha, keyframes } from '@mui/material/styles';

// ============================================================================
// Types
// ============================================================================

export interface TransportControlsProps {
  /** Whether playback is active */
  isPlaying: boolean;
  /** Whether recording is active */
  isRecording: boolean;
  /** Whether loop is enabled */
  loopEnabled: boolean;
  /** Current playback position in seconds */
  currentTime: number;
  /** Total duration in seconds */
  duration: number;
  /** Loop start position in seconds */
  loopStart?: number;
  /** Loop end position in seconds */
  loopEnd?: number;
  /** Callbacks */
  onPlay: () => void;
  onStop: () => void;
  onRecord: () => void;
  onToggleLoop: () => void;
  onSeek: (time: number) => void;
  onRewind: () => void;
  onForward: () => void;
  /** Compact display mode */
  compact?: boolean;
}

// ============================================================================
// Animations
// ============================================================================

const recordPulse = keyframes`
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.6;
    transform: scale(0.95);
  }
`;

// ============================================================================
// Helper Functions
// ============================================================================

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

// ============================================================================
// Main TransportControls Component
// ============================================================================

const TransportControls = memo(({
  isPlaying,
  isRecording,
  loopEnabled,
  currentTime,
  duration,
  loopStart = 0,
  loopEnd,
  onPlay,
  onStop,
  onRecord,
  onToggleLoop,
  onSeek,
  onRewind,
  onForward,
  compact = false,
}: TransportControlsProps) => {
  const theme = useTheme();

  const buttonSize = compact ? 'small' : 'medium';
  const iconSize = compact ? 'small' : 'medium';

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={compact ? 0.5 : 1}
      sx={{
        p: compact ? 0.5 : 1,
        bgcolor: alpha(theme.palette.background.paper, 0.95),
        borderRadius: 1,
        border: `1px solid ${theme.palette.divider}`,
      }}
    >
      {/* Rewind */}
      <Tooltip title="Rewind">
        <IconButton size={buttonSize} onClick={onRewind}>
          <RewindIcon fontSize={iconSize} />
        </IconButton>
      </Tooltip>

      {/* Stop */}
      <Tooltip title="Stop">
        <IconButton
          size={buttonSize}
          onClick={onStop}
          sx={{
            color: !isPlaying && !isRecording ? 'text.disabled' : 'text.primary',
          }}
        >
          <StopIcon fontSize={iconSize} />
        </IconButton>
      </Tooltip>

      {/* Play/Pause */}
      <Tooltip title={isPlaying ? 'Pause' : 'Play'}>
        <IconButton
          size={buttonSize}
          onClick={onPlay}
          sx={{
            color: isPlaying ? theme.palette.success.main : 'text.primary',
            bgcolor: isPlaying ? alpha(theme.palette.success.main, 0.1) : 'transparent',
          }}
        >
          <PlayIcon fontSize={iconSize} />
        </IconButton>
      </Tooltip>

      {/* Record */}
      <Tooltip title={isRecording ? 'Stop Recording' : 'Record'}>
        <IconButton
          size={buttonSize}
          onClick={onRecord}
          sx={{
            color: isRecording ? theme.palette.error.main : 'text.primary',
            bgcolor: isRecording ? alpha(theme.palette.error.main, 0.1) : 'transparent',
            animation: isRecording ? `${recordPulse} 1s ease-in-out infinite` : 'none',
          }}
        >
          <RecordIcon fontSize={iconSize} />
        </IconButton>
      </Tooltip>

      {/* Forward */}
      <Tooltip title="Forward">
        <IconButton size={buttonSize} onClick={onForward}>
          <ForwardIcon fontSize={iconSize} />
        </IconButton>
      </Tooltip>

      {/* Divider */}
      <Box sx={{ width: 1, height: 24, bgcolor: theme.palette.divider, mx: 0.5 }} />

      {/* Loop */}
      <Tooltip title={loopEnabled ? 'Disable Loop' : 'Enable Loop'}>
        <IconButton
          size={buttonSize}
          onClick={onToggleLoop}
          sx={{
            color: loopEnabled ? theme.palette.primary.main : 'text.secondary',
            bgcolor: loopEnabled ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
          }}
        >
          <LoopIcon fontSize={iconSize} />
        </IconButton>
      </Tooltip>

      {/* Divider */}
      <Box sx={{ width: 1, height: 24, bgcolor: theme.palette.divider, mx: 0.5 }} />

      {/* Time display */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: compact ? 80 : 120 }}>
        <Typography
          variant="caption"
          sx={{
            fontFamily: 'monospace',
            fontWeight: 600,
            fontSize: compact ? '0.7rem' : '0.85rem',
            color: isRecording ? 'error.main' : 'text.primary',
          }}
        >
          {formatTime(currentTime)}
        </Typography>
        <Typography variant="caption" color="text.disabled">/</Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            fontFamily: 'monospace',
            fontSize: compact ? '0.65rem' : '0.75rem',
          }}
        >
          {formatTime(duration)}
        </Typography>
      </Stack>

      {/* Timeline position */}
      {!compact && (
        <Box sx={{ flex: 1, mx: 1 }}>
          <NumberInput
            value={currentTime}
            onChange={(value) => onSeek(value)}
            min={0}
            max={duration || 60}
            step={0.1}
            unit="s"
            size="small"
            fullWidth
          />
        </Box>
      )}
    </Stack>
  );
});

TransportControls.displayName = 'TransportControls';

export default TransportControls;
