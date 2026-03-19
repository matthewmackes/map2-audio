// ============================================================================
// MAP2 Audio Platform - Settings Panel Component
// Comprehensive system settings, service monitoring, and configuration
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  CardActions,
  Divider,
  CircularProgress,
  Alert,
  IconButton,
  Button,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tab,
  Tabs,
} from '@mui/material';
import {
  ChartLine,
  CheckmarkFilled,
  ChevronDown,
  Code,
  ColorPalette,
  ConnectionSignal,
  DataBase,
  Debug,
  Equalizer,
  Folder,
  Information,
  Music,
  PlayFilled,
  RecentlyViewed,
  Renew,
  Restart,
  Security,
  Settings,
  StopFilled,
  Time,
  WarningAlt,
  Waveform,
  Laptop,
} from '@carbon/icons-react';
import {
  audioApi,
  midiApi,
  irApi,
  namApi,
  metricsApi,
  systemApi,
  historyApi,
  sessionsApi,
  healthApi,
} from '../api';
import type {
  AudioStatus,
  IRStatus,
  NAMStatus,
  HistoryStatus,
  RealtimeStatus,
  BrandingStatus,
  SystemMetrics,
} from '../types';
import { useWebSocketStatus, useWebSocketQuery } from '../hooks/useWebSocket';

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

interface ServiceStatus {
  name: string;
  icon: React.ReactNode;
  status: 'running' | 'stopped' | 'error' | 'unknown';
  message?: string;
  details?: Record<string, string | number | boolean>;
  actions?: Array<{
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
    color?: 'primary' | 'secondary' | 'error' | 'success';
  }>;
}

function getStatusColor(status: string): 'success' | 'error' | 'warning' | 'default' {
  switch (status) {
    case 'running':
      return 'success';
    case 'stopped':
      return 'default';
    case 'error':
      return 'error';
    default:
      return 'warning';
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'running':
      return <Glyph icon={CheckmarkFilled} color="success.main" />;
    case 'stopped':
      return <Glyph icon={StopFilled} color="text.disabled" />;
    case 'error':
      return <Glyph icon={WarningAlt} color="error.main" />;
    default:
      return <Glyph icon={WarningAlt} color="warning.main" />;
  }
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ p: 2 }}>{children}</Box>}
    </div>
  );
}

export default function SettingsPanel() {
  const [tabIndex, setTabIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // WebSocket status
  const { status: wsStatus, isConnected: wsConnected } = useWebSocketStatus();
  const { getStats } = useWebSocketQuery();
  const [wsStats, setWsStats] = useState<any>(null);

  // Theme state
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>(() => {
    const stored = localStorage.getItem('map2-theme');
    return (stored as 'dark' | 'light' | 'system') || 'dark';
  });

  // Service states
  const [audioStatus, setAudioStatus] = useState<AudioStatus | null>(null);
  const [irStatus, setIRStatus] = useState<IRStatus | null>(null);
  const [namStatus, setNAMStatus] = useState<NAMStatus | null>(null);
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus | null>(null);
  const [brandingStatus, setBrandingStatus] = useState<BrandingStatus | null>(null);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [apiHealth, setApiHealth] = useState<boolean | null>(null);
  const [sessionCount, setSessionCount] = useState<number>(0);

  const fetchAllStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const results = await Promise.allSettled([
        audioApi.getStatus(),
        irApi.getStatus(),
        namApi.getStatus(),
        historyApi.getStatus(),
        systemApi.getRealtimeStatus(),
        systemApi.getBrandingStatus(),
        metricsApi.getCurrent(),
        healthApi.check(),
        sessionsApi.list(),
      ]);

      if (results[0].status === 'fulfilled') setAudioStatus(results[0].value);
      if (results[1].status === 'fulfilled') setIRStatus(results[1].value);
      if (results[2].status === 'fulfilled') setNAMStatus(results[2].value);
      if (results[3].status === 'fulfilled') setHistoryStatus(results[3].value);
      if (results[4].status === 'fulfilled') setRealtimeStatus(results[4].value);
      if (results[5].status === 'fulfilled') setBrandingStatus(results[5].value);
      if (results[6].status === 'fulfilled') setMetrics(results[6].value);
      if (results[7].status === 'fulfilled') setApiHealth(results[7].value.status === 'ok');
      if (results[8].status === 'fulfilled') setSessionCount(results[8].value.sessions.length);

      // Fetch WebSocket stats if connected
      if (wsConnected) {
        try {
          const stats = await getStats();
          setWsStats(stats);
        } catch (err) {
          console.warn('Failed to fetch WebSocket stats:', err);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status');
    } finally {
      setLoading(false);
    }
  }, [wsConnected, getStats]);

  useEffect(() => {
    fetchAllStatus();
    const interval = setInterval(fetchAllStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchAllStatus]);

  const handleRestartBackend = () => {
    setConfirmDialog({
      open: true,
      title: 'Restart Backend',
      message: 'Are you sure you want to restart the MAP2 backend service? This will briefly interrupt audio processing.',
      onConfirm: async () => {
        try {
          await systemApi.restartBackend();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to restart backend');
        }
        setConfirmDialog(null);
      },
    });
  };

  const handleRestartSystem = () => {
    setConfirmDialog({
      open: true,
      title: 'Restart System',
      message: 'Are you sure you want to restart the entire system? All services will be temporarily unavailable.',
      onConfirm: async () => {
        try {
          await systemApi.restartSystem();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to restart system');
        }
        setConfirmDialog(null);
      },
    });
  };

  const handleReinstallBranding = async () => {
    try {
      const result = await systemApi.reinstallBranding();
      if (!result.success) {
        setError(result.errors?.join(', ') || 'Branding installation failed');
      }
      await fetchAllStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reinstall branding');
    }
  };

  const services: ServiceStatus[] = [
    {
      name: 'FastAPI Backend',
      icon: <Code size={18} />,
      status: apiHealth ? 'running' : apiHealth === false ? 'error' : 'unknown',
      message: apiHealth ? 'API responding normally' : 'API not responding',
      details: {
        'Base URL': '/api',
        'Port': 8080,
      },
      actions: [
        {
          label: 'Restart',
          icon: <Restart size={16} />,
          onClick: handleRestartBackend,
          color: 'primary',
        },
      ],
    },
    {
      name: 'WebSocket Service',
      icon: <ConnectionSignal size={18} />,
      status: wsStatus === 'connected' ? 'running' : wsStatus === 'error' ? 'error' : wsStatus === 'reconnecting' ? 'unknown' : 'stopped',
      message: wsStatus === 'connected'
        ? 'Real-time updates active'
        : wsStatus === 'reconnecting'
          ? 'Attempting to reconnect...'
          : wsStatus === 'error'
            ? 'Connection failed'
            : 'Not connected',
      details: wsStats
        ? {
            'Active Connections': wsStats.active_connections || 0,
            'Subscribed Topics': wsStats.topics?.join(', ') || 'None',
            'Endpoint': '/ws/v1',
          }
        : {
            'Status': wsStatus,
            'Endpoint': '/ws/v1',
          },
    },
    {
      name: 'Audio Engine',
      icon: <Equalizer size={18} />,
      status: audioStatus?.running ? 'running' : audioStatus?.available ? 'stopped' : 'error',
      message: audioStatus?.running
        ? `${audioStatus.sample_rate}Hz / ${audioStatus.buffer_size} samples`
        : audioStatus?.error || 'Not running',
      details: audioStatus
        ? {
            'Engine': audioStatus.engine,
            'Sample Rate': `${audioStatus.sample_rate} Hz`,
            'Buffer Size': `${audioStatus.buffer_size} samples`,
            'CPU Load': `${audioStatus.cpu_load.toFixed(1)}%`,
            'Plugin Count': audioStatus.plugin_count || 0,
          }
        : undefined,
      actions: [
        {
          label: audioStatus?.running ? 'Stop' : 'Start',
          icon: audioStatus?.running ? <StopFilled size={16} /> : <PlayFilled size={16} />,
          onClick: async () => {
            try {
              if (audioStatus?.running) {
                await audioApi.stop();
              } else {
                await audioApi.start();
              }
              await fetchAllStatus();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Audio control failed');
            }
          },
          color: audioStatus?.running ? 'error' : 'success',
        },
      ],
    },
    {
      name: 'MIDI Engine',
      icon: <Music size={18} />,
      status: 'running', // Assume running if API is accessible
      message: 'MIDI service active',
      actions: [
        {
          label: 'Restart',
          icon: <Restart size={16} />,
          onClick: async () => {
            try {
              await midiApi.stop();
              await midiApi.start();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'MIDI restart failed');
            }
          },
        },
      ],
    },
    {
      name: 'IR Processor',
      icon: <Waveform size={18} />,
      status: irStatus?.available ? 'running' : 'error',
      message: irStatus?.available
        ? `Cabinet: ${irStatus.loaded_cabinet || 'None'} | Reverb: ${irStatus.loaded_reverb || 'None'}`
        : irStatus?.error || 'Not available',
    },
    {
      name: 'Neural Amp Modeler',
      icon: <Debug size={18} />,
      status: namStatus?.available ? 'running' : 'stopped',
      message: namStatus?.available
        ? `Active: ${namStatus.activeModel || 'None'}`
        : 'PyTorch not installed',
    },
    {
      name: 'Automation Engine',
      icon: <ChartLine size={18} />,
      status: 'running',
      message: 'Timeline automation active',
    },
    {
      name: 'Command History',
      icon: <RecentlyViewed size={18} />,
      status: 'running',
      message: `${historyStatus?.undo_stack_size || 0} undos / ${historyStatus?.redo_stack_size || 0} redos`,
      actions: [
        {
          label: 'Clear History',
          icon: <StopFilled size={16} />,
          onClick: async () => {
            try {
              await historyApi.clear();
              await fetchAllStatus();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Failed to clear history');
            }
          },
          disabled: (historyStatus?.undo_stack_size || 0) === 0,
        },
      ],
    },
    {
      name: 'Session Manager',
      icon: <Folder size={18} />,
      status: 'running',
      message: `${sessionCount} saved sessions`,
    },
  ];

  if (loading && !audioStatus) {
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
        <Glyph icon={Settings} color="primary.main" />
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          Settings & System Status
        </Typography>
        <IconButton onClick={fetchAllStatus} disabled={loading} size="small">
          <Renew size={18} />
        </IconButton>
      </Box>

      <Divider />

      {/* Tabs */}
      <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)} variant="fullWidth">
        <Tab icon={<Laptop size={18} />} label="Services" />
        <Tab icon={<Security size={18} />} label="System" />
        <Tab icon={<ColorPalette size={18} />} label="Appearance" />
        <Tab icon={<Debug size={18} />} label="Debug" />
      </Tabs>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ m: 2 }}>
          {error}
        </Alert>
      )}

      {/* Tab Panels */}
      <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
        {/* Services Tab */}
        <TabPanel value={tabIndex} index={0}>
          <Grid container spacing={2}>
            {services.map((service) => (
              <Grid item xs={12} md={6} key={service.name}>
                <Card variant="outlined">
                  <CardContent sx={{ pb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      {service.icon}
                      <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>
                        {service.name}
                      </Typography>
                      <Chip
                        label={service.status}
                        size="small"
                        color={getStatusColor(service.status)}
                        icon={getStatusIcon(service.status)}
                      />
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      {service.message}
                    </Typography>
                    {service.details && (
                      <Box sx={{ mt: 1 }}>
                        {Object.entries(service.details).map(([key, value]) => (
                          <Typography key={key} variant="caption" display="block" color="text.secondary">
                            {key}: <strong>{String(value)}</strong>
                          </Typography>
                        ))}
                      </Box>
                    )}
                  </CardContent>
                  {service.actions && service.actions.length > 0 && (
                    <CardActions>
                      {service.actions.map((action, idx) => (
                        <Button
                          key={idx}
                          size="small"
                          startIcon={action.icon}
                          onClick={action.onClick}
                          disabled={action.disabled}
                          color={action.color}
                        >
                          {action.label}
                        </Button>
                      ))}
                    </CardActions>
                  )}
                </Card>
              </Grid>
            ))}
          </Grid>
        </TabPanel>

        {/* System Tab */}
        <TabPanel value={tabIndex} index={1}>
          {/* System Metrics */}
          {metrics && (
            <Card variant="outlined" sx={{ mb: 2 }}>
              <CardContent>
                <Typography variant="subtitle1" gutterBottom>
                  System Resources
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6} sm={3}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Glyph icon={ChartLine} color="primary.main" />
                      <Typography variant="h6">{metrics.cpu_percent.toFixed(1)}%</Typography>
                      <Typography variant="caption" color="text.secondary">
                        CPU Usage
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Glyph icon={DataBase} color="secondary.main" />
                      <Typography variant="h6">{metrics.memory_percent.toFixed(1)}%</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Memory
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Glyph icon={DataBase} color="text.secondary" />
                      <Typography variant="h6">{metrics.disk_percent.toFixed(1)}%</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Disk
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Glyph icon={Equalizer} color="success.main" />
                      <Typography variant="h6">{metrics.audio_latency_ms.toFixed(1)}ms</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Latency
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          )}

          {/* Real-time Audio Status */}
          {realtimeStatus && (
            <Accordion defaultExpanded>
              <AccordionSummary expandIcon={<ChevronDown size={16} />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                  <Security size={18} />
                  <Typography>Real-Time Audio Configuration</Typography>
                  <Box sx={{ flexGrow: 1 }} />
                  <Chip
                    label={`Grade: ${realtimeStatus.summary.grade}`}
                    size="small"
                    color={getStatusColor(
                      realtimeStatus.summary.grade === 'A+' || realtimeStatus.summary.grade === 'A'
                        ? 'running'
                        : realtimeStatus.summary.grade === 'B'
                          ? 'unknown'
                          : 'error'
                    )}
                  />
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={1} sx={{ mb: 2 }}>
                  <Grid item>
                    <Chip icon={<CheckmarkFilled size={14} />} label={`${realtimeStatus.summary.passed} Passed`} color="success" size="small" />
                  </Grid>
                  <Grid item>
                    <Chip icon={<WarningAlt size={14} />} label={`${realtimeStatus.summary.warnings} Warnings`} color="warning" size="small" />
                  </Grid>
                  <Grid item>
                    <Chip icon={<WarningAlt size={14} />} label={`${realtimeStatus.summary.failed} Failed`} color="error" size="small" />
                  </Grid>
                </Grid>
                <List dense>
                  {realtimeStatus.checks.map((check, idx) => (
                    <ListItem key={idx}>
                      <ListItemIcon>
                        {check.ok ? <Glyph icon={CheckmarkFilled} color="success.main" /> : <Glyph icon={WarningAlt} color="error.main" />}
                      </ListItemIcon>
                      <ListItemText
                        primary={check.name}
                        secondary={check.message}
                      />
                      {!check.ok && check.fix && (
                        <ListItemSecondaryAction>
                          <Tooltip title={check.fix}>
                            <IconButton size="small">
                              <Information size={16} />
                            </IconButton>
                          </Tooltip>
                        </ListItemSecondaryAction>
                      )}
                    </ListItem>
                  ))}
                </List>
              </AccordionDetails>
            </Accordion>
          )}

          {/* Branding Status */}
          {brandingStatus && (
            <Accordion>
              <AccordionSummary expandIcon={<ChevronDown size={16} />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ColorPalette size={18} />
                  <Typography>MAP2 Branding</Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <List dense>
                  {brandingStatus.checks.map((check, idx) => (
                    <ListItem key={idx}>
                      <ListItemIcon>
                        {check.installed ? <Glyph icon={CheckmarkFilled} color="success.main" /> : <Glyph icon={WarningAlt} color="error.main" />}
                      </ListItemIcon>
                      <ListItemText
                        primary={check.name}
                        secondary={check.path || check.current}
                      />
                    </ListItem>
                  ))}
                </List>
                <Button
                  variant="outlined"
                  startIcon={<Restart size={16} />}
                  onClick={handleReinstallBranding}
                  disabled={!brandingStatus.source_available}
                  sx={{ mt: 1 }}
                >
                  Reinstall Branding
                </Button>
              </AccordionDetails>
            </Accordion>
          )}

          {/* System Actions */}
          <Card variant="outlined" sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>
                System Actions
              </Typography>
              <Grid container spacing={2}>
                <Grid item>
                  <Button
                    variant="outlined"
                    startIcon={<Restart size={16} />}
                    onClick={handleRestartBackend}
                  >
                    Restart Backend
                  </Button>
                </Grid>
                <Grid item>
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<Restart size={16} />}
                    onClick={handleRestartSystem}
                  >
                    Restart System
                  </Button>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </TabPanel>

        {/* Appearance Tab */}
        <TabPanel value={tabIndex} index={2}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>
                Theme Settings
              </Typography>
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Color Theme</InputLabel>
                <Select
                  value={theme}
                  label="Color Theme"
                  onChange={(e) => {
                    const newTheme = e.target.value as 'dark' | 'light' | 'system';
                    setTheme(newTheme);
                    localStorage.setItem('map2-theme', newTheme);
                    // Apply theme - in production this would update the MUI theme provider
                    document.documentElement.setAttribute('data-theme', newTheme);
                  }}
                >
                  <MenuItem value="dark">Dark</MenuItem>
                  <MenuItem value="light">Light</MenuItem>
                  <MenuItem value="system">System Default</MenuItem>
                </Select>
              </FormControl>
              <Typography variant="body2" color="text.secondary">
                Theme preference is stored locally in your browser.
              </Typography>
            </CardContent>
          </Card>
        </TabPanel>

        {/* Debug Tab */}
        <TabPanel value={tabIndex} index={3}>
          <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>
                API Endpoints
              </Typography>
              <List dense>
                {[
                  { name: 'Audio', endpoint: '/api/audio/status' },
                  { name: 'Chains', endpoint: '/api/chains/' },
                  { name: 'Plugins', endpoint: '/api/plugins/discover' },
                  { name: 'Snapshots', endpoint: '/api/snapshots/' },
                  { name: 'MIDI', endpoint: '/api/midi/devices' },
                  { name: 'IR', endpoint: '/api/ir/' },
                  { name: 'NAM', endpoint: '/api/nam/' },
                  { name: 'Metrics', endpoint: '/api/metrics/current' },
                  { name: 'Health', endpoint: '/api/health' },
                  { name: 'WebSocket Stats', endpoint: '/ws/stats' },
                ].map((api) => (
                  <ListItem key={api.name}>
                    <ListItemIcon>
                      <Code size={16} />
                    </ListItemIcon>
                    <ListItemText
                      primary={api.name}
                      secondary={api.endpoint}
                      secondaryTypographyProps={{ fontFamily: 'var(--font-ui-tight)', fontSize: '0.75rem' }}
                    />
                    <ListItemSecondaryAction>
                      <Button
                        size="small"
                        href={api.endpoint}
                        target="_blank"
                      >
                        Open
                      </Button>
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>
                API Documentation
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Interactive API documentation is available via FastAPI's built-in Swagger UI.
              </Typography>
              <Button
                variant="outlined"
                startIcon={<Code size={16} />}
                href="/docs"
                target="_blank"
              >
                Open API Docs
              </Button>
            </CardContent>
          </Card>
        </TabPanel>
      </Box>

      {/* Confirmation Dialog */}
      <Dialog
        open={confirmDialog?.open || false}
        onClose={() => setConfirmDialog(null)}
      >
        <DialogTitle>{confirmDialog?.title}</DialogTitle>
        <DialogContent>
          <DialogContentText>{confirmDialog?.message}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog(null)}>Cancel</Button>
          <Button
            onClick={confirmDialog?.onConfirm}
            color="primary"
            variant="contained"
            autoFocus
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
