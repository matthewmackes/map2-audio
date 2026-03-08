// ============================================================================
// MAP2 Audio Platform - Audio Plugin Node Component
// Custom React Flow node for audio plugins with Material-UI styling
// Enhanced with CPU indicators, LFO badges, modulation display,
// sidechain routing handles, latency visualization, and meter panel toggle
// ============================================================================

import { memo, useState, useEffect, useMemo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import {
  Card,
  CardContent,
  Typography,
  IconButton,
  Chip,
  Stack,
  Box,
  Tooltip,
} from '@mui/material';
import { NumberInput } from '../../NumberInput';
import {
  PowerSettingsNew as PowerIcon,
  Delete as DeleteIcon,
  Settings as SettingsIcon,
  DragIndicator as DragIcon,
  Speed as CpuIcon,
  Waves as LfoIcon,
  GraphicEq as EnvelopeIcon,
  Timer as LatencyIcon,
  Timeline as AutomationIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
  CallSplit as SidechainIcon,
} from '@mui/icons-material';
import { useTheme, alpha } from '@mui/material/styles';
import { AudioPluginNodeData, getSidechainHandleId } from './AudioPluginNodeTypes';
import { getDisplayPluginName } from '../../../displayNames';

/**
 * Calculate latency in milliseconds from samples
 */
function samplesToMs(samples: number, sampleRate: number = 48000): number {
  return (samples / sampleRate) * 1000;
}

/**
 * Get latency color based on ms threshold
 * Green: <5ms, Yellow: 5-20ms, Red: >20ms
 */
function getLatencyColor(ms: number): 'success' | 'warning' | 'error' {
  if (ms < 5) return 'success';
  if (ms < 20) return 'warning';
  return 'error';
}

/**
 * Format latency display string
 */
function formatLatency(samples: number, sampleRate: number = 48000): string {
  const ms = samplesToMs(samples, sampleRate);
  if (ms < 1) {
    return `${samples} smp`;
  }
  return `${ms.toFixed(1)}ms`;
}

const AudioPluginNode = memo(
  ({ data, selected }: NodeProps<AudioPluginNodeData>) => {
    const theme = useTheme();
    const {
      plugin,
      isBypassed,
      inputPorts,
      outputPorts,
      compact,
      meters,
      quickParameters,
      onQuickParamChange,
      sidechainBuses,
      sidechainBusNames,
      meterPanelExpanded,
      onToggleMeterPanel,
      isHardware,
    } = data;

    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteProgress, setDeleteProgress] = useState(100);

    // Calculate latency info
    const latencyInfo = useMemo(() => {
      if (data.latencySamples === undefined || data.latencySamples === 0) {
        return null;
      }
      const sampleRate = data.sampleRate || 48000;
      const ms = samplesToMs(data.latencySamples, sampleRate);
      return {
        samples: data.latencySamples,
        ms,
        display: formatLatency(data.latencySamples, sampleRate),
        color: getLatencyColor(ms),
      };
    }, [data.latencySamples, data.sampleRate]);

    // Sidechain handles info
    const sidechainHandles = useMemo(() => {
      if (!sidechainBuses || sidechainBuses <= 0) return [];
      return Array.from({ length: sidechainBuses }, (_, i) => ({
        id: getSidechainHandleId(i),
        name: sidechainBusNames?.[i] || `Sidechain ${i + 1}`,
        index: i,
      }));
    }, [sidechainBuses, sidechainBusNames]);

    useEffect(() => {
      if (!isDeleting) return;

      const interval = setInterval(() => {
        setDeleteProgress(prev => {
          const next = prev - 33.33; // 100 / 3 frames for 300ms
          if (next <= 0) {
            clearInterval(interval);
            setTimeout(() => data.onRemove(), 50);
            return 0;
          }
          return next;
        });
      }, 100);

      return () => clearInterval(interval);
    }, [isDeleting, data]);

    // Mini meter bar component
    const meterBar = (value: number | undefined, color: string) => (
      <Box sx={{ flex: 1, height: 6, bgcolor: 'action.hover', borderRadius: 1, overflow: 'hidden' }}>
        <Box sx={{ width: `${Math.min(Math.max((value ?? 0) * 100, 0), 100)}%`, height: '100%', bgcolor: color, transition: 'width 120ms linear' }} />
      </Box>
    );

    const handleDelete = () => {
      setIsDeleting(true);
      setDeleteProgress(100);
    };

    return (
      <>
        {/* Main Audio Input Handle */}
        <Handle
          type="target"
          position={Position.Left}
          id="audio-in"
          style={{
            width: 12,
            height: 12,
            background: theme.palette.info.main,
            border: `2px solid ${theme.palette.background.paper}`,
            opacity: isDeleting ? 0 : 1,
            transition: 'opacity 300ms ease-out',
            top: '50%',
          }}
        />

        {/* Sidechain Input Handles - positioned below main input */}
        {sidechainHandles.map((sc, idx) => (
          <Tooltip key={sc.id} title={sc.name} placement="left">
            <Handle
              type="target"
              position={Position.Left}
              id={sc.id}
              style={{
                width: 10,
                height: 10,
                background: theme.palette.secondary.main,
                border: `2px solid ${theme.palette.background.paper}`,
                opacity: isDeleting ? 0 : 0.9,
                transition: 'opacity 300ms ease-out',
                top: `calc(50% + ${(idx + 1) * 20}px)`,
              }}
            />
          </Tooltip>
        ))}

        {/* Node Card with Deletion Animation */}
        <Card
          sx={{
            width: compact ? 180 : 260,
            minHeight: compact ? 110 : 160,
            border: 2,
            borderColor: isDeleting ? 'error.main'
              : isHardware ? '#C8A951'
              : selected ? 'primary.main' : 'divider',
            opacity: isDeleting ? 0.3 : isBypassed ? 0.5 : 1,
            bgcolor: isDeleting ? 'error.dark'
              : isHardware ? alpha('#C8A951', 0.06)
              : selected ? alpha(theme.palette.primary.main, 0.1) : 'background.paper',
            transition: 'all 300ms ease-out',
            cursor: 'grab',
            '&:hover': {
              borderColor: isDeleting ? 'error.main' : isHardware ? '#D4B86A' : 'primary.light',
              boxShadow: isDeleting ? 2 : isHardware ? '0 0 12px rgba(200,169,81,0.3)' : 4,
            },
            '&:active': {
              cursor: 'grabbing',
              transform: isDeleting ? 'scale(1)' : 'scale(1.02)',
            },
          }}
        >
          <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 }, position: 'relative', overflow: 'hidden' }}>
            {/* Deletion Progress Bar - Shrinks as countdown */}
            {isDeleting && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  height: '6px',
                  backgroundColor: '#ff0000',
                  width: `${deleteProgress}%`,
                  transition: 'width 100ms linear',
                  zIndex: 10,
                }}
              />
            )}

            {/* Header */}
            <Stack direction="row" spacing={0.5} alignItems="flex-start" mb={compact ? 0.5 : 1}>
              <DragIcon
                sx={{ fontSize: 16, color: 'text.disabled', mt: 0.5 }}
              />
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Typography
                  variant="subtitle2"
                  fontWeight="bold"
                  color="text.primary"
                  sx={{ lineHeight: 1.3, wordBreak: 'break-word', fontSize: compact ? '0.85rem' : '0.95rem' }}
                >
                  {getDisplayPluginName(plugin.name, plugin.uri)}
                </Typography>
                {!compact && plugin.plugin_display_type && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    noWrap
                    sx={{ fontSize: '0.7rem', display: 'block' }}
                  >
                    {plugin.plugin_display_type}
                  </Typography>
                )}
              </Box>
              {/* Hardware plugin badge */}
              {isHardware && (
                <Tooltip title="Hardware Effect (S/PDIF Send/Return)">
                  <Chip
                    label="HW"
                    size="small"
                    sx={{
                      height: 18,
                      fontSize: '0.6rem',
                      fontWeight: 'bold',
                      bgcolor: '#C8A951',
                      color: '#1A1A1A',
                      '& .MuiChip-label': { px: 0.5 },
                    }}
                  />
                </Tooltip>
              )}
              {/* Sidechain indicator if has sidechain buses */}
              {sidechainBuses && sidechainBuses > 0 && (
                <Tooltip title={`${sidechainBuses} sidechain input${sidechainBuses > 1 ? 's' : ''}`}>
                  <SidechainIcon sx={{ fontSize: 14, color: 'secondary.main' }} />
                </Tooltip>
              )}
            </Stack>

            {/* Port Indicators + Performance badges */}
            <Stack direction="row" spacing={0.5} mb={compact ? 0.5 : 1} flexWrap="wrap" sx={{ gap: 0.5 }}>
              <Chip
                label={`${inputPorts} in`}
                size="small"
                color="info"
                variant="outlined"
                sx={{ height: 18, fontSize: '0.65rem' }}
              />
              <Chip
                label={`${outputPorts} out`}
                size="small"
                color="success"
                variant="outlined"
                sx={{ height: 18, fontSize: '0.65rem' }}
              />

              {/* Latency badge - NEW */}
              {latencyInfo && (
                <Tooltip title={`Latency: ${latencyInfo.samples} samples (${latencyInfo.ms.toFixed(2)}ms)`}>
                  <Chip
                    icon={<LatencyIcon sx={{ fontSize: 12 }} />}
                    label={latencyInfo.display}
                    size="small"
                    color={latencyInfo.color}
                    variant="outlined"
                    sx={{ height: 18, fontSize: '0.6rem', '& .MuiChip-icon': { fontSize: 10 } }}
                  />
                </Tooltip>
              )}

              {/* CPU indicator */}
              {data.cpuPercent !== undefined && (
                <Tooltip title={`CPU: ${data.cpuPercent.toFixed(1)}%`}>
                  <Chip
                    icon={<CpuIcon sx={{ fontSize: 12 }} />}
                    label={`${data.cpuPercent.toFixed(0)}%`}
                    size="small"
                    color={data.cpuPercent > 50 ? 'error' : data.cpuPercent > 25 ? 'warning' : 'default'}
                    variant="outlined"
                    sx={{ height: 18, fontSize: '0.6rem', '& .MuiChip-icon': { fontSize: 10 } }}
                  />
                </Tooltip>
              )}
            </Stack>

            {/* Modulation indicators row */}
            <Stack direction="row" spacing={0.5} mb={compact ? 0.5 : 1} flexWrap="wrap" sx={{ gap: 0.5 }}>
              {/* LFO active indicator */}
              {data.hasLfo && (
                <Tooltip title="LFO modulation active">
                  <Chip
                    icon={<LfoIcon sx={{ fontSize: 12 }} />}
                    label="LFO"
                    size="small"
                    color="secondary"
                    sx={{ height: 18, fontSize: '0.6rem', '& .MuiChip-icon': { fontSize: 10 } }}
                  />
                </Tooltip>
              )}

              {/* Envelope follower indicator */}
              {data.hasEnvelope && (
                <Tooltip title="Envelope follower active">
                  <Chip
                    icon={<EnvelopeIcon sx={{ fontSize: 12 }} />}
                    label="ENV"
                    size="small"
                    color="warning"
                    sx={{ height: 18, fontSize: '0.6rem', '& .MuiChip-icon': { fontSize: 10 } }}
                  />
                </Tooltip>
              )}

              {/* Automation indicator - NEW */}
              {data.hasAutomation && (
                <Tooltip title="Automation recorded">
                  <Chip
                    icon={<AutomationIcon sx={{ fontSize: 12 }} />}
                    label="AUTO"
                    size="small"
                    color="primary"
                    sx={{
                      height: 18,
                      fontSize: '0.6rem',
                      '& .MuiChip-icon': { fontSize: 10 },
                      animation: 'pulse 2s infinite',
                      '@keyframes pulse': {
                        '0%, 100%': { opacity: 1 },
                        '50%': { opacity: 0.6 },
                      },
                    }}
                  />
                </Tooltip>
              )}
            </Stack>

            {/* Mini meters */}
            {(meters?.input !== undefined || meters?.output !== undefined) && (
              <Stack direction="row" spacing={0.5} mb={compact ? 0.5 : 1} alignItems="center">
                {meterBar(meters?.input, theme.palette.info.main)}
                {meterBar(meters?.output, theme.palette.success.main)}
              </Stack>
            )}

            {/* Quick tweak inputs */}
            {!compact && quickParameters && quickParameters.length > 0 && (
              <Stack spacing={0.5} mb={1}>
                {quickParameters.slice(0, 2).map((param) => (
                  <NumberInput
                    key={param.symbol}
                    label={param.name}
                    value={param.value}
                    min={param.min}
                    max={param.max}
                    step={(param.max - param.min) / 50}
                    onChange={(val) => {
                      onQuickParamChange?.(param.symbol, val, param.index);
                    }}
                    size="small"
                  />
                ))}
              </Stack>
            )}

            {/* Action Buttons */}
            <Stack direction="row" spacing={0.5} justifyContent="flex-end" alignItems="center">
              {/* Meter panel expand toggle - NEW */}
              {onToggleMeterPanel && (
                <Tooltip title={meterPanelExpanded ? "Collapse meters" : "Expand meters"}>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleMeterPanel();
                    }}
                    sx={{ color: meterPanelExpanded ? 'primary.main' : 'text.secondary' }}
                  >
                    {meterPanelExpanded ? <CollapseIcon fontSize="small" /> : <ExpandIcon fontSize="small" />}
                  </IconButton>
                </Tooltip>
              )}

              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  data.onToggleBypass();
                }}
              >
                <PowerIcon
                  fontSize="small"
                  color={isBypassed ? 'disabled' : 'primary'}
                />
              </IconButton>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  data.onOpenParameters();
                }}
              >
                <SettingsIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete();
                }}
                disabled={isDeleting}
                sx={{
                  color: isDeleting ? 'error.main' : 'error.light',
                  transition: 'all 200ms ease-out',
                  '&:hover': {
                    bgcolor: 'error.dark',
                    transform: 'scale(1.1)',
                  },
                }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Stack>
          </CardContent>
        </Card>

        {/* Output Handle */}
        <Handle
          type="source"
          position={Position.Right}
          id="audio-out"
          style={{
            width: 12,
            height: 12,
            background: theme.palette.success.main,
            border: `2px solid ${theme.palette.background.paper}`,
            opacity: isDeleting ? 0 : 1,
            transition: 'opacity 300ms ease-out',
          }}
        />
      </>
    );
  }
);

AudioPluginNode.displayName = 'AudioPluginNode';

export default AudioPluginNode;
