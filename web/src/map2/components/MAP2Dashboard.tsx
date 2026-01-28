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
} from '@mui/material';
import {
  Close as CloseIcon,
  Dashboard as DashboardIcon,
  GraphicEq as IRIcon,
  Psychology as NAMIcon,
  Speed as MetricsIcon,
  Settings as SettingsIcon,
  AccountTree as ChainIcon,
  Extension as PluginIcon,
  Piano as MidiIcon,
  VolumeUp as AudioIcon,
  WorkHistory as WorkFlowIcon,
  Router as NetworkIcon,
  Language as WWWIcon,
  Widgets as FeaturesIcon,
} from '@mui/icons-material';

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
  const theme = useTheme();

  // Initialize WebSocket connection for real-time updates
  const { status, error } = useWebSocketConnection();

  // Show connection status notifications
  useEffect(() => {
    if (status === 'connected') {
      setWsNotification({
        open: true,
        message: 'Real-time updates connected',
        severity: 'success'
      });
    } else if (status === 'error' && error) {
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
  }, [status, error]);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  if (!open) return null;

  const tabs = [
    { label: 'Quick Access', icon: <FeaturesIcon />, component: <FeaturesPanel /> },
    { label: 'Audio', icon: <AudioIcon />, component: <AudioEngine /> },
    { label: 'Chains', icon: <ChainIcon />, component: <ChainBuilder /> },
    { label: 'Plugins', icon: <PluginIcon />, component: <PluginBrowser /> },
    { label: 'MIDI', icon: <MidiIcon />, component: <MIDIMapper /> },
    { label: 'Cabinets/IR', icon: <IRIcon />, component: <IRManager /> },
    { label: 'NAM Models', icon: <NAMIcon />, component: <NAMManager /> },
    { label: 'WorkFlow', icon: <WorkFlowIcon />, component: <WorkFlow /> },
    { label: 'Settings', icon: <SettingsIcon />, component: <SettingsPanel /> },
    { label: 'NETWORK', icon: <NetworkIcon />, component: <NetworkPanel /> },
    { label: 'WWW', icon: <WWWIcon />, component: <WWWPanel /> },
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
          <DashboardIcon sx={{ mr: 2, color: 'primary.main' }} />
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
          {onClose && (
            <IconButton onClick={onClose} color="inherit">
              <CloseIcon />
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
