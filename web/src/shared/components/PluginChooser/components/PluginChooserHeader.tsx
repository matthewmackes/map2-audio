// ============================================================================
// PluginChooser - Header Component
// Search bar, view mode toggle, sort controls
// ============================================================================

import { useState, useRef, useEffect } from 'react'
import {
  Box,
  TextField,
  InputAdornment,
  IconButton,
  ToggleButtonGroup,
  ToggleButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Chip,
  Stack,
  Typography,
  Autocomplete,
} from '@mui/material'
import {
  Search as SearchIcon,
  Clear as ClearIcon,
  GridView as GridViewIcon,
  ViewList as ListViewIcon,
  TableRows as TableViewIcon,
  Sort as SortIcon,
  ArrowUpward as AscIcon,
  ArrowDownward as DescIcon,
  SortByAlpha as SortNameIcon,
  Person as SortAuthorIcon,
  Category as SortCategoryIcon,
  History as SortRecentIcon,
  TrendingUp as SortFrequencyIcon,
  Tune as SortParamsIcon,
  Info as InfoIcon,
} from '@mui/icons-material'
import { usePluginChooser } from '../PluginChooserContext'
import { ViewMode, SortBy } from '../types'

interface PluginChooserHeaderProps {
  title?: string
  onTogglePreviewPanel?: () => void
  showPreviewToggle?: boolean
}

const SORT_OPTIONS: { value: SortBy; label: string; icon: React.ReactNode }[] = [
  { value: 'name', label: 'Name', icon: <SortNameIcon fontSize="small" /> },
  { value: 'author', label: 'Author', icon: <SortAuthorIcon fontSize="small" /> },
  { value: 'category', label: 'Category', icon: <SortCategoryIcon fontSize="small" /> },
  { value: 'recent', label: 'Recently Used', icon: <SortRecentIcon fontSize="small" /> },
  { value: 'frequency', label: 'Most Used', icon: <SortFrequencyIcon fontSize="small" /> },
  { value: 'params', label: 'Parameters', icon: <SortParamsIcon fontSize="small" /> },
]

export function PluginChooserHeader({
  title = 'Select Plugin',
  onTogglePreviewPanel,
  showPreviewToggle = true,
}: PluginChooserHeaderProps) {
  const {
    state,
    filteredPlugins,
    plugins,
    setSearchQuery,
    setViewMode,
    setSort,
    resetFilters,
    togglePreviewPanel,
  } = usePluginChooser()

  const [sortAnchorEl, setSortAnchorEl] = useState<null | HTMLElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Focus search on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      searchInputRef.current?.focus()
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  const handleViewModeChange = (
    _: React.MouseEvent<HTMLElement>,
    newMode: ViewMode | null
  ) => {
    if (newMode) {
      setViewMode(newMode)
    }
  }

  const handleSortClick = (event: React.MouseEvent<HTMLElement>) => {
    setSortAnchorEl(event.currentTarget)
  }

  const handleSortClose = () => {
    setSortAnchorEl(null)
  }

  const handleSortSelect = (sortBy: SortBy) => {
    // Toggle direction if same sort is selected
    if (state.sortBy === sortBy) {
      setSort(sortBy, state.sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSort(sortBy, 'asc')
    }
    handleSortClose()
  }

  const handleClearSearch = () => {
    setSearchQuery('')
    searchInputRef.current?.focus()
  }

  const handleClearAll = () => {
    resetFilters()
    searchInputRef.current?.focus()
  }

  const currentSortOption = SORT_OPTIONS.find(opt => opt.value === state.sortBy)
  const hasActiveFilters =
    state.searchQuery ||
    state.selectedCategory ||
    state.showFavoritesOnly ||
    state.showRecentOnly ||
    state.selectedFolder ||
    state.selectedTags.length > 0

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        p: 1.5,
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      {/* Title and controls row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="h6" sx={{ flexShrink: 0, mr: 1 }}>
          {title}
        </Typography>

        {/* Search field */}
        <TextField
          inputRef={searchInputRef}
          size="small"
          placeholder="Search plugins... (try author:name, type:delay)"
          value={state.searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{ flex: 1, maxWidth: 400 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
              </InputAdornment>
            ),
            endAdornment: state.searchQuery && (
              <InputAdornment position="end">
                <IconButton size="small" onClick={handleClearSearch}>
                  <ClearIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />

        <Box sx={{ flexGrow: 1 }} />

        {/* View mode toggle */}
        <ToggleButtonGroup
          value={state.viewMode}
          exclusive
          onChange={handleViewModeChange}
          size="small"
        >
          <ToggleButton value="grid">
            <Tooltip title="Grid view">
              <GridViewIcon sx={{ fontSize: 18 }} />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="list">
            <Tooltip title="List view">
              <ListViewIcon sx={{ fontSize: 18 }} />
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>

        {/* Sort button */}
        <Tooltip title="Sort">
          <IconButton size="small" onClick={handleSortClick}>
            <SortIcon sx={{ fontSize: 20 }} />
            {state.sortDirection === 'desc' ? (
              <DescIcon sx={{ fontSize: 12, ml: -0.5 }} />
            ) : (
              <AscIcon sx={{ fontSize: 12, ml: -0.5 }} />
            )}
          </IconButton>
        </Tooltip>

        {/* Sort menu */}
        <Menu
          anchorEl={sortAnchorEl}
          open={Boolean(sortAnchorEl)}
          onClose={handleSortClose}
        >
          {SORT_OPTIONS.map((option) => (
            <MenuItem
              key={option.value}
              onClick={() => handleSortSelect(option.value)}
              selected={state.sortBy === option.value}
            >
              <ListItemIcon>{option.icon}</ListItemIcon>
              <ListItemText>{option.label}</ListItemText>
              {state.sortBy === option.value && (
                state.sortDirection === 'desc' ? (
                  <DescIcon sx={{ fontSize: 16, ml: 1 }} />
                ) : (
                  <AscIcon sx={{ fontSize: 16, ml: 1 }} />
                )
              )}
            </MenuItem>
          ))}
        </Menu>

        {/* Preview panel toggle */}
        {showPreviewToggle && (
          <Tooltip title={state.previewPanelOpen ? 'Hide preview' : 'Show preview'}>
            <IconButton
              size="small"
              onClick={onTogglePreviewPanel || togglePreviewPanel}
              color={state.previewPanelOpen ? 'primary' : 'default'}
            >
              <InfoIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Active filters / status row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 24 }}>
        {/* Result count */}
        <Typography variant="caption" color="text.secondary">
          {filteredPlugins.length} of {plugins.length} plugins
        </Typography>

        {/* Active filter chips */}
        <Stack direction="row" spacing={0.5} sx={{ flex: 1 }}>
          {state.selectedCategory && (
            <Chip
              label={`Category: ${state.selectedCategory}`}
              size="small"
              onDelete={() => resetFilters()}
              sx={{ height: 20, fontSize: '0.7rem' }}
            />
          )}
          {state.showFavoritesOnly && (
            <Chip
              label="Favorites only"
              size="small"
              color="warning"
              onDelete={() => resetFilters()}
              sx={{ height: 20, fontSize: '0.7rem' }}
            />
          )}
          {state.showRecentOnly && (
            <Chip
              label="Recent only"
              size="small"
              color="info"
              onDelete={() => resetFilters()}
              sx={{ height: 20, fontSize: '0.7rem' }}
            />
          )}
          {state.selectedFolder && (
            <Chip
              label="Folder filter active"
              size="small"
              onDelete={() => resetFilters()}
              sx={{ height: 20, fontSize: '0.7rem' }}
            />
          )}
        </Stack>

        {/* Clear all filters */}
        {hasActiveFilters && (
          <Chip
            label="Clear all"
            size="small"
            onClick={handleClearAll}
            sx={{ height: 20, fontSize: '0.7rem', cursor: 'pointer' }}
          />
        )}

        {/* Current sort indicator */}
        {currentSortOption && (
          <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto' }}>
            Sorted by {currentSortOption.label.toLowerCase()}
            {state.sortDirection === 'desc' ? ' (desc)' : ''}
          </Typography>
        )}
      </Box>
    </Box>
  )
}

export default PluginChooserHeader
