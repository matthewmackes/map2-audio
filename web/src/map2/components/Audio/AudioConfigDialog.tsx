// @ts-nocheck
// ============================================================================
// MAP2 Audio Platform - Audio Configuration Dialog
// Device selection, sample rate, buffer size, and advanced audio settings
// ============================================================================

import { memo, useState, useCallback, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stack,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Alert,
  Box,
  Divider,
  IconButton,
  Tooltip,
  CircularProgress,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import { NumberInput } from '../NumberInput';
import {
  Settings as SettingsIcon,
  Speed as PerformanceIcon,
  HighQuality as QualityIcon,
  Headphones as HeadphonesIcon,
  Refresh as RefreshIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { useTheme, alpha } from '@mui/material/styles';

// ============================================================================
// Types
// ============================================================================

export interface AudioDevice {
  id: string;
  name: string;
  inputChannels: number;
  outputChannels: number;
  supportedSampleRates: number[];
  isDefault?: boolean;
}

export interface AudioConfig {
  deviceId: string;
  sampleRate: number;
  bufferSize: number;
  convolutionMode?: 'zero_latency' | 'low_latency' | 'high_quality';
  midiEnabled?: boolean;
}

export interface AudioConfigDialogProps {
  open: boolean;
  onClose: () => void;
  /** Current audio configuration */
  currentConfig: AudioConfig;
  /** Available audio devices */
  devices: AudioDevice[];
  /** Callback when configuration is applied */
  onApply: (config: AudioConfig) => Promise<void>;
  /** Callback to refresh device list */
  onRefreshDevices?: () => Promise<void>;
  /** Whether audio is currently running */
  isAudioRunning?: boolean;
  /** Loading state */
  isLoading?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const SAMPLE_RATES = [44100, 48000, 88200, 96000, 176400, 192000];

const BUFFER_SIZES = [32, 64, 128, 256, 512, 1024, 2048];

const BUFFER_PRESETS = {
  ultraLow: { size: 64, label: 'Ultra Low', description: '~1.3ms @ 48kHz - May cause dropouts' },
  low: { size: 128, label: 'Low', description: '~2.7ms @ 48kHz - Good for monitoring' },
  standard: { size: 256, label: 'Standard', description: '~5.3ms @ 48kHz - Balanced' },
  safe: { size: 512, label: 'Safe', description: '~10.7ms @ 48kHz - Very stable' },
};

const CONVOLUTION_MODES = {
  zero_latency: { label: 'Zero Latency', description: 'Lowest latency, higher CPU', icon: PerformanceIcon },
  low_latency: { label: 'Low Latency', description: 'Balanced latency and CPU', icon: HeadphonesIcon },
  high_quality: { label: 'High Quality', description: 'Best quality, some latency', icon: QualityIcon },
};

// ============================================================================
// Helper Functions
// ============================================================================

function calculateLatencyMs(bufferSize: number, sampleRate: number): number {
  return (bufferSize / sampleRate) * 1000;
}

function formatLatency(ms: number): string {
  return ms < 10 ? `${ms.toFixed(2)}ms` : `${ms.toFixed(1)}ms`;
}

// ============================================================================
// Device Selector Component
// ============================================================================

interface DeviceSelectorProps {
  devices: AudioDevice[];
  selectedId: string;
  onChange: (deviceId: string) => void;
  onRefresh?: () => void;
  isLoading?: boolean;
}

const DeviceSelector = memo(({ devices, selectedId, onChange, onRefresh, isLoading }: DeviceSelectorProps) => {
  const theme = useTheme();

  return (
    <Stack spacing={1}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <FormControl fullWidth size="small">
          <InputLabel>Audio Device</InputLabel>
          <Select
            value={selectedId}
            onChange={(e) => onChange(e.target.value)}
            label="Audio Device"
            disabled={isLoading}
          >
            {devices.map((device) => (
              <MenuItem key={device.id} value={device.id}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ width: '100%' }}>
                  <HeadphonesIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography variant="body2">{device.name}</Typography>
                  {device.isDefault && (
                    <Chip label="Default" size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
                  )}
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                    {device.inputChannels}in/{device.outputChannels}out
                  </Typography>
                </Stack>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {onRefresh && (
          <Tooltip title="Refresh device list">
            <IconButton onClick={onRefresh} disabled={isLoading} size="small">
              {isLoading ? <CircularProgress size={18} /> : <RefreshIcon />}
            </IconButton>
          </Tooltip>
        )}
      </Stack>

      {/* Device capabilities */}
      {selectedId && devices.find((d) => d.id === selectedId) && (
        <Stack direction="row" spacing={1}>
          <Chip
            label={`${devices.find((d) => d.id === selectedId)?.inputChannels || 0} inputs`}
            size="small"
            variant="outlined"
            sx={{ height: 20, fontSize: '0.65rem' }}
          />
          <Chip
            label={`${devices.find((d) => d.id === selectedId)?.outputChannels || 0} outputs`}
            size="small"
            variant="outlined"
            sx={{ height: 20, fontSize: '0.65rem' }}
          />
        </Stack>
      )}
    </Stack>
  );
});

DeviceSelector.displayName = 'DeviceSelector';

// ============================================================================
// Main AudioConfigDialog Component
// ============================================================================

const AudioConfigDialog = memo(({
  open,
  onClose,
  currentConfig,
  devices,
  onApply,
  onRefreshDevices,
  isAudioRunning = false,
  isLoading = false,
}: AudioConfigDialogProps) => {
  const theme = useTheme();

  // Local state for pending config changes
  const [config, setConfig] = useState<AudioConfig>(currentConfig);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setConfig(currentConfig);
      setError(null);
    }
  }, [open, currentConfig]);

  // Calculate latency for current settings
  const latencyMs = useMemo(() => {
    return calculateLatencyMs(config.bufferSize, config.sampleRate);
  }, [config.bufferSize, config.sampleRate]);

  // Check if settings have changed
  const hasChanges = useMemo(() => {
    return (
      config.deviceId !== currentConfig.deviceId ||
      config.sampleRate !== currentConfig.sampleRate ||
      config.bufferSize !== currentConfig.bufferSize ||
      config.convolutionMode !== currentConfig.convolutionMode
    );
  }, [config, currentConfig]);

  // Handle device change
  const handleDeviceChange = useCallback((deviceId: string) => {
    setConfig((prev) => ({ ...prev, deviceId }));
  }, []);

  // Handle sample rate change
  const handleSampleRateChange = useCallback((sampleRate: number) => {
    setConfig((prev) => ({ ...prev, sampleRate }));
  }, []);

  // Handle buffer size change
  const handleBufferSizeChange = useCallback((_: any, value: number | number[]) => {
    const bufferSize = BUFFER_SIZES[value as number];
    setConfig((prev) => ({ ...prev, bufferSize }));
  }, []);

  // Handle buffer preset selection
  const handlePresetSelect = useCallback((size: number) => {
    setConfig((prev) => ({ ...prev, bufferSize: size }));
  }, []);

  // Handle convolution mode change
  const handleConvolutionModeChange = useCallback((
    _: React.MouseEvent<HTMLElement>,
    mode: 'zero_latency' | 'low_latency' | 'high_quality' | null
  ) => {
    if (mode) {
      setConfig((prev) => ({ ...prev, convolutionMode: mode }));
    }
  }, []);

  // Apply configuration
  const handleApply = useCallback(async () => {
    setIsApplying(true);
    setError(null);

    try {
      await onApply(config);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply configuration');
    } finally {
      setIsApplying(false);
    }
  }, [config, onApply, onClose]);

  // Get buffer size slider value
  const bufferSliderValue = BUFFER_SIZES.indexOf(config.bufferSize);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { bgcolor: 'background.paper' },
      }}
    >
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <SettingsIcon />
          <Typography variant="h6">Audio Configuration</Typography>
        </Stack>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={3}>
          {/* Warning if audio is running */}
          {isAudioRunning && (
            <Alert severity="warning" icon={<WarningIcon />}>
              Audio is currently running. Changes will restart the audio engine.
            </Alert>
          )}

          {/* Error message */}
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {/* Device Selection */}
          <Box>
            <Typography variant="subtitle2" gutterBottom fontWeight={600}>
              Audio Device
            </Typography>
            <DeviceSelector
              devices={devices}
              selectedId={config.deviceId}
              onChange={handleDeviceChange}
              onRefresh={onRefreshDevices}
              isLoading={isLoading}
            />
          </Box>

          <Divider />

          {/* Sample Rate */}
          <Box>
            <Typography variant="subtitle2" gutterBottom fontWeight={600}>
              Sample Rate
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 1 }}>
              {SAMPLE_RATES.map((rate) => (
                <Chip
                  key={rate}
                  label={`${rate / 1000}kHz`}
                  onClick={() => handleSampleRateChange(rate)}
                  color={config.sampleRate === rate ? 'primary' : 'default'}
                  variant={config.sampleRate === rate ? 'filled' : 'outlined'}
                  sx={{ fontWeight: config.sampleRate === rate ? 600 : 400 }}
                />
              ))}
            </Stack>
          </Box>

          <Divider />

          {/* Buffer Size */}
          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography variant="subtitle2" fontWeight={600}>
                Buffer Size
              </Typography>
              <Chip
                label={formatLatency(latencyMs)}
                color={latencyMs < 5 ? 'success' : latencyMs < 15 ? 'warning' : 'error'}
                size="small"
              />
            </Stack>

            {/* Presets */}
            <Stack direction="row" spacing={1} mb={2}>
              {Object.entries(BUFFER_PRESETS).map(([key, preset]) => (
                <Tooltip key={key} title={preset.description}>
                  <Chip
                    label={preset.label}
                    onClick={() => handlePresetSelect(preset.size)}
                    color={config.bufferSize === preset.size ? 'primary' : 'default'}
                    variant={config.bufferSize === preset.size ? 'filled' : 'outlined'}
                    size="small"
                  />
                </Tooltip>
              ))}
            </Stack>

            {/* Buffer Size Input */}
            <Stack spacing={1}>
              <NumberInput
                label="Buffer Size"
                value={config.bufferSize}
                onChange={(v) => {
                  // Find closest valid buffer size
                  const closest = BUFFER_SIZES.reduce((prev, curr) =>
                    Math.abs(curr - v) < Math.abs(prev - v) ? curr : prev
                  );
                  const idx = BUFFER_SIZES.indexOf(closest);
                  handleBufferSizeChange(null, idx);
                }}
                min={BUFFER_SIZES[0]}
                max={BUFFER_SIZES[BUFFER_SIZES.length - 1]}
                step={64}
                unit="samples"
                size="small"
              />
              <Typography variant="caption" color="text.secondary" textAlign="center">
                {config.bufferSize} samples = {formatLatency(latencyMs)} latency @ {config.sampleRate / 1000}kHz
              </Typography>
            </Stack>
          </Box>

          <Divider />

          {/* Convolution Mode */}
          <Box>
            <Typography variant="subtitle2" gutterBottom fontWeight={600}>
              Convolution Mode (Cabinet/Reverb IR)
            </Typography>
            <ToggleButtonGroup
              value={config.convolutionMode || 'low_latency'}
              exclusive
              onChange={handleConvolutionModeChange}
              fullWidth
              size="small"
            >
              {Object.entries(CONVOLUTION_MODES).map(([mode, info]) => {
                const IconComponent = info.icon;
                return (
                  <ToggleButton key={mode} value={mode}>
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                      <IconComponent sx={{ fontSize: 16 }} />
                      <Typography variant="caption">{info.label}</Typography>
                    </Stack>
                  </ToggleButton>
                );
              })}
            </ToggleButtonGroup>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              {CONVOLUTION_MODES[config.convolutionMode || 'low_latency']?.description}
            </Typography>
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={isApplying}>
          Cancel
        </Button>
        <Button
          onClick={handleApply}
          variant="contained"
          disabled={!hasChanges || isApplying}
          startIcon={isApplying ? <CircularProgress size={16} /> : null}
        >
          {isApplying ? 'Applying...' : 'Apply'}
        </Button>
      </DialogActions>
    </Dialog>
  );
});

AudioConfigDialog.displayName = 'AudioConfigDialog';

export default AudioConfigDialog;
