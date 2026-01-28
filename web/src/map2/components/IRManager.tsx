// ============================================================================
// MAP2 Audio Platform - Impulse Response Manager Component
// Manages cabinet and reverb IR loading, uploading, and selection
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Button,
  Tabs,
  Tab,
  Divider,
  CircularProgress,
  Alert,
  Chip,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  LinearProgress,
} from '@mui/material';
import {
  Speaker as CabinetIcon,
  Waves as ReverbIcon,
  PlayArrow as LoadIcon,
  CloudUpload as UploadIcon,
  Check as ActiveIcon,
  Refresh as RefreshIcon,
  Info as InfoIcon,
  MusicNote as AudioIcon,
} from '@mui/icons-material';
import { irApi } from '../api';
import type { IRFile, IRStatus } from '../types';

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
      id={`ir-tabpanel-${index}`}
      aria-labelledby={`ir-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 2 }}>{children}</Box>}
    </div>
  );
}

interface IRListProps {
  irs: IRFile[];
  activeIR?: string;
  onLoad: (name: string) => void;
  loading: boolean;
  loadingIR?: string;
}

function IRList({ irs, activeIR, onLoad, loading, loadingIR }: IRListProps) {
  if (irs.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <AudioIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
        <Typography color="text.secondary">No impulse responses found</Typography>
        <Typography variant="body2" color="text.secondary">
          Upload WAV files to get started
        </Typography>
      </Box>
    );
  }

  return (
    <List dense>
      {irs.map((ir) => {
        const isActive = activeIR === ir.name;
        const isLoading = loadingIR === ir.name;

        return (
          <ListItem key={ir.name} disablePadding>
            <ListItemButton
              onClick={() => !isActive && !loading && onLoad(ir.name)}
              disabled={loading}
              selected={isActive}
            >
              <ListItemIcon>
                {isLoading ? (
                  <CircularProgress size={24} />
                ) : isActive ? (
                  <ActiveIcon color="success" />
                ) : (
                  <AudioIcon color="action" />
                )}
              </ListItemIcon>
              <ListItemText
                primary={ir.name}
                secondary={
                  ir.duration
                    ? `${(ir.duration * 1000).toFixed(0)}ms • ${ir.sample_rate || 48000}Hz`
                    : undefined
                }
              />
              <ListItemSecondaryAction>
                {isActive ? (
                  <Chip label="Active" size="small" color="success" />
                ) : (
                  <Tooltip title="Load IR">
                    <IconButton
                      edge="end"
                      onClick={() => onLoad(ir.name)}
                      disabled={loading}
                      size="small"
                    >
                      <LoadIcon />
                    </IconButton>
                  </Tooltip>
                )}
              </ListItemSecondaryAction>
            </ListItemButton>
          </ListItem>
        );
      })}
    </List>
  );
}

export default function IRManager() {
  const [tabIndex, setTabIndex] = useState(0);
  const [status, setStatus] = useState<IRStatus | null>(null);
  const [cabinets, setCabinets] = useState<IRFile[]>([]);
  const [reverbs, setReverbs] = useState<IRFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingIR, setLoadingIR] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);

  const cabinetInputRef = useRef<HTMLInputElement>(null);
  const reverbInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [statusRes, cabinetsRes, reverbsRes] = await Promise.all([
        irApi.getStatus(),
        irApi.listCabinets(),
        irApi.listReverbs(),
      ]);

      setStatus(statusRes);
      setCabinets(cabinetsRes.irs);
      setReverbs(reverbsRes.irs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load IR data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleLoadCabinet = async (name: string) => {
    try {
      setLoadingIR(name);
      await irApi.loadCabinet(name);
      setStatus((prev) => (prev ? { ...prev, loaded_cabinet: name } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cabinet IR');
    } finally {
      setLoadingIR(undefined);
    }
  };

  const handleLoadReverb = async (name: string) => {
    try {
      setLoadingIR(name);
      await irApi.loadReverb(name);
      setStatus((prev) => (prev ? { ...prev, loaded_reverb: name } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reverb IR');
    } finally {
      setLoadingIR(undefined);
    }
  };

  const handleUpload = async (type: 'cabinet' | 'reverb', files: FileList | null) => {
    if (!files || files.length === 0) return;

    try {
      setUploading(true);
      setUploadProgress(0);

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.name.toLowerCase().endsWith('.wav')) {
          throw new Error(`${file.name} is not a WAV file`);
        }

        if (type === 'cabinet') {
          await irApi.uploadCabinet(file);
        } else {
          await irApi.uploadReverb(file);
        }

        setUploadProgress(((i + 1) / files.length) * 100);
      }

      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload IR');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  if (!status?.available) {
    return (
      <Paper sx={{ p: 3 }}>
        <Alert severity="warning">
          <Typography variant="subtitle1">IR Processing Unavailable</Typography>
          <Typography variant="body2">
            {status?.error || 'IR processor dependencies are not installed'}
          </Typography>
        </Alert>
      </Paper>
    );
  }

  return (
    <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          Impulse Responses
        </Typography>
        <IconButton onClick={() => setInfoDialogOpen(true)} size="small">
          <InfoIcon />
        </IconButton>
        <IconButton onClick={fetchData} disabled={loading} size="small">
          <RefreshIcon />
        </IconButton>
      </Box>

      <Divider />

      {/* Error Alert */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ m: 1 }}>
          {error}
        </Alert>
      )}

      {/* Upload Progress */}
      {uploading && (
        <Box sx={{ px: 2 }}>
          <LinearProgress variant="determinate" value={uploadProgress} />
          <Typography variant="caption" color="text.secondary">
            Uploading... {uploadProgress.toFixed(0)}%
          </Typography>
        </Box>
      )}

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)} variant="fullWidth">
          <Tab
            icon={<CabinetIcon />}
            label={`Cabinets (${cabinets.length})`}
            id="ir-tab-0"
            aria-controls="ir-tabpanel-0"
          />
          <Tab
            icon={<ReverbIcon />}
            label={`Reverbs (${reverbs.length})`}
            id="ir-tab-1"
            aria-controls="ir-tabpanel-1"
          />
        </Tabs>
      </Box>

      {/* Content */}
      <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <TabPanel value={tabIndex} index={0}>
              <Box sx={{ mb: 2 }}>
                <input
                  ref={cabinetInputRef}
                  type="file"
                  accept=".wav"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => handleUpload('cabinet', e.target.files)}
                />
                <Button
                  variant="outlined"
                  startIcon={<UploadIcon />}
                  onClick={() => cabinetInputRef.current?.click()}
                  disabled={uploading}
                  fullWidth
                >
                  Upload Cabinet IR
                </Button>
              </Box>
              <IRList
                irs={cabinets}
                activeIR={status?.loaded_cabinet}
                onLoad={handleLoadCabinet}
                loading={!!loadingIR}
                loadingIR={loadingIR}
              />
            </TabPanel>

            <TabPanel value={tabIndex} index={1}>
              <Box sx={{ mb: 2 }}>
                <input
                  ref={reverbInputRef}
                  type="file"
                  accept=".wav"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => handleUpload('reverb', e.target.files)}
                />
                <Button
                  variant="outlined"
                  startIcon={<UploadIcon />}
                  onClick={() => reverbInputRef.current?.click()}
                  disabled={uploading}
                  fullWidth
                >
                  Upload Reverb IR
                </Button>
              </Box>
              <IRList
                irs={reverbs}
                activeIR={status?.loaded_reverb}
                onLoad={handleLoadReverb}
                loading={!!loadingIR}
                loadingIR={loadingIR}
              />
            </TabPanel>
          </>
        )}
      </Box>

      {/* Info Dialog */}
      <Dialog open={infoDialogOpen} onClose={() => setInfoDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>About Impulse Responses</DialogTitle>
        <DialogContent>
          <Typography paragraph>
            <strong>Cabinet IRs</strong> simulate the frequency response of guitar speaker cabinets.
            They capture the unique tonal characteristics of different cabinet/speaker combinations.
          </Typography>
          <Typography paragraph>
            <strong>Reverb IRs</strong> capture the acoustic properties of real spaces, from small
            rooms to large halls and plates. They provide natural-sounding reverberation.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Upload WAV files (44.1kHz or 48kHz recommended) to add your own impulse responses.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInfoDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Hidden file inputs */}
      <input
        ref={cabinetInputRef}
        type="file"
        accept=".wav"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => handleUpload('cabinet', e.target.files)}
      />
      <input
        ref={reverbInputRef}
        type="file"
        accept=".wav"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => handleUpload('reverb', e.target.files)}
      />
    </Paper>
  );
}
