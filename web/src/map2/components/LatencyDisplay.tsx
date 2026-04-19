// ============================================================================
// MAP2 Audio Platform - Latency Display Component
// Per-plugin and chain latency with compensation toggle
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Tooltip,
  IconButton,
  Switch,
  FormControlLabel,
  Chip,
  Collapse,
  List,
  ListItem,
  ListItemText,
  Divider,
} from '@mui/material';
import {
  CheckmarkFilled,
  ChevronDown,
  ChevronUp,
  CloseFilled,
  Flash,
  Renew,
  Timer,
} from '@carbon/icons-react';
import { useTheme, alpha } from '@mui/material/styles';
import { sanitizeRestrictedDisplayText } from '../displayNames';

interface PluginLatency {
  uri: string;
  name: string;
  latencySamples: number;
  latencyMs: number;
  compensated: boolean;
}

interface LatencyStatus {
  enabled: boolean;
  maxLatencySamples: number;
  maxLatencyMs: number;
  chainLatencySamples: number;
  chainLatencyMs: number;
  activeDelayLines: number;
  compensatedPlugins: PluginLatency[];
}

interface LatencyDisplayProps {
  pluginUri?: string;  // Show single plugin if provided
  compact?: boolean;
  showCompensationToggle?: boolean;
  onCompensationChange?: (enabled: boolean) => void;
}

const API_BASE = '/api';

// Format latency with appropriate unit
const formatLatency = (ms: number) => {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  if (ms < 10) return `${ms.toFixed(2)}ms`;
  return `${ms.toFixed(1)}ms`;
};

// Color based on latency
const getLatencyColor = (ms: number) => {
  if (ms < 3) return 'success';
  if (ms < 10) return 'warning';
  return 'error';
};

export function LatencyBadge({ latencyMs, compact = false }: { latencyMs: number; compact?: boolean }) {
  const color = getLatencyColor(latencyMs);
  
  if (compact) {
    return (
      <Tooltip title={`Latency: ${formatLatency(latencyMs)}`}>
        <Typography 
          variant="caption" 
          sx={{ 
            fontFamily: 'var(--font-mono)', 
            fontSize: 10,
            color: `${color}.main`,
          }}
        >
          {latencyMs.toFixed(1)}ms
        </Typography>
      </Tooltip>
    );
  }

  return (
    <Chip
      icon={<Timer size={14} />}
      label={formatLatency(latencyMs)}
      size="small"
      color={color}
      variant="outlined"
      sx={{ 
        height: 20, 
        '& .MuiChip-label': { px: 0.5, fontSize: 11 },
        '& .MuiChip-icon': { ml: 0.5 },
      }}
    />
  );
}

export default function LatencyDisplay({
  pluginUri,
  compact = false,
  showCompensationToggle = true,
  onCompensationChange,
}: LatencyDisplayProps) {
  const theme = useTheme();
  const [status, setStatus] = useState<LatencyStatus | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/latency/status`);
      if (res.ok) {
        const data = await res.json();
        setStatus({
          enabled: data.enabled ?? false,
          maxLatencySamples: data.max_latency_samples || 0,
          maxLatencyMs: data.max_latency_ms || 0,
          chainLatencySamples: data.chain_latency_samples || 0,
          chainLatencyMs: data.chain_latency_ms || 0,
          activeDelayLines: data.active_delay_lines || 0,
          compensatedPlugins: (data.compensated_plugins || []).map((p: any) => ({
            uri: p.uri,
            name: p.name || p.uri.split('#').pop() || 'Unknown',
            latencySamples: p.latency_samples || 0,
            latencyMs: p.latency_ms || 0,
            compensated: p.compensated ?? false,
          })),
        });
      }
    } catch (err) {
      console.error('Failed to fetch latency status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleCompensationToggle = async (enabled: boolean) => {
    try {
      await fetch(`${API_BASE}/latency/compensate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      await fetchStatus();
      onCompensationChange?.(enabled);
    } catch (err) {
      console.error('Failed to toggle compensation:', err);
    }
  };

  // Single plugin mode
  if (pluginUri && status) {
    const plugin = status.compensatedPlugins.find(p => p.uri === pluginUri);
    if (!plugin) return null;
    
    return (
      <Tooltip
        title={
          <Box>
            <Typography variant="body2">Latency: {formatLatency(plugin.latencyMs)}</Typography>
            <Typography variant="caption">
              {plugin.latencySamples} samples @ 48kHz
            </Typography>
          <Typography variant="caption" display="block">
              {plugin.compensated ? '✓ Compensated' : '✗ Not compensated'}
            </Typography>
          </Box>
        }
      >
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
          <LatencyBadge latencyMs={plugin.latencyMs} compact={compact} />
          {plugin.compensated && (
            <Box sx={{ color: 'success.main', display: 'inline-flex' }}>
              <Flash size={12} />
            </Box>
          )}
        </Box>
      </Tooltip>
    );
  }

  if (!status) return null;

  // Full chain view
  return (
    <Paper
      elevation={1}
      sx={{
        p: compact ? 0.5 : 1,
        bgcolor: alpha(theme.palette.background.paper, 0.8),
        borderRadius: 2,
      }}
    >
      {/* Chain Summary */}
      <Box 
        sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1,
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <Box sx={{ color: 'primary.main', display: 'inline-flex' }}>
          <Timer size={20} />
        </Box>
        
        {!compact && (
          <Typography variant="caption" sx={{ fontWeight: 600 }}>
            LATENCY
          </Typography>
        )}
        
        <Tooltip title={`Total chain latency: ${status.chainLatencySamples} samples`}>
          <Chip
            label={formatLatency(status.chainLatencyMs)}
            size="small"
            color={getLatencyColor(status.chainLatencyMs)}
            sx={{ 
              height: 20, 
              '& .MuiChip-label': { px: 0.75, fontSize: 11, fontFamily: 'var(--font-mono)' },
            }}
          />
        </Tooltip>

        {showCompensationToggle && (
          <Tooltip title={status.enabled ? 'Latency compensation ON' : 'Latency compensation OFF'}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Switch
                size="small"
                checked={status.enabled}
                onChange={(e) => handleCompensationToggle(e.target.checked)}
                onClick={(e) => e.stopPropagation()}
                sx={{ transform: 'scale(0.8)' }}
              />
              {status.enabled ? (
                <Box sx={{ color: 'success.main', display: 'inline-flex' }}>
                  <CheckmarkFilled size={14} />
                </Box>
              ) : (
                <Box sx={{ color: 'text.disabled', display: 'inline-flex' }}>
                  <CloseFilled size={14} />
                </Box>
              )}
            </Box>
          </Tooltip>
        )}

        <Box sx={{ flex: 1 }} />

        <IconButton size="small" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </IconButton>

        <IconButton size="small" onClick={(e) => { e.stopPropagation(); fetchStatus(); }}>
          <Renew size={16} />
        </IconButton>
      </Box>

      {/* Per-Plugin Breakdown */}
      <Collapse in={expanded}>
        <Divider sx={{ my: 1 }} />
        
        {status.compensatedPlugins.length === 0 ? (
          <Typography variant="caption" color="textSecondary">
            No plugins with measurable latency
          </Typography>
        ) : (
          <List dense disablePadding>
            {status.compensatedPlugins
              .sort((a, b) => b.latencyMs - a.latencyMs)
              .map((plugin) => (
                <ListItem key={plugin.uri} sx={{ px: 0, py: 0.25 }}>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LatencyBadge latencyMs={plugin.latencyMs} compact />
                        <Typography variant="caption" noWrap sx={{ flex: 1 }}>
                          {sanitizeRestrictedDisplayText(plugin.name) || 'Processor'}
                        </Typography>
                        {plugin.compensated && (
                          <Chip
                            label="OK"
                            size="small"
                            color="success"
                            sx={{ height: 16, '& .MuiChip-label': { px: 0.5, fontSize: 10 } }}
                          />
                        )}
                      </Box>
                    }
                  />
                </ListItem>
              ))}
          </List>
        )}

        <Box sx={{ mt: 1, pt: 1, borderTop: `1px solid ${theme.palette.divider}` }}>
          <Typography variant="caption" color="textSecondary">
            Max plugin latency: {formatLatency(status.maxLatencyMs)} • 
            Active delay lines: {status.activeDelayLines}
          </Typography>
        </Box>
      </Collapse>
    </Paper>
  );
}

// Hook for easy access to latency data
export function useLatencyStatus() {
  const [status, setStatus] = useState<LatencyStatus | null>(null);
  
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${API_BASE}/latency/status`);
        if (res.ok) {
          const data = await res.json();
          setStatus({
            enabled: data.enabled ?? false,
            maxLatencySamples: data.max_latency_samples || 0,
            maxLatencyMs: data.max_latency_ms || 0,
            chainLatencySamples: data.chain_latency_samples || 0,
            chainLatencyMs: data.chain_latency_ms || 0,
            activeDelayLines: data.active_delay_lines || 0,
            compensatedPlugins: data.compensated_plugins || [],
          });
        }
      } catch (err) {
        // Ignore
      }
    };
    
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);
  
  return status;
}
