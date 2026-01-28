// ============================================================================
// MAP2 Audio Platform - Plugin Preset Manager Component
// Manages saving, loading, and organizing individual plugin parameter presets
// ============================================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Chip,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  IconButton,
  Menu,
  MenuItem,
  Divider,
  Alert,
  CircularProgress,
  Tab,
  Tabs,
  Tooltip,
  Grid,
} from '@mui/material';
import {
  Save as SaveIcon,
  Delete as DeleteIcon,
  Favorite as FavoriteIcon,
  FavoriteBorder as FavoriteOutlineIcon,
  MoreVert as MoreIcon,
  Edit as EditIcon,
  Settings as SettingsIcon,
  Download as DownloadIcon,
  Star as StarIcon,
  History as HistoryIcon,
} from '@mui/icons-material';
import { pluginPresetsApi } from '../api';

export interface PluginParameter {
  symbol: string;
  name: string;
  value: number;
  default: number;
  min: number;
  max: number;
  unit?: string;
}

interface PluginPresetManagerProps {
  pluginUri: string;
  pluginName: string;
  currentParameters: Record<string, number>;
  onLoadPreset?: (preset: {
    id: number;
    name: string;
    parameters: Record<string, number>;
  }) => void;
  onPresetsChanged?: () => void;
}

interface PresetItem {
  id: number;
  name: string;
  parameters: Record<string, number>;
  is_favorite: boolean;
  is_default: boolean;
  usage_count: number;
  description: string;
  category: string;
  created_at: string;
}

export default function PluginPresetManager({
  pluginUri,
  pluginName,
  currentParameters,
  onLoadPreset,
  onPresetsChanged,
}: PluginPresetManagerProps) {
  const [presets, setPresets] = useState<PresetItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Save preset dialog state
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [presetDescription, setPresetDescription] = useState('');
  const [presetCategory, setPresetCategory] = useState('User');
  const [presetTags, setPresetTags] = useState('');
  const [presetAsDefault, setPresetAsDefault] = useState(false);
  const [presetAsNewTag, setPresetAsNewTag] = useState('');
  const [saving, setSaving] = useState(false);

  // Preset list state
  const [selectedPreset, setSelectedPreset] = useState<PresetItem | null>(null);
  const [tabValue, setTabValue] = useState(0);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Load presets on mount and when plugin changes
  useEffect(() => {
    loadPresets();
  }, [pluginUri]);

  const loadPresets = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await pluginPresetsApi.getByPluginUri(pluginUri);
      setPresets(response.presets as PresetItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load presets');
    } finally {
      setLoading(false);
    }
  }, [pluginUri]);

  // Filter presets based on tab and search
  const filteredPresets = useMemo(() => {
    let filtered = presets;

    // Tab filters
    if (tabValue === 1) {
      // Favorites tab
      filtered = filtered.filter((p) => p.is_favorite);
    } else if (tabValue === 2) {
      // Defaults tab
      filtered = filtered.filter((p) => p.is_default);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query)
      );
    }

    return filtered.sort((a, b) => {
      // Sort by: defaults first, then favorites, then name
      if (a.is_default && !b.is_default) return -1;
      if (!a.is_default && b.is_default) return 1;
      if (a.is_favorite && !b.is_favorite) return -1;
      if (!a.is_favorite && b.is_favorite) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [presets, tabValue, searchQuery]);

  const handleSavePreset = async () => {
    if (!presetName.trim()) {
      setError('Preset name is required');
      return;
    }

    try {
      setSaving(true);
      const tags = presetTags.split(',').map((t) => t.trim()).filter(Boolean);
      if (presetAsNewTag) {
        tags.push(presetAsNewTag);
      }

      await pluginPresetsApi.create({
        name: presetName,
        plugin_uri: pluginUri,
        plugin_name: pluginName,
        parameters: currentParameters,
        tags,
        category: presetCategory,
        description: presetDescription,
        is_favorite: true,
        is_default: presetAsDefault,
      });

      setSaveDialogOpen(false);
      setPresetName('');
      setPresetDescription('');
      setPresetTags('');
      setPresetAsDefault(false);
      setPresetAsNewTag('');

      await loadPresets();
      onPresetsChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preset');
    } finally {
      setSaving(false);
    }
  };

  const handleLoadPreset = async (preset: PresetItem) => {
    try {
      await pluginPresetsApi.load(preset.id);
      onLoadPreset?.({
        id: preset.id,
        name: preset.name,
        parameters: preset.parameters,
      });
      await loadPresets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preset');
    }
  };

  const handleDeletePreset = async (presetId: number) => {
    if (!confirm('Are you sure you want to delete this preset?')) return;

    try {
      await pluginPresetsApi.delete(presetId);
      await loadPresets();
      onPresetsChanged?.();
      setMenuAnchor(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete preset');
    }
  };

  const handleToggleFavorite = async (preset: PresetItem) => {
    try {
      await pluginPresetsApi.toggleFavorite(preset.id);
      await loadPresets();
      onPresetsChanged?.();
      setMenuAnchor(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update preset');
    }
  };

  const handleSetAsDefault = async (preset: PresetItem) => {
    try {
      await pluginPresetsApi.update(preset.id, { is_default: !preset.is_default });
      await loadPresets();
      onPresetsChanged?.();
      setMenuAnchor(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update preset');
    }
  };

  const handleOpenMenu = (event: React.MouseEvent<HTMLElement>) => {
    setMenuAnchor(event.currentTarget);
  };

  const handleCloseMenu = () => {
    setMenuAnchor(null);
  };

  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Header with Save Button */}
      <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SettingsIcon />
          Presets for {pluginName}
        </Typography>
        <Tooltip title="Save current parameters as a preset">
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={() => setSaveDialogOpen(true)}
            size="small"
          >
            Save Preset
          </Button>
        </Tooltip>
      </Stack>

      {/* Error message */}
      {error && (
        <Alert
          severity="error"
          onClose={() => setError(null)}
          sx={{ display: 'flex', alignItems: 'center' }}
        >
          {error}
        </Alert>
      )}

      {/* Search and tabs */}
      <Stack spacing={2}>
        <TextField
          size="small"
          placeholder="Search presets..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          fullWidth
        />

        <Tabs value={tabValue} onChange={(_, value) => setTabValue(value)}>
          <Tab label={`All (${presets.length})`} />
          <Tab label={`Favorites (${presets.filter((p) => p.is_favorite).length})`} />
          <Tab label={`Defaults (${presets.filter((p) => p.is_default).length})`} />
        </Tabs>
      </Stack>

      {/* Preset list */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : filteredPresets.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center', bgcolor: 'action.hover' }}>
          <Typography color="text.secondary">
            {searchQuery ? 'No presets match your search' : 'No presets saved yet'}
          </Typography>
        </Paper>
      ) : (
        <Paper sx={{ maxHeight: 400, overflow: 'auto' }}>
          <List sx={{ width: '100%' }}>
            {filteredPresets.map((preset, index) => (
              <React.Fragment key={preset.id}>
                <ListItem
                  secondaryAction={
                    <Stack direction="row" spacing={0}>
                      {preset.is_default && (
                        <Tooltip title="Default preset">
                          <StarIcon sx={{ color: 'warning.main', mt: 1 }} />
                        </Tooltip>
                      )}
                      {preset.is_favorite && (
                        <Tooltip title="Favorite">
                          <FavoriteIcon sx={{ color: 'error.main', mt: 1 }} />
                        </Tooltip>
                      )}
                      <IconButton
                        edge="end"
                        onClick={handleOpenMenu}
                        onMouseEnter={() => setSelectedPreset(preset)}
                      >
                        <MoreIcon />
                      </IconButton>
                    </Stack>
                  }
                  disablePadding
                >
                  <ListItemButton
                    onClick={() => handleLoadPreset(preset)}
                    sx={{
                      bgcolor:
                        selectedPreset?.id === preset.id ? 'action.selected' : 'transparent',
                    }}
                  >
                    <ListItemText
                      primary={
                        <Stack direction="row" spacing={1} alignItems="center">
                          <span>{preset.name}</span>
                          {preset.is_default && (
                            <Chip
                              icon={<StarIcon />}
                              label="Default"
                              size="small"
                              variant="outlined"
                            />
                          )}
                          {preset.usage_count > 0 && (
                            <Chip
                              icon={<HistoryIcon />}
                              label={`Used ${preset.usage_count}x`}
                              size="small"
                              variant="filled"
                            />
                          )}
                        </Stack>
                      }
                      secondary={
                        <Stack spacing={0.5}>
                          {preset.description && (
                            <Typography variant="caption" color="text.secondary">
                              {preset.description}
                            </Typography>
                          )}
                          {preset.category && (
                            <Chip label={preset.category} size="small" />
                          )}
                        </Stack>
                      }
                    />
                  </ListItemButton>
                </ListItem>
                {index < filteredPresets.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </List>
        </Paper>
      )}

      {/* Actions menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleCloseMenu}
      >
        {selectedPreset && (
          <>
            <MenuItem
              onClick={() => {
                handleToggleFavorite(selectedPreset);
              }}
            >
              {selectedPreset.is_favorite ? (
                <>
                  <FavoriteOutlineIcon sx={{ mr: 1 }} />
                  Remove Favorite
                </>
              ) : (
                <>
                  <FavoriteIcon sx={{ mr: 1 }} />
                  Add to Favorites
                </>
              )}
            </MenuItem>
            <MenuItem
              onClick={() => {
                handleSetAsDefault(selectedPreset);
              }}
            >
              {selectedPreset.is_default ? (
                <>
                  <StarIcon sx={{ mr: 1 }} />
                  Unset as Default
                </>
              ) : (
                <>
                  <StarIcon sx={{ mr: 1 }} />
                  Set as Default
                </>
              )}
            </MenuItem>
            <Divider />
            <MenuItem
              onClick={() => {
                handleDeletePreset(selectedPreset.id);
              }}
              sx={{ color: 'error.main' }}
            >
              <DeleteIcon sx={{ mr: 1 }} />
              Delete
            </MenuItem>
          </>
        )}
      </Menu>

      {/* Save Preset Dialog */}
      <Dialog
        open={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Save Preset</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField
            label="Preset Name"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="e.g., Clean Reverb"
            fullWidth
            autoFocus
          />
          <TextField
            label="Description"
            value={presetDescription}
            onChange={(e) => setPresetDescription(e.target.value)}
            placeholder="Optional description"
            fullWidth
            multiline
            rows={2}
          />
          <TextField
            label="Category"
            value={presetCategory}
            onChange={(e) => setPresetCategory(e.target.value)}
            placeholder="e.g., Reverbs, Delays"
            fullWidth
          />
          <TextField
            label="Tags (comma-separated)"
            value={presetTags}
            onChange={(e) => setPresetTags(e.target.value)}
            placeholder="e.g., ambient, lush, classic"
            fullWidth
          />
          <TextField
            label="New Tag"
            value={presetAsNewTag}
            onChange={(e) => setPresetAsNewTag(e.target.value)}
            placeholder="Or create a new tag"
            fullWidth
          />
          <Stack direction="row" spacing={1} alignItems="center">
            <input
              type="checkbox"
              checked={presetAsDefault}
              onChange={(e) => setPresetAsDefault(e.target.checked)}
            />
            <Typography variant="body2">Set as default for this plugin</Typography>
          </Stack>
          <Alert severity="info">
            Current parameters from {pluginName} will be saved
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSavePreset}
            variant="contained"
            disabled={saving || !presetName.trim()}
          >
            {saving ? <CircularProgress size={24} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
