// ============================================================================
// PluginChooser - Category Sidebar
// Hierarchical category navigation with folders support
// ============================================================================

import { useState, useMemo } from 'react'
import {
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Collapse,
  Typography,
  Divider,
  IconButton,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Badge,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import {
  ExpandLess,
  ExpandMore,
  Star as StarIcon,
  History as HistoryIcon,
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  CreateNewFolder as CreateNewFolderIcon,
  Delete as DeleteIcon,
  ChevronLeft as ChevronLeftIcon,
} from '@mui/icons-material'
import { usePluginChooser } from '../PluginChooserContext'
import { buildCategoryTree } from '../utils/pluginFilters'
import { CategoryNode, PluginFolder } from '../types'
import { LegacyPluginIcon } from './LegacyPluginIcon'
import { PluginType } from '../../../../pipedal/Lv2Plugin'

interface CategorySidebarProps {
  onCollapse?: () => void
}

export function CategorySidebar({ onCollapse }: CategorySidebarProps) {
  const {
    state,
    plugins,
    filteredPlugins,
    folders,
    setCategory,
    setFavoritesOnly,
    setRecentOnly,
    setFolder,
    createFolder,
    deleteFolder,
    resetFilters,
  } = usePluginChooser()

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  // Build category tree from plugins
  const categoryTree = useMemo(() => buildCategoryTree(plugins), [plugins])

  // Count favorites and recent
  const favoritesCount = useMemo(
    () => plugins.filter(p => p.isFavorite).length,
    [plugins]
  )
  const recentCount = useMemo(
    () => plugins.filter(p => p.lastUsed !== undefined).length,
    [plugins]
  )

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      return next
    })
  }

  const handleCategoryClick = (category: string | null) => {
    setCategory(category)
  }

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      createFolder(newFolderName.trim())
      setNewFolderName('')
      setCreateFolderOpen(false)
    }
  }

  const handleDeleteFolder = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    deleteFolder(folderId)
  }

  // Get category icon based on name
  const getCategoryPluginType = (name: string): PluginType => {
    const nameLower = name.toLowerCase()
    if (nameLower.includes('compressor')) return PluginType.CompressorPlugin
    if (nameLower.includes('limiter')) return PluginType.LimiterPlugin
    if (nameLower.includes('gate')) return PluginType.GatePlugin
    if (nameLower.includes('delay')) return PluginType.DelayPlugin
    if (nameLower.includes('reverb')) return PluginType.ReverbPlugin
    if (nameLower.includes('distortion')) return PluginType.DistortionPlugin
    if (nameLower.includes('amplifier') || nameLower.includes('amp')) return PluginType.AmplifierPlugin
    if (nameLower.includes('chorus')) return PluginType.ChorusPlugin
    if (nameLower.includes('flanger')) return PluginType.FlangerPlugin
    if (nameLower.includes('phaser')) return PluginType.PhaserPlugin
    if (nameLower.includes('eq') || nameLower.includes('equalizer')) return PluginType.EQPlugin
    if (nameLower.includes('filter')) return PluginType.FilterPlugin
    if (nameLower.includes('modulator')) return PluginType.ModulatorPlugin
    if (nameLower.includes('simulator')) return PluginType.SimulatorPlugin
    if (nameLower.includes('dynamics')) return PluginType.CompressorPlugin
    if (nameLower.includes('utility')) return PluginType.UtilityPlugin
    return PluginType.Plugin
  }

  const isAllSelected = !state.selectedCategory && !state.showFavoritesOnly && !state.showRecentOnly && !state.selectedFolder

  return (
    <Box
      sx={{
        width: state.sidebarCollapsed ? 48 : 220,
        flexShrink: 0,
        borderRight: 1,
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s ease',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: state.sidebarCollapsed ? 'center' : 'space-between',
          p: 1,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        {!state.sidebarCollapsed && (
          <Typography variant="subtitle2" fontWeight={600}>
            Categories
          </Typography>
        )}
        <IconButton size="small" onClick={onCollapse}>
          <ChevronLeftIcon
            sx={{
              transform: state.sidebarCollapsed ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s',
            }}
          />
        </IconButton>
      </Box>

      {/* Categories List */}
      <List
        component="nav"
        dense
        sx={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          py: 0.5,
        }}
      >
        {/* All Plugins */}
        <ListItemButton
          selected={isAllSelected}
          onClick={() => resetFilters()}
          sx={{ py: 0.5, minHeight: 36 }}
        >
          <ListItemIcon sx={{ minWidth: 32 }}>
            <LegacyPluginIcon pluginType={PluginType.Plugin} size={18} opacity={0.7} />
          </ListItemIcon>
          {!state.sidebarCollapsed && (
            <>
              <ListItemText
                primary="All Plugins"
                primaryTypographyProps={{ fontSize: '0.8rem' }}
              />
              <Typography variant="caption" color="text.secondary">
                {plugins.length}
              </Typography>
            </>
          )}
        </ListItemButton>

        {/* Favorites */}
        <ListItemButton
          selected={state.showFavoritesOnly}
          onClick={() => setFavoritesOnly(!state.showFavoritesOnly)}
          sx={{ py: 0.5, minHeight: 36 }}
        >
          <ListItemIcon sx={{ minWidth: 32 }}>
            <Badge
              badgeContent={favoritesCount}
              color="warning"
              max={99}
              sx={{ '& .MuiBadge-badge': { fontSize: '0.6rem', height: 14, minWidth: 14 } }}
            >
              <StarIcon sx={{ fontSize: 18, color: state.showFavoritesOnly ? 'warning.main' : 'text.secondary' }} />
            </Badge>
          </ListItemIcon>
          {!state.sidebarCollapsed && (
            <ListItemText
              primary="Favorites"
              primaryTypographyProps={{ fontSize: '0.8rem' }}
            />
          )}
        </ListItemButton>

        {/* Recent */}
        <ListItemButton
          selected={state.showRecentOnly}
          onClick={() => setRecentOnly(!state.showRecentOnly)}
          sx={{ py: 0.5, minHeight: 36 }}
        >
          <ListItemIcon sx={{ minWidth: 32 }}>
            <Badge
              badgeContent={recentCount}
              color="info"
              max={99}
              sx={{ '& .MuiBadge-badge': { fontSize: '0.6rem', height: 14, minWidth: 14 } }}
            >
              <HistoryIcon sx={{ fontSize: 18 }} />
            </Badge>
          </ListItemIcon>
          {!state.sidebarCollapsed && (
            <ListItemText
              primary="Recent"
              primaryTypographyProps={{ fontSize: '0.8rem' }}
            />
          )}
        </ListItemButton>

        <Divider sx={{ my: 0.5 }} />

        {/* Hardware Effects Section */}
        {plugins.some(p => p.format === 'hardware') && (
          <>
            {!state.sidebarCollapsed && (
            <Typography
              variant="caption"
              sx={{ px: 2, py: 0.5, display: 'block', color: 'warning.main', fontWeight: 600 }}
            >
              HARDWARE
            </Typography>
            )}
            <ListItemButton
              selected={state.selectedCategory === 'lexicon'}
              onClick={() => handleCategoryClick('lexicon')}
              sx={{
                py: 0.5,
                minHeight: 36,
                '&.Mui-selected': {
                  bgcolor: (theme) => alpha(theme.palette.warning.main, 0.15),
                  '&:hover': { bgcolor: (theme) => alpha(theme.palette.warning.main, 0.25) },
                },
                '&:hover': { bgcolor: (theme) => alpha(theme.palette.warning.main, 0.08) },
              }}
            >
              <ListItemIcon sx={{ minWidth: 32 }}>
                <img src="/img/fx_lexicon.svg" alt="" width={18} height={18} style={{ display: 'block' }} />
              </ListItemIcon>
              {!state.sidebarCollapsed && (
                <>
                  <ListItemText
                    primary="Lexicon MPX-1"
                    primaryTypographyProps={{ fontSize: '0.8rem', noWrap: true, sx: { color: 'warning.main' } }}
                  />
                  <Typography variant="caption" sx={{ color: 'warning.main' }}>
                    {plugins.filter(p => p.format === 'hardware').length}
                  </Typography>
                </>
              )}
            </ListItemButton>
            <Divider sx={{ my: 0.5 }} />
          </>
        )}

        {/* Plugin Categories */}
        {categoryTree.filter(c => c.name.toLowerCase() !== 'lexicon').map(category => (
          <ListItemButton
            key={category.id}
            selected={state.selectedCategory === category.name}
            onClick={() => handleCategoryClick(category.name)}
            sx={{ py: 0.5, minHeight: 36 }}
          >
            <ListItemIcon sx={{ minWidth: 32 }}>
              <LegacyPluginIcon
                pluginType={getCategoryPluginType(category.name)}
                size={18}
                opacity={0.7}
              />
            </ListItemIcon>
            {!state.sidebarCollapsed && (
              <>
                <ListItemText
                  primary={category.displayName}
                  primaryTypographyProps={{ fontSize: '0.8rem', noWrap: true }}
                />
                <Typography variant="caption" color="text.secondary">
                  {category.count}
                </Typography>
              </>
            )}
          </ListItemButton>
        ))}

        {!state.sidebarCollapsed && folders.length > 0 && (
          <>
            <Divider sx={{ my: 0.5 }} />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ px: 2, py: 0.5, display: 'block' }}
            >
              MY FOLDERS
            </Typography>
          </>
        )}

        {/* Custom Folders */}
        {!state.sidebarCollapsed &&
          folders.map(folder => (
            <ListItemButton
              key={folder.id}
              selected={state.selectedFolder === folder.id}
              onClick={() => setFolder(folder.id)}
              sx={{ py: 0.5, minHeight: 36 }}
            >
              <ListItemIcon sx={{ minWidth: 32 }}>
                {state.selectedFolder === folder.id ? (
                  <FolderOpenIcon sx={{ fontSize: 18 }} />
                ) : (
                  <FolderIcon sx={{ fontSize: 18 }} />
                )}
              </ListItemIcon>
              <ListItemText
                primary={folder.name}
                primaryTypographyProps={{ fontSize: '0.8rem', noWrap: true }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                {folder.pluginUris.length}
              </Typography>
              <IconButton
                size="small"
                onClick={(e) => handleDeleteFolder(folder.id, e)}
                sx={{ p: 0.25 }}
              >
                <DeleteIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </ListItemButton>
          ))}

        {/* Create Folder Button */}
        {!state.sidebarCollapsed && (
          <ListItemButton
            onClick={() => setCreateFolderOpen(true)}
            sx={{ py: 0.5, minHeight: 36, color: 'text.secondary' }}
          >
            <ListItemIcon sx={{ minWidth: 32 }}>
              <CreateNewFolderIcon sx={{ fontSize: 18 }} />
            </ListItemIcon>
            <ListItemText
              primary="New Folder"
              primaryTypographyProps={{ fontSize: '0.8rem' }}
            />
          </ListItemButton>
        )}
      </List>

      {/* Create Folder Dialog */}
      <Dialog open={createFolderOpen} onClose={() => setCreateFolderOpen(false)}>
        <DialogTitle>Create New Folder</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Folder Name"
            fullWidth
            variant="outlined"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolder()
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateFolderOpen(false)}>Cancel</Button>
          <Button onClick={handleCreateFolder} variant="contained">
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default CategorySidebar
