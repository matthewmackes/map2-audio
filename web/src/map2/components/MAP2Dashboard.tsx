// ============================================================================
// MAP2 Audio Platform - Main Dashboard Component
// Comprehensive dashboard with all MAP2-specific features
// ============================================================================

import React, { useState, useEffect } from 'react';
import {
  Box,
  Tabs,
  Tab,
  Paper,
  Typography,
  AppBar,
  Toolbar,
  IconButton,
  useTheme,
  alpha,
  Snackbar,
  Alert,
  Chip,
} from '@mui/material';
import {
  AppConnectivity,
  Close,
  Dashboard,
  Earth,
  Equalizer,
  FlowConnection,
  MachineLearningModel,
  Music,
  Router,
  Settings,
  VolumeUp,
  WorkflowAutomation,
} from '@carbon/icons-react';

import IRManager from './IRManager';
import NAMManager from './NAMManager';
import MetricsDashboard from './MetricsDashboard';
import SettingsPanel from './SettingsPanel';
import ChainBuilder from './ChainBuilder';
import PluginBrowser from './PluginBrowser';
import MIDIMapper from './MIDIMapper';
import AudioEngine from './AudioEngine';
import WorkFlow from './WorkFlow';
import NetworkPanel from './NetworkPanel';
import WWWPanel from './WWWPanel';
import FeaturesPanel from './FeaturesPanel';
import { FeatureStatusBar } from './FeaturesPanel';
import { useWebSocketConnection, useWebSocketStatus } from '../hooks/useWebSocket';
import { API_BASE } from '../api';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`map2-tabpanel-${index}`}
      aria-labelledby={`map2-tab-${index}`}
      style={{ height: '100%', overflow: 'hidden' }}
      {...other}
    >
      {value === index && (
        <Box sx={{ height: '100%', overflow: 'auto' }}>{children}</Box>
      )}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `map2-tab-${index}`,
    'aria-controls': `map2-tabpanel-${index}`,
  };
}

interface MAP2DashboardProps {
  open?: boolean;
  onClose?: () => void;
  initialTab?: number;
}

export default function MAP2Dashboard({ open = true, onClose, initialTab = 0 }: MAP2DashboardProps) {
  const [tabValue, setTabValue] = useState(initialTab);
  const [wsNotification, setWsNotification] = useState<{open: boolean; message: string; severity: 'success' | 'error' | 'info'}>({
    open: false,
    message: '',
    severity: 'info'
  });
  const [avbStatus, setAvbStatus] = useState<{ state: string; available: boolean; interfaceName: string; reason: string | null }>({
    state: 'unknown',
    available: false,
    interfaceName: '',
    reason: null,
  });
  const theme = useTheme();

  // Initialize WebSocket connection for real-time updates
  const { status } = useWebSocketConnection();

  // Show connection status notifications
  useEffect(() => {
    if (status === 'connected') {
      setWsNotification({
        open: true,
        message: 'Real-time updates connected',
        severity: 'success'
      });
    } else if (status === 'error') {
      setWsNotification({
        open: true,
        message: 'WebSocket connection failed',
        severity: 'error'
      });
    } else if (status === 'reconnecting') {
      setWsNotification({
        open: true,
        message: 'Reconnecting to server...',
        severity: 'info'
      });
    }
  }, [status]);

  useEffect(() => {
    if (typeof fetch !== 'function') return;
    let cancelled = false;
    let timer: number | undefined;

    const pullStatus = async () => {
      try {
        const response = await fetch(`${API_BASE}/avb/status`);
        if (!response.ok && response.status !== 503) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = await response.json();
        if (cancelled) return;
        setAvbStatus({
          state: String(payload?.state || 'unknown'),
          available: Boolean(payload?.available),
          interfaceName: String(payload?.interface || ''),
          reason: payload?.reason ? String(payload.reason) : null,
        });
      } catch {
        if (cancelled) return;
        setAvbStatus({
          state: 'unreachable',
          available: false,
          interfaceName: '',
          reason: 'AVB status API unreachable',
        });
      }
    };

    const poll = async () => {
      await pullStatus();
      if (!cancelled) {
        timer = window.setTimeout(poll, 5000);
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  if (!open) return null;

  const avbChipColor = (
    avbStatus.state === 'operational'
      ? 'success'
      : avbStatus.state === 'degraded'
        ? 'warning'
        : avbStatus.state === 'disabled'
          ? 'default'
          : 'error'
  ) as 'default' | 'success' | 'warning' | 'error';
  const avbChipTitle = avbStatus.reason || (avbStatus.interfaceName ? `Interface ${avbStatus.interfaceName}` : 'AVB interface not configured');

  const tabs = [
    { label: 'Quick Access', icon: <AppConnectivity size={18} />, component: <FeaturesPanel /> },
    { label: 'Audio', icon: <VolumeUp size={18} />, component: <AudioEngine /> },
    { label: 'Chains', icon: <FlowConnection size={18} />, component: <ChainBuilder /> },
    { label: 'Plugins', icon: <AppConnectivity size={18} />, component: <PluginBrowser /> },
    { label: 'MIDI', icon: <Music size={18} />, component: <MIDIMapper /> },
    { label: 'Cabinets/IR', icon: <Equalizer size={18} />, component: <IRManager /> },
    { label: 'NAM Models', icon: <MachineLearningModel size={18} />, component: <NAMManager /> },
    { label: 'WorkFlow', icon: <WorkflowAutomation size={18} />, component: <WorkFlow /> },
    { label: 'Settings', icon: <Settings size={18} />, component: <SettingsPanel /> },
    { label: 'NETWORK', icon: <Router size={18} />, component: <NetworkPanel /> },
    { label: 'WWW', icon: <Earth size={18} />, component: <WWWPanel /> },
  ];

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1300,
        bgcolor: 'background.default',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <AppBar position="static" elevation={0} sx={{ bgcolor: 'background.paper' }}>
        <Toolbar>
          <Box component="span" sx={{ mr: 2, color: 'primary.main', display: 'inline-flex', lineHeight: 0 }}>
            <Dashboard size={24} />
          </Box>
          <Typography
            variant="h6"
            sx={{
              flexGrow: 1,
              fontWeight: 700,
              background: 'linear-gradient(135deg, #A770E4 0%, #FF6060 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            MAP2 Audio Dashboard
          </Typography>
          <Chip
            size="small"
            color={avbChipColor}
            label={`AVB: ${avbStatus.state}`}
            title={avbChipTitle}
            sx={{ mr: 1, fontWeight: 600 }}
          />
          {onClose && (
            <IconButton onClick={onClose} color="inherit">
              <Close size={20} />
            </IconButton>
          )}
        </Toolbar>
      </AppBar>

      {/* Tabs */}
      <Paper
        elevation={0}
        sx={{
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: alpha(theme.palette.background.paper, 0.8),
        }}
      >
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          aria-label="MAP2 Dashboard tabs"
          sx={{
            '& .MuiTab-root': {
              minHeight: 64,
              textTransform: 'none',
              fontWeight: 500,
            },
            '& .Mui-selected': {
              color: 'primary.main',
            },
          }}
        >
          {tabs.map((tab, index) => (
            <Tab
              key={index}
              icon={tab.icon}
              label={tab.label}
              {...a11yProps(index)}
              iconPosition="start"
            />
          ))}
        </Tabs>
      </Paper>

      {/* Tab Panels */}
      <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
        {tabs.map((tab, index) => (
          <TabPanel key={index} value={tabValue} index={index}>
            {tab.component}
          </TabPanel>
        ))}
      </Box>

      {/* WebSocket Status Notifications */}
      <Snackbar
        open={wsNotification.open}
        autoHideDuration={3000}
        onClose={() => setWsNotification({ ...wsNotification, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setWsNotification({ ...wsNotification, open: false })}
          severity={wsNotification.severity}
          variant="filled"
        >
          {wsNotification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
