// ============================================================================
// MAP2 Audio Platform - Envelope Follower Panel Component
// Sidechain and envelope follower configuration
// ============================================================================

import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  FormControlLabel,
  Button,
  IconButton,
  Tooltip,
  Divider,
  Chip,
  Collapse,
  Grid,
  LinearProgress,
} from '@mui/material';
import { NumberInput } from './NumberInput';
import {
  GraphicEq as EnvelopeIcon,
  PlayArrow as ActiveIcon,
  Stop as StopIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
  Settings as SettingsIcon,
  VolumeUp as VolumeIcon,
} from '@mui/icons-material';
import { useTheme, alpha } from '@mui/material/styles';

interface EnvelopeConfig {
  inputSource: 'main_input' | 'sidechain' | 'plugin_output';
  attackMs: number;
  releaseMs: number;
  thresholdDb: number;
  sensitivity: number;
  invert: boolean;
}

interface EnvelopeFollowerPanelProps {
  parameterId: string;
  parameterName?: string;
  hasEnvelope?: boolean;
  envelopeConfig?: EnvelopeConfig;
  currentEnvelopeValue?: number;
  onEnvelopeChange?: (config: EnvelopeConfig | null) => void;
  compact?: boolean;
}

const INPUT_SOURCES = [
  { value: 'main_input', label: 'Main Input', description: 'Follow the main audio input level' },
  { value: 'sidechain', label: 'Sidechain', description: 'Follow external sidechain input' },
  { value: 'plugin_output', label: 'Plugin Output', description: 'Follow output of another plugin' },
];

const API_BASE = '/api';

export default function EnvelopeFollowerPanel({
  parameterId,
  parameterName,
  hasEnvelope = false,
  envelopeConfig: initialConfig,
  currentEnvelopeValue = 0,
  onEnvelopeChange,
  compact = false,
}: EnvelopeFollowerPanelProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState(hasEnvelope);
  const [config, setConfig] = useState<EnvelopeConfig>(initialConfig || {
    inputSource: 'main_input',
    attackMs: 10,
    releaseMs: 100,
    thresholdDb: -60,
    sensitivity: 1.0,
    invert: false,
  });
  const [envelopeLevel, setEnvelopeLevel] = useState(currentEnvelopeValue);
  const [saving, setSaving] = useState(false);

  // Poll envelope level when active
  useEffect(() => {
    if (!active) return;
    
    const fetchLevel = async () => {
      try {
        const res = await fetch(`${API_BASE}/automation/envelope/${encodeURIComponent(parameterId)}/level`);
        if (res.ok) {
          const data = await res.json();
          setEnvelopeLevel(data.level || 0);
        }
      } catch {
        // Ignore
      }
    };
    
    const interval = setInterval(fetchLevel, 50); // 20Hz update rate
    return () => clearInterval(interval);
  }, [active, parameterId]);

  const handleApply = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/automation/envelope`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parameter_id: parameterId,
          input_source: config.inputSource,
          attack_ms: config.attackMs,
          release_ms: config.releaseMs,
          threshold_db: config.thresholdDb,
          sensitivity: config.sensitivity,
          invert: config.invert,
        }),
      });
      
      if (res.ok) {
        setActive(true);
        onEnvelopeChange?.(config);
      }
    } catch (err) {
      console.error('Failed to apply envelope follower:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    try {
      await fetch(`${API_BASE}/automation/envelope/${encodeURIComponent(parameterId)}`, {
        method: 'DELETE',
      });
      setActive(false);
      onEnvelopeChange?.(null);
    } catch (err) {
      console.error('Failed to remove envelope follower:', err);
    } finally {
      setSaving(false);
    }
  };

  if (compact) {
    return (
      <Tooltip title={active ? 'Envelope Follower Active' : 'Add Envelope Follower'}>
        <IconButton
          size="small"
          onClick={() => setExpanded(!expanded)}
          sx={{
            color: active ? theme.palette.secondary.main : undefined,
            bgcolor: active ? alpha(theme.palette.secondary.main, 0.1) : undefined,
          }}
        >
          <EnvelopeIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    );
  }

  return (
    <Paper
      elevation={1}
      sx={{
        p: 1.5,
        bgcolor: alpha(theme.palette.background.paper, 0.8),
        borderRadius: 2,
        border: active ? `1px solid ${theme.palette.secondary.main}` : undefined,
      }}
    >
      {/* Header */}
      <Box 
        sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1,
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <EnvelopeIcon 
          sx={{ 
            color: active ? theme.palette.secondary.main : theme.palette.action.active,
            fontSize: 20,
          }} 
        />
        
        <Typography variant="subtitle2" sx={{ flex: 1 }}>
          Envelope Follower
        </Typography>

        {active && (
          <Box sx={{ flex: 1, mx: 1, maxWidth: 100 }}>
            <LinearProgress
              variant="determinate"
              value={envelopeLevel * 100}
              sx={{
                height: 6,
                borderRadius: 3,
                bgcolor: alpha(theme.palette.secondary.main, 0.2),
                '& .MuiLinearProgress-bar': {
                  bgcolor: theme.palette.secondary.main,
                  borderRadius: 3,
                },
              }}
            />
          </Box>
        )}

        {active && (
          <Chip
            label={INPUT_SOURCES.find(s => s.value === config.inputSource)?.label || 'Input'}
            size="small"
            color="secondary"
            variant="outlined"
            sx={{ height: 20, fontSize: 10 }}
          />
        )}

        <IconButton size="small">
          {expanded ? <CollapseIcon fontSize="small" /> : <ExpandIcon fontSize="small" />}
        </IconButton>
      </Box>

      {/* Expanded Configuration */}
      <Collapse in={expanded}>
        <Divider sx={{ my: 1.5 }} />

        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="textSecondary">
            Target: {parameterName || parameterId}
          </Typography>
        </Box>

        {/* Input Source */}
        <FormControl fullWidth size="small" sx={{ mb: 2 }}>
          <InputLabel>Input Source</InputLabel>
          <Select
            value={config.inputSource}
            label="Input Source"
            onChange={(e) => setConfig({ ...config, inputSource: e.target.value as EnvelopeConfig['inputSource'] })}
          >
            {INPUT_SOURCES.map((src) => (
              <MenuItem key={src.value} value={src.value}>
                <Box>
                  <Typography variant="body2">{src.label}</Typography>
                  <Typography variant="caption" color="textSecondary">
                    {src.description}
                  </Typography>
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Attack/Release */}
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={6}>
            <NumberInput
              label="Attack"
              value={config.attackMs}
              onChange={(value) => setConfig({ ...config, attackMs: value })}
              min={0.1}
              max={500}
              step={0.1}
              unit="ms"
              size="small"
            />
          </Grid>
          <Grid item xs={6}>
            <NumberInput
              label="Release"
              value={config.releaseMs}
              onChange={(value) => setConfig({ ...config, releaseMs: value })}
              min={1}
              max={2000}
              step={1}
              unit="ms"
              size="small"
            />
          </Grid>
        </Grid>

        {/* Threshold */}
        <Box sx={{ mb: 2 }}>
          <NumberInput
            label="Threshold"
            value={config.thresholdDb}
            onChange={(value) => setConfig({ ...config, thresholdDb: value })}
            min={-80}
            max={0}
            step={1}
            unit="dB"
            size="small"
          />
        </Box>

        {/* Sensitivity */}
        <Box sx={{ mb: 2 }}>
          <NumberInput
            label="Sensitivity"
            value={config.sensitivity}
            onChange={(value) => setConfig({ ...config, sensitivity: value })}
            min={0.1}
            max={4}
            step={0.1}
            unit="x"
            size="small"
          />
        </Box>

        {/* Invert */}
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={config.invert}
              onChange={(e) => setConfig({ ...config, invert: e.target.checked })}
            />
          }
          label={<Typography variant="caption">Invert (ducking mode)</Typography>}
        />

        <Divider sx={{ my: 1.5 }} />

        {/* Actions */}
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
          {active && (
            <Button size="small" color="error" onClick={handleRemove} disabled={saving}>
              Remove
            </Button>
          )}
          <Button 
            size="small" 
            variant="contained" 
            color="secondary"
            onClick={handleApply} 
            disabled={saving}
          >
            {active ? 'Update' : 'Apply'}
          </Button>
        </Box>
      </Collapse>
    </Paper>
  );
}

// Mini envelope indicator for compact views
export function EnvelopeIndicator({ 
  active, 
  level = 0, 
  source 
}: { 
  active: boolean; 
  level?: number; 
  source?: string;
}) {
  const theme = useTheme();
  
  if (!active) return null;
  
  return (
    <Tooltip title={`Envelope from ${source || 'input'}`}>
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          px: 0.5,
          py: 0.25,
          borderRadius: 1,
          bgcolor: alpha(theme.palette.secondary.main, 0.1),
          border: `1px solid ${alpha(theme.palette.secondary.main, 0.3)}`,
          gap: 0.5,
        }}
      >
        <EnvelopeIcon sx={{ fontSize: 10, color: theme.palette.secondary.main }} />
        <Box
          sx={{
            width: 20,
            height: 4,
            borderRadius: 2,
            bgcolor: alpha(theme.palette.secondary.main, 0.3),
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              width: `${level * 100}%`,
              height: '100%',
              bgcolor: theme.palette.secondary.main,
              transition: 'width 50ms',
            }}
          />
        </Box>
      </Box>
    </Tooltip>
  );
}
