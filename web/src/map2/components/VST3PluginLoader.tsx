import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  Typography,
  CircularProgress,
  Box,
  Chip,
  Paper,
  Slider,
  TextField,
  Switch,
  FormControlLabel,
  Alert,
} from '@mui/material';
import { api } from './api';

interface VST3Plugin {
  uri: string;
  name: string;
  author: string;
  description: string;
  category: string;
  audio_inputs: number;
  audio_outputs: number;
  parameters_available: boolean;
}

interface VST3Parameter {
  index: number;
  name: string;
  symbol: string;
  min: number;
  max: number;
  default: number;
  value: number;
  unit?: string;
  label?: string;
  is_toggled?: boolean;
  is_log?: boolean;
  is_automatable?: boolean;
}

interface VST3LoaderProps {
  onPluginAdded?: (instanceId: string) => void;
}

export const VST3PluginLoader: React.FC<VST3LoaderProps> = ({ onPluginAdded }) => {
  const [open, setOpen] = useState(false);
  const [plugins, setPlugins] = useState<VST3Plugin[]>([]);
  const [selectedPlugin, setSelectedPlugin] = useState<VST3Plugin | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingParams, setLoadingParams] = useState(false);
  const [parameters, setParameters] = useState<VST3Parameter[]>([]);
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load available VST3 plugins
  const loadPlugins = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.vst3.list();
      setPlugins(response.plugins || []);
    } catch (err) {
      setError('Failed to load VST3 plugins: ' + (err as Error).message);
      console.error('Error loading VST3 plugins:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load plugin into effects chain and get parameters
  const loadPluginToChain = async (plugin: VST3Plugin) => {
    try {
      setLoading(true);
      setError(null);
      
      // Step 1: Load plugin to chain
      const loadResponse = await api.vst3.load(plugin.uri);
      const newInstanceId = loadResponse.instance?.id || loadResponse.instance;
      setInstanceId(newInstanceId);

      // Step 2: Try to get parameters
      setLoadingParams(true);
      try {
        const paramsResponse = await api.vst3.getParameters(plugin.uri);
        
        if (paramsResponse.parameters && paramsResponse.parameters.length > 0) {
          setParameters(paramsResponse.parameters);
        } else if (paramsResponse.requires_instantiation) {
          // Parameters available after instantiation in chain
          setError(null);
          setParameters([]);
        }
      } catch (paramErr) {
        console.error('Error loading parameters:', paramErr);
        // Non-fatal - plugin is still loaded
      } finally {
        setLoadingParams(false);
      }

      // Notify parent component
      if (onPluginAdded && newInstanceId) {
        onPluginAdded(newInstanceId);
      }

    } catch (err) {
      setError('Failed to load plugin: ' + (err as Error).message);
      console.error('Error loading plugin:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    setOpen(true);
    setSelectedPlugin(null);
    setParameters([]);
    setInstanceId(null);
    setError(null);
    loadPlugins();
  };

  const handleClose = () => {
    setOpen(false);
    setSelectedPlugin(null);
    setParameters([]);
    setInstanceId(null);
  };

  const handlePluginSelect = (plugin: VST3Plugin) => {
    setSelectedPlugin(plugin);
    setParameters([]);
    setInstanceId(null);
  };

  const handleAddToChain = async () => {
    if (selectedPlugin) {
      await loadPluginToChain(selectedPlugin);
    }
  };

  const handleParameterChange = (param: VST3Parameter, newValue: number) => {
    // Update local state
    setParameters(prev =>
      prev.map(p => (p.index === param.index ? { ...p, value: newValue } : p))
    );

    // TODO: Send parameter change to backend
    // This would call an API endpoint to update the parameter in the running plugin
    console.log(`Parameter ${param.name} changed to ${newValue}`);
  };

  const renderParameterControl = (param: VST3Parameter) => {
    if (param.is_toggled) {
      return (
        <FormControlLabel
          control={
            <Switch
              checked={param.value > 0.5}
              onChange={(e) => handleParameterChange(param, e.target.checked ? 1 : 0)}
            />
          }
          label={param.name}
        />
      );
    }

    return (
      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" gutterBottom>
          {param.name} {param.unit && `(${param.unit})`}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Slider
            value={param.value}
            min={param.min}
            max={param.max}
            step={(param.max - param.min) / 100}
            onChange={(_, value) => handleParameterChange(param, value as number)}
            sx={{ flex: 1 }}
          />
          <TextField
            type="number"
            value={param.value.toFixed(2)}
            onChange={(e) => handleParameterChange(param, parseFloat(e.target.value))}
            size="small"
            sx={{ width: 80 }}
          />
        </Box>
      </Box>
    );
  };

  return (
    <>
      <Button variant="contained" color="primary" onClick={handleOpen}>
        Add VST3 Plugin
      </Button>

      <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
        <DialogTitle>
          {instanceId ? 'Plugin Loaded - Parameters' : 'Select VST3 Plugin'}
        </DialogTitle>

        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {loading && !instanceId && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          )}

          {!instanceId && !loading && (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Select a VST3 plugin to add to the effects chain
              </Typography>

              <List>
                {plugins.map((plugin) => (
                  <ListItemButton
                    key={plugin.uri}
                    selected={selectedPlugin?.uri === plugin.uri}
                    onClick={() => handlePluginSelect(plugin)}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {plugin.name}
                          <Chip label="VST3" size="small" color="primary" variant="outlined" />
                        </Box>
                      }
                      secondary={
                        <>
                          {plugin.author && `By ${plugin.author} • `}
                          {plugin.category}
                          {plugin.description && ` • ${plugin.description}`}
                        </>
                      }
                    />
                  </ListItemButton>
                ))}
              </List>

              {plugins.length === 0 && !loading && (
                <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 4 }}>
                  No VST3 plugins found. Install VST3 plugins to ~/.vst3 or /usr/lib/vst3
                </Typography>
              )}
            </>
          )}

          {instanceId && (
            <Paper elevation={0} sx={{ p: 2, bgcolor: 'background.default' }}>
              <Typography variant="h6" gutterBottom>
                {selectedPlugin?.name}
                <Chip label="Loaded" size="small" color="success" sx={{ ml: 2 }} />
              </Typography>

              {loadingParams && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, my: 2 }}>
                  <CircularProgress size={20} />
                  <Typography variant="body2">Loading parameters...</Typography>
                </Box>
              )}

              {!loadingParams && parameters.length === 0 && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  Parameters are available once the plugin is running in the effects chain.
                  VST3 plugins require instantiation to expose their parameters.
                </Alert>
              )}

              {!loadingParams && parameters.length > 0 && (
                <Box sx={{ mt: 3 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Parameters ({parameters.length})
                  </Typography>
                  {parameters.map((param) => (
                    <Box key={param.index}>{renderParameterControl(param)}</Box>
                  ))}
                </Box>
              )}

              {instanceId && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
                  Instance ID: {instanceId}
                </Typography>
              )}
            </Paper>
          )}
        </DialogContent>

        <DialogActions>
          {!instanceId ? (
            <>
              <Button onClick={handleClose}>Cancel</Button>
              <Button
                onClick={handleAddToChain}
                variant="contained"
                disabled={!selectedPlugin || loading}
              >
                Add to Effects Chain
              </Button>
            </>
          ) : (
            <Button onClick={handleClose} variant="contained">
              Close
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
};

export default VST3PluginLoader;
