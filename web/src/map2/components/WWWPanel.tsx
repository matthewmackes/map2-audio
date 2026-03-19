// ============================================================================
// MAP2 Audio Platform - Web Services Configuration Panel
// Comprehensive web server and API management
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
  TextField,
  Switch,
  FormControlLabel,
  Tab,
  Tabs,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  LinearProgress,
  Slider,
} from '@mui/material';
import { NumberInput } from './NumberInput';
import {
  CheckmarkFilled,
  ChevronDown,
  Cloud,
  CloudUpload,
  Code,
  ConnectionSignal,
  Copy,
  DataBase,
  Delete,
  Download,
  Globe,
  Http,
  Information,
  Launch,
  Locked,
  Password,
  Renew,
  Restart,
  Security,
  Settings,
  Terminal,
  View,
  ViewOff,
  WarningAlt,
  ChartLine,
  Document,
} from '@carbon/icons-react';
import { wwwApi, healthApi } from '../api';
import type {
  WWWStatus,
  WebServerConfig,
  APIConfig,
  SSLConfig,
  CORSConfig,
  AccessLog,
  APIEndpoint,
  WebSocketStats,
} from '../types';

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

export default function WWWPanel() {
  const [tabIndex, setTabIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // WWW state
  const [wwwStatus, setWwwStatus] = useState<WWWStatus | null>(null);
  const [apiEndpoints, setApiEndpoints] = useState<APIEndpoint[]>([]);
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([]);
  const [wsStats, setWsStats] = useState<WebSocketStats | null>(null);

  // Dialog states
  const [configDialog, setConfigDialog] = useState<{ open: boolean; type: string; config: any }>({ open: false, type: '', config: null });
  const [showApiKey, setShowApiKey] = useState(false);

  const fetchWWWStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [status, endpoints, logs, wsStatsData] = await Promise.all([
        wwwApi.getStatus(),
        wwwApi.getEndpoints(),
        wwwApi.getAccessLogs(50),
        wwwApi.getWebSocketStats(),
      ]);

      setWwwStatus(status);
      setApiEndpoints(endpoints.endpoints);
      setAccessLogs(logs.logs);
      setWsStats(wsStatsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch WWW status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWWWStatus();
  }, [fetchWWWStatus]);

  const handleRestartService = async (service: 'backend' | 'frontend') => {
    try {
      setLoading(true);
      await wwwApi.restartService(service);
      setSuccess(`${service} service restarted`);
      await fetchWWWStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to restart ${service}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateConfig = async (type: string, config: any) => {
    try {
      setLoading(true);
      await wwwApi.updateConfig(type, config);
      setSuccess(`${type} configuration updated`);
      setConfigDialog({ open: false, type: '', config: null });
      await fetchWWWStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateApiKey = async () => {
    try {
      setLoading(true);
      const result = await wwwApi.generateApiKey();
      setSuccess('New API key generated. Make sure to save it!');
      await fetchWWWStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate API key');
    } finally {
      setLoading(false);
    }
  };

  const handleClearLogs = async () => {
    try {
      setLoading(true);
      await wwwApi.clearLogs();
      setSuccess('Access logs cleared');
      setAccessLogs([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear logs');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setSuccess('Copied to clipboard');
  };

  if (loading && !wwwStatus) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Glyph icon={Globe} color="primary.main" />
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          Web Services Configuration
        </Typography>
        {wwwStatus?.backend_running ? (
          <Chip icon={<CheckmarkFilled size={14} />} label="API Online" color="success" size="small" />
        ) : (
          <Chip icon={<WarningAlt size={14} />} label="API Offline" color="error" size="small" />
        )}
        {wwwStatus?.frontend_running && (
          <Chip icon={<CheckmarkFilled size={14} />} label="Web UI Online" color="success" size="small" />
        )}
        <IconButton onClick={fetchWWWStatus} disabled={loading} size="small">
          <Renew size={18} />
        </IconButton>
      </Box>

      <Divider />

      {/* Tabs */}
      <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)} variant="fullWidth">
        <Tab icon={<Code size={18} />} label="API Server" />
        <Tab icon={<Globe size={18} />} label="Web Server" />
        <Tab icon={<Security size={18} />} label="Security" />
        <Tab icon={<Document size={18} />} label="Logs" />
      </Tabs>

      {/* Alerts */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ m: 2 }}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" onClose={() => setSuccess(null)} sx={{ m: 2 }}>
          {success}
        </Alert>
      )}

      {loading && <LinearProgress />}

      {/* Tab Panels */}
      <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
        {/* API Server Tab */}
        <TabPanel value={tabIndex} index={0}>
          <Grid container spacing={2}>
            {/* Backend Status */}
            <Grid item xs={12} md={6}>
              <Card variant="outlined">
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <Glyph icon={Code} color={wwwStatus?.backend_running ? 'success.main' : 'error.main'} />
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                      FastAPI Backend
                    </Typography>
                    <Chip
                      label={wwwStatus?.backend_running ? 'Running' : 'Stopped'}
                      color={wwwStatus?.backend_running ? 'success' : 'error'}
                      size="small"
                    />
                  </Box>
                  <List dense>
                    <ListItem>
                      <ListItemText primary="Host" secondary={wwwStatus?.backend_host || '0.0.0.0'} />
                    </ListItem>
                    <ListItem>
                      <ListItemText primary="Port" secondary={wwwStatus?.backend_port || 8080} />
                    </ListItem>
                    <ListItem>
                      <ListItemText primary="Workers" secondary={wwwStatus?.workers || 1} />
                    </ListItem>
                    <ListItem>
                      <ListItemText primary="Uptime" secondary={wwwStatus?.uptime || 'N/A'} />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="API Documentation"
                        secondary={
                          <Button
                            size="small"
                            startIcon={<Launch size={16} />}
                            onClick={() => window.open(`http://${window.location.hostname}:8080/docs`, '_blank')}
                          >
                            Open Swagger UI
                          </Button>
                        }
                      />
                    </ListItem>
                  </List>
                </CardContent>
                <CardActions>
                  <Button
                    size="small"
                    startIcon={<Restart size={16} />}
                    onClick={() => handleRestartService('backend')}
                    disabled={loading}
                  >
                    Restart
                  </Button>
                  <Button
                    size="small"
                    startIcon={<Settings size={16} />}
                    onClick={() => setConfigDialog({
                      open: true,
                      type: 'backend',
                      config: {
                        host: wwwStatus?.backend_host || '0.0.0.0',
                        port: wwwStatus?.backend_port || 8080,
                        workers: wwwStatus?.workers || 1,
                        debug: wwwStatus?.debug || false,
                      }
                    })}
                  >
                    Configure
                  </Button>
                </CardActions>
              </Card>
            </Grid>

            {/* WebSocket Stats */}
            <Grid item xs={12} md={6}>
              <Card variant="outlined">
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <Glyph icon={ConnectionSignal} color="primary.main" />
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                      WebSocket Server
                    </Typography>
                    <Chip
                      label={`${wsStats?.active_connections || 0} Connected`}
                      color="primary"
                      size="small"
                    />
                  </Box>
                  <List dense>
                    <ListItem>
                      <ListItemText primary="Active Connections" secondary={wsStats?.active_connections || 0} />
                    </ListItem>
                    <ListItem>
                      <ListItemText primary="Total Messages" secondary={wsStats?.total_messages || 0} />
                    </ListItem>
                    <ListItem>
                      <ListItemText primary="Messages/sec" secondary={wsStats?.messages_per_second?.toFixed(2) || '0.00'} />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="Subscriptions"
                        secondary={
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                            {wsStats?.subscriptions?.map((sub) => (
                              <Chip key={sub.topic} label={`${sub.topic}: ${sub.count}`} size="small" variant="outlined" />
                            ))}
                          </Box>
                        }
                      />
                    </ListItem>
                  </List>
                </CardContent>
              </Card>
            </Grid>

            {/* API Endpoints */}
            <Grid item xs={12}>
              <Accordion defaultExpanded>
                <AccordionSummary expandIcon={<ChevronDown size={16} />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Code size={18} />
                    <Typography>API Endpoints ({apiEndpoints.length})</Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Method</TableCell>
                        <TableCell>Path</TableCell>
                        <TableCell>Description</TableCell>
                        <TableCell>Requests</TableCell>
                        <TableCell>Avg. Time</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {apiEndpoints.slice(0, 20).map((endpoint, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <Chip
                              label={endpoint.method}
                              size="small"
                              color={
                                endpoint.method === 'GET' ? 'success' :
                                endpoint.method === 'POST' ? 'primary' :
                                endpoint.method === 'PUT' ? 'warning' :
                                endpoint.method === 'DELETE' ? 'error' : 'default'
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontFamily: 'var(--font-mono)' }}>
                              {endpoint.path}
                            </Typography>
                          </TableCell>
                          <TableCell>{endpoint.description || '-'}</TableCell>
                          <TableCell>{endpoint.request_count || 0}</TableCell>
                          <TableCell>{endpoint.avg_response_time ? `${endpoint.avg_response_time.toFixed(2)}ms` : '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </AccordionDetails>
              </Accordion>
            </Grid>
          </Grid>
        </TabPanel>

        {/* Web Server Tab */}
        <TabPanel value={tabIndex} index={1}>
          <Grid container spacing={2}>
            {/* Frontend Status */}
            <Grid item xs={12} md={6}>
              <Card variant="outlined">
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <Glyph icon={Globe} color={wwwStatus?.frontend_running ? 'success.main' : 'warning.main'} />
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                      Web Frontend
                    </Typography>
                    <Chip
                      label={wwwStatus?.frontend_running ? 'Running' : 'Stopped'}
                      color={wwwStatus?.frontend_running ? 'success' : 'default'}
                      size="small"
                    />
                  </Box>
                  <List dense>
                    <ListItem>
                      <ListItemText primary="Framework" secondary="React + Vite" />
                    </ListItem>
                    <ListItem>
                      <ListItemText primary="Port" secondary={wwwStatus?.frontend_port || 3000} />
                    </ListItem>
                    <ListItem>
                      <ListItemText primary="Mode" secondary={wwwStatus?.frontend_mode || 'development'} />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="URL"
                        secondary={
                          <Button
                            size="small"
                            startIcon={<Launch size={16} />}
                            onClick={() => window.open(`http://${window.location.hostname}:${wwwStatus?.frontend_port || 3000}`, '_blank')}
                          >
                            Open Web UI
                          </Button>
                        }
                      />
                    </ListItem>
                  </List>
                </CardContent>
                <CardActions>
                  <Button
                    size="small"
                    startIcon={<Restart size={16} />}
                    onClick={() => handleRestartService('frontend')}
                    disabled={loading}
                  >
                    Restart
                  </Button>
                </CardActions>
              </Card>
            </Grid>

            {/* Performance */}
            <Grid item xs={12} md={6}>
              <Card variant="outlined">
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <Glyph icon={ChartLine} color="primary.main" />
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                      Performance
                    </Typography>
                  </Box>
                  <List dense>
                    <ListItem>
                      <ListItemText
                        primary="CPU Usage"
                        secondary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <LinearProgress
                              variant="determinate"
                              value={wwwStatus?.cpu_percent || 0}
                              sx={{ flexGrow: 1, height: 8, borderRadius: 4 }}
                            />
                            <Typography variant="body2">{wwwStatus?.cpu_percent?.toFixed(1) || 0}%</Typography>
                          </Box>
                        }
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="Memory Usage"
                        secondary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <LinearProgress
                              variant="determinate"
                              value={wwwStatus?.memory_percent || 0}
                              sx={{ flexGrow: 1, height: 8, borderRadius: 4 }}
                              color="secondary"
                            />
                            <Typography variant="body2">{wwwStatus?.memory_mb?.toFixed(0) || 0} MB</Typography>
                          </Box>
                        }
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText primary="Total Requests" secondary={wwwStatus?.total_requests || 0} />
                    </ListItem>
                    <ListItem>
                      <ListItemText primary="Requests/min" secondary={wwwStatus?.requests_per_minute?.toFixed(2) || '0.00'} />
                    </ListItem>
                  </List>
                </CardContent>
              </Card>
            </Grid>

            {/* Static Files */}
            <Grid item xs={12}>
              <Accordion>
                <AccordionSummary expandIcon={<ChevronDown size={16} />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <DataBase size={18} />
                    <Typography>Static Files & Assets</Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <List dense>
                    <ListItem>
                      <ListItemIcon><DataBase size={18} /></ListItemIcon>
                      <ListItemText primary="Web Root" secondary={wwwStatus?.web_root || '/web/dist'} />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon><CloudUpload size={18} /></ListItemIcon>
                      <ListItemText primary="Upload Directory" secondary={wwwStatus?.upload_dir || '/tmp/map2-uploads'} />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon><DataBase size={18} /></ListItemIcon>
                      <ListItemText primary="Max Upload Size" secondary={`${wwwStatus?.max_upload_size || 512} MB`} />
                    </ListItem>
                  </List>
                </AccordionDetails>
              </Accordion>
            </Grid>
          </Grid>
        </TabPanel>

        {/* Security Tab */}
        <TabPanel value={tabIndex} index={2}>
          <Grid container spacing={2}>
            {/* CORS Configuration */}
            <Grid item xs={12} md={6}>
              <Card variant="outlined">
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <Glyph icon={Globe} color="primary.main" />
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                      CORS Settings
                    </Typography>
                    <Chip
                      label={wwwStatus?.cors_enabled ? 'Enabled' : 'Disabled'}
                      color={wwwStatus?.cors_enabled ? 'success' : 'default'}
                      size="small"
                    />
                  </Box>
                  <List dense>
                    <ListItem>
                      <ListItemText
                        primary="Allowed Origins"
                        secondary={
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                            {wwwStatus?.cors_origins?.map((origin, idx) => (
                              <Chip key={idx} label={origin} size="small" variant="outlined" />
                            )) || <Typography variant="body2">*</Typography>}
                          </Box>
                        }
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText primary="Allow Credentials" secondary={wwwStatus?.cors_credentials ? 'Yes' : 'No'} />
                    </ListItem>
                  </List>
                </CardContent>
                <CardActions>
                  <Button
                    size="small"
                    startIcon={<Settings size={16} />}
                    onClick={() => setConfigDialog({
                      open: true,
                      type: 'cors',
                      config: {
                        enabled: wwwStatus?.cors_enabled ?? true,
                        origins: wwwStatus?.cors_origins || ['*'],
                        credentials: wwwStatus?.cors_credentials ?? true,
                      }
                    })}
                  >
                    Configure
                  </Button>
                </CardActions>
              </Card>
            </Grid>

            {/* SSL/TLS */}
            <Grid item xs={12} md={6}>
              <Card variant="outlined">
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    {wwwStatus?.ssl_enabled ? <Glyph icon={Locked} color="success.main" /> : <Glyph icon={Http} color="warning.main" />}
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                      SSL/TLS
                    </Typography>
                    <Chip
                      label={wwwStatus?.ssl_enabled ? 'Enabled' : 'Disabled'}
                      color={wwwStatus?.ssl_enabled ? 'success' : 'warning'}
                      size="small"
                    />
                  </Box>
                  <List dense>
                    {wwwStatus?.ssl_enabled ? (
                      <>
                        <ListItem>
                          <ListItemText primary="Certificate" secondary={wwwStatus?.ssl_cert || 'N/A'} />
                        </ListItem>
                        <ListItem>
                          <ListItemText primary="Expires" secondary={wwwStatus?.ssl_expires || 'N/A'} />
                        </ListItem>
                      </>
                    ) : (
                      <ListItem>
                        <ListItemText
                          primary="Status"
                          secondary="SSL is not configured. Consider enabling HTTPS for production use."
                        />
                      </ListItem>
                    )}
                  </List>
                </CardContent>
                <CardActions>
                  <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
                    Use certbot or your hosting provider to manage SSL certificates.
                  </Typography>
                </CardActions>
              </Card>
            </Grid>

            {/* API Key Management */}
            <Grid item xs={12} md={6}>
              <Card variant="outlined">
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <Glyph icon={Password} color="primary.main" />
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                      API Keys
                    </Typography>
                    <Chip
                      label={wwwStatus?.api_key_required ? 'Required' : 'Optional'}
                      color={wwwStatus?.api_key_required ? 'warning' : 'default'}
                      size="small"
                    />
                  </Box>
                  <List dense>
                    <ListItem>
                      <ListItemText
                        primary="Current API Key"
                        secondary={
                          wwwStatus?.api_key ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="body2" sx={{ fontFamily: 'var(--font-mono)' }}>
                                {showApiKey ? wwwStatus.api_key : '••••••••••••••••'}
                              </Typography>
                              <IconButton size="small" onClick={() => setShowApiKey(!showApiKey)}>
                                {showApiKey ? <ViewOff size={16} /> : <View size={16} />}
                              </IconButton>
                              <IconButton size="small" onClick={() => copyToClipboard(wwwStatus.api_key!)}>
                                <Copy size={16} />
                              </IconButton>
                            </Box>
                          ) : 'Not configured'
                        }
                      />
                    </ListItem>
                  </List>
                </CardContent>
                <CardActions>
                  <Button
                    size="small"
                    startIcon={<Password size={16} />}
                    onClick={handleGenerateApiKey}
                    disabled={loading}
                  >
                    Generate New Key
                  </Button>
                </CardActions>
              </Card>
            </Grid>

            {/* Rate Limiting */}
            <Grid item xs={12} md={6}>
              <Card variant="outlined">
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <Glyph icon={ChartLine} color="primary.main" />
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                      Rate Limiting
                    </Typography>
                    <Chip
                      label={wwwStatus?.rate_limit_enabled ? 'Enabled' : 'Disabled'}
                      color={wwwStatus?.rate_limit_enabled ? 'success' : 'default'}
                      size="small"
                    />
                  </Box>
                  <List dense>
                    <ListItem>
                      <ListItemText primary="Requests per minute" secondary={wwwStatus?.rate_limit_rpm || 'Unlimited'} />
                    </ListItem>
                    <ListItem>
                      <ListItemText primary="Burst limit" secondary={wwwStatus?.rate_limit_burst || 'N/A'} />
                    </ListItem>
                  </List>
                </CardContent>
                <CardActions>
                  <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
                    Requires reverse proxy (nginx) or middleware configuration.
                  </Typography>
                </CardActions>
              </Card>
            </Grid>
          </Grid>
        </TabPanel>

        {/* Logs Tab */}
        <TabPanel value={tabIndex} index={3}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">
              Access Logs
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size="small"
                startIcon={<Renew size={16} />}
                onClick={fetchWWWStatus}
                disabled={loading}
              >
                Refresh
              </Button>
              <Button
                size="small"
                color="warning"
                startIcon={<Delete size={16} />}
                onClick={handleClearLogs}
                disabled={loading}
              >
                Clear Logs
              </Button>
              <Button
                size="small"
                startIcon={<Download size={16} />}
                onClick={() => {
                  const blob = new Blob([JSON.stringify(accessLogs, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'access-logs.json';
                  a.click();
                }}
              >
                Export
              </Button>
            </Box>
          </Box>

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Timestamp</TableCell>
                <TableCell>Method</TableCell>
                <TableCell>Path</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Time</TableCell>
                <TableCell>Client</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {accessLogs.length > 0 ? (
                accessLogs.map((log, idx) => (
                  <TableRow key={idx}>
                    <TableCell sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                      {new Date(log.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={log.method}
                        size="small"
                        color={
                          log.method === 'GET' ? 'success' :
                          log.method === 'POST' ? 'primary' :
                          log.method === 'PUT' ? 'warning' :
                          log.method === 'DELETE' ? 'error' : 'default'
                        }
                      />
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {log.path}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={log.status_code}
                        size="small"
                        color={
                          log.status_code < 300 ? 'success' :
                          log.status_code < 400 ? 'info' :
                          log.status_code < 500 ? 'warning' : 'error'
                        }
                      />
                    </TableCell>
                    <TableCell>{log.response_time?.toFixed(2) || '-'}ms</TableCell>
                    <TableCell sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{log.client_ip}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <Typography color="text.secondary">No access logs available</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabPanel>
      </Box>

      {/* Configuration Dialog */}
      <Dialog
        open={configDialog.open}
        onClose={() => setConfigDialog({ open: false, type: '', config: null })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Configure {configDialog.type === 'backend' ? 'Backend Server' : configDialog.type === 'cors' ? 'CORS Settings' : ''}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {configDialog.type === 'backend' && (
              <>
                <TextField
                  fullWidth
                  label="Host"
                  value={configDialog.config?.host || ''}
                  onChange={(e) => setConfigDialog({
                    ...configDialog,
                    config: { ...configDialog.config, host: e.target.value }
                  })}
                />
                <NumberInput
                  label="Port"
                  value={Number(configDialog.config?.port || 8080)}
                  min={1}
                  max={65535}
                  step={1}
                  size="small"
                  fullWidth
                  onChange={(value) => setConfigDialog({
                    ...configDialog,
                    config: { ...configDialog.config, port: Math.max(1, Math.min(65535, Math.round(value))) }
                  })}
                />
                <NumberInput
                  label="Workers"
                  value={Number(configDialog.config?.workers || 1)}
                  min={1}
                  max={8}
                  step={1}
                  size="small"
                  fullWidth
                  onChange={(value) => setConfigDialog({
                    ...configDialog,
                    config: { ...configDialog.config, workers: Math.max(1, Math.min(8, Math.round(value))) }
                  })}
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={configDialog.config?.debug || false}
                      onChange={(e) => setConfigDialog({
                        ...configDialog,
                        config: { ...configDialog.config, debug: e.target.checked }
                      })}
                    />
                  }
                  label="Debug Mode"
                />
              </>
            )}
            {configDialog.type === 'cors' && (
              <>
                <FormControlLabel
                  control={
                    <Switch
                      checked={configDialog.config?.enabled ?? true}
                      onChange={(e) => setConfigDialog({
                        ...configDialog,
                        config: { ...configDialog.config, enabled: e.target.checked }
                      })}
                    />
                  }
                  label="Enable CORS"
                />
                <TextField
                  fullWidth
                  label="Allowed Origins (comma-separated)"
                  value={configDialog.config?.origins?.join(', ') || '*'}
                  onChange={(e) => setConfigDialog({
                    ...configDialog,
                    config: { ...configDialog.config, origins: e.target.value.split(',').map((s: string) => s.trim()) }
                  })}
                  helperText="Use * to allow all origins"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={configDialog.config?.credentials ?? true}
                      onChange={(e) => setConfigDialog({
                        ...configDialog,
                        config: { ...configDialog.config, credentials: e.target.checked }
                      })}
                    />
                  }
                  label="Allow Credentials"
                />
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfigDialog({ open: false, type: '', config: null })}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => handleUpdateConfig(configDialog.type, configDialog.config)}
            disabled={loading}
          >
            Apply
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
