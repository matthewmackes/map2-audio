// ============================================================================
// MAP2 Audio Platform - Automation Lane Component
// Single automation lane with point editing and curve visualization
// ============================================================================

import { memo, useRef, useCallback, useMemo, useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Stack,
  IconButton,
  Tooltip,
  Chip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Visibility as ShowIcon,
  VisibilityOff as HideIcon,
  FiberManualRecord as RecordIcon,
  Timeline as CurveIcon,
} from '@mui/icons-material';
import { useTheme, alpha } from '@mui/material/styles';

// ============================================================================
// Types
// ============================================================================

export type CurveType = 'linear' | 'exponential' | 'logarithmic' | 's_curve' | 'step';

export interface AutomationPoint {
  id: string;
  time: number;
  value: number;
  curve: CurveType;
}

export interface AutomationLaneProps {
  /** Unique lane ID */
  id: string;
  /** Parameter name to display */
  parameterName: string;
  /** Plugin name */
  pluginName: string;
  /** Automation points */
  points: AutomationPoint[];
  /** Whether the lane is enabled */
  enabled: boolean;
  /** Whether the lane is armed for recording */
  armed: boolean;
  /** Current playback position */
  currentTime: number;
  /** Total duration */
  duration: number;
  /** Current value (for playhead indicator) */
  currentValue?: number;
  /** Min/Max value range */
  minValue?: number;
  maxValue?: number;
  /** Lane height in pixels */
  height?: number;
  /** Callbacks */
  onAddPoint: (time: number, value: number) => void;
  onMovePoint: (pointId: string, time: number, value: number) => void;
  onDeletePoint: (pointId: string) => void;
  onChangeCurve: (pointId: string, curve: CurveType) => void;
  onToggleEnabled: () => void;
  onToggleArmed: () => void;
  onDelete: () => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

function interpolateValue(
  points: AutomationPoint[],
  time: number,
  curve: CurveType
): number {
  if (points.length === 0) return 0.5;
  if (points.length === 1) return points[0].value;

  // Find surrounding points
  const sortedPoints = [...points].sort((a, b) => a.time - b.time);

  if (time <= sortedPoints[0].time) return sortedPoints[0].value;
  if (time >= sortedPoints[sortedPoints.length - 1].time) {
    return sortedPoints[sortedPoints.length - 1].value;
  }

  // Find the two points to interpolate between
  let p1 = sortedPoints[0];
  let p2 = sortedPoints[1];
  for (let i = 0; i < sortedPoints.length - 1; i++) {
    if (time >= sortedPoints[i].time && time < sortedPoints[i + 1].time) {
      p1 = sortedPoints[i];
      p2 = sortedPoints[i + 1];
      break;
    }
  }

  // Linear interpolation factor
  const t = (time - p1.time) / (p2.time - p1.time);

  // Apply curve type
  let curvedT = t;
  switch (p1.curve) {
    case 'exponential':
      curvedT = t * t;
      break;
    case 'logarithmic':
      curvedT = Math.sqrt(t);
      break;
    case 's_curve':
      curvedT = t * t * (3 - 2 * t);
      break;
    case 'step':
      curvedT = t < 0.5 ? 0 : 1;
      break;
    default:
      curvedT = t;
  }

  return p1.value + (p2.value - p1.value) * curvedT;
}

function getCurveColor(curve: CurveType): string {
  switch (curve) {
    case 'exponential': return '#ff9800';
    case 'logarithmic': return '#4caf50';
    case 's_curve': return '#9c27b0';
    case 'step': return '#f44336';
    default: return '#2196f3';
  }
}

// ============================================================================
// Main AutomationLane Component
// ============================================================================

const AutomationLane = memo(({
  id,
  parameterName,
  pluginName,
  points,
  enabled,
  armed,
  currentTime,
  duration,
  currentValue,
  minValue = 0,
  maxValue = 1,
  height = 80,
  onAddPoint,
  onMovePoint,
  onDeletePoint,
  onChangeCurve,
  onToggleEnabled,
  onToggleArmed,
  onDelete,
}: AutomationLaneProps) => {
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [selectedPoint, setSelectedPoint] = useState<string | null>(null);
  const [dragPoint, setDragPoint] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; pointId: string } | null>(null);

  // Sort points by time
  const sortedPoints = useMemo(() => {
    return [...points].sort((a, b) => a.time - b.time);
  }, [points]);

  // Draw automation curve on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width } = canvas;
    const canvasHeight = height;

    // Clear canvas
    ctx.fillStyle = enabled
      ? alpha(theme.palette.background.paper, 0.8)
      : alpha(theme.palette.action.disabledBackground, 0.5);
    ctx.fillRect(0, 0, width, canvasHeight);

    // Draw grid lines
    ctx.strokeStyle = alpha(theme.palette.divider, 0.3);
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = (i / 4) * canvasHeight;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    if (!enabled || sortedPoints.length === 0) return;

    // Draw automation curve
    ctx.beginPath();
    ctx.strokeStyle = armed
      ? theme.palette.error.main
      : theme.palette.primary.main;
    ctx.lineWidth = 2;

    const timeToX = (t: number) => (t / duration) * width;
    const valueToY = (v: number) => (1 - (v - minValue) / (maxValue - minValue)) * canvasHeight;

    // Draw curve with interpolation
    const steps = width;
    for (let i = 0; i <= steps; i++) {
      const time = (i / steps) * duration;
      const value = interpolateValue(sortedPoints, time, 'linear');
      const x = timeToX(time);
      const y = valueToY(value);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Draw points
    sortedPoints.forEach((point) => {
      const x = timeToX(point.time);
      const y = valueToY(point.value);
      const color = getCurveColor(point.curve);

      // Point circle
      ctx.beginPath();
      ctx.arc(x, y, selectedPoint === point.id ? 8 : 6, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = theme.palette.background.paper;
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // Draw playhead
    if (currentTime >= 0 && currentTime <= duration) {
      const playheadX = timeToX(currentTime);
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, canvasHeight);
      ctx.strokeStyle = theme.palette.error.main;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Current value indicator
      if (currentValue !== undefined) {
        const currentY = valueToY(currentValue);
        ctx.beginPath();
        ctx.arc(playheadX, currentY, 4, 0, Math.PI * 2);
        ctx.fillStyle = theme.palette.error.main;
        ctx.fill();
      }
    }
  }, [sortedPoints, enabled, armed, currentTime, duration, minValue, maxValue, height, theme, selectedPoint, currentValue]);

  // Handle canvas click to add point
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !enabled) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const time = (x / canvas.width) * duration;
    const value = minValue + (1 - y / height) * (maxValue - minValue);

    // Check if clicking on existing point
    const clickedPoint = sortedPoints.find((p) => {
      const px = (p.time / duration) * canvas.width;
      const py = (1 - (p.value - minValue) / (maxValue - minValue)) * height;
      return Math.abs(x - px) < 10 && Math.abs(y - py) < 10;
    });

    if (clickedPoint) {
      setSelectedPoint(clickedPoint.id);
    } else {
      onAddPoint(time, value);
    }
  }, [enabled, duration, minValue, maxValue, height, sortedPoints, onAddPoint]);

  // Handle context menu
  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas || !enabled) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Find clicked point
    const clickedPoint = sortedPoints.find((p) => {
      const px = (p.time / duration) * canvas.width;
      const py = (1 - (p.value - minValue) / (maxValue - minValue)) * height;
      return Math.abs(x - px) < 10 && Math.abs(y - py) < 10;
    });

    if (clickedPoint) {
      setContextMenu({ x: e.clientX, y: e.clientY, pointId: clickedPoint.id });
    }
  }, [enabled, duration, minValue, maxValue, height, sortedPoints]);

  return (
    <Box
      ref={containerRef}
      sx={{
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 1,
        overflow: 'hidden',
        opacity: enabled ? 1 : 0.5,
      }}
    >
      {/* Lane Header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{
          px: 1,
          py: 0.5,
          bgcolor: alpha(theme.palette.primary.main, 0.1),
          borderBottom: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="caption" fontWeight={600} noWrap sx={{ maxWidth: 100 }}>
            {parameterName}
          </Typography>
          <Chip
            label={pluginName}
            size="small"
            variant="outlined"
            sx={{ height: 18, fontSize: '0.6rem' }}
          />
          <Chip
            label={`${points.length} pts`}
            size="small"
            sx={{ height: 16, fontSize: '0.55rem' }}
          />
        </Stack>

        <Stack direction="row" spacing={0.5}>
          {/* Record arm */}
          <Tooltip title={armed ? 'Disarm Recording' : 'Arm for Recording'}>
            <IconButton
              size="small"
              onClick={onToggleArmed}
              sx={{
                color: armed ? 'error.main' : 'text.secondary',
                bgcolor: armed ? alpha(theme.palette.error.main, 0.1) : 'transparent',
              }}
            >
              <RecordIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>

          {/* Enable/Disable */}
          <Tooltip title={enabled ? 'Disable Lane' : 'Enable Lane'}>
            <IconButton size="small" onClick={onToggleEnabled}>
              {enabled ? <ShowIcon sx={{ fontSize: 14 }} /> : <HideIcon sx={{ fontSize: 14 }} />}
            </IconButton>
          </Tooltip>

          {/* Delete */}
          <Tooltip title="Delete Lane">
            <IconButton size="small" onClick={onDelete} color="error">
              <DeleteIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      {/* Lane Canvas */}
      <canvas
        ref={canvasRef}
        width={400}
        height={height}
        style={{
          width: '100%',
          height,
          cursor: enabled ? 'crosshair' : 'not-allowed',
        }}
        onClick={handleCanvasClick}
        onContextMenu={handleContextMenu}
      />

      {/* Point Context Menu */}
      <Menu
        open={!!contextMenu}
        onClose={() => setContextMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={contextMenu ? { top: contextMenu.y, left: contextMenu.x } : undefined}
      >
        <MenuItem onClick={() => { onChangeCurve(contextMenu!.pointId, 'linear'); setContextMenu(null); }}>
          <ListItemIcon><CurveIcon sx={{ color: getCurveColor('linear') }} /></ListItemIcon>
          <ListItemText>Linear</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { onChangeCurve(contextMenu!.pointId, 'exponential'); setContextMenu(null); }}>
          <ListItemIcon><CurveIcon sx={{ color: getCurveColor('exponential') }} /></ListItemIcon>
          <ListItemText>Exponential</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { onChangeCurve(contextMenu!.pointId, 'logarithmic'); setContextMenu(null); }}>
          <ListItemIcon><CurveIcon sx={{ color: getCurveColor('logarithmic') }} /></ListItemIcon>
          <ListItemText>Logarithmic</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { onChangeCurve(contextMenu!.pointId, 's_curve'); setContextMenu(null); }}>
          <ListItemIcon><CurveIcon sx={{ color: getCurveColor('s_curve') }} /></ListItemIcon>
          <ListItemText>S-Curve</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { onChangeCurve(contextMenu!.pointId, 'step'); setContextMenu(null); }}>
          <ListItemIcon><CurveIcon sx={{ color: getCurveColor('step') }} /></ListItemIcon>
          <ListItemText>Step</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { onDeletePoint(contextMenu!.pointId); setContextMenu(null); }}>
          <ListItemIcon><DeleteIcon color="error" /></ListItemIcon>
          <ListItemText>Delete Point</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
});

AutomationLane.displayName = 'AutomationLane';

export default AutomationLane;
