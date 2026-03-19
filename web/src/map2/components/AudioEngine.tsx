// ============================================================================
// MAP2 Audio Platform - Audio Engine Control Component
// Control audio engine, view levels, monitor performance, and system metrics
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Stack,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  Grid,
  LinearProgress,
  Chip,
  Divider,
  IconButton,
  Tabs,
  Tab,
  Tooltip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  ChartLine,
  CheckmarkFilled,
  DataBase,
  Equalizer,
  Information,
  PlayFilled,
  Renew,
  StopFilled,
  Time,
  Timer,
  VolumeUp,
  WarningAlt,
} from '@carbon/icons-react';
import { audioApi, metricsApi, systemApi } from '../api';
import { useMeterData } from '../hooks/useWebSocket';
import type { AudioStatus, AudioLevels, PluginLevels, SystemMetrics, MetricsSummary, RealtimeStatus, JackMetrics } from '../types';
import { sanitizeRestrictedDisplayText } from '../displayNames';

function Glyph({
  icon: Icon,
  size = 18,
  color = 'inherit',
}: {
  icon: React.ComponentType<{ size?: number }>;
  size?: number;
  color?: string;
}) {
  return (
    <Box component="span" sx={{ color, display: 'inline-flex', alignItems: 'center', lineHeight: 0 }}>
      <Icon size={size} />
    </Box>
  );
}

function LevelMeter({ label, level, color = 'primary' }: { label: string; level: number; color?: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success' }) {
  const dbValue = 20 * Math.log10(Math.max(level, 0.00001));
  const normalizedValue = Math.max(0, Math.min(100, (dbValue + 60) * (100 / 60)));

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="caption">{label}</Typography>
        <Typography variant="caption">{dbValue.toFixed(1)} dB</Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={normalizedValue}
        color={normalizedValue > 90 ? 'error' : normalizedValue > 75 ? 'warning' : color}
        sx={{ height: 8, borderRadius: 1 }}
      />
    </Box>
  );
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

function getGradeColor(grade: string): 'success' | 'warning' | 'error' | 'default' {
  switch (grade) {
    case 'A+':
    case 'A':
      return 'success';
    case 'B':
      return 'warning';
    case 'C':
    case 'D':
      return 'error';
    default:
      return 'default';
  }
}

interface MetricCardProps {
  icon: React.ReactNode;
  title: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  color?: 'primary' | 'secondary' | 'success' | 'warning' | 'error';
  progress?: number;
}

function MetricCard({ icon, title, value, unit, subtext, color = 'primary', progress }: MetricCardProps) {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <Box sx={{ color: `${color}.main`, mr: 1 }}>{icon}</Box>
          <Typography variant="body2" color="text.secondary">
            {title}
          </Typography>
        </Box>
        <Typography variant="h4" component="div" color={`${color}.main`}>
          {value}
          {unit && (
            <Typography component="span" variant="body1" color="text.secondary">
              {' '}
              {unit}
            </Typography>
          )}
        </Typography>
        {progress !== undefined && (
          <LinearProgress
            variant="determinate"
            value={Math.min(progress, 100)}
            color={progress > 80 ? 'error' : progress > 60 ? 'warning' : 'primary'}
            sx={{ mt: 1, height: 6, borderRadius: 3 }}
          />
        )}
        {subtext && (
          <Typography variant="caption" color="text.secondary">
            {subtext}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

export default function AudioEngine() {
  const [tabValue, setTabValue] = useState(0);
  const [status, setStatus] = useState<AudioStatus | null>(null);
  const [levels, setLevels] = useState<AudioLevels | null>(null);
  const [pluginLevels, setPluginLevels] = useState<PluginLevels[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Metrics state
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus | null>(null);
  const [jackMetrics, setJackMetrics] = useState<JackMetrics | null>(null);
  const intervalRef = useRef<number | null>(null);

  // WebSocket meter data
  const { levels: wsLevels } = useMeterData();

  // Use WebSocket levels if available, otherwise use polled levels
  useEffect(() => {
    if (wsLevels) {
      setLevels(wsLevels);
    }
  }, [wsLevels]);

  // Load audio status
  const loadStatus = useCallback(async () => {
    try {
      const [statusRes, levelsRes, pluginLevelsRes] = await Promise.all([
        audioApi.getStatus(),
        audioApi.getLevels(),
        audioApi.getPluginLevels(),
      ]);

      setStatus(statusRes);
      if (!wsLevels) {
        setLevels(levelsRes);
      }
      setPluginLevels(pluginLevelsRes.plugins || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audio status');
    } finally {
      setLoading(false);
    }
  }, [wsLevels]);

  // Load metrics
  const fetchMetrics = useCallback(async () => {
    try {
      const [metricsRes, summaryRes, rtStatusRes, jackRes] = await Promise.allSettled([
        metricsApi.getCurrent(),
        metricsApi.getSummary(),
        systemApi.getRealtimeStatus(),
        metricsApi.getJack(),
      ]);

      if (metricsRes.status === 'fulfilled') setMetrics(metricsRes.value);
      if (summaryRes.status === 'fulfilled') setSummary(summaryRes.value);
      if (rtStatusRes.status === 'fulfilled') setRealtimeStatus(rtStatusRes.value);
      if (jackRes.status === 'fulfilled') setJackMetrics(jackRes.value);

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
    }
  }, []);

  // Combined refresh
  const handleRefresh = useCallback(async () => {
    await Promise.all([loadStatus(), fetchMetrics()]);
  }, [loadStatus, fetchMetrics]);

  useEffect(() => {
    handleRefresh();
    // Auto-refresh every 2 seconds
    intervalRef.current = window.setInterval(handleRefresh, 2000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [handleRefresh]);

  // Start audio engine
  const handleStart = async () => {
    try {
      await audioApi.start();
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start audio engine');
    }
  };

  // Stop audio engine
  const handleStop = async () => {
    try {
      await audioApi.stop();
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop audio engine');
    }
  };

  if (loading && !status) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>
          Audio & Performance
        </Typography>
        {realtimeStatus && (
          <Chip
            label={`Grade: ${realtimeStatus.summary.grade}`}
            color={getGradeColor(realtimeStatus.summary.grade)}
            size="small"
          />
        )}
        <Button
          variant={status?.running ? 'outlined' : 'contained'}
          startIcon={status?.running ? <StopFilled size={16} /> : <PlayFilled size={16} />}
          onClick={status?.running ? handleStop : handleStart}
          color={status?.running ? 'error' : 'success'}
        >
          {status?.running ? 'Stop' : 'Start'}
        </Button>
        <IconButton onClick={handleRefresh}>
          <Renew size={18} />
        </IconButton>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mx: 2, mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Tabs */}
      <Paper elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tabValue}
          onChange={(_, newValue) => setTabValue(newValue)}
          aria-label="audio and metrics tabs"
        >
          <Tab label="Audio Engine" icon={<VolumeUp size={18} />} iconPosition="start" />
          <Tab label="System Metrics" icon={<ChartLine size={18} />} iconPosition="start" />
        </Tabs>
      </Paper>

      {/* Tab Panels */}
      {tabValue === 0 ? (
        <Box sx={{ p: 2, overflow: 'auto', flexGrow: 1 }}>
          {/* Status Overview */}
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Stack spacing={2}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Glyph icon={ChartLine} color="primary.main" />
                      <Typography variant="h6">Engine Status</Typography>
                    </Box>

                    <Divider />

                    <Stack spacing={1}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" color="text.secondary">Status</Typography>
                        <Chip
                          label={status?.running ? 'Running' : 'Stopped'}
                          color={status?.running ? 'success' : 'default'}
                          size="small"
                        />
                      </Box>

                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" color="text.secondary">Sample Rate</Typography>
                        <Typography variant="body2">{status?.sample_rate || 0} Hz</Typography>
                      </Box>

                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" color="text.secondary">Buffer Size</Typography>
                        <Typography variant="body2">{status?.buffer_size || 0} samples</Typography>
                      </Box>

                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" color="text.secondary">CPU Load</Typography>
                        <Typography variant="body2">{status?.cpu_load !== undefined ? status.cpu_load.toFixed(1) : '0'}%</Typography>
                      </Box>

                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" color="text.secondary">Engine</Typography>
                        <Typography variant="body2">{status?.engine || 'N/A'}</Typography>
                      </Box>

                      {status?.plugin_count !== undefined && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">Active Plugins</Typography>
                          <Typography variant="body2">{status.plugin_count}</Typography>
                        </Box>
                      )}
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Stack spacing={2}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Glyph icon={VolumeUp} color="primary.main" />
                      <Typography variant="h6">Audio Levels</Typography>
                    </Box>

                    <Divider />

                    <Stack spacing={2}>
                      <LevelMeter
                        label="Input Left"
                        level={levels?.input_left || 0}
                        color="info"
                      />
                      <LevelMeter
                        label="Input Right"
                        level={levels?.input_right || 0}
                        color="info"
                      />
                      <LevelMeter
                        label="Output Left"
                        level={levels?.output_left || 0}
                        color="success"
                      />
                      <LevelMeter
                        label="Output Right"
                        level={levels?.output_right || 0}
                        color="success"
                      />
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Plugin Levels */}
          {pluginLevels.length > 0 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Plugin Levels
              </Typography>
              <Stack spacing={2}>
                {pluginLevels.map((plugin) => (
                  <Card key={plugin.uri} variant="outlined">
                    <CardContent>
                      <Typography variant="subtitle2" gutterBottom>
                        {sanitizeRestrictedDisplayText(plugin.name) || 'Processor'}
                      </Typography>
                      <Stack spacing={1}>
                        <LevelMeter
                          label="Input"
                          level={plugin.input || 0}
                          color="secondary"
                        />
                        <LevelMeter
                          label="Output"
                          level={plugin.output || 0}
                          color="primary"
                        />
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            </Box>
          )}
        </Box>
      ) : (
        <Box sx={{ p: 2, overflow: 'auto', flexGrow: 1 }}>
          {/* Metrics Grid */}
          <Grid container spacing={2}>
            {/* CPU */}
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                icon={<ChartLine size={18} />}
                title="CPU Usage"
                value={metrics?.cpu_percent !== undefined ? metrics.cpu_percent.toFixed(1) : '0'}
                unit="%"
                progress={metrics?.cpu_percent}
                color={
                  (metrics?.cpu_percent || 0) > 80
                    ? 'error'
                    : (metrics?.cpu_percent || 0) > 60
                      ? 'warning'
                      : 'primary'
                }
                subtext={summary?.cpu?.avg !== undefined ? `Avg: ${summary.cpu.avg.toFixed(1)}% • Max: ${summary.cpu.max.toFixed(1)}%` : undefined}
              />
            </Grid>

            {/* Memory */}
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                icon={<DataBase size={18} />}
                title="Memory Usage"
                value={metrics?.memory_percent !== undefined ? metrics.memory_percent.toFixed(1) : '0'}
                unit="%"
                progress={metrics?.memory_percent}
                color={
                  (metrics?.memory_percent || 0) > 90
                    ? 'error'
                    : (metrics?.memory_percent || 0) > 75
                      ? 'warning'
                      : 'secondary'
                }
                subtext={
                  metrics?.memory_used_mb !== undefined && metrics?.memory_total_mb !== undefined
                    ? `${metrics.memory_used_mb.toFixed(0)} / ${metrics.memory_total_mb.toFixed(0)} MB`
                    : undefined
                }
              />
            </Grid>

            {/* Audio Latency */}
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                icon={<Timer size={18} />}
                title="Audio Latency"
                value={
                  metrics?.audio_latency_ms !== undefined
                    ? metrics.audio_latency_ms.toFixed(1)
                    : jackMetrics?.latency_ms !== undefined
                      ? jackMetrics.latency_ms.toFixed(1)
                      : '0'
                }
                unit="ms"
                color={
                  (metrics?.audio_latency_ms || 0) > 20
                    ? 'warning'
                    : (metrics?.audio_latency_ms || 0) > 10
                      ? 'secondary'
                      : 'success'
                }
                subtext={
                  jackMetrics
                    ? `${jackMetrics.sample_rate}Hz • ${jackMetrics.buffer_size} samples`
                    : undefined
                }
              />
            </Grid>

            {/* XRuns */}
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                icon={<WarningAlt size={18} />}
                title="Audio Xruns"
                value={metrics?.audio_xruns || 0}
                color={(metrics?.audio_xruns || 0) > 0 ? 'error' : 'success'}
                subtext={
                  (metrics?.audio_xruns || 0) > 0
                    ? 'Buffer underruns detected'
                    : 'No buffer underruns'
                }
              />
            </Grid>

            {/* Uptime */}
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                icon={<Time size={18} />}
                title="Uptime"
                value={formatUptime(metrics?.uptime_seconds || 0)}
                color="primary"
              />
            </Grid>

            {/* Disk */}
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                icon={<Information size={18} />}
                title="Disk Usage"
                value={metrics?.disk_percent !== undefined ? metrics.disk_percent.toFixed(1) : '0'}
                unit="%"
                progress={metrics?.disk_percent}
                color={(metrics?.disk_percent || 0) > 90 ? 'error' : 'primary'}
              />
            </Grid>
          </Grid>

          {/* Real-time Status Checks */}
          {realtimeStatus && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle1" gutterBottom>
                Real-Time Audio Configuration
              </Typography>
              <Card variant="outlined">
                <Box sx={{ p: 2 }}>
                  <Grid container spacing={1}>
                    <Grid item>
                      <Chip
                        icon={<CheckmarkFilled size={14} />}
                        label={`${realtimeStatus.summary.passed} Passed`}
                        color="success"
                        size="small"
                      />
                    </Grid>
                    <Grid item>
                      <Chip
                        icon={<Information size={14} />}
                        label={`${realtimeStatus.summary.warnings} Warnings`}
                        color="warning"
                        size="small"
                      />
                    </Grid>
                    <Grid item>
                      <Chip
                        icon={<WarningAlt size={14} />}
                        label={`${realtimeStatus.summary.failed} Failed`}
                        color="error"
                        size="small"
                      />
                    </Grid>
                  </Grid>
                </Box>
                <Divider />
                <List dense>
                  {realtimeStatus.checks.slice(0, 8).map((check) => (
                    <ListItem key={check.name}>
                      <ListItemIcon>
                        {check.ok ? <Glyph icon={CheckmarkFilled} color="success.main" /> : <Glyph icon={WarningAlt} color="error.main" />}
                      </ListItemIcon>
                      <ListItemText
                        primary={check.name}
                        secondary={check.message}
                        secondaryTypographyProps={{
                          color: check.ok ? 'text.secondary' : 'error',
                        }}
                      />
                      {!check.ok && check.fix && (
                        <Tooltip title={check.fix}>
                          <IconButton size="small">
                            <Information size={14} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </ListItem>
                  ))}
                </List>
                {realtimeStatus.recommendations.length > 0 && (
                  <>
                    <Divider />
                    <Box sx={{ p: 2 }}>
                      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                        Recommendations
                      </Typography>
                      {realtimeStatus.recommendations.map((rec, index) => (
                        <Typography
                          key={index}
                          variant="body2"
                          sx={{
                            fontFamily: 'var(--font-ui-tight)',
                            fontSize: '0.75rem',
                            bgcolor: 'grey.900',
                            p: 0.5,
                            borderRadius: 0.5,
                            mb: 0.5,
                            wordBreak: 'break-all',
                          }}
                        >
                          {rec}
                        </Typography>
                      ))}
                    </Box>
                  </>
                )}
              </Card>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
