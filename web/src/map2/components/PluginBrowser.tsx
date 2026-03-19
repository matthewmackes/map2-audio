// ============================================================================
// MAP2 Audio Platform - Plugin Browser Component
// Searchable browser for all available audio plugins (VST3, AU, LV2, LADSPA)
// ============================================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  Chip,
  InputAdornment,
  CircularProgress,
  Alert,
  Stack,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
  Tooltip,
} from '@mui/material';
import {
  AppConnectivity,
  CheckmarkFilled,
  ChevronDown,
  Download,
  Edit,
  Equalizer,
  Favorite,
  FavoriteFilled,
  Filter,
  FolderDetails,
  Information,
  OverflowMenuVertical,
  PlayFilled,
  Renew,
  Search,
  TrashCan,
  WarningAlt,
} from '@carbon/icons-react';
import { pluginsApi, snapshotsApi, chainsApi, pluginPresetsApi } from '../api';
import type { Plugin, Snapshot, SnapshotCategory } from '../types';
import PluginPresetManager from './PluginPresetManager';
import { getDisplayPluginName, sanitizeRestrictedDisplayText } from '../displayNames';

function IconGlyph({
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

// Plugin Pack types
interface PluginPack {
  id: string;
  name: string;
  description: string;
  packages: string[];
  category: string;
  size_estimate: string;
  plugin_count: number;
  status: 'installed' | 'not_installed' | 'installing' | 'uninstalling' | 'disabled' | 'disabling' | 'enabling' | 'error';
  error_message?: string | null;
  can_install?: boolean;  // Whether this pack can be installed via package manager
  can_uninstall?: boolean;  // Whether this pack can be uninstalled via package manager
}

export default function PluginBrowser() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [tabValue, setTabValue] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isCached, setIsCached] = useState(false);

  // Preset state
  const [presets, setPresets] = useState<Snapshot[]>([]);
  const [presetCategories, setPresetCategories] = useState<SnapshotCategory[]>([]);
  const [presetTags, setPresetTags] = useState<string[]>([]);
  const [presetSearchQuery, setPresetSearchQuery] = useState('');
  const [selectedPresetCategory, setSelectedPresetCategory] = useState<string>('all');
  const [selectedPresetTag, setSelectedPresetTag] = useState<string>('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [selectedPreset, setSelectedPreset] = useState<Snapshot | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('');

  // Plugin presets state
  const [pluginsWithFavorites, setPluginsWithFavorites] = useState<Set<string>>(new Set());
  const [selectedPluginForPreset, setSelectedPluginForPreset] = useState<Plugin | null>(null);
  const [presetManagerOpen, setPresetManagerOpen] = useState(false);

  // Plugin packs state
  const [pluginPacks, setPluginPacks] = useState<PluginPack[]>([]);
  const [packsLoading, setPacksLoading] = useState(false);
  const [packsExpanded, setPacksExpanded] = useState(false);

  // Load plugins function - can be called for initial load or refresh
  const loadPlugins = useCallback(async (forceRefresh = false) => {
    try {
      if (forceRefresh) {
        setRefreshing(true);
      }
      const response = await pluginsApi.discover(forceRefresh);
      setPlugins(response.plugins || []);
      setIsCached(response.cached ?? false);
      setLastUpdate(new Date());
      setError(null);

      // Show warning if using stale cache
      if (response.warning) {
        setError(response.warning);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plugins');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Load plugins with favorites
  const loadPluginsWithFavorites = useCallback(async () => {
    try {
      const response = await pluginPresetsApi.getPluginsWithFavorites();
      const uris = new Set(response.plugins.map(p => p.plugin_uri));
      setPluginsWithFavorites(uris);
    } catch (err) {
      console.warn('Failed to load plugins with favorites:', err);
    }
  }, []);

  // Load plugin packs
  const loadPluginPacks = useCallback(async () => {
    try {
      setPacksLoading(true);
      const response = await fetch('/api/plugin-packages/list');
      const data = await response.json();
      setPluginPacks(data.packs || []);
    } catch (err) {
      console.warn('Failed to load plugin packs:', err);
    } finally {
      setPacksLoading(false);
    }
  }, []);

  // Install plugin pack
  const handleInstallPack = async (packId: string) => {
    try {
      await fetch(`/api/plugin-packages/${packId}/install`, { method: 'POST' });
      // Update status optimistically
      setPluginPacks(prev => prev.map(p =>
        p.id === packId ? { ...p, status: 'installing' as const } : p
      ));
      // Poll for status updates
      pollPackStatus(packId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to install plugin pack');
    }
  };

  // Uninstall plugin pack
  const handleUninstallPack = async (packId: string) => {
    if (!confirm('Are you sure you want to uninstall this plugin pack?')) return;
    try {
      await fetch(`/api/plugin-packages/${packId}/uninstall`, { method: 'POST' });
      // Update status optimistically
      setPluginPacks(prev => prev.map(p =>
        p.id === packId ? { ...p, status: 'uninstalling' as const } : p
      ));
      // Poll for status updates
      pollPackStatus(packId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to uninstall plugin pack');
    }
  };

  // Poll for pack status after install/uninstall
  const pollPackStatus = (packId: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/plugin-packages/${packId}/status`);
        const data = await response.json();
        setPluginPacks(prev => prev.map(p =>
          p.id === packId ? { ...p, status: data.status, error_message: data.error_message } : p
        ));
        // Stop polling when not in progress
        if (data.status !== 'installing' && data.status !== 'uninstalling') {
          clearInterval(interval);
          // Refresh plugin list if installation completed
          if (data.status === 'installed' || data.status === 'not_installed') {
            loadPlugins(true);
          }
        }
      } catch (err) {
        clearInterval(interval);
      }
    }, 2000);
    // Stop polling after 5 minutes max
    setTimeout(() => clearInterval(interval), 300000);
  };

  // Initial load
  useEffect(() => {
    loadPlugins();
    loadPluginsWithFavorites();
    loadPluginPacks();
  }, [loadPlugins, loadPluginsWithFavorites, loadPluginPacks]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      // Only auto-refresh if we're on the plugins tab and not currently loading
      if (tabValue === 0 && !loading && !refreshing) {
        loadPlugins(false); // Don't force refresh for auto-updates
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [tabValue, loading, refreshing, loadPlugins]);

  // Manual refresh handler
  const handleRefresh = () => {
    loadPlugins(true);
  };

  // Load presets
  const loadPresets = useCallback(async () => {
    try {
      const [presetsRes, categoriesRes, tagsRes] = await Promise.all([
        snapshotsApi.list({
          category: selectedPresetCategory !== 'all' ? selectedPresetCategory : undefined,
          tags: selectedPresetTag !== 'all' ? selectedPresetTag : undefined,
          favorites_only: favoritesOnly || undefined,
          search: presetSearchQuery || undefined,
        }),
        snapshotsApi.getCategories(),
        snapshotsApi.getTags(),
      ]);

      setPresets(presetsRes.snapshots || []);
      setPresetCategories(categoriesRes.categories || []);
      setPresetTags(tagsRes.tags || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load presets');
    }
  }, [selectedPresetCategory, selectedPresetTag, favoritesOnly, presetSearchQuery]);

  useEffect(() => {
    loadPresets();
  }, [loadPresets]);

  // Preset handlers
  const handleToggleFavorite = async (presetId: number) => {
    try {
      await snapshotsApi.toggleFavorite(presetId);
      await loadPresets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle favorite');
    }
  };

  const handleLoadPreset = async (presetId: number) => {
    try {
      await chainsApi.loadPreset(presetId);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preset');
    }
  };

  const handleDeletePreset = async (presetId: number) => {
    if (!confirm('Are you sure you want to delete this preset?')) return;

    try {
      await snapshotsApi.delete(presetId);
      await loadPresets();
      setMenuAnchor(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete preset');
    }
  };

  const handleOpenEdit = (preset: Snapshot) => {
    setSelectedPreset(preset);
    setEditName(preset.name);
    setEditDescription(preset.description || '');
    setEditCategory(preset.category || '');
    setEditDialogOpen(true);
    setMenuAnchor(null);
  };

  const handleSaveEdit = async () => {
    if (!selectedPreset) return;

    try {
      await snapshotsApi.update(selectedPreset.id, {
        name: editName,
        description: editDescription,
        category: editCategory,
      });
      await loadPresets();
      setEditDialogOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update preset');
    }
  };

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set(plugins.map(p => p.category).filter(Boolean));
    return ['all', ...Array.from(cats).sort()];
  }, [plugins]);

  // Filter plugins
  const filteredPlugins = useMemo(() => {
    return plugins.filter(plugin => {
      // Category filter
      if (selectedCategory !== 'all' && plugin.category !== selectedCategory) {
        return false;
      }

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const displayName = getDisplayPluginName(plugin.name, plugin.uri).toLowerCase();
        const displayAuthor = sanitizeRestrictedDisplayText(plugin.author).toLowerCase();
        return (
          displayName.includes(query) ||
          displayAuthor.includes(query) ||
          plugin.category.toLowerCase().includes(query) ||
          plugin.class_label.toLowerCase().includes(query)
        );
      }

      return true;
    });
  }, [plugins, searchQuery, selectedCategory]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ p: 2, pb: 0 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography variant="h5" gutterBottom>
              Plugins & Presets
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Browse {plugins.length} audio plugins and {presets.length} saved parameter sets
              {lastUpdate && (
                <span style={{ marginLeft: '1rem' }}>
                  {isCached ? '(cached)' : '(fresh)'} - Updated {lastUpdate.toLocaleTimeString()}
                </span>
              )}
            </Typography>
          </Box>
          <Tooltip title="Force refresh plugin list from backend">
            <IconButton
              onClick={handleRefresh}
              disabled={refreshing}
              color="primary"
            >
              {refreshing ? <CircularProgress size={24} /> : <Renew size={20} />}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mx: 2, mt: 2 }}>
          {error}
        </Alert>
      )}

      {/* Tabs */}
      <Paper elevation={0} sx={{ borderBottom: 1, borderColor: 'divider', mt: 2 }}>
        <Tabs
          value={tabValue}
          onChange={(_, newValue) => setTabValue(newValue)}
          aria-label="plugin browser tabs"
        >
          <Tab label={`Plugins (${plugins.length})`} icon={<Equalizer size={18} />} iconPosition="start" />
          <Tab label={`Presets (${presets.length})`} icon={<FolderDetails size={18} />} iconPosition="start" />
        </Tabs>
      </Paper>

      {/* Tab Panels */}
      {tabValue === 0 ? (
        <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
          {/* Search and Filters */}
          <Paper sx={{ p: 2, mb: 2 }}>
            <Stack spacing={2}>
              <TextField
                fullWidth
                placeholder="Search plugins by name, author, or category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search size={16} />
                    </InputAdornment>
                  ),
                }}
              />

              <Box>
                <Stack direction="row" alignItems="center" spacing={1} mb={1}>
                  <Filter size={16} />
                  <Typography variant="subtitle2">Category</Typography>
                </Stack>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {categories.map((category) => (
                    <Chip
                      key={category}
                      label={category === 'all' ? 'All' : category}
                      onClick={() => setSelectedCategory(category)}
                      color={selectedCategory === category ? 'primary' : 'default'}
                      variant={selectedCategory === category ? 'filled' : 'outlined'}
                    />
                  ))}
                </Stack>
              </Box>
            </Stack>
          </Paper>

          {/* Plugin Results */}
          <Box>
        <Typography variant="subtitle2" gutterBottom>
          {filteredPlugins.length} plugin{filteredPlugins.length !== 1 ? 's' : ''} found
        </Typography>

            <Typography variant="subtitle2" gutterBottom>
              {filteredPlugins.length} plugin{filteredPlugins.length !== 1 ? 's' : ''} found
            </Typography>

            {filteredPlugins.length > 0 ? (
              <Grid container spacing={2} sx={{ mt: 0 }}>
                {filteredPlugins.map((plugin) => (
                  <Grid item xs={12} sm={6} md={4} lg={3} key={plugin.uri}>
                <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <CardContent sx={{ flexGrow: 1 }}>
                    <Stack spacing={1}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <IconGlyph icon={Equalizer} color="primary.main" />
                        <Typography variant="h6" component="div" noWrap>
                          {getDisplayPluginName(plugin.name, plugin.uri)}
                        </Typography>
                        {pluginsWithFavorites.has(plugin.uri) && (
                          <Tooltip title="Has saved presets">
                            <IconGlyph icon={FavoriteFilled} size={18} color="error.main" />
                          </Tooltip>
                        )}
                      </Box>

                      <Typography variant="body2" color="text.secondary">
                        by {sanitizeRestrictedDisplayText(plugin.author)}
                      </Typography>

                      <Stack direction="row" spacing={1}>
                        <Chip label={plugin.category} size="small" color="primary" variant="outlined" />
                        <Chip label={plugin.class_label} size="small" />
                      </Stack>

                      <Divider />

                      <Stack direction="row" spacing={2}>
                        <Typography variant="caption" color="text.secondary">
                          Inputs: {plugin.in_ports}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Outputs: {plugin.out_ports}
                        </Typography>
                      </Stack>

                      {/* UI Capability Badges */}
                      {(plugin.has_ui || (plugin as any).ui_info) && (
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                          {plugin.has_ui && (
                            <Chip 
                              label="GUI" 
                              size="small" 
                              color="info" 
                              variant="outlined"
                              sx={{ fontSize: '0.65rem', height: 20 }}
                            />
                          )}
                          {(plugin as any).ui_info?.has_meters && (
                            <Chip 
                              label="Meters" 
                              size="small" 
                              color="success" 
                              variant="outlined"
                              sx={{ fontSize: '0.65rem', height: 20 }}
                            />
                          )}
                          {(plugin as any).ui_info?.has_tuner && (
                            <Chip 
                              label="Tuner" 
                              size="small" 
                              color="secondary" 
                              variant="outlined"
                              sx={{ fontSize: '0.65rem', height: 20 }}
                            />
                          )}
                          {(plugin as any).ui_info?.has_spectrum && (
                            <Chip 
                              label="Spectrum" 
                              size="small" 
                              color="warning" 
                              variant="outlined"
                              sx={{ fontSize: '0.65rem', height: 20 }}
                            />
                          )}
                        </Stack>
                      )}

                      {plugin.parameters && plugin.parameters.length > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          {plugin.parameters.length} parameter{plugin.parameters.length !== 1 ? 's' : ''}
                        </Typography>
                      )}

                      {plugin.license && (
                        <Typography variant="caption" color="text.secondary">
                          License: {plugin.license}
                        </Typography>
                      )}
                    </Stack>
                  </CardContent>

                  <CardActions sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Tooltip title="Manage parameter presets">
                      <Button
                        size="small"
                        startIcon={<FolderDetails size={16} />}
                        onClick={() => {
                          setSelectedPluginForPreset(plugin);
                          setPresetManagerOpen(true);
                        }}
                        variant={pluginsWithFavorites.has(plugin.uri) ? 'contained' : 'outlined'}
                        color={pluginsWithFavorites.has(plugin.uri) ? 'error' : 'primary'}
                      >
                        Presets
                      </Button>
                    </Tooltip>
                    <Accordion sx={{ width: '100%', flex: 1 }} elevation={0}>
                      <AccordionSummary expandIcon={<ChevronDown size={16} />}>
                        <Typography variant="caption">
                          <Box component="span" sx={{ display: 'inline-flex', mr: 0.5, verticalAlign: 'middle' }}>
                            <Information size={14} />
                          </Box>
                          Details
                        </Typography>
                      </AccordionSummary>
                      <AccordionDetails>
                        <Stack spacing={1}>
                          <Typography variant="caption" sx={{ wordBreak: 'break-all' }}>
                            <strong>URI:</strong> {plugin.uri}
                          </Typography>
                          {plugin.version && (
                            <Typography variant="caption">
                              <strong>Version:</strong> {plugin.version}
                            </Typography>
                          )}
                          {plugin.has_ui && (
                            <Chip label="Has GUI" size="small" color="success" />
                          )}
                          {plugin.parameters && plugin.parameters.length > 0 && (
                            <>
                              <Typography variant="caption" sx={{ mt: 1 }}>
                                <strong>Parameters:</strong>
                              </Typography>
                              <List dense disablePadding>
                                {plugin.parameters.slice(0, 5).map((param, idx) => (
                                  <ListItem key={idx} dense disablePadding>
                                    <ListItemText
                                      primary={
                                        <Typography variant="caption">
                                          {param.name}
                                        </Typography>
                                      }
                                      secondary={
                                        <Typography variant="caption" color="text.secondary">
                                          {param.min} to {param.max} (default: {param.default})
                                        </Typography>
                                      }
                                    />
                                  </ListItem>
                                ))}
                                {plugin.parameters.length > 5 && (
                                  <Typography variant="caption" color="text.secondary">
                                    ... and {plugin.parameters.length - 5} more
                                  </Typography>
                                )}
                              </List>
                            </>
                          )}
                        </Stack>
                      </AccordionDetails>
                    </Accordion>
                  </CardActions>
                </Card>
              </Grid>
            ))}
              </Grid>
            ) : (
              <Alert severity="info" sx={{ mt: 2 }}>
                No plugins found matching your search criteria.
              </Alert>
            )}
          </Box>

        </Box>
      ) : (
        <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
          {/* Preset Tab Content */}

          {/* Preset Filters */}
          <Paper sx={{ p: 2, mb: 2 }}>
            <Stack spacing={2}>
              <TextField
                fullWidth
                placeholder="Search presets..."
                value={presetSearchQuery}
                onChange={(e) => setPresetSearchQuery(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search size={16} />
                    </InputAdornment>
                  ),
                }}
              />

              <Box>
                <Stack direction="row" alignItems="center" spacing={1} mb={1}>
                  <Filter size={16} />
                  <Typography variant="subtitle2">Category</Typography>
                </Stack>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip
                    label="All"
                    onClick={() => setSelectedPresetCategory('all')}
                    color={selectedPresetCategory === 'all' ? 'primary' : 'default'}
                    variant={selectedPresetCategory === 'all' ? 'filled' : 'outlined'}
                  />
                  {presetCategories.map((cat) => (
                    <Chip
                      key={cat.name}
                      label={`${cat.name} (${cat.count})`}
                      onClick={() => setSelectedPresetCategory(cat.name)}
                      color={selectedPresetCategory === cat.name ? 'primary' : 'default'}
                      variant={selectedPresetCategory === cat.name ? 'filled' : 'outlined'}
                    />
                  ))}
                </Stack>
              </Box>

              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Tags
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip
                    label="All"
                    onClick={() => setSelectedPresetTag('all')}
                    color={selectedPresetTag === 'all' ? 'primary' : 'default'}
                    variant={selectedPresetTag === 'all' ? 'filled' : 'outlined'}
                    size="small"
                  />
                  {presetTags.map((tag) => (
                    <Chip
                      key={tag}
                      label={tag}
                      onClick={() => setSelectedPresetTag(tag)}
                      color={selectedPresetTag === tag ? 'primary' : 'default'}
                      variant={selectedPresetTag === tag ? 'filled' : 'outlined'}
                      size="small"
                    />
                  ))}
                </Stack>
              </Box>

              <Box>
                <Chip
                  icon={favoritesOnly ? <FavoriteFilled size={14} /> : <Favorite size={14} />}
                  label="Favorites Only"
                  onClick={() => setFavoritesOnly(!favoritesOnly)}
                  color={favoritesOnly ? 'secondary' : 'default'}
                  variant={favoritesOnly ? 'filled' : 'outlined'}
                />
              </Box>
            </Stack>
          </Paper>

          {/* Preset Results */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              {presets.length} preset{presets.length !== 1 ? 's' : ''} found
            </Typography>

            {presets.length > 0 ? (
              <Grid container spacing={2} sx={{ mt: 0 }}>
                {presets.map((preset) => (
                  <Grid item xs={12} sm={6} md={4} key={preset.id}>
                    <Card variant="outlined">
                      <CardContent>
                        <Stack spacing={1}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography variant="h6" component="div" noWrap sx={{ flexGrow: 1 }}>
                              {preset.name}
                            </Typography>
                            <IconButton
                              size="small"
                              onClick={() => handleToggleFavorite(preset.id)}
                            >
                              {preset.is_favorite ? (
                                <FavoriteFilled size={18} />
                              ) : (
                                <Favorite size={18} />
                              )}
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                setSelectedPreset(preset);
                                setMenuAnchor(e.currentTarget);
                              }}
                            >
                              <OverflowMenuVertical size={18} />
                            </IconButton>
                          </Box>

                          {preset.description && (
                            <Typography variant="body2" color="text.secondary" noWrap>
                              {preset.description}
                            </Typography>
                          )}

                          {preset.category && (
                            <Chip label={preset.category} size="small" color="primary" variant="outlined" />
                          )}

                          {preset.tags && preset.tags.length > 0 && (
                            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                              {preset.tags.map((tag) => (
                                <Chip key={tag} label={tag} size="small" />
                              ))}
                            </Stack>
                          )}

                          <Typography variant="caption" color="text.secondary">
                            Updated: {new Date(preset.updated_at).toLocaleDateString()}
                          </Typography>
                        </Stack>
                      </CardContent>

                      <CardActions>
                        <Button
                          size="small"
                          startIcon={<PlayFilled size={16} />}
                          onClick={() => handleLoadPreset(preset.id)}
                        >
                          Load
                        </Button>
                      </CardActions>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            ) : (
              <Alert severity="info" sx={{ mt: 2 }}>
                No presets found matching your criteria.
              </Alert>
            )}
          </Box>
        </Box>
      )}

      {/* Plugin Pack Manager - Fixed Bottom Section */}
      <Paper
        elevation={3}
        sx={{
          borderTop: '2px solid',
          borderColor: 'primary.main',
          p: 2,
          background: 'linear-gradient(180deg, rgba(25, 118, 210, 0.05) 0%, transparent 100%)'
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <IconGlyph icon={AppConnectivity} size={28} color="primary.main" />
            <Box>
              <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
                Plugin Pack Manager
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Install or uninstall curated plugin collections via system packages
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              icon={<CheckmarkFilled size={14} />}
              label={`${pluginPacks.filter(p => p.status === 'installed').length} of ${pluginPacks.length} installed`}
              color="success"
              variant="outlined"
            />
            <Button
              size="small"
              startIcon={packsLoading ? <CircularProgress size={16} /> : <Renew size={16} />}
              onClick={loadPluginPacks}
              disabled={packsLoading}
            >
              Refresh
            </Button>
            <Button
              size="small"
              variant={packsExpanded ? 'contained' : 'outlined'}
              onClick={() => setPacksExpanded(!packsExpanded)}
              endIcon={
                <Box
                  component="span"
                  sx={{
                    display: 'inline-flex',
                    transform: packsExpanded ? 'rotate(180deg)' : 'none',
                    transition: '0.3s',
                  }}
                >
                  <ChevronDown size={16} />
                </Box>
              }
            >
              {packsExpanded ? 'Collapse' : 'Expand'}
            </Button>
          </Stack>
        </Box>

        {packsExpanded && (
          <Box sx={{ mt: 2 }}>
            {packsLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                <CircularProgress />
              </Box>
            ) : (
              <Grid container spacing={2}>
                {pluginPacks.map((pack) => (
                  <Grid item xs={12} sm={6} md={4} lg={3} key={pack.id}>
                    <Card
                      variant="outlined"
                      sx={{
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        opacity: pack.status === 'installing' || pack.status === 'uninstalling' ? 0.7 : 1,
                        borderColor: pack.status === 'installed' ? 'success.main' : 'divider',
                        transition: 'all 0.3s',
                        '&:hover': {
                          boxShadow: 3,
                          borderColor: 'primary.main'
                        }
                      }}
                    >
                      <CardContent sx={{ flexGrow: 1, pb: 1 }}>
                        <Stack spacing={1}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography variant="subtitle1" component="div" fontWeight={600}>
                              {pack.name}
                            </Typography>
                            {pack.status === 'installed' && (
                              <Tooltip title="Installed">
                                <IconGlyph icon={CheckmarkFilled} size={16} color="success.main" />
                              </Tooltip>
                            )}
                            {pack.status === 'error' && (
                              <Tooltip title={pack.error_message || 'Error'}>
                                <IconGlyph icon={WarningAlt} size={16} color="error.main" />
                              </Tooltip>
                            )}
                            {(pack.status === 'installing' || pack.status === 'uninstalling') && (
                              <CircularProgress size={18} />
                            )}
                          </Box>

                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem', lineHeight: 1.4 }}>
                            {pack.description}
                          </Typography>

                          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                            <Chip label={pack.category} size="small" color="primary" variant="outlined" sx={{ fontSize: '0.7rem', height: 22 }} />
                            <Chip label={`${pack.plugin_count} plugins`} size="small" sx={{ fontSize: '0.7rem', height: 22 }} />
                            <Chip label={pack.size_estimate} size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 22 }} />
                          </Stack>
                        </Stack>
                      </CardContent>

                      <CardActions sx={{ pt: 0 }}>
                        {pack.status === 'installing' ? (
                          <Button size="small" disabled fullWidth>
                            Installing...
                          </Button>
                        ) : pack.status === 'uninstalling' ? (
                          <Button size="small" disabled fullWidth>
                            Uninstalling...
                          </Button>
                        ) : pack.status === 'disabling' ? (
                          <Button size="small" disabled fullWidth>
                            Disabling...
                          </Button>
                        ) : pack.status === 'enabling' ? (
                          <Button size="small" disabled fullWidth>
                            Enabling...
                          </Button>
                        ) : pack.status === 'disabled' ? (
                          <Button
                            size="small"
                            color="primary"
                            variant="contained"
                            onClick={() => {
                              fetch(`/api/plugin-packages/${pack.id}/enable`, { method: 'POST' });
                              setPluginPacks(prev => prev.map(p =>
                                p.id === pack.id ? { ...p, status: 'enabling' as const } : p
                              ));
                              pollPackStatus(pack.id);
                            }}
                            fullWidth
                          >
                            Enable
                          </Button>
                        ) : pack.status === 'installed' ? (
                          <Stack direction="row" spacing={1} sx={{ width: '100%' }}>
                            <Button
                              size="small"
                              color="inherit"
                              variant="outlined"
                              onClick={() => {
                                fetch(`/api/plugin-packages/${pack.id}/disable`, { method: 'POST' });
                                setPluginPacks(prev => prev.map(p =>
                                  p.id === pack.id ? { ...p, status: 'disabling' as const } : p
                                ));
                                pollPackStatus(pack.id);
                              }}
                              sx={{ flex: 1 }}
                            >
                              Disable
                            </Button>
                            {pack.can_uninstall !== false && (
                              <Button
                                size="small"
                                color="error"
                                variant="outlined"
                                startIcon={<TrashCan size={16} />}
                                onClick={() => handleUninstallPack(pack.id)}
                                sx={{ flex: 1 }}
                              >
                                Uninstall
                              </Button>
                            )}
                          </Stack>
                        ) : pack.can_install !== false ? (
                          <Button
                            size="small"
                            color="primary"
                            variant="contained"
                            startIcon={<Download size={16} />}
                            onClick={() => handleInstallPack(pack.id)}
                            fullWidth
                          >
                            Install
                          </Button>
                        ) : (
                          <Typography variant="caption" color="text.secondary" sx={{ p: 1, textAlign: 'center', width: '100%' }}>
                            Not available via package manager
                          </Typography>
                        )}
                      </CardActions>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}
          </Box>
        )}

        {/* Quick Status Row when collapsed */}
        {!packsExpanded && pluginPacks.length > 0 && (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
            {pluginPacks.map((pack) => (
              <Chip
                key={pack.id}
                label={pack.name}
                size="small"
                color={pack.status === 'installed' ? 'success' : 'default'}
                variant={pack.status === 'installed' ? 'filled' : 'outlined'}
                icon={
                  pack.status === 'installing' || pack.status === 'uninstalling'
                    ? <CircularProgress size={12} />
                    : pack.status === 'installed'
                      ? <CheckmarkFilled size={12} />
                      : undefined
                }
                onClick={() => setPacksExpanded(true)}
                sx={{ cursor: 'pointer' }}
              />
            ))}
          </Stack>
        )}
      </Paper>

      {/* Context Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
      >
        <MenuItem onClick={() => selectedPreset && handleOpenEdit(selectedPreset)}>
          <Edit size={16} style={{ marginRight: 8 }} />
          Edit
        </MenuItem>
        <MenuItem onClick={() => selectedPreset && handleDeletePreset(selectedPreset.id)}>
          <TrashCan size={16} style={{ marginRight: 8 }} />
          Delete
        </MenuItem>
      </Menu>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Preset</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Name"
              fullWidth
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
            <TextField
              label="Description"
              fullWidth
              multiline
              rows={3}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
            />
            <TextField
              label="Category"
              fullWidth
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveEdit} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>

      {/* Plugin Preset Manager Dialog */}
      <Dialog
        open={presetManagerOpen}
        onClose={() => setPresetManagerOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Manage Presets - {selectedPluginForPreset?.name}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {selectedPluginForPreset && (
            <PluginPresetManager
              pluginUri={selectedPluginForPreset.uri}
              pluginName={getDisplayPluginName(selectedPluginForPreset.name, selectedPluginForPreset.uri)}
              currentParameters={
                selectedPluginForPreset.parameters?.reduce(
                  (acc, param) => ({
                    ...acc,
                    [param.symbol || param.name]: param.default,
                  }),
                  {}
                ) || {}
              }
              onPresetsChanged={() => {
                loadPluginsWithFavorites();
              }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPresetManagerOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
