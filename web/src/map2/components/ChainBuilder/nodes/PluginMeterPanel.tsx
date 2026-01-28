// @ts-nocheck
// ============================================================================
// MAP2 Audio Platform - Plugin Meter Panel Component
// Expandable per-plugin metering panel with VU, Spectrum, and Info tabs
// ============================================================================

import { memo, useState, useRef, useEffect, useCallback } from 'react';
import {
  Box,
  Tabs,
  Tab,
  Typography,
  Stack,
  Tooltip,
  Chip,
} from '@mui/material';
import {
  VolumeUp as VuIcon,
  Equalizer as SpectrumIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { useTheme, alpha } from '@mui/material/styles';

// ============================================================================
// Types
// ============================================================================

export interface PluginMeterData {
  // VU meter data
  inputLeft: number;
  inputRight: number;
  outputLeft: number;
  outputRight: number;
  inputPeak: number;
  outputPeak: number;

  // Spectrum data (64 bins for mini display)
  spectrum?: number[];

  // Plugin info
  latencySamples?: number;
  cpuPercent?: number;
  format?: string;
  version?: string;
}

export interface PluginMeterPanelProps {
  pluginUri: string;
  pluginName: string;
  isExpanded: boolean;
  meterData?: PluginMeterData;
  sampleRate?: number;
  onClose?: () => void;
}

// ============================================================================
// VU Meter Component
// ============================================================================

interface VuMeterBarProps {
  value: number; // 0-1 normalized
  peak?: number;
  label: string;
  color: string;
  width?: number;
}

const VuMeterBar = memo(({ value, peak, label, color, width = 20 }: VuMeterBarProps) => {
  const theme = useTheme();
  const height = 80;
  const normalizedValue = Math.min(Math.max(value, 0), 1);
  const normalizedPeak = peak !== undefined ? Math.min(Math.max(peak, 0), 1) : undefined;

  // Calculate dB for display
  const db = normalizedValue > 0 ? 20 * Math.log10(normalizedValue) : -60;
  const dbDisplay = db > -60 ? `${db.toFixed(0)}dB` : '-∞';

  return (
    <Stack alignItems="center" spacing={0.5}>
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
        {label}
      </Typography>
      <Box
        sx={{
          width,
          height,
          bgcolor: 'action.hover',
          borderRadius: 1,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Meter fill */}
        <Box
          sx={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: `${normalizedValue * 100}%`,
            bgcolor: normalizedValue > 0.9 ? theme.palette.error.main : color,
            transition: 'height 50ms linear',
          }}
        />
        {/* Peak indicator */}
        {normalizedPeak !== undefined && normalizedPeak > 0 && (
          <Box
            sx={{
              position: 'absolute',
              bottom: `${normalizedPeak * 100}%`,
              left: 0,
              right: 0,
              height: 2,
              bgcolor: theme.palette.error.main,
              transition: 'bottom 50ms linear',
            }}
          />
        )}
        {/* Scale marks */}
        {[0, 0.25, 0.5, 0.75, 1].map((mark) => (
          <Box
            key={mark}
            sx={{
              position: 'absolute',
              bottom: `${mark * 100}%`,
              left: 0,
              width: 4,
              height: 1,
              bgcolor: 'text.disabled',
            }}
          />
        ))}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.55rem' }}>
        {dbDisplay}
      </Typography>
    </Stack>
  );
});

VuMeterBar.displayName = 'VuMeterBar';

// ============================================================================
// VU Tab Content
// ============================================================================

interface VuTabProps {
  meterData?: PluginMeterData;
}

const VuTab = memo(({ meterData }: VuTabProps) => {
  const theme = useTheme();

  return (
    <Box sx={{ p: 1 }}>
      <Stack direction="row" spacing={2} justifyContent="center">
        {/* Input meters */}
        <Stack spacing={0.5} alignItems="center">
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', fontWeight: 600 }}>
            INPUT
          </Typography>
          <Stack direction="row" spacing={0.5}>
            <VuMeterBar
              value={meterData?.inputLeft ?? 0}
              peak={meterData?.inputPeak}
              label="L"
              color={theme.palette.info.main}
            />
            <VuMeterBar
              value={meterData?.inputRight ?? 0}
              peak={meterData?.inputPeak}
              label="R"
              color={theme.palette.info.main}
            />
          </Stack>
        </Stack>

        {/* Output meters */}
        <Stack spacing={0.5} alignItems="center">
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', fontWeight: 600 }}>
            OUTPUT
          </Typography>
          <Stack direction="row" spacing={0.5}>
            <VuMeterBar
              value={meterData?.outputLeft ?? 0}
              peak={meterData?.outputPeak}
              label="L"
              color={theme.palette.success.main}
            />
            <VuMeterBar
              value={meterData?.outputRight ?? 0}
              peak={meterData?.outputPeak}
              label="R"
              color={theme.palette.success.main}
            />
          </Stack>
        </Stack>
      </Stack>
    </Box>
  );
});

VuTab.displayName = 'VuTab';

// ============================================================================
// Spectrum Tab Content
// ============================================================================

interface SpectrumTabProps {
  spectrum?: number[];
}

const SpectrumTab = memo(({ spectrum }: SpectrumTabProps) => {
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Draw spectrum on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    const data = spectrum || new Array(64).fill(0);

    // Clear canvas
    ctx.fillStyle = theme.palette.background.default;
    ctx.fillRect(0, 0, width, height);

    // Draw spectrum bars
    const barWidth = width / data.length;
    const gradient = ctx.createLinearGradient(0, height, 0, 0);
    gradient.addColorStop(0, theme.palette.primary.dark);
    gradient.addColorStop(0.5, theme.palette.primary.main);
    gradient.addColorStop(1, theme.palette.error.main);

    ctx.fillStyle = gradient;

    for (let i = 0; i < data.length; i++) {
      const value = Math.min(Math.max(data[i], 0), 1);
      const barHeight = value * height;
      ctx.fillRect(
        i * barWidth,
        height - barHeight,
        barWidth - 1,
        barHeight
      );
    }

    // Draw frequency labels
    ctx.fillStyle = theme.palette.text.disabled;
    ctx.font = '8px sans-serif';
    ctx.fillText('20Hz', 2, height - 2);
    ctx.fillText('1kHz', width / 2 - 10, height - 2);
    ctx.fillText('20kHz', width - 25, height - 2);
  }, [spectrum, theme]);

  return (
    <Box sx={{ p: 1 }}>
      <canvas
        ref={canvasRef}
        width={200}
        height={60}
        style={{
          width: '100%',
          height: 60,
          borderRadius: 4,
          border: `1px solid ${theme.palette.divider}`,
        }}
      />
    </Box>
  );
});

SpectrumTab.displayName = 'SpectrumTab';

// ============================================================================
// Info Tab Content
// ============================================================================

interface InfoTabProps {
  meterData?: PluginMeterData;
  sampleRate?: number;
}

const InfoTab = memo(({ meterData, sampleRate = 48000 }: InfoTabProps) => {
  const latencyMs = meterData?.latencySamples
    ? ((meterData.latencySamples / sampleRate) * 1000).toFixed(2)
    : null;

  return (
    <Box sx={{ p: 1 }}>
      <Stack spacing={0.5}>
        {/* Latency */}
        {meterData?.latencySamples !== undefined && (
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="caption" color="text.secondary">Latency</Typography>
            <Chip
              label={`${meterData.latencySamples} smp (${latencyMs}ms)`}
              size="small"
              sx={{ height: 18, fontSize: '0.6rem' }}
            />
          </Stack>
        )}

        {/* CPU */}
        {meterData?.cpuPercent !== undefined && (
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="caption" color="text.secondary">CPU</Typography>
            <Chip
              label={`${meterData.cpuPercent.toFixed(1)}%`}
              size="small"
              color={meterData.cpuPercent > 50 ? 'error' : meterData.cpuPercent > 25 ? 'warning' : 'default'}
              sx={{ height: 18, fontSize: '0.6rem' }}
            />
          </Stack>
        )}

        {/* Format */}
        {meterData?.format && (
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="caption" color="text.secondary">Format</Typography>
            <Chip
              label={meterData.format}
              size="small"
              variant="outlined"
              sx={{ height: 18, fontSize: '0.6rem' }}
            />
          </Stack>
        )}

        {/* Version */}
        {meterData?.version && (
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="caption" color="text.secondary">Version</Typography>
            <Typography variant="caption" color="text.primary">{meterData.version}</Typography>
          </Stack>
        )}
      </Stack>
    </Box>
  );
});

InfoTab.displayName = 'InfoTab';

// ============================================================================
// Main PluginMeterPanel Component
// ============================================================================

const PluginMeterPanel = memo(({
  pluginUri,
  pluginName,
  isExpanded,
  meterData,
  sampleRate,
  onClose,
}: PluginMeterPanelProps) => {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState(0);

  if (!isExpanded) {
    return null;
  }

  return (
    <Box
      sx={{
        mt: 0.5,
        bgcolor: alpha(theme.palette.background.paper, 0.95),
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 1,
        overflow: 'hidden',
        boxShadow: 2,
      }}
    >
      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_, newValue) => setActiveTab(newValue)}
        variant="fullWidth"
        sx={{
          minHeight: 28,
          '& .MuiTab-root': {
            minHeight: 28,
            py: 0,
            fontSize: '0.65rem',
          },
        }}
      >
        <Tab
          icon={<VuIcon sx={{ fontSize: 14 }} />}
          iconPosition="start"
          label="VU"
          sx={{ minHeight: 28 }}
        />
        <Tab
          icon={<SpectrumIcon sx={{ fontSize: 14 }} />}
          iconPosition="start"
          label="FFT"
          sx={{ minHeight: 28 }}
        />
        <Tab
          icon={<InfoIcon sx={{ fontSize: 14 }} />}
          iconPosition="start"
          label="Info"
          sx={{ minHeight: 28 }}
        />
      </Tabs>

      {/* Tab content */}
      <Box sx={{ minHeight: 90 }}>
        {activeTab === 0 && <VuTab meterData={meterData} />}
        {activeTab === 1 && <SpectrumTab spectrum={meterData?.spectrum} />}
        {activeTab === 2 && <InfoTab meterData={meterData} sampleRate={sampleRate} />}
      </Box>
    </Box>
  );
});

PluginMeterPanel.displayName = 'PluginMeterPanel';

export default PluginMeterPanel;
