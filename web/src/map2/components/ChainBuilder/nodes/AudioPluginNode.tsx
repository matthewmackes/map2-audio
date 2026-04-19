// ============================================================================
// MAP2 Audio Platform - Audio Plugin Node Component
// Custom React Flow node for audio plugins with Material-UI styling
// Enhanced with CPU indicators, LFO badges, modulation display,
// sidechain routing handles, latency visualization, and meter panel toggle
// ============================================================================

import { memo, useMemo } from 'react';
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
import { NumberInput } from '../../../../app/components/ParameterControl';
import {
  ChartLine,
  ChevronDown,
  ChevronUp,
  DirectionFork,
  Draggable,
  Equalizer,
  Meter,
  Power,
  Timer,
  TrashCan,
  Waveform,
} from '@carbon/icons-react';
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

function ChipGlyph({
  icon: Icon,
  size = 12,
}: {
  icon: React.ComponentType<{ size?: number }>;
  size?: number;
}) {
  return <Icon size={size} />;
}

const CARBON_ACTION_BAR_BG = '#000000';
const CARBON_SELECTED_BORDER = '#0f62fe';
const CARBON_DELETE = '#da1e28';
const CARBON_BYPASS = '#f1c21b';

function OverlayActionButton({
  label,
  icon: Icon,
  backgroundColor,
  color,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  backgroundColor: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        onClick();
      }}
      sx={{
        pointerEvents: 'auto',
        appearance: 'none',
        border: 0,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        minHeight: 28,
        px: 1,
        bgcolor: backgroundColor,
        color,
        borderRadius: 0.75,
        fontSize: '0.68rem',
        fontWeight: 700,
        letterSpacing: '0.02em',
        cursor: 'pointer',
        transition: 'transform 120ms ease, filter 120ms ease',
        '&:hover': {
          filter: 'brightness(1.05)',
          transform: 'translateY(-1px)',
        },
        '&:focus-visible': {
          outline: `2px solid ${CARBON_SELECTED_BORDER}`,
          outlineOffset: 2,
        },
      }}
    >
      <Icon size={14} />
      <Box component="span">{label}</Box>
    </Box>
  );
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
    const isSelected = selected || data.isSelected;

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

    // Mini meter bar component
    const meterBar = (value: number | undefined, color: string) => (
      <Box sx={{ flex: 1, height: 6, bgcolor: 'action.hover', borderRadius: 1, overflow: 'hidden' }}>
        <Box sx={{ width: `${Math.min(Math.max((value ?? 0) * 100, 0), 100)}%`, height: '100%', bgcolor: color, transition: 'width 120ms linear' }} />
      </Box>
    );

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
                opacity: 0.9,
                top: `calc(50% + ${(idx + 1) * 20}px)`,
              }}
            />
          </Tooltip>
        ))}

        <Card
          sx={{
            width: compact ? 180 : 260,
            minHeight: compact ? 110 : 160,
            border: 2,
            borderColor: isSelected
              ? CARBON_SELECTED_BORDER
              : isHardware ? '#C8A951' : 'divider',
            bgcolor: isHardware
              ? alpha('#C8A951', 0.06)
              : isSelected ? '#f4f4f4'
              : isBypassed ? alpha(theme.palette.action.disabledBackground, 0.4) : 'background.paper',
            filter: isBypassed ? 'saturate(0.82)' : 'none',
            transition: 'all 180ms ease-out',
            cursor: 'grab',
            boxShadow: isSelected ? '0 0 0 1px rgba(15,98,254,0.2), 0 12px 24px rgba(22,22,22,0.12)' : undefined,
            '&:hover': {
              borderColor: isSelected
                ? CARBON_SELECTED_BORDER
                : isHardware ? '#D4B86A' : 'primary.light',
              boxShadow: isHardware
                ? '0 0 12px rgba(200,169,81,0.3)'
                : isSelected ? '0 0 0 1px rgba(15,98,254,0.24), 0 14px 28px rgba(22,22,22,0.16)' : 4,
            },
            '&:active': {
              cursor: 'grabbing',
              transform: 'scale(1.02)',
            },
          }}
        >
          <CardContent
            sx={{
              p: 1.5,
              pt: isSelected ? 6.25 : 1.5,
              '&:last-child': { pb: 1.5 },
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {isSelected && (
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{
                  position: 'absolute',
                  top: 8,
                  left: 8,
                  right: 8,
                  minHeight: 38,
                  px: 1,
                  py: 0.75,
                  bgcolor: CARBON_ACTION_BAR_BG,
                  color: '#f4f4f4',
                  borderRadius: 1,
                  boxShadow: '0 8px 16px rgba(0,0,0,0.24)',
                  pointerEvents: 'none',
                  zIndex: 1,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    color: '#f4f4f4',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    letterSpacing: '0.02em',
                  }}
                >
                  Selected
                </Typography>
                <Stack direction="row" spacing={0.75} sx={{ pointerEvents: 'auto' }}>
                  <OverlayActionButton
                    label={isBypassed ? 'Enable' : 'Bypass'}
                    icon={Power}
                    backgroundColor={CARBON_BYPASS}
                    color="#161616"
                    onClick={data.onToggleBypass}
                  />
                  <OverlayActionButton
                    label="Remove"
                    icon={TrashCan}
                    backgroundColor={CARBON_DELETE}
                    color="#ffffff"
                    onClick={data.onRemove}
                  />
                </Stack>
              </Stack>
            )}

            {/* Header */}
            <Stack direction="row" spacing={0.5} alignItems="flex-start" mb={compact ? 0.5 : 1}>
              <Box sx={{ color: 'text.disabled', mt: 0.5, display: 'inline-flex', alignItems: 'center' }}>
                <Draggable size={16} />
              </Box>
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
                  <Box sx={{ fontSize: 14, color: 'secondary.main', display: 'inline-flex', alignItems: 'center' }}>
                    <DirectionFork size={14} />
                  </Box>
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
                    icon={<ChipGlyph icon={Timer} />}
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
                    icon={<ChipGlyph icon={Meter} />}
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
                    icon={<ChipGlyph icon={Waveform} />}
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
                    icon={<ChipGlyph icon={Equalizer} />}
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
                    icon={<ChipGlyph icon={ChartLine} />}
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

            {onToggleMeterPanel && (
              <Stack direction="row" justifyContent="flex-end" alignItems="center">
                <Tooltip title={meterPanelExpanded ? 'Collapse meters' : 'Expand meters'}>
                  <IconButton
                    size="small"
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleMeterPanel();
                    }}
                    sx={{ color: meterPanelExpanded ? 'primary.main' : 'text.secondary' }}
                  >
                    {meterPanelExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </IconButton>
                </Tooltip>
              </Stack>
            )}
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
          }}
        />
      </>
    );
  }
);

AudioPluginNode.displayName = 'AudioPluginNode';

export default AudioPluginNode;
