// ============================================================================
// MAP2 Audio Platform - MIDI Configuration Component
// MIDI routing, filtering, mapping, and device management
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Alert,
  CircularProgress,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Tooltip,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemSecondaryAction,
  Divider,
  Switch,
  FormControlLabel,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  Grid,
  Checkbox,
  LinearProgress,
} from '@mui/material';
import { NumberInput } from './NumberInput';
import {
  Delete as DeleteIcon,
  Add as AddIcon,
  Refresh as RefreshIcon,
  RadioButtonChecked as LearnIcon,
  Usb as MidiIcon,
  PlayArrow as StartIcon,
  Stop as StopIcon,
  AccountTree as RoutingIcon,
  FilterList as FilterIcon,
  SwapHoriz as MappingIcon,
  Collections as PresetIcon,
  Monitor as MonitorIcon,
  Schedule as ClockIcon,
  Save as SaveIcon,
  Upload as UploadIcon,
  Download as DownloadIcon,
  Clear as ClearIcon,
  Input as InputIcon,
  Output as OutputIcon,
  ArrowForward as ArrowIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { midiApi, pluginsApi } from '../api';
import type { MIDIMapping, MIDIDevice, Plugin } from '../types';
import { getDisplayPluginName } from '../displayNames';

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
      id={`midi-tabpanel-${index}`}
      aria-labelledby={`midi-tab-${index}`}
      style={{ height: '100%', display: value === index ? 'flex' : 'none', flexDirection: 'column' }}
      {...other}
    >
      {value === index && <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>{children}</Box>}
    </div>
  );
}

// Local state types
interface MIDIRoute {
  id: number;
  inputPort: string;
  outputPort: string;
  channel: number | 'all';
  enabled: boolean;
}

interface MIDIFilterConfig {
  noteOn: boolean;
  noteOff: boolean;
  cc: boolean;
  programChange: boolean;
  pitchBend: boolean;
  aftertouch: boolean;
  sysex: boolean;
  clock: boolean;
  channels: boolean[];
}

interface MIDIPreset {
  id: number;
  name: string;
  description: string;
  mappingCount: number;
  routeCount: number;
}

interface MIDIMessage {
  id: number;
  timestamp: string;
  type: string;
  channel: number;
  data1: number;
  data2?: number;
  port: string;
}

export default function MIDIMapper() {
  const [tabValue, setTabValue] = useState(0);
  const [mappings, setMappings] = useState<MIDIMapping[]>([]);
  const [devices, setDevices] = useState<{ inputs: MIDIDevice[]; outputs: MIDIDevice[] }>({ inputs: [], outputs: [] });
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [midiStarted, setMidiStarted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [learnMode, setLearnMode] = useState(false);

  // Add mapping dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newMapping, setNewMapping] = useState({
    channel: 1,
    cc: 1,
    targetUri: '',
    paramIndex: 0,
  });

  // Routing state (local UI state)
  const [routes, setRoutes] = useState<MIDIRoute[]>([
    { id: 1, inputPort: 'Virtual Input 1', outputPort: 'Virtual Output 1', channel: 'all', enabled: true },
  ]);
  const [routeDialogOpen, setRouteDialogOpen] = useState(false);
  const [newRoute, setNewRoute] = useState({ inputPort: '', outputPort: '', channel: 'all' as number | 'all' });

  // Filter state (local UI state)
  const [filterConfig, setFilterConfig] = useState<MIDIFilterConfig>({
    noteOn: true,
    noteOff: true,
    cc: true,
    programChange: true,
    pitchBend: true,
    aftertouch: true,
    sysex: false,
    clock: false,
    channels: Array(16).fill(true),
  });

  // Preset state (local UI state)
  const [presets, setPresets] = useState<MIDIPreset[]>([
    { id: 1, name: 'Default', description: 'Default MIDI configuration', mappingCount: 0, routeCount: 1 },
  ]);
  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  // Monitor state (local UI state)
  const [monitorMessages, setMonitorMessages] = useState<MIDIMessage[]>([]);
  const [monitorActive, setMonitorActive] = useState(false);
  const [monitorFilter, setMonitorFilter] = useState({ port: 'all', channel: 'all', type: 'all' });
  const messageIdRef = useRef(0);

  // Clock state (local UI state)
  const [clockConfig, setClockConfig] = useState({
    mode: 'internal' as 'internal' | 'external',
    bpm: 120,
    running: false,
    sendClock: true,
    receiveClock: true,
  });

  // Load data
  const loadData = useCallback(async () => {
    try {
      const [mappingsRes, devicesRes, pluginsRes] = await Promise.all([
        midiApi.getMappings(),
        midiApi.getDevices(),
        pluginsApi.list(),
      ]);

      setMappings(mappingsRes.mappings || []);
      setDevices(devicesRes);
      setPlugins(pluginsRes.loaded || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load MIDI data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Simulate MIDI monitor messages when active
  useEffect(() => {
    if (!monitorActive || !midiStarted) return;

    const interval = setInterval(() => {
      const types = ['Note On', 'Note Off', 'CC', 'Program Change', 'Pitch Bend'];
      const type = types[Math.floor(Math.random() * types.length)];
      const newMessage: MIDIMessage = {
        id: messageIdRef.current++,
        timestamp: new Date().toLocaleTimeString(),
        type,
        channel: Math.floor(Math.random() * 16) + 1,
        data1: Math.floor(Math.random() * 128),
        data2: type !== 'Program Change' ? Math.floor(Math.random() * 128) : undefined,
        port: devices.inputs[0]?.name || 'Virtual Input 1',
      };
      setMonitorMessages(prev => [newMessage, ...prev].slice(0, 100));
    }, 500);

    return () => clearInterval(interval);
  }, [monitorActive, midiStarted, devices.inputs]);

  // Start MIDI
  const handleStartMidi = async () => {
    try {
      await midiApi.start();
      setMidiStarted(true);
      await loadData();
      setSuccess('MIDI engine started');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start MIDI');
    }
  };

  // Stop MIDI
  const handleStopMidi = async () => {
    try {
      await midiApi.stop();
      setMidiStarted(false);
      setMonitorActive(false);
      await loadData();
      setSuccess('MIDI engine stopped');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop MIDI');
    }
  };

  // Add mapping
  const handleAddMapping = async () => {
    try {
      await midiApi.addMapping(
        newMapping.channel,
        newMapping.cc,
        newMapping.targetUri,
        newMapping.paramIndex
      );
      setAddDialogOpen(false);
      setNewMapping({ channel: 1, cc: 1, targetUri: '', paramIndex: 0 });
      await loadData();
      setSuccess('Mapping added');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add mapping');
    }
  };

  // Start learn mode
  const handleStartLearn = async (targetUri: string, paramIndex: number) => {
    try {
      await midiApi.startLearn(targetUri, paramIndex);
      setLearnMode(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start learn mode');
    }
  };

  // Delete mapping
  const handleDeleteMapping = async (mappingId: number) => {
    try {
      await midiApi.deleteMapping(mappingId);
      await loadData();
      setSuccess('Mapping deleted');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete mapping');
    }
  };

  // Add route (local state)
  const handleAddRoute = () => {
    if (!newRoute.inputPort || !newRoute.outputPort) return;
    setRoutes(prev => [...prev, {
      id: Date.now(),
      inputPort: newRoute.inputPort,
      outputPort: newRoute.outputPort,
      channel: newRoute.channel,
      enabled: true,
    }]);
    setRouteDialogOpen(false);
    setNewRoute({ inputPort: '', outputPort: '', channel: 'all' });
    setSuccess('Route added');
  };

  // Delete route (local state)
  const handleDeleteRoute = (id: number) => {
    setRoutes(prev => prev.filter(r => r.id !== id));
    setSuccess('Route deleted');
  };

  // Toggle route enabled (local state)
  const handleToggleRoute = (id: number) => {
    setRoutes(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  // Save preset (local state)
  const handleSavePreset = () => {
    if (!newPresetName.trim()) return;
    setPresets(prev => [...prev, {
      id: Date.now(),
      name: newPresetName,
      description: `Saved on ${new Date().toLocaleDateString()}`,
      mappingCount: mappings.length,
      routeCount: routes.length,
    }]);
    setPresetDialogOpen(false);
    setNewPresetName('');
    setSuccess('Preset saved');
  };

  // Delete preset (local state)
  const handleDeletePreset = (id: number) => {
    setPresets(prev => prev.filter(p => p.id !== id));
    setSuccess('Preset deleted');
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'row' }}>
      {/* Left Sidebar - Vertical Tabs */}
      <Paper
        elevation={0}
        sx={{
          width: 200,
          borderRight: 1,
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="subtitle1" fontWeight="bold">
            MIDI Configuration
          </Typography>
        </Box>
        <Tabs
          orientation="vertical"
          value={tabValue}
          onChange={(_, newValue) => setTabValue(newValue)}
          sx={{
            '& .MuiTab-root': {
              alignItems: 'flex-start',
              textAlign: 'left',
              minHeight: 48,
              px: 2,
            },
          }}
        >
          <Tab icon={<MidiIcon />} iconPosition="start" label="Devices" />
          <Tab icon={<RoutingIcon />} iconPosition="start" label="Routing" />
          <Tab icon={<FilterIcon />} iconPosition="start" label="Filters" />
          <Tab icon={<MappingIcon />} iconPosition="start" label="CC Mapping" />
          <Tab icon={<PresetIcon />} iconPosition="start" label="Presets" />
          <Tab icon={<MonitorIcon />} iconPosition="start" label="Monitor" />
          <Tab icon={<ClockIcon />} iconPosition="start" label="Clock" />
        </Tabs>
      </Paper>

      {/* Main Content Area */}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {['MIDI Devices', 'MIDI Routing', 'MIDI Filters', 'CC Mapping', 'MIDI Presets', 'MIDI Monitor', 'MIDI Clock'][tabValue]}
          </Typography>
          <Chip
            label={midiStarted ? 'Engine Running' : 'Engine Stopped'}
            color={midiStarted ? 'success' : 'default'}
            size="small"
          />
          <Button
            variant={midiStarted ? 'outlined' : 'contained'}
            startIcon={midiStarted ? <StopIcon /> : <StartIcon />}
            onClick={midiStarted ? handleStopMidi : handleStartMidi}
            color={midiStarted ? 'error' : 'success'}
            size="small"
          >
            {midiStarted ? 'Stop' : 'Start'}
          </Button>
          <IconButton onClick={loadData} size="small">
            <RefreshIcon />
          </IconButton>
        </Box>

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

        {/* Learn Mode Alert */}
        {learnMode && (
          <Alert
            severity="info"
            sx={{ m: 2 }}
            action={
              <Button color="inherit" size="small" onClick={() => setLearnMode(false)}>
                Cancel
              </Button>
            }
          >
            Learn mode active: Move a MIDI controller to map it
          </Alert>
        )}

        {/* Tab Content */}
        <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
          {/* Tab 0: Devices */}
          <TabPanel value={tabValue} index={0}>
            <Box sx={{ p: 2, overflow: 'auto' }}>
              <Stack spacing={3}>
                <Card variant="outlined">
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                      <InputIcon color="primary" />
                      <Typography variant="subtitle1" fontWeight="bold">
                        Input Devices ({devices.inputs.length})
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {devices.inputs.length > 0 ? (
                        devices.inputs.map((device) => (
                          <Chip
                            key={device.id}
                            icon={<MidiIcon />}
                            label={device.name}
                            color={device.connected ? 'success' : 'default'}
                            variant={device.connected ? 'filled' : 'outlined'}
                          />
                        ))
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          No MIDI input devices detected
                        </Typography>
                      )}
                    </Stack>
                  </CardContent>
                </Card>

                <Card variant="outlined">
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                      <OutputIcon color="primary" />
                      <Typography variant="subtitle1" fontWeight="bold">
                        Output Devices ({devices.outputs.length})
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {devices.outputs.length > 0 ? (
                        devices.outputs.map((device) => (
                          <Chip
                            key={device.id}
                            icon={<MidiIcon />}
                            label={device.name}
                            color={device.connected ? 'success' : 'default'}
                            variant={device.connected ? 'filled' : 'outlined'}
                          />
                        ))
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          No MIDI output devices detected
                        </Typography>
                      )}
                    </Stack>
                  </CardContent>
                </Card>

                <Card variant="outlined">
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                      <SettingsIcon color="primary" />
                      <Typography variant="subtitle1" fontWeight="bold">
                        Device Settings
                      </Typography>
                    </Box>
                    <FormControlLabel
                      control={<Switch checked={midiStarted} onChange={midiStarted ? handleStopMidi : handleStartMidi} />}
                      label="Auto-start MIDI on boot"
                    />
                    <FormControlLabel
                      control={<Switch defaultChecked />}
                      label="Auto-detect new devices"
                    />
                  </CardContent>
                </Card>
              </Stack>
            </Box>
          </TabPanel>

          {/* Tab 1: Routing */}
          <TabPanel value={tabValue} index={1}>
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => setRouteDialogOpen(true)}
                  disabled={!midiStarted}
                >
                  Add Route
                </Button>
              </Box>
              <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
                <Stack spacing={2}>
                  {routes.map((route) => (
                    <Card key={route.id} variant="outlined" sx={{ opacity: route.enabled ? 1 : 0.5 }}>
                      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1 }}>
                        <Switch
                          checked={route.enabled}
                          onChange={() => handleToggleRoute(route.id)}
                          size="small"
                        />
                        <Chip icon={<InputIcon />} label={route.inputPort} size="small" />
                        <ArrowIcon color="action" />
                        <Chip icon={<OutputIcon />} label={route.outputPort} size="small" color="primary" />
                        <Chip
                          label={route.channel === 'all' ? 'All Channels' : `CH ${route.channel}`}
                          size="small"
                          variant="outlined"
                        />
                        <Box sx={{ flexGrow: 1 }} />
                        <IconButton size="small" color="error" onClick={() => handleDeleteRoute(route.id)}>
                          <DeleteIcon />
                        </IconButton>
                      </CardContent>
                    </Card>
                  ))}
                  {routes.length === 0 && (
                    <Alert severity="info">
                      No MIDI routes configured. Click "Add Route" to create one.
                    </Alert>
                  )}
                </Stack>
              </Box>
            </Box>
          </TabPanel>

          {/* Tab 2: Filters */}
          <TabPanel value={tabValue} index={2}>
            <Box sx={{ p: 2, overflow: 'auto' }}>
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                        Message Type Filter
                      </Typography>
                      <Stack spacing={1}>
                        {[
                          { key: 'noteOn', label: 'Note On' },
                          { key: 'noteOff', label: 'Note Off' },
                          { key: 'cc', label: 'Control Change (CC)' },
                          { key: 'programChange', label: 'Program Change' },
                          { key: 'pitchBend', label: 'Pitch Bend' },
                          { key: 'aftertouch', label: 'Aftertouch' },
                          { key: 'sysex', label: 'System Exclusive' },
                          { key: 'clock', label: 'MIDI Clock' },
                        ].map(({ key, label }) => (
                          <FormControlLabel
                            key={key}
                            control={
                              <Checkbox
                                checked={filterConfig[key as keyof MIDIFilterConfig] as boolean}
                                onChange={(e) => setFilterConfig(prev => ({ ...prev, [key]: e.target.checked }))}
                                size="small"
                              />
                            }
                            label={label}
                          />
                        ))}
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                        Channel Filter
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {filterConfig.channels.map((enabled, idx) => (
                          <Chip
                            key={idx}
                            label={idx + 1}
                            size="small"
                            color={enabled ? 'primary' : 'default'}
                            variant={enabled ? 'filled' : 'outlined'}
                            onClick={() => {
                              const newChannels = [...filterConfig.channels];
                              newChannels[idx] = !newChannels[idx];
                              setFilterConfig(prev => ({ ...prev, channels: newChannels }));
                            }}
                            sx={{ minWidth: 36 }}
                          />
                        ))}
                      </Box>
                      <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                        <Button size="small" variant="outlined" onClick={() => setFilterConfig(prev => ({ ...prev, channels: Array(16).fill(true) }))}>
                          All
                        </Button>
                        <Button size="small" variant="outlined" onClick={() => setFilterConfig(prev => ({ ...prev, channels: Array(16).fill(false) }))}>
                          None
                        </Button>
                      </Box>
                    </CardContent>
                  </Card>
                  <Card variant="outlined" sx={{ mt: 2 }}>
                    <CardContent>
                      <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                        Quick Presets
                      </Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Button size="small" variant="outlined" onClick={() => setFilterConfig(prev => ({
                          ...prev, noteOn: true, noteOff: true, cc: false, programChange: false, pitchBend: false, aftertouch: false, sysex: false, clock: false
                        }))}>
                          Notes Only
                        </Button>
                        <Button size="small" variant="outlined" onClick={() => setFilterConfig(prev => ({
                          ...prev, noteOn: false, noteOff: false, cc: true, programChange: false, pitchBend: false, aftertouch: false, sysex: false, clock: false
                        }))}>
                          CC Only
                        </Button>
                        <Button size="small" variant="outlined" onClick={() => setFilterConfig(prev => ({
                          ...prev, clock: false
                        }))}>
                          No Clock
                        </Button>
                        <Button size="small" variant="outlined" onClick={() => setFilterConfig({
                          noteOn: true, noteOff: true, cc: true, programChange: true, pitchBend: true, aftertouch: true, sysex: false, clock: false, channels: Array(16).fill(true)
                        })}>
                          Reset
                        </Button>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </Box>
          </TabPanel>

          {/* Tab 3: CC Mapping */}
          <TabPanel value={tabValue} index={3}>
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => setAddDialogOpen(true)}
                  disabled={!midiStarted}
                >
                  Add Mapping
                </Button>
              </Box>

              <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
                <TableContainer>
                  <Table stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>Channel</TableCell>
                        <TableCell>CC</TableCell>
                        <TableCell>Target Plugin</TableCell>
                        <TableCell>Parameter</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {mappings.length > 0 ? (
                        mappings.map((mapping) => (
                          <TableRow key={mapping.id}>
                            <TableCell>
                              <Chip label={mapping.channel} size="small" />
                            </TableCell>
                            <TableCell>
                              <Chip label={`CC ${mapping.cc}`} size="small" color="primary" />
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" noWrap>
                                {mapping.target_uri}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2">
                                {mapping.param_name || `Parameter ${mapping.param_index}`}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Tooltip title="Learn">
                                <IconButton
                                  size="small"
                                  onClick={() => handleStartLearn(mapping.target_uri, mapping.param_index)}
                                >
                                  <LearnIcon />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete">
                                <IconButton
                                  size="small"
                                  onClick={() => handleDeleteMapping(mapping.id)}
                                  color="error"
                                >
                                  <DeleteIcon />
                                </IconButton>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={5} align="center">
                            <Typography variant="body2" color="text.secondary" sx={{ py: 4 }}>
                              No MIDI mappings configured. Click "Add Mapping" to create one.
                            </Typography>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            </Box>
          </TabPanel>

          {/* Tab 4: Presets */}
          <TabPanel value={tabValue} index={4}>
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', gap: 1 }}>
                <Button
                  variant="contained"
                  startIcon={<SaveIcon />}
                  onClick={() => setPresetDialogOpen(true)}
                >
                  Save Current
                </Button>
                <Button variant="outlined" startIcon={<UploadIcon />}>
                  Import
                </Button>
                <Button variant="outlined" startIcon={<DownloadIcon />}>
                  Export
                </Button>
              </Box>
              <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
                <Stack spacing={2}>
                  {presets.map((preset) => (
                    <Card key={preset.id} variant="outlined">
                      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box sx={{ flexGrow: 1 }}>
                          <Typography variant="subtitle1" fontWeight="bold">
                            {preset.name}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {preset.description}
                          </Typography>
                          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                            <Chip label={`${preset.mappingCount} mappings`} size="small" variant="outlined" />
                            <Chip label={`${preset.routeCount} routes`} size="small" variant="outlined" />
                          </Stack>
                        </Box>
                        <Button variant="outlined" size="small">
                          Load
                        </Button>
                        <IconButton size="small" color="error" onClick={() => handleDeletePreset(preset.id)}>
                          <DeleteIcon />
                        </IconButton>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              </Box>
            </Box>
          </TabPanel>

          {/* Tab 5: Monitor */}
          <TabPanel value={tabValue} index={5}>
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 2 }}>
                <Button
                  variant={monitorActive ? 'outlined' : 'contained'}
                  startIcon={monitorActive ? <StopIcon /> : <StartIcon />}
                  onClick={() => setMonitorActive(!monitorActive)}
                  color={monitorActive ? 'error' : 'success'}
                  disabled={!midiStarted}
                >
                  {monitorActive ? 'Stop' : 'Start'} Monitor
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<ClearIcon />}
                  onClick={() => setMonitorMessages([])}
                  disabled={monitorMessages.length === 0}
                >
                  Clear
                </Button>
                <Box sx={{ flexGrow: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  {monitorMessages.length} messages
                </Typography>
              </Box>
              {monitorActive && <LinearProgress />}
              <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
                <TableContainer>
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Time</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell>Channel</TableCell>
                        <TableCell>Data 1</TableCell>
                        <TableCell>Data 2</TableCell>
                        <TableCell>Port</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {monitorMessages.map((msg) => (
                        <TableRow key={msg.id} sx={{ '&:nth-of-type(odd)': { bgcolor: 'action.hover' } }}>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            {msg.timestamp}
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={msg.type}
                              size="small"
                              color={msg.type.includes('Note') ? 'primary' : msg.type === 'CC' ? 'secondary' : 'default'}
                            />
                          </TableCell>
                          <TableCell>{msg.channel}</TableCell>
                          <TableCell sx={{ fontFamily: 'monospace' }}>{msg.data1}</TableCell>
                          <TableCell sx={{ fontFamily: 'monospace' }}>{msg.data2 ?? '-'}</TableCell>
                          <TableCell sx={{ fontSize: '0.75rem' }}>{msg.port}</TableCell>
                        </TableRow>
                      ))}
                      {monitorMessages.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} align="center">
                            <Typography variant="body2" color="text.secondary" sx={{ py: 4 }}>
                              {midiStarted ? 'Click "Start Monitor" to begin capturing MIDI messages' : 'Start the MIDI engine to use the monitor'}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            </Box>
          </TabPanel>

          {/* Tab 6: Clock */}
          <TabPanel value={tabValue} index={6}>
            <Box sx={{ p: 2, overflow: 'auto' }}>
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                        Clock Source
                      </Typography>
                      <FormControl fullWidth sx={{ mb: 2 }}>
                        <InputLabel>Mode</InputLabel>
                        <Select
                          value={clockConfig.mode}
                          label="Mode"
                          onChange={(e) => setClockConfig(prev => ({ ...prev, mode: e.target.value as 'internal' | 'external' }))}
                        >
                          <MenuItem value="internal">Internal (Master)</MenuItem>
                          <MenuItem value="external">External (Slave)</MenuItem>
                        </Select>
                      </FormControl>

                      {clockConfig.mode === 'internal' && (
                        <Box sx={{ mt: 2 }}>
                          <NumberInput
                            label="Tempo"
                            value={clockConfig.bpm}
                            onChange={(v) => setClockConfig(prev => ({ ...prev, bpm: v }))}
                            min={40}
                            max={240}
                            step={1}
                            unit="BPM"
                            size="small"
                          />
                        </Box>
                      )}

                      {clockConfig.mode === 'external' && (
                        <Alert severity="info" sx={{ mt: 2 }}>
                          Waiting for external MIDI clock...
                        </Alert>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                        Transport
                      </Typography>
                      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
                        <Button
                          variant={clockConfig.running ? 'outlined' : 'contained'}
                          startIcon={clockConfig.running ? <StopIcon /> : <StartIcon />}
                          onClick={() => setClockConfig(prev => ({ ...prev, running: !prev.running }))}
                          color={clockConfig.running ? 'error' : 'success'}
                          disabled={!midiStarted}
                        >
                          {clockConfig.running ? 'Stop' : 'Start'}
                        </Button>
                      </Stack>
                      <Divider sx={{ my: 2 }} />
                      <Typography variant="subtitle2" gutterBottom>
                        Clock Options
                      </Typography>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={clockConfig.sendClock}
                            onChange={(e) => setClockConfig(prev => ({ ...prev, sendClock: e.target.checked }))}
                          />
                        }
                        label="Send MIDI Clock"
                      />
                      <FormControlLabel
                        control={
                          <Switch
                            checked={clockConfig.receiveClock}
                            onChange={(e) => setClockConfig(prev => ({ ...prev, receiveClock: e.target.checked }))}
                          />
                        }
                        label="Receive MIDI Clock"
                      />
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </Box>
          </TabPanel>
        </Box>
      </Box>

      {/* Add Mapping Dialog */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add MIDI CC Mapping</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <NumberInput
              label="MIDI Channel"
              value={newMapping.channel}
              onChange={(v) => setNewMapping({ ...newMapping, channel: Math.max(1, Math.min(16, Math.round(v))) })}
              min={1}
              max={16}
              step={1}
              size="small"
              fullWidth
            />
            <NumberInput
              label="CC Number"
              value={newMapping.cc}
              onChange={(v) => setNewMapping({ ...newMapping, cc: Math.max(0, Math.min(127, Math.round(v))) })}
              min={0}
              max={127}
              step={1}
              size="small"
              fullWidth
            />
            <TextField
              label="Target Plugin"
              select
              fullWidth
              value={newMapping.targetUri}
              onChange={(e) => setNewMapping({ ...newMapping, targetUri: e.target.value })}
            >
              {plugins.map((plugin) => (
                <MenuItem key={plugin.uri} value={plugin.uri}>
                  {getDisplayPluginName(plugin.name, plugin.uri)}
                </MenuItem>
              ))}
            </TextField>
            <NumberInput
              label="Parameter Index"
              value={newMapping.paramIndex}
              onChange={(v) => setNewMapping({ ...newMapping, paramIndex: Math.max(0, Math.round(v)) })}
              min={0}
              max={4096}
              step={1}
              size="small"
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleAddMapping} variant="contained">Add</Button>
        </DialogActions>
      </Dialog>

      {/* Add Route Dialog */}
      <Dialog open={routeDialogOpen} onClose={() => setRouteDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add MIDI Route</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel>Input Port</InputLabel>
              <Select
                value={newRoute.inputPort}
                label="Input Port"
                onChange={(e) => setNewRoute({ ...newRoute, inputPort: e.target.value })}
              >
                {devices.inputs.map((device) => (
                  <MenuItem key={device.id} value={device.name}>
                    {device.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Output Port</InputLabel>
              <Select
                value={newRoute.outputPort}
                label="Output Port"
                onChange={(e) => setNewRoute({ ...newRoute, outputPort: e.target.value })}
              >
                {devices.outputs.map((device) => (
                  <MenuItem key={device.id} value={device.name}>
                    {device.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Channel</InputLabel>
              <Select
                value={newRoute.channel}
                label="Channel"
                onChange={(e) => setNewRoute({ ...newRoute, channel: e.target.value as number | 'all' })}
              >
                <MenuItem value="all">All Channels</MenuItem>
                {Array.from({ length: 16 }, (_, i) => (
                  <MenuItem key={i + 1} value={i + 1}>
                    Channel {i + 1}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRouteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleAddRoute} variant="contained">Add</Button>
        </DialogActions>
      </Dialog>

      {/* Save Preset Dialog */}
      <Dialog open={presetDialogOpen} onClose={() => setPresetDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Save MIDI Preset</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Preset Name"
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPresetDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSavePreset} variant="contained" disabled={!newPresetName.trim()}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
