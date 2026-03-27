// ============================================================================
// MAP2 Audio Platform - Automation Editor Component
// Timeline-based parameter automation with LFO configuration
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
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
  Button,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TextField,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Switch,
  FormControlLabel,
} from '@mui/material';
import { NumberInput } from '../../app/components/ParameterControl';
import {
  Add,
  ChartLine,
  PauseFilled,
  PlayFilled,
  Renew,
  Repeat,
  SkipBack,
  StopFilled,
  TrashCan,
  Waveform,
} from '@carbon/icons-react';
import { automationApi } from '../api';
import type { AutomationStatus, AutomationLane, LFOConfig, CurveType, LFOWaveform } from '../types';

const CURVE_TYPES: { value: CurveType; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'exponential', label: 'Exponential' },
  { value: 'logarithmic', label: 'Logarithmic' },
  { value: 's_curve', label: 'S-Curve' },
  { value: 'step', label: 'Step' },
];

const LFO_WAVEFORMS: { value: LFOWaveform; label: string }[] = [
  { value: 'sine', label: 'Sine' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'square', label: 'Square' },
  { value: 'saw', label: 'Sawtooth' },
];

interface LFODialogProps {
  open: boolean;
  parameterId: string;
  onClose: () => void;
  onSave: (config: LFOConfig) => void;
}

function LFODialog({ open, parameterId, onClose, onSave }: LFODialogProps) {
  const [rateHz, setRateHz] = useState(1.0);
  const [depth, setDepth] = useState(0.5);
  const [waveform, setWaveform] = useState<LFOWaveform>('sine');

  const handleSave = () => {
    onSave({
      parameter_id: parameterId,
      rate_hz: rateHz,
      depth,
      waveform,
    });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Configure LFO</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 2 }}>
          <NumberInput
            label="Rate"
            value={rateHz}
            onChange={(v) => setRateHz(v)}
            min={0.1}
            max={20}
            step={0.1}
            unit="Hz"
            size="small"
          />
        </Box>

        <Box sx={{ mt: 3 }}>
          <NumberInput
            label="Depth"
            value={depth * 100}
            onChange={(v) => setDepth(v / 100)}
            min={0}
            max={100}
            step={1}
            unit="%"
            size="small"
          />
        </Box>

        <FormControl fullWidth sx={{ mt: 3 }}>
          <InputLabel>Waveform</InputLabel>
          <Select
            value={waveform}
            label="Waveform"
            onChange={(e) => setWaveform(e.target.value as LFOWaveform)}
          >
            {LFO_WAVEFORMS.map((w) => (
              <MenuItem key={w.value} value={w.value}>
                {w.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  );
}

interface AddPointDialogProps {
  open: boolean;
  parameterId: string;
  onClose: () => void;
  onAdd: (time: number, value: number, curve: CurveType) => void;
}

function AddPointDialog({ open, parameterId, onClose, onAdd }: AddPointDialogProps) {
  const [time, setTime] = useState(0);
  const [value, setValue] = useState(0.5);
  const [curve, setCurve] = useState<CurveType>('linear');

  const handleAdd = () => {
    onAdd(time, value, curve);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Add Automation Point</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 2 }}>
          <NumberInput
            label="Time (seconds)"
            value={time}
            onChange={(v) => setTime(Math.max(0, v))}
            min={0}
            max={3600}
            step={0.1}
            size="small"
            fullWidth
          />
        </Box>

        <Box sx={{ mt: 3 }}>
          <NumberInput
            label="Value"
            value={value * 100}
            onChange={(v) => setValue(v / 100)}
            min={0}
            max={100}
            step={1}
            unit="%"
            size="small"
          />
        </Box>

        <FormControl fullWidth sx={{ mt: 3 }}>
          <InputLabel>Curve Type</InputLabel>
          <Select value={curve} label="Curve Type" onChange={(e) => setCurve(e.target.value as CurveType)}>
            {CURVE_TYPES.map((c) => (
              <MenuItem key={c.value} value={c.value}>
                {c.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleAdd} variant="contained">
          Add Point
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ColoredGlyph({
  icon: Icon,
  color = 'inherit',
  size = 18,
}: {
  icon: React.ComponentType<{ size?: number }>;
  color?: string;
  size?: number;
}) {
  return (
    <Box component="span" sx={{ color, display: 'inline-flex', alignItems: 'center', lineHeight: 0 }}>
      <Icon size={size} />
    </Box>
  );
}

export default function AutomationEditor() {
  const [status, setStatus] = useState<AutomationStatus | null>(null);
  const [lanes, setLanes] = useState<string[]>([]);
  const [selectedLane, setSelectedLane] = useState<string | null>(null);
  const [laneData, setLaneData] = useState<AutomationLane | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lfoDialogOpen, setLfoDialogOpen] = useState(false);
  const [addPointDialogOpen, setAddPointDialogOpen] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [statusRes, lanesRes] = await Promise.all([
        automationApi.getStatus(),
        automationApi.listLanes(),
      ]);
      setStatus(statusRes);
      setLanes(lanesRes.parameters);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load automation data');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLaneData = useCallback(async (parameterId: string) => {
    try {
      const data = await automationApi.getLane(parameterId);
      setLaneData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load lane data');
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (selectedLane) {
      fetchLaneData(selectedLane);
    } else {
      setLaneData(null);
    }
  }, [selectedLane, fetchLaneData]);

  const handlePlaybackControl = async (action: 'start' | 'stop' | 'seek', time?: number) => {
    try {
      const result = await automationApi.controlPlayback(action, time);
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              is_playing: result.is_playing,
              current_time: result.current_time,
            }
          : prev
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Playback control failed');
    }
  };

  const handleLFOConfig = async (config: LFOConfig) => {
    try {
      await automationApi.configureLFO(config);
      if (selectedLane) {
        await fetchLaneData(selectedLane);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to configure LFO');
    }
  };

  const handleAddPoint = async (time: number, value: number, curve: CurveType) => {
    if (!selectedLane) return;
    try {
      await automationApi.addPoint(selectedLane, time, value, curve);
      await fetchLaneData(selectedLane);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add point');
    }
  };

  const handleDeleteLane = async (parameterId: string) => {
    try {
      await automationApi.deleteLane(parameterId);
      setLanes((prev) => prev.filter((l) => l !== parameterId));
      if (selectedLane === parameterId) {
        setSelectedLane(null);
        setLaneData(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete lane');
    }
  };

  const handleClearAll = async () => {
    try {
      await automationApi.clearAll();
      setLanes([]);
      setSelectedLane(null);
      setLaneData(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear automation');
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    return `${mins}:${secs.padStart(4, '0')}`;
  };

  return (
    <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <ColoredGlyph icon={ChartLine} color="primary.main" />
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          Parameter Automation
        </Typography>
        <Chip
          label={`${lanes.length} lanes`}
          size="small"
          variant="outlined"
        />
        <IconButton onClick={fetchData} size="small">
          <Renew size={18} />
        </IconButton>
      </Box>

      <Divider />

      {/* Transport Controls */}
      <Box sx={{ p: 2, bgcolor: 'grey.900' }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item>
            <IconButton onClick={() => handlePlaybackControl('seek', 0)} disabled={!status}>
              <SkipBack size={20} />
            </IconButton>
            {status?.is_playing ? (
              <IconButton onClick={() => handlePlaybackControl('stop')} color="primary">
                <PauseFilled size={20} />
              </IconButton>
            ) : (
              <IconButton onClick={() => handlePlaybackControl('start')} color="primary">
                <PlayFilled size={20} />
              </IconButton>
            )}
            <IconButton onClick={() => handlePlaybackControl('stop')} disabled={!status?.is_playing}>
              <StopFilled size={20} />
            </IconButton>
          </Grid>
          <Grid item xs>
            <Typography variant="h5" sx={{ fontFamily: 'var(--font-ui-tight)' }}>
              {formatTime(status?.current_time || 0)}
            </Typography>
          </Grid>
          <Grid item>
            <FormControlLabel
              control={
                <Switch
                  checked={status?.loop_enabled || false}
                  disabled
                />
              }
              label={<Repeat size={18} />}
            />
          </Grid>
          <Grid item>
            <Tooltip title="Clear All Automation">
              <IconButton onClick={handleClearAll} disabled={lanes.length === 0} color="error">
                <TrashCan size={18} />
              </IconButton>
            </Tooltip>
          </Grid>
        </Grid>
      </Box>

      <Divider />

      {/* Error Alert */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ m: 2 }}>
          {error}
        </Alert>
      )}

      {/* Content */}
      <Box sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex' }}>
        {/* Lane List */}
        <Box
          sx={{
            width: 250,
            borderRight: 1,
            borderColor: 'divider',
            overflow: 'auto',
          }}
        >
          <Box sx={{ p: 1 }}>
            <Typography variant="overline" color="text.secondary">
              Automation Lanes
            </Typography>
          </Box>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
              <CircularProgress size={24} />
            </Box>
          ) : lanes.length === 0 ? (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                No automation lanes
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Automate parameters from the plugin editor
              </Typography>
            </Box>
          ) : (
            <List dense>
              {lanes.map((lane) => (
                <ListItem key={lane} disablePadding>
                <ListItemButton
                  selected={selectedLane === lane}
                  onClick={() => setSelectedLane(lane)}
                >
                  <ListItemIcon>
                    <ChartLine size={16} />
                  </ListItemIcon>
                    <ListItemText
                      primary={lane}
                      primaryTypographyProps={{
                        noWrap: true,
                        fontSize: '0.875rem',
                      }}
                    />
                    <ListItemSecondaryAction>
                      <IconButton
                        edge="end"
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteLane(lane);
                        }}
                      >
                        <TrashCan size={16} />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </Box>

        {/* Lane Editor */}
        <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
          {selectedLane && laneData ? (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Typography variant="h6">{selectedLane}</Typography>
                <Chip
                  label={laneData.modulation_source}
                  size="small"
                  variant="outlined"
                />
                <Box sx={{ flexGrow: 1 }} />
                <Button
                  startIcon={<Waveform size={16} />}
                  variant="outlined"
                  size="small"
                  onClick={() => setLfoDialogOpen(true)}
                >
                  LFO
                </Button>
                <Button
                  startIcon={<Add size={16} />}
                  variant="contained"
                  size="small"
                  onClick={() => setAddPointDialogOpen(true)}
                >
                  Add Point
                </Button>
              </Box>

              {/* Automation Points */}
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle2" gutterBottom>
                    Automation Points ({laneData.points.length})
                  </Typography>
                  {laneData.points.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No automation points. Add points to create automation.
                    </Typography>
                  ) : (
                    <List dense>
                      {laneData.points.map((point, index) => (
                        <ListItem key={index}>
                          <ListItemText
                            primary={`${formatTime(point.time)} → ${(point.value * 100).toFixed(0)}%`}
                            secondary={`Curve: ${point.curve}`}
                          />
                          <ListItemSecondaryAction>
                            <IconButton
                              size="small"
                              onClick={() =>
                                automationApi.removePoint(selectedLane, point.time).then(() =>
                                  fetchLaneData(selectedLane)
                                )
                              }
                            >
                              <TrashCan size={16} />
                            </IconButton>
                          </ListItemSecondaryAction>
                        </ListItem>
                      ))}
                    </List>
                  )}
                </CardContent>
              </Card>
            </Box>
          ) : (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
              }}
            >
              <ColoredGlyph icon={ChartLine} color="text.secondary" size={64} />
              <Typography color="text.secondary">
                {lanes.length > 0
                  ? 'Select a lane to edit automation'
                  : 'No automation lanes configured'}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* Dialogs */}
      <LFODialog
        open={lfoDialogOpen}
        parameterId={selectedLane || ''}
        onClose={() => setLfoDialogOpen(false)}
        onSave={handleLFOConfig}
      />
      <AddPointDialog
        open={addPointDialogOpen}
        parameterId={selectedLane || ''}
        onClose={() => setAddPointDialogOpen(false)}
        onAdd={handleAddPoint}
      />
    </Paper>
  );
}
