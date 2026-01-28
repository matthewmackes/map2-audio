// ============================================================================
// MAP2 Audio Platform - Preset Manager Component
// Complete preset management with filters, favorites, and search
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
  IconButton,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
} from '@mui/material';
import {
  Search as SearchIcon,
  Favorite as FavoriteIcon,
  FavoriteBorder as FavoriteOutlineIcon,
  Delete as DeleteIcon,
  PlayArrow as LoadIcon,
  MoreVert as MoreIcon,
  Edit as EditIcon,
  Refresh as RefreshIcon,
  FilterList as FilterIcon,
} from '@mui/icons-material';
import { presetsApi, chainsApi } from '../api';
import type { Preset, PresetCategory } from '../types';

export default function PresetManager() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [categories, setCategories] = useState<PresetCategory[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  // Menu state
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null);

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('');

  // Load data
  const loadData = useCallback(async () => {
    try {
      const [presetsRes, categoriesRes, tagsRes] = await Promise.all([
        presetsApi.list({
          category: selectedCategory !== 'all' ? selectedCategory : undefined,
          tags: selectedTag !== 'all' ? selectedTag : undefined,
          favorites_only: favoritesOnly || undefined,
          search: searchQuery || undefined,
        }),
        presetsApi.getCategories(),
        presetsApi.getTags(),
      ]);

      setPresets(presetsRes.presets || []);
      setCategories(categoriesRes.categories || []);
      setTags(tagsRes.tags || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load presets');
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, selectedTag, favoritesOnly, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Toggle favorite
  const handleToggleFavorite = async (presetId: number) => {
    try {
      await presetsApi.toggleFavorite(presetId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle favorite');
    }
  };

  // Load preset
  const handleLoadPreset = async (presetId: number) => {
    try {
      await chainsApi.loadPreset(presetId);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preset');
    }
  };

  // Delete preset
  const handleDeletePreset = async (presetId: number) => {
    if (!confirm('Are you sure you want to delete this preset?')) return;

    try {
      await presetsApi.delete(presetId);
      await loadData();
      setMenuAnchor(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete preset');
    }
  };

  // Open edit dialog
  const handleOpenEdit = (preset: Preset) => {
    setSelectedPreset(preset);
    setEditName(preset.name);
    setEditDescription(preset.description || '');
    setEditCategory(preset.category || '');
    setEditDialogOpen(true);
    setMenuAnchor(null);
  };

  // Save preset changes
  const handleSaveEdit = async () => {
    if (!selectedPreset) return;

    try {
      await presetsApi.update(selectedPreset.id, {
        name: editName,
        description: editDescription,
        category: editCategory,
      });
      await loadData();
      setEditDialogOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update preset');
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>
          Preset Manager
        </Typography>
        <IconButton onClick={loadData}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack spacing={2}>
          <TextField
            fullWidth
            placeholder="Search presets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />

          <Box>
            <Stack direction="row" alignItems="center" spacing={1} mb={1}>
              <FilterIcon fontSize="small" />
              <Typography variant="subtitle2">Category</Typography>
            </Stack>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip
                label="All"
                onClick={() => setSelectedCategory('all')}
                color={selectedCategory === 'all' ? 'primary' : 'default'}
                variant={selectedCategory === 'all' ? 'filled' : 'outlined'}
              />
              {categories.map((cat) => (
                <Chip
                  key={cat.name}
                  label={`${cat.name} (${cat.count})`}
                  onClick={() => setSelectedCategory(cat.name)}
                  color={selectedCategory === cat.name ? 'primary' : 'default'}
                  variant={selectedCategory === cat.name ? 'filled' : 'outlined'}
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
                onClick={() => setSelectedTag('all')}
                color={selectedTag === 'all' ? 'primary' : 'default'}
                variant={selectedTag === 'all' ? 'filled' : 'outlined'}
                size="small"
              />
              {tags.map((tag) => (
                <Chip
                  key={tag}
                  label={tag}
                  onClick={() => setSelectedTag(tag)}
                  color={selectedTag === tag ? 'primary' : 'default'}
                  variant={selectedTag === tag ? 'filled' : 'outlined'}
                  size="small"
                />
              ))}
            </Stack>
          </Box>

          <Box>
            <Chip
              icon={favoritesOnly ? <FavoriteIcon /> : <FavoriteOutlineIcon />}
              label="Favorites Only"
              onClick={() => setFavoritesOnly(!favoritesOnly)}
              color={favoritesOnly ? 'secondary' : 'default'}
              variant={favoritesOnly ? 'filled' : 'outlined'}
            />
          </Box>
        </Stack>
      </Paper>

      {/* Results */}
      <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
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
                            <FavoriteIcon color="secondary" />
                          ) : (
                            <FavoriteOutlineIcon />
                          )}
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            setSelectedPreset(preset);
                            setMenuAnchor(e.currentTarget);
                          }}
                        >
                          <MoreIcon />
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
                      startIcon={<LoadIcon />}
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

      {/* Context Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
      >
        <MenuItem onClick={() => selectedPreset && handleOpenEdit(selectedPreset)}>
          <EditIcon sx={{ mr: 1 }} fontSize="small" />
          Edit
        </MenuItem>
        <MenuItem onClick={() => selectedPreset && handleDeletePreset(selectedPreset.id)}>
          <DeleteIcon sx={{ mr: 1 }} fontSize="small" />
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
    </Box>
  );
}
