// ============================================================================
// MAP2 Audio Platform - Neural Amp Modeler (NAM) Manager Component
// Manages NAM model loading and activation
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
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
  Divider,
  CircularProgress,
  Alert,
  Chip,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Card,
  CardContent,
  Grid,
} from '@mui/material';
import {
  MusicVideo as NAMIcon,
  PlayArrow as LoadIcon,
  Check as ActiveIcon,
  Refresh as RefreshIcon,
  Info as InfoIcon,
  Memory as ModelIcon,
  Bolt as AmpIcon,
} from '@mui/icons-material';
import { namApi } from '../api';
import type { NAMModel, NAMStatus } from '../types';

function getModelTypeIcon(type: string) {
  switch (type.toLowerCase()) {
    case 'amp':
      return <AmpIcon />;
    case 'pedal':
      return <NAMIcon />;
    default:
      return <ModelIcon />;
  }
}

export default function NAMManager() {
  const [status, setStatus] = useState<NAMStatus | null>(null);
  const [models, setModels] = useState<NAMModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingModel, setLoadingModel] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [statusRes, modelsRes] = await Promise.all([namApi.getStatus(), namApi.listModels()]);

      setStatus(statusRes);
      setModels(modelsRes.models);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load NAM data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleLoadModel = async (name: string) => {
    try {
      setLoadingModel(name);
      await namApi.loadModel(name);
      await namApi.activateModel(name);
      setStatus((prev) => (prev ? { ...prev, activeModel: name } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load NAM model');
    } finally {
      setLoadingModel(undefined);
    }
  };

  if (!status?.available) {
    return (
      <Paper sx={{ p: 3 }}>
        <Alert severity="warning">
          <Typography variant="subtitle1">Neural Amp Modeler Unavailable</Typography>
          <Typography variant="body2">
            {status?.error || 'NAM dependencies (PyTorch) are not installed'}
          </Typography>
        </Alert>
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" color="text.secondary">
            To enable NAM support, install PyTorch:
          </Typography>
          <Typography
            variant="body2"
            component="code"
            sx={{ display: 'block', mt: 1, p: 1, bgcolor: 'grey.900', borderRadius: 1 }}
          >
            pip install torch
          </Typography>
        </Box>
      </Paper>
    );
  }

  // Group models by type
  const modelsByType = models.reduce(
    (acc, model) => {
      const type = model.type || 'other';
      if (!acc[type]) acc[type] = [];
      acc[type].push(model);
      return acc;
    },
    {} as Record<string, NAMModel[]>
  );

  return (
    <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <NAMIcon sx={{ color: 'primary.main' }} />
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          Neural Amp Modeler
        </Typography>
        <IconButton onClick={() => setInfoDialogOpen(true)} size="small">
          <InfoIcon />
        </IconButton>
        <IconButton onClick={fetchData} disabled={loading} size="small">
          <RefreshIcon />
        </IconButton>
      </Box>

      <Divider />

      {/* Status Card */}
      <Box sx={{ p: 2 }}>
        <Card variant="outlined">
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs>
                <Typography variant="body2" color="text.secondary">
                  Active Model
                </Typography>
                <Typography variant="subtitle1">
                  {status?.activeModel || 'None'}
                </Typography>
              </Grid>
              <Grid item>
                <Chip
                  icon={<ModelIcon />}
                  label={`${models.length} models`}
                  size="small"
                  variant="outlined"
                />
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mx: 2 }}>
          {error}
        </Alert>
      )}

      {/* Model List */}
      <Box sx={{ flexGrow: 1, overflow: 'auto', px: 2 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : models.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <NAMIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
            <Typography color="text.secondary">No NAM models found</Typography>
            <Typography variant="body2" color="text.secondary">
              Add .nam model files to the NAM models directory
            </Typography>
          </Box>
        ) : (
          Object.entries(modelsByType).map(([type, typeModels]) => (
            <Box key={type} sx={{ mb: 2 }}>
              <Typography
                variant="overline"
                color="text.secondary"
                sx={{ display: 'block', mb: 1 }}
              >
                {type.toUpperCase()} ({typeModels.length})
              </Typography>
              <List dense disablePadding>
                {typeModels.map((model) => {
                  const isActive = status?.activeModel === model.name;
                  const isLoading = loadingModel === model.name;

                  return (
                    <ListItem key={model.name} disablePadding>
                      <ListItemButton
                        onClick={() => !isActive && !loadingModel && handleLoadModel(model.name)}
                        disabled={!!loadingModel}
                        selected={isActive}
                        sx={{ borderRadius: 1, mb: 0.5 }}
                      >
                        <ListItemIcon>
                          {isLoading ? (
                            <CircularProgress size={24} />
                          ) : isActive ? (
                            <ActiveIcon color="success" />
                          ) : (
                            getModelTypeIcon(model.type)
                          )}
                        </ListItemIcon>
                        <ListItemText
                          primary={model.name}
                          secondary={
                            model.size ? `${(model.size / 1024 / 1024).toFixed(1)} MB` : undefined
                          }
                        />
                        <ListItemSecondaryAction>
                          {isActive ? (
                            <Chip label="Active" size="small" color="success" />
                          ) : (
                            <Tooltip title="Load Model">
                              <IconButton
                                edge="end"
                                onClick={() => handleLoadModel(model.name)}
                                disabled={!!loadingModel}
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
            </Box>
          ))
        )}
      </Box>

      {/* Info Dialog */}
      <Dialog open={infoDialogOpen} onClose={() => setInfoDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>About Neural Amp Modeler</DialogTitle>
        <DialogContent>
          <Typography paragraph>
            <strong>Neural Amp Modeler (NAM)</strong> uses machine learning to capture the sonic
            characteristics of real amplifiers and pedals with remarkable accuracy.
          </Typography>
          <Typography paragraph>
            NAM models are trained on actual hardware and can reproduce the complex non-linear
            behavior of tube amplifiers, including:
          </Typography>
          <Box component="ul" sx={{ mt: 1, pl: 2 }}>
            <Typography component="li">Tube saturation and compression</Typography>
            <Typography component="li">Frequency response curves</Typography>
            <Typography component="li">Dynamic response to playing dynamics</Typography>
            <Typography component="li">Tone stack interaction</Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Place .nam model files in the NAM models directory to make them available here.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInfoDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
