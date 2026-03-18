// ============================================================================
// MAP2 Audio Platform - System Metrics Dashboard Component
// Real-time performance monitoring and system health display
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  Divider,
  CircularProgress,
  Alert,
  IconButton,
  Chip,
  LinearProgress,
  Tooltip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  Speed as CpuIcon,
  Memory as MemoryIcon,
  Timer as LatencyIcon,
  Warning as XrunIcon,
  Refresh as RefreshIcon,
  CheckCircle as OkIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  GraphicEq as AudioIcon,
  Schedule as UptimeIcon,
} from '@mui/icons-material';
import { metricsApi, systemApi } from '../api';
import type { SystemMetrics, MetricsSummary, RealtimeStatus, JackMetrics } from '../types';

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

export default function MetricsDashboard() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus | null>(null);
  const [jackMetrics, setJackMetrics] = useState<JackMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  const fetchData = useCallback(async () => {
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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Auto-refresh every 2 seconds
    intervalRef.current = window.setInterval(fetchData, 2000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchData]);

  if (loading && !metrics) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <AudioIcon sx={{ color: 'primary.main' }} />
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          System Metrics
        </Typography>
        {realtimeStatus && (
          <Chip
            label={`Grade: ${realtimeStatus.summary.grade}`}
            color={getGradeColor(realtimeStatus.summary.grade)}
            size="small"
          />
        )}
        <IconButton onClick={fetchData} size="small">
          <RefreshIcon />
        </IconButton>
      </Box>

      <Divider />

      {/* Error Alert */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ m: 2 }}>
          {error}
        </Alert>
      )}

      {/* Metrics Grid */}
      <Box sx={{ p: 2, overflow: 'auto', flexGrow: 1 }}>
        <Grid container spacing={2}>
          {/* CPU */}
          <Grid item xs={12} sm={6} md={3}>
            <MetricCard
              icon={<CpuIcon />}
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
              icon={<MemoryIcon />}
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
              icon={<LatencyIcon />}
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
              icon={<XrunIcon />}
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
              icon={<UptimeIcon />}
              title="Uptime"
              value={formatUptime(metrics?.uptime_seconds || 0)}
              color="primary"
            />
          </Grid>

          {/* Disk */}
          <Grid item xs={12} sm={6} md={3}>
            <MetricCard
              icon={<InfoIcon />}
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
                      icon={<OkIcon />}
                      label={`${realtimeStatus.summary.passed} Passed`}
                      color="success"
                      size="small"
                    />
                  </Grid>
                  <Grid item>
                    <Chip
                      icon={<InfoIcon />}
                      label={`${realtimeStatus.summary.warnings} Warnings`}
                      color="warning"
                      size="small"
                    />
                  </Grid>
                  <Grid item>
                    <Chip
                      icon={<ErrorIcon />}
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
                      {check.ok ? <OkIcon color="success" /> : <ErrorIcon color="error" />}
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
                          <InfoIcon fontSize="small" />
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
    </Paper>
  );
}
