// ============================================================================
// MAP2 Audio Platform - LFO Quick Button Component
// Quick LFO modulation assignment for any parameter
// ============================================================================

import React, { useState } from 'react';
import {
  Box,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  FormControlLabel,
  Grid,
  Chip,
  Paper,
} from '@mui/material';
import { NumberInput } from './NumberInput';
import {
  Waves as LFOIcon,
  Close as CloseIcon,
  PlayArrow as ActiveIcon,
} from '@mui/icons-material';
import { useTheme, alpha } from '@mui/material/styles';

type LFOWaveform = 'sine' | 'triangle' | 'square' | 'saw_up' | 'saw_down' | 'random' | 'sample_hold' | 'pulse';

interface LFOConfig {
  waveform: LFOWaveform;
  rateHz: number;
  depth: number;
  bipolar: boolean;
  syncToTempo: boolean;
  tempoDivision: string;
}

interface LFOQuickButtonProps {
  parameterId: string;
  parameterName?: string;
  currentValue?: number;
  hasLFO?: boolean;
  lfoConfig?: LFOConfig;
  onLFOChange?: (config: LFOConfig | null) => void;
  size?: 'small' | 'medium';
  showLabel?: boolean;
}

const WAVEFORMS: { value: LFOWaveform; label: string; icon: string }[] = [
  { value: 'sine', label: 'Sine', icon: '∿' },
  { value: 'triangle', label: 'Triangle', icon: '△' },
  { value: 'square', label: 'Square', icon: '□' },
  { value: 'saw_up', label: 'Saw Up', icon: '⧗' },
  { value: 'saw_down', label: 'Saw Down', icon: '⧖' },
  { value: 'random', label: 'Random', icon: '⚡' },
  { value: 'sample_hold', label: 'S&H', icon: '⊡' },
  { value: 'pulse', label: 'Pulse', icon: '▯' },
];

const TEMPO_DIVISIONS = [
  { value: '1/1', label: '1 bar' },
  { value: '1/2', label: '1/2 note' },
  { value: '1/4', label: '1/4 note' },
  { value: '1/8', label: '1/8 note' },
  { value: '1/16', label: '1/16 note' },
  { value: '1/4D', label: 'Dotted 1/4' },
  { value: '1/8D', label: 'Dotted 1/8' },
  { value: '1/4T', label: 'Triplet 1/4' },
  { value: '1/8T', label: 'Triplet 1/8' },
];

const API_BASE = '/api';

export default function LFOQuickButton({
  parameterId,
  parameterName,
  currentValue,
  hasLFO = false,
  lfoConfig: initialConfig,
  onLFOChange,
  size = 'small',
  showLabel = false,
}: LFOQuickButtonProps) {
  const theme = useTheme();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [config, setConfig] = useState<LFOConfig>(initialConfig || {
    waveform: 'sine',
    rateHz: 1.0,
    depth: 0.5,
    bipolar: true,
    syncToTempo: false,
    tempoDivision: '1/4',
  });
  const [active, setActive] = useState(hasLFO);
  const [saving, setSaving] = useState(false);

  const handleOpen = () => {
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/automation/lfo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parameter_id: parameterId,
          rate_hz: config.rateHz,
          depth: config.depth,
          waveform: config.waveform,
          bipolar: config.bipolar,
          sync_to_tempo: config.syncToTempo,
          tempo_division: config.tempoDivision,
        }),
      });
      
      if (res.ok) {
        setActive(true);
        onLFOChange?.(config);
      }
    } catch (err) {
      console.error('Failed to apply LFO:', err);
    } finally {
      setSaving(false);
      handleClose();
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    try {
      await fetch(`${API_BASE}/automation/lfo/${encodeURIComponent(parameterId)}`, {
        method: 'DELETE',
      });
      setActive(false);
      onLFOChange?.(null);
    } catch (err) {
      console.error('Failed to remove LFO:', err);
    } finally {
      setSaving(false);
      handleClose();
    }
  };

  return (
    <>
      <Tooltip 
        title={active ? `LFO Active: ${config.waveform} @ ${config.rateHz}Hz` : 'Add LFO Modulation'}
      >
        <IconButton
          size={size}
          onClick={handleOpen}
          sx={{
            color: active ? theme.palette.primary.main : theme.palette.action.active,
            bgcolor: active ? alpha(theme.palette.primary.main, 0.1) : undefined,
            animation: active ? 'lfo-pulse 1s ease-in-out infinite' : undefined,
            '@keyframes lfo-pulse': {
              '0%, 100%': { opacity: 1 },
              '50%': { opacity: 0.6 },
            },
            '&:hover': {
              bgcolor: alpha(theme.palette.primary.main, 0.2),
            },
          }}
        >
          <LFOIcon fontSize={size === 'small' ? 'small' : 'medium'} />
        </IconButton>
      </Tooltip>

      {showLabel && active && (
        <Chip
          label={`${config.waveform} ${config.rateHz.toFixed(1)}Hz`}
          size="small"
          color="primary"
          variant="outlined"
          onDelete={handleRemove}
          sx={{ ml: 0.5, height: 20, fontSize: 10 }}
        />
      )}

      <Dialog open={dialogOpen} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <LFOIcon color="primary" />
            <Typography>LFO Modulation</Typography>
          </Box>
          <IconButton onClick={handleClose} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent>
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="textSecondary">
              Parameter: {parameterName || parameterId}
            </Typography>
          </Box>

          {/* Waveform Selection */}
          <Typography variant="subtitle2" gutterBottom>Waveform</Typography>
          <Grid container spacing={1} sx={{ mb: 3 }}>
            {WAVEFORMS.map((wf) => (
              <Grid item key={wf.value}>
                <Paper
                  elevation={config.waveform === wf.value ? 3 : 1}
                  onClick={() => setConfig({ ...config, waveform: wf.value })}
                  sx={{
                    p: 1,
                    cursor: 'pointer',
                    minWidth: 60,
                    textAlign: 'center',
                    bgcolor: config.waveform === wf.value 
                      ? alpha(theme.palette.primary.main, 0.2) 
                      : undefined,
                    border: config.waveform === wf.value 
                      ? `2px solid ${theme.palette.primary.main}` 
                      : '2px solid transparent',
                    '&:hover': {
                      bgcolor: alpha(theme.palette.primary.main, 0.1),
                    },
                  }}
                >
                  <Typography variant="h6">{wf.icon}</Typography>
                  <Typography variant="caption">{wf.label}</Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>

          {/* Rate Control */}
          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="subtitle2">
                Rate: {config.syncToTempo ? config.tempoDivision : `${config.rateHz.toFixed(2)} Hz`}
              </Typography>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={config.syncToTempo}
                    onChange={(e) => setConfig({ ...config, syncToTempo: e.target.checked })}
                  />
                }
                label={<Typography variant="caption">Sync</Typography>}
              />
            </Box>
            
            {config.syncToTempo ? (
              <FormControl fullWidth size="small" sx={{ mt: 1 }}>
                <Select
                  value={config.tempoDivision}
                  onChange={(e) => setConfig({ ...config, tempoDivision: e.target.value })}
                >
                  {TEMPO_DIVISIONS.map((div) => (
                    <MenuItem key={div.value} value={div.value}>
                      {div.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : (
              <NumberInput
                label="Rate"
                value={config.rateHz}
                onChange={(value) => setConfig({ ...config, rateHz: value })}
                min={0.01}
                max={20}
                step={0.01}
                unit="Hz"
                size="small"
                sx={{ mt: 1 }}
              />
            )}
          </Box>

          {/* Depth Control */}
          <Box sx={{ mb: 3 }}>
            <NumberInput
              label="Depth"
              value={config.depth * 100}
              onChange={(value) => setConfig({ ...config, depth: value / 100 })}
              min={0}
              max={100}
              step={1}
              unit="%"
              size="small"
            />
          </Box>

          {/* Bipolar Switch */}
          <FormControlLabel
            control={
              <Switch
                checked={config.bipolar}
                onChange={(e) => setConfig({ ...config, bipolar: e.target.checked })}
              />
            }
            label={
              <Box>
                <Typography variant="body2">Bipolar</Typography>
                <Typography variant="caption" color="textSecondary">
                  {config.bipolar ? 'Oscillates above and below center' : 'Oscillates from min to max'}
                </Typography>
              </Box>
            }
          />
        </DialogContent>

        <DialogActions>
          {active && (
            <Button onClick={handleRemove} color="error" disabled={saving}>
              Remove LFO
            </Button>
          )}
          <Box sx={{ flex: 1 }} />
          <Button onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSave} variant="contained" disabled={saving}>
            {active ? 'Update' : 'Apply'} LFO
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

// Inline mini LFO indicator for compact views
export function LFOIndicator({ active, waveform, rate }: { active: boolean; waveform?: string; rate?: number }) {
  const theme = useTheme();
  
  if (!active) return null;
  
  return (
    <Tooltip title={`LFO: ${waveform || 'sine'} @ ${rate?.toFixed(1) || '1.0'}Hz`}>
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          px: 0.5,
          py: 0.25,
          borderRadius: 1,
          bgcolor: alpha(theme.palette.primary.main, 0.1),
          border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`,
        }}
      >
        <LFOIcon sx={{ fontSize: 10, color: theme.palette.primary.main, mr: 0.25 }} />
        <Typography variant="caption" sx={{ fontSize: 9, color: theme.palette.primary.main }}>
          LFO
        </Typography>
      </Box>
    </Tooltip>
  );
}
