/**
 * Cluster Administration Dashboard
 * 
 * Comprehensive web-based interface for managing MAP2 Audio cluster:
 * - Real-time node health monitoring with Prometheus metrics
 * - State replication (Raft consensus) status
 * - Update orchestration with snapshots & rollback
 * - Configuration distribution (GitOps)
 * - Network topology visualization
 * - Node lifecycle management (diagnostics, recovery, promotion/demotion)
 * - Disaster recovery management
 * - Event log viewer
 * 
 * Integration Features:
 * ✓ Real metric collection (CPU, Memory, DSP, Xruns)
 * ✓ Raft consensus leader tracking
 * ✓ SSH-based update execution
 * ✓ LVM snapshot management
 * ✓ Git configuration versioning
 * ✓ Hybrid SSH + API communication
 * 
 * Auto-refreshes metrics every 10 seconds
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Grid,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  IconButton,
  Chip,
  Alert,
  AlertTitle,
  CircularProgress,
  Card,
  CardContent,
  CardHeader,
  Tabs,
  Tab,
  LinearProgress,
  Tooltip,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  CloudDownload as BackupIcon,
  Upload as RestoreIcon,
  Update as UpdateIcon,
  Settings as ConfigIcon,
  Timeline as TopologyIcon,
  Event as EventIcon,
  Storage as StorageIcon,
} from '@mui/icons-material';

// ============================================================================
// Types
// ============================================================================

interface ClusterNode {
  id: string;
  hostname: string;
  ip: string;
  role: string;
  mode: string;
  status: 'online' | 'offline' | 'degraded' | 'updating' | 'rebooting';
  health_score: number;
  cpu_percent: number;
  memory_percent: number;
  dsp_load_percent?: number;  // New: DSP/audio load
  xrun_count?: number;         // New: JACK buffer underruns
  last_seen: string;
}

interface ClusterHealth {
  total_nodes: number;
  online_nodes: number;
  offline_nodes: number;
  degraded_nodes: number;
  avg_health_score: number;
  cluster_status: string;
}

interface ConsensusState {
  leader_id: string | null;
  current_term: number;
  state_hash: string;
  nodes: ConsensusNodeState[];
}

interface ConsensusNodeState {
  node_id: string;
  role: 'leader' | 'follower' | 'candidate';
  term: number;
  log_index: number;
  commit_index: number;
  state_hash: string;
}

interface UpdateStatus {
  active_count: number;
  jobs: UpdateJob[];
}

interface UpdateJob {
  node_id: string;
  status: 'pending' | 'updating' | 'validating' | 'success' | 'failed' | 'rolled_back';
  progress: number;
  start_time?: string;
  snapshot_id?: string;
  errors: string[];
}

interface ConfigDistribution {
  current_version: string;
  files: ConfigFile[];
}

interface ConfigFile {
  filename: string;
  version: string;
  size_bytes: number;
  checksum: string;
  updated_at: string;
  synced_nodes: number;
  total_nodes: number;
}

interface NetworkLink {
  source_node: string;
  target_node: string;
  latency_ms: number;
  packet_loss_percent: number;
  status: 'healthy' | 'degraded' | 'failed';
}

interface TopologyData {
  nodes: string[];
  links: NetworkLink[];
  summary: {
    total_links: number;
    healthy: number;
    degraded: number;
    failed: number;
    avg_latency_ms: number;
    health_percent: number;
  };
}

interface ClusterEvent {
  id: string;
  event_type: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  source_node_id: string;
  message: string;
  timestamp: string;
}

interface BackupManifest {
  backup_id: string;
  timestamp: string;
  backup_type: string;
  size_mb: number;
  restoration_tested: boolean;
}

// ============================================================================
// Main Component
// ============================================================================

export default function ClusterAdmin() {
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  
  // Data state
  const [nodes, setNodes] = useState<ClusterNode[]>([]);
  const [health, setHealth] = useState<ClusterHealth | null>(null);
  const [topology, setTopology] = useState<TopologyData | null>(null);
  const [events, setEvents] = useState<ClusterEvent[]>([]);
  const [backups, setBackups] = useState<BackupManifest[]>([]);
  const [consensusState, setConsensusState] = useState<ConsensusState | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [configDist, setConfigDist] = useState<ConfigDistribution | null>(null);

  // Deployment mode detection
  const [deploymentMode, setDeploymentMode] = useState<'all-in-one' | 'cluster'>('cluster');

  // API base URL
  const API_BASE = 'http://localhost:8080/api/cluster';

  // ============================================================================
  // Data Fetching
  // ============================================================================

  const fetchNodes = async () => {
    try {
      const response = await fetch(`${API_BASE}/nodes`);
      if (!response.ok) throw new Error('Failed to fetch nodes');
      const data = await response.json();
      setNodes(data.nodes || []);
      
      // Detect deployment mode
      if (data.nodes && data.nodes.length === 1 && data.nodes[0].mode === 'all-in-one') {
        setDeploymentMode('all-in-one');
      } else {
        setDeploymentMode('cluster');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const fetchHealth = async () => {
    try {
      const response = await fetch(`${API_BASE}/health`);
      if (!response.ok) throw new Error('Failed to fetch health');
      const data = await response.json();
      setHealth(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const fetchConsensus = async () => {
    try {
      const response = await fetch(`${API_BASE}/state-replication/status`);
      if (!response.ok) throw new Error('Failed to fetch consensus');
      const data = await response.json();
      setConsensusState(data);
    } catch (err) {
      // Consensus may not be available in all-in-one mode
      setConsensusState(null);
    }
  };

  const fetchUpdateStatus = async () => {
    try {
      const response = await fetch(`${API_BASE}/updates/status`);
      if (!response.ok) throw new Error('Failed to fetch update status');
      const data = await response.json();
      setUpdateStatus(data);
    } catch (err) {
      setUpdateStatus(null);
    }
  };

  const fetchConfigDistribution = async () => {
    try {
      const response = await fetch(`${API_BASE}/config/distribution-status`);
      if (!response.ok) throw new Error('Failed to fetch config status');
      const data = await response.json();
      setConfigDist(data);
    } catch (err) {
      setConfigDist(null);
    }
  };

  const fetchTopology = async () => {
    try {
      const response = await fetch(`${API_BASE}/topology`);
      if (!response.ok) throw new Error('Failed to fetch topology');
      const data = await response.json();
      setTopology(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const fetchEvents = async () => {
    try {
      const response = await fetch(`${API_BASE}/events?limit=50`);
      if (!response.ok) throw new Error('Failed to fetch events');
      const data = await response.json();
      setEvents(data.events || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const fetchBackups = async () => {
    try {
      const response = await fetch(`${API_BASE}/backup/list?limit=20`);
      if (!response.ok) throw new Error('Failed to fetch backups');
      const data = await response.json();
      setBackups(data.backups || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const fetchAllData = async () => {
    setLoading(true);
    setError(null);
    await Promise.all([
      fetchNodes(),
      fetchHealth(),
      fetchTopology(),
      fetchConsensus(),
      fetchUpdateStatus(),
      fetchConfigDistribution(),
      fetchEvents(),
      fetchBackups(),
    ]);
    setLoading(false);
  };

  // Auto-refresh every 10 seconds
  useEffect(() => {
    fetchAllData();
    
    if (autoRefresh) {
      const interval = setInterval(fetchAllData, 10000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  // ============================================================================
  // Actions
  // ============================================================================

  const handleRebootNode = async (nodeId: string) => {
    if (!confirm(`Reboot node ${nodeId}?`)) return;
    
    try {
      const response = await fetch(`${API_BASE}/nodes/${nodeId}/reboot`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Reboot failed');
      alert('Reboot initiated');
      fetchAllData();
    } catch (err) {
      alert(`Failed to reboot: ${err}`);
    }
  };

  const handleCreateBackup = async () => {
    if (!confirm('Create full cluster backup?')) return;
    
    try {
      const response = await fetch(`${API_BASE}/backup/create?backup_type=full`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Backup failed');
      alert('Backup created successfully');
      fetchBackups();
    } catch (err) {
      alert(`Backup failed: ${err}`);
    }
  };

  const handleScheduleUpdate = async () => {
    if (!confirm('Schedule cluster update for Sunday 3 AM?')) return;
    
    try {
      const response = await fetch(`${API_BASE}/update/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stagger_hours: 2 }),
      });
      if (!response.ok) throw new Error('Schedule failed');
      alert('Update scheduled');
    } catch (err) {
      alert(`Failed to schedule: ${err}`);
    }
  };

  // ============================================================================
  // Helper Functions
  // ============================================================================

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'success';
      case 'degraded': return 'warning';
      case 'offline': return 'error';
      default: return 'default';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'INFO': return 'info';
      case 'WARNING': return 'warning';
      case 'ERROR': return 'error';
      case 'CRITICAL': return 'error';
      default: return 'default';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  // ============================================================================
  // Render: Cluster Overview Tab
  // ============================================================================

  const renderOverviewTab = () => (
    <Box>
      {/* Deployment Mode Banner */}
      {deploymentMode === 'all-in-one' && (
        <Alert severity="info" sx={{ mb: 3 }}>
          <AlertTitle>All-In-One Mode</AlertTitle>
          Running in single-node mode. Cluster features are disabled.
        </Alert>
      )}

      {/* Health Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Total Nodes
              </Typography>
              <Typography variant="h3">
                {health?.total_nodes || 0}
              </Typography>
              <Typography variant="caption" color="textSecondary">
                {deploymentMode === 'all-in-one' ? 'All-In-One' : 'Cluster Mode'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Online Nodes
              </Typography>
              <Typography variant="h3" color="success.main">
                {health?.online_nodes || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Avg Health Score
              </Typography>
              <Typography variant="h3">
                {health?.avg_health_score?.toFixed(0) || 0}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Cluster Status
              </Typography>
              <Chip
                label={health?.cluster_status || 'Unknown'}
                color={getStatusColor(health?.cluster_status || 'offline')}
                sx={{ mt: 1 }}
              />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Consensus Status (Cluster mode only) */}
      {deploymentMode === 'cluster' && consensusState && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Consensus Leader
                </Typography>
                <Typography variant="h6">
                  {consensusState.leader_id || 'None'}
                </Typography>
                <Typography variant="caption">
                  Term: {consensusState.current_term}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Configuration Version
                </Typography>
                <Typography variant="h6">
                  {configDist?.current_version || 'Unknown'}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Active Updates
                </Typography>
                <Typography variant="h6">
                  {updateStatus?.active_count || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Alerts */}
      {health && health.degraded_nodes > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <AlertTitle>Warning</AlertTitle>
          {health.degraded_nodes} node(s) are degraded. Check node health for details.
        </Alert>
      )}

      {health && health.offline_nodes > 0 && (
        <Alert severity="error" sx={{ mb: 3 }}>
          <AlertTitle>Critical</AlertTitle>
          {health.offline_nodes} node(s) are offline. Immediate attention required.
        </Alert>
      )}

      {/* Nodes Table */}
      <Paper sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6">Cluster Nodes</Typography>
          <Button
            startIcon={<RefreshIcon />}
            onClick={fetchAllData}
            disabled={loading}
          >
            Refresh
          </Button>
        </Box>
        
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Node ID</TableCell>
                <TableCell>Hostname</TableCell>
                <TableCell>IP Address</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Health</TableCell>
                <TableCell>CPU</TableCell>
                <TableCell>Memory</TableCell>
                <TableCell>DSP Load</TableCell>
                <TableCell>Xruns</TableCell>
                <TableCell>Last Seen</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {nodes.map((node) => (
                <TableRow key={node.id}>
                  <TableCell>{node.id}</TableCell>
                  <TableCell>{node.hostname}</TableCell>
                  <TableCell>{node.ip}</TableCell>
                  <TableCell>
                    <Chip label={node.role} size="small" />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={node.status}
                      color={getStatusColor(node.status)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Box sx={{ width: '100%', mr: 1 }}>
                        <LinearProgress
                          variant="determinate"
                          value={node.health_score}
                          color={
                            node.health_score > 80 ? 'success' :
                            node.health_score > 50 ? 'warning' : 'error'
                          }
                        />
                      </Box>
                      <Box sx={{ minWidth: 35 }}>
                        <Typography variant="body2" color="textSecondary">
                          {node.health_score}%
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>{node.cpu_percent?.toFixed(1)}%</TableCell>
                  <TableCell>{node.memory_percent?.toFixed(1)}%</TableCell>
                  <TableCell>
                    <Tooltip title="DSP/Audio Load">
                      <span>{node.dsp_load_percent?.toFixed(1) || 'N/A'}%</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Tooltip title="JACK Buffer Underruns">
                      <Chip
                        label={node.xrun_count || 0}
                        size="small"
                        color={(node.xrun_count || 0) > 0 ? 'warning' : 'success'}
                      />
                    </Tooltip>
                  </TableCell>
                  <TableCell>{formatTimestamp(node.last_seen)}</TableCell>
                  <TableCell>
                    <Tooltip title="Reboot Node">
                      <IconButton
                        size="small"
                        onClick={() => handleRebootNode(node.id)}
                      >
                        <RefreshIcon />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );

  // ============================================================================
  // Render: Consensus Tab
  // ============================================================================

  const renderConsensusTab = () => (
    <Box>
      {deploymentMode === 'all-in-one' ? (
        <Alert severity="info">
          Consensus features are only available in cluster mode
        </Alert>
      ) : (
        <>
          {/* Consensus Overview */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>
                    Current Leader
                  </Typography>
                  <Typography variant="h5">
                    {consensusState?.leader_id || 'None'}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>
                    Current Term
                  </Typography>
                  <Typography variant="h5">
                    {consensusState?.current_term || 0}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography color="textSecondary" gutterBottom>
                    State Hash
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {consensusState?.state_hash?.substring(0, 12) || 'N/A'}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Consensus Nodes Table */}
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Node Replication Status</Typography>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Node ID</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>Term</TableCell>
                    <TableCell>Log Index</TableCell>
                    <TableCell>Commit Index</TableCell>
                    <TableCell>State Hash</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {consensusState?.nodes.map((node) => (
                    <TableRow key={node.node_id}>
                      <TableCell>{node.node_id}</TableCell>
                      <TableCell>
                        <Chip 
                          label={node.role}
                          color={node.role === 'leader' ? 'primary' : 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{node.term}</TableCell>
                      <TableCell>{node.log_index}</TableCell>
                      <TableCell>{node.commit_index}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        {node.state_hash?.substring(0, 12)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      )}
    </Box>
  );

  // ============================================================================
  // Render: Updates Tab
  // ============================================================================

  const renderUpdatesTab = () => (
    <Box>
      {/* Active Updates Summary */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Active Updates
              </Typography>
              <Typography variant="h4">
                {updateStatus?.active_count || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Button
                variant="contained"
                startIcon={<UpdateIcon />}
                onClick={handleScheduleUpdate}
                sx={{ mr: 2 }}
              >
                Schedule Update
              </Button>
              <Typography variant="caption" color="textSecondary" sx={{ ml: 2 }}>
                Updates include LVM snapshots and automatic rollback
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Update Jobs Table */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Update Orchestration Status</Typography>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Node ID</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Progress</TableCell>
                <TableCell>Started</TableCell>
                <TableCell>Snapshot ID</TableCell>
                <TableCell>Errors</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {updateStatus?.jobs && updateStatus.jobs.length > 0 ? (
                updateStatus.jobs.map((job) => (
                  <TableRow key={job.node_id}>
                    <TableCell>{job.node_id}</TableCell>
                    <TableCell>
                      <Chip
                        label={job.status}
                        color={
                          job.status === 'success' ? 'success' :
                          job.status === 'failed' ? 'error' :
                          job.status === 'rolled_back' ? 'warning' :
                          'default'
                        }
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Box sx={{ width: '100%', mr: 1 }}>
                          <LinearProgress variant="determinate" value={job.progress} />
                        </Box>
                        <Box sx={{ minWidth: 35 }}>
                          <Typography variant="body2">{job.progress}%</Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>{job.start_time ? formatTimestamp(job.start_time) : 'N/A'}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      {job.snapshot_id || 'None'}
                    </TableCell>
                    <TableCell>
                      {job.errors.length > 0 ? (
                        <Tooltip title={job.errors.join(', ')}>
                          <Chip label={job.errors.length} color="error" size="small" />
                        </Tooltip>
                      ) : (
                        '0'
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <Typography color="textSecondary">No active updates</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );

  // ============================================================================
  // Render: Configuration Tab
  // ============================================================================

  const renderConfigTab = () => (
    <Box>
      {/* Config Overview */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Current Version
              </Typography>
              <Typography variant="h5">
                {configDist?.current_version || 'Unknown'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Button
                variant="contained"
                startIcon={<ConfigIcon />}
                onClick={async () => {
                  try {
                    const response = await fetch(`${API_BASE}/config/distribute`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ verify_checksums: true, reload_services: true }),
                    });
                    if (!response.ok) throw new Error('Distribution failed');
                    alert('Configuration distributed successfully');
                    fetchConfigDistribution();
                  } catch (err) {
                    alert(`Failed to distribute config: ${err}`);
                  }
                }}
              >
                Distribute Configuration
              </Button>
              <Typography variant="caption" color="textSecondary" sx={{ ml: 2 }}>
                GitOps-style distribution with SHA256 verification
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Configuration Files Table */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Configuration Files</Typography>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Filename</TableCell>
                <TableCell>Version</TableCell>
                <TableCell>Size</TableCell>
                <TableCell>Checksum</TableCell>
                <TableCell>Last Updated</TableCell>
                <TableCell>Synced Nodes</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {configDist?.files && configDist.files.length > 0 ? (
                configDist.files.map((file) => (
                  <TableRow key={file.filename}>
                    <TableCell>{file.filename}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      {file.version}
                    </TableCell>
                    <TableCell>{(file.size_bytes / 1024).toFixed(1)} KB</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      {file.checksum?.substring(0, 12)}
                    </TableCell>
                    <TableCell>{formatTimestamp(file.updated_at)}</TableCell>
                    <TableCell>
                      <Chip
                        label={`${file.synced_nodes}/${file.total_nodes}`}
                        color={file.synced_nodes === file.total_nodes ? 'success' : 'warning'}
                        size="small"
                      />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <Typography color="textSecondary">No configuration files tracked</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );

  // ============================================================================
  // Render: Network Topology Tab
  // ============================================================================

  const renderTopologyTab = () => (
    <Box>
      {/* Topology Summary */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Total Links
              </Typography>
              <Typography variant="h4">
                {topology?.summary.total_links || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Avg Latency
              </Typography>
              <Typography variant="h4">
                {topology?.summary.avg_latency_ms?.toFixed(2) || 0} ms
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Network Health
              </Typography>
              <Typography variant="h4">
                {topology?.summary.health_percent?.toFixed(0) || 0}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Failed Links
              </Typography>
              <Typography variant="h4" color="error.main">
                {topology?.summary.failed || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Network Links Table */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Network Links</Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Source</TableCell>
                <TableCell>Target</TableCell>
                <TableCell>Latency (ms)</TableCell>
                <TableCell>Packet Loss (%)</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {topology?.links.map((link, idx) => (
                <TableRow key={idx}>
                  <TableCell>{link.source_node}</TableCell>
                  <TableCell>{link.target_node}</TableCell>
                  <TableCell>{link.latency_ms.toFixed(2)}</TableCell>
                  <TableCell>{link.packet_loss_percent.toFixed(2)}</TableCell>
                  <TableCell>
                    <Chip
                      label={link.status}
                      color={getStatusColor(link.status)}
                      size="small"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );

  // ============================================================================
  // Render: Events Tab
  // ============================================================================

  const renderEventsTab = () => (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Recent Events</Typography>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Timestamp</TableCell>
              <TableCell>Severity</TableCell>
              <TableCell>Source</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Message</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {events.map((event) => (
              <TableRow key={event.id}>
                <TableCell>{formatTimestamp(event.timestamp)}</TableCell>
                <TableCell>
                  <Chip
                    label={event.severity}
                    color={getSeverityColor(event.severity)}
                    size="small"
                  />
                </TableCell>
                <TableCell>{event.source_node_id}</TableCell>
                <TableCell>{event.event_type}</TableCell>
                <TableCell>{event.message}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );

  // ============================================================================
  // Render: Backup & Recovery Tab
  // ============================================================================

  const renderBackupTab = () => (
    <Box>
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <Button
            variant="contained"
            startIcon={<BackupIcon />}
            onClick={handleCreateBackup}
          >
            Create Backup
          </Button>
          <Button
            variant="outlined"
            startIcon={<UpdateIcon />}
            onClick={handleScheduleUpdate}
          >
            Schedule Update
          </Button>
        </Box>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Available Backups</Typography>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Backup ID</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Size (MB)</TableCell>
                <TableCell>Tested</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {backups.map((backup) => (
                <TableRow key={backup.backup_id}>
                  <TableCell>{backup.backup_id}</TableCell>
                  <TableCell>
                    <Chip label={backup.backup_type} size="small" />
                  </TableCell>
                  <TableCell>{formatTimestamp(backup.timestamp)}</TableCell>
                  <TableCell>{backup.size_mb}</TableCell>
                  <TableCell>
                    {backup.restoration_tested ? '✓' : '✗'}
                  </TableCell>
                  <TableCell>
                    <Tooltip title="Restore from this backup">
                      <IconButton size="small">
                        <RestoreIcon />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );

  // ============================================================================
  // Main Render
  // ============================================================================

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Cluster Administration
        </Typography>
        <Typography variant="body2" color="textSecondary">
          Manage your MAP2 Audio cluster infrastructure
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Paper sx={{ mb: 3 }}>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
          <Tab label="Overview" icon={<StorageIcon />} iconPosition="start" />
          {deploymentMode === 'cluster' && (
            <Tab label="Consensus" icon={<TopologyIcon />} iconPosition="start" />
          )}
          {deploymentMode === 'cluster' && (
            <Tab label="Updates" icon={<UpdateIcon />} iconPosition="start" />
          )}
          {deploymentMode === 'cluster' && (
            <Tab label="Configuration" icon={<ConfigIcon />} iconPosition="start" />
          )}
          <Tab label="Network Topology" icon={<TopologyIcon />} iconPosition="start" />
          <Tab label="Events" icon={<EventIcon />} iconPosition="start" />
          <Tab label="Backup & Recovery" icon={<BackupIcon />} iconPosition="start" />
        </Tabs>
      </Paper>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      <Box>
        {activeTab === 0 && renderOverviewTab()}
        {deploymentMode === 'cluster' && activeTab === 1 && renderConsensusTab()}
        {deploymentMode === 'cluster' && activeTab === 2 && renderUpdatesTab()}
        {deploymentMode === 'cluster' && activeTab === 3 && renderConfigTab()}
        {activeTab === (deploymentMode === 'cluster' ? 4 : 1) && renderTopologyTab()}
        {activeTab === (deploymentMode === 'cluster' ? 5 : 2) && renderEventsTab()}
        {activeTab === (deploymentMode === 'cluster' ? 6 : 3) && renderBackupTab()}
      </Box>
    </Container>
  );
}
