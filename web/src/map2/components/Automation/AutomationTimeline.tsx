// @ts-nocheck
// ============================================================================
// MAP2 Audio Platform - Automation Timeline Component
// Main timeline panel with transport controls and automation lanes
// ============================================================================

import { memo, useState, useCallback } from 'react';
import {
  Box,
  Paper,
  Stack,
  Typography,
  IconButton,
  Tooltip,
  Collapse,
  Button,
  Divider,
} from '@mui/material';
import {
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
  Add as AddIcon,
  Timeline as TimelineIcon,
} from '@mui/icons-material';
import { useTheme, alpha } from '@mui/material/styles';

import TransportControls, { TransportControlsProps } from './TransportControls';
import AutomationLane, { AutomationLaneProps, AutomationPoint, CurveType } from './AutomationLane';

// ============================================================================
// Types
// ============================================================================

export interface AutomationLaneData {
  id: string;
  pluginUri: string;
  pluginName: string;
  parameterIndex: number;
  parameterName: string;
  points: AutomationPoint[];
  enabled: boolean;
  armed: boolean;
  minValue: number;
  maxValue: number;
}

export interface AutomationTimelineProps {
  /** Automation lanes */
  lanes: AutomationLaneData[];
  /** Transport state */
  isPlaying: boolean;
  isRecording: boolean;
  loopEnabled: boolean;
  currentTime: number;
  duration: number;
  loopStart?: number;
  loopEnd?: number;
  /** Callbacks - Transport */
  onPlay: () => void;
  onStop: () => void;
  onRecord: () => void;
  onToggleLoop: () => void;
  onSeek: (time: number) => void;
  /** Callbacks - Lanes */
  onAddLane: () => void;
  onDeleteLane: (laneId: string) => void;
  onToggleLaneEnabled: (laneId: string) => void;
  onToggleLaneArmed: (laneId: string) => void;
  onAddPoint: (laneId: string, time: number, value: number) => void;
  onMovePoint: (laneId: string, pointId: string, time: number, value: number) => void;
  onDeletePoint: (laneId: string, pointId: string) => void;
  onChangeCurve: (laneId: string, pointId: string, curve: CurveType) => void;
  /** Current parameter values (for playhead indicators) */
  currentValues?: Record<string, number>;
  /** Whether the panel starts collapsed */
  defaultCollapsed?: boolean;
  /** Panel position */
  position?: 'bottom' | 'right';
  /** Panel height when expanded (bottom) or width (right) */
  expandedSize?: number;
}

// ============================================================================
// Main AutomationTimeline Component
// ============================================================================

const AutomationTimeline = memo(({
  lanes,
  isPlaying,
  isRecording,
  loopEnabled,
  currentTime,
  duration,
  loopStart,
  loopEnd,
  onPlay,
  onStop,
  onRecord,
  onToggleLoop,
  onSeek,
  onAddLane,
  onDeleteLane,
  onToggleLaneEnabled,
  onToggleLaneArmed,
  onAddPoint,
  onMovePoint,
  onDeletePoint,
  onChangeCurve,
  currentValues,
  defaultCollapsed = true,
  position = 'bottom',
  expandedSize = 300,
}: AutomationTimelineProps) => {
  const theme = useTheme();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  // Handle rewind
  const handleRewind = useCallback(() => {
    onSeek(0);
  }, [onSeek]);

  // Handle forward (jump to end or next marker)
  const handleForward = useCallback(() => {
    onSeek(duration);
  }, [onSeek, duration]);

  const isHorizontal = position === 'bottom';

  return (
    <Paper
      elevation={4}
      sx={{
        position: 'relative',
        bgcolor: alpha(theme.palette.background.paper, 0.98),
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: isHorizontal ? '8px 8px 0 0' : '8px 0 0 8px',
        overflow: 'hidden',
        ...(isHorizontal
          ? { width: '100%' }
          : { height: '100%' }),
      }}
    >
      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{
          px: 2,
          py: 1,
          bgcolor: alpha(theme.palette.primary.main, 0.1),
          borderBottom: `1px solid ${theme.palette.divider}`,
          cursor: 'pointer',
        }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <TimelineIcon sx={{ fontSize: 20, color: 'primary.main' }} />
          <Typography variant="subtitle2" fontWeight={600}>
            Automation
          </Typography>
          {lanes.length > 0 && (
            <Typography variant="caption" color="text.secondary">
              ({lanes.length} lane{lanes.length !== 1 ? 's' : ''})
            </Typography>
          )}
          {isRecording && (
            <Typography variant="caption" color="error.main" fontWeight={600}>
              ● REC
            </Typography>
          )}
        </Stack>

        <IconButton size="small">
          {collapsed ? <ExpandIcon /> : <CollapseIcon />}
        </IconButton>
      </Stack>

      {/* Content */}
      <Collapse in={!collapsed}>
        <Box
          sx={{
            ...(isHorizontal
              ? { height: expandedSize }
              : { width: expandedSize }),
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Transport Controls */}
          <Box sx={{ p: 1, borderBottom: `1px solid ${theme.palette.divider}` }}>
            <TransportControls
              isPlaying={isPlaying}
              isRecording={isRecording}
              loopEnabled={loopEnabled}
              currentTime={currentTime}
              duration={duration}
              loopStart={loopStart}
              loopEnd={loopEnd}
              onPlay={onPlay}
              onStop={onStop}
              onRecord={onRecord}
              onToggleLoop={onToggleLoop}
              onSeek={onSeek}
              onRewind={handleRewind}
              onForward={handleForward}
              compact
            />
          </Box>

          {/* Lanes area */}
          <Box
            sx={{
              flex: 1,
              overflowY: 'auto',
              p: 1,
            }}
          >
            {lanes.length === 0 ? (
              <Stack
                alignItems="center"
                justifyContent="center"
                spacing={2}
                sx={{ height: '100%', py: 4 }}
              >
                <Typography variant="body2" color="text.secondary">
                  No automation lanes
                </Typography>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={onAddLane}
                >
                  Add Automation Lane
                </Button>
              </Stack>
            ) : (
              <Stack spacing={1}>
                {lanes.map((lane) => (
                  <AutomationLane
                    key={lane.id}
                    id={lane.id}
                    parameterName={lane.parameterName}
                    pluginName={lane.pluginName}
                    points={lane.points}
                    enabled={lane.enabled}
                    armed={lane.armed}
                    currentTime={currentTime}
                    duration={duration}
                    currentValue={currentValues?.[`${lane.pluginUri}:${lane.parameterIndex}`]}
                    minValue={lane.minValue}
                    maxValue={lane.maxValue}
                    height={60}
                    onAddPoint={(time, value) => onAddPoint(lane.id, time, value)}
                    onMovePoint={(pointId, time, value) => onMovePoint(lane.id, pointId, time, value)}
                    onDeletePoint={(pointId) => onDeletePoint(lane.id, pointId)}
                    onChangeCurve={(pointId, curve) => onChangeCurve(lane.id, pointId, curve)}
                    onToggleEnabled={() => onToggleLaneEnabled(lane.id)}
                    onToggleArmed={() => onToggleLaneArmed(lane.id)}
                    onDelete={() => onDeleteLane(lane.id)}
                  />
                ))}

                {/* Add lane button */}
                <Button
                  variant="text"
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={onAddLane}
                  sx={{ alignSelf: 'flex-start' }}
                >
                  Add Lane
                </Button>
              </Stack>
            )}
          </Box>
        </Box>
      </Collapse>
    </Paper>
  );
});

AutomationTimeline.displayName = 'AutomationTimeline';

export default AutomationTimeline;
