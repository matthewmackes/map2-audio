// ============================================================================
// PluginChooser - Type Definitions
// Unified plugin selection component for MAP2 Audio Platform
// ============================================================================

import { PluginType } from '../../../pipedal/Lv2Plugin'

/**
 * Unified plugin format type
 */
export type PluginFormat = 'lv2' | 'vst3' | 'hardware'

/**
 * View modes for the plugin grid/list
 */
export type ViewMode = 'grid' | 'list' | 'table'

/**
 * Sort options for plugins
 */
export type SortBy = 'name' | 'author' | 'category' | 'recent' | 'frequency' | 'params'

/**
 * Window/display modes for the chooser
 */
export type ChooserMode = 'dialog' | 'panel' | 'floating'

/**
 * Parameter preview information
 */
export interface ParameterPreview {
  name: string
  symbol: string
  defaultValue: number
  minValue: number
  maxValue: number
  unit?: string
}

/**
 * Unified plugin interface that normalizes both UiPlugin and Plugin types
 */
export interface UnifiedPlugin {
  // Core identity
  uri: string
  name: string

  // Format
  format: PluginFormat

  // Author
  authorName: string
  authorHomepage?: string

  // Classification
  category: string
  displayType: string
  pluginType: PluginType
  tags: string[]

  // I/O configuration
  audioInputs: number
  audioOutputs: number
  hasMidiInput: boolean
  hasMidiOutput: boolean
  isStereo: boolean

  // Features
  hasUi: boolean
  hasModGui: boolean
  parameterCount: number
  topParameters: ParameterPreview[]

  // Metadata
  description?: string
  version?: string
  license?: string

  // User data (persisted locally)
  isFavorite: boolean
  lastUsed?: number // timestamp
  usageCount: number
  customTags: string[]
  folders: string[]
}

/**
 * Custom folder for organizing plugins
 */
export interface PluginFolder {
  id: string
  name: string
  icon?: string
  color?: string
  pluginUris: string[]
  createdAt: number
  updatedAt: number
}

/**
 * Plugin chooser component props
 */
export interface PluginChooserProps {
  // Display modes
  mode: ChooserMode
  open: boolean
  onClose: () => void

  // Selection handling
  onSelect: (pluginUri: string) => void
  onSelectMultiple?: (pluginUris: string[]) => void

  // Context
  targetChainId?: number
  initialPluginUri?: string

  // Customization
  showQuickAdd?: boolean
  showPreviewPanel?: boolean
  allowDragDrop?: boolean
  pinned?: boolean

  // Filtering
  modGuiOnly?: boolean
  categoryFilter?: string
}

/**
 * Plugin chooser state
 */
export interface PluginChooserState {
  // Search
  searchQuery: string
  searchHistory: string[]

  // Filters
  selectedCategory: string | null
  selectedTags: string[]
  selectedFolder: string | null
  showFavoritesOnly: boolean
  showRecentOnly: boolean

  // View
  viewMode: ViewMode
  sortBy: SortBy
  sortDirection: 'asc' | 'desc'

  // Selection
  selectedPluginUri: string | null
  hoveredPluginUri: string | null

  // UI state
  previewPanelOpen: boolean
  sidebarCollapsed: boolean
}

/**
 * Plugin usage statistics
 */
export interface PluginStats {
  uri: string
  usageCount: number
  lastUsed: number
  frequentlyUsedWith: string[] // URIs of plugins often used together
}

/**
 * Persisted user preferences
 */
export interface PluginChooserPreferences {
  viewMode: ViewMode
  sortBy: SortBy
  sortDirection: 'asc' | 'desc'
  sidebarCollapsed: boolean
  previewPanelOpen: boolean
  favorites: string[]
  folders: PluginFolder[]
  customTags: Record<string, string[]> // uri -> tags
  stats: PluginStats[]
  searchHistory: string[]
}

/**
 * Category node for hierarchical navigation
 */
export interface CategoryNode {
  id: string
  name: string
  displayName: string
  pluginType: PluginType
  count: number
  children: CategoryNode[]
  expanded?: boolean
}

/**
 * Search query parsed result
 */
export interface ParsedSearchQuery {
  terms: string[]
  filters: {
    author?: string
    type?: string
    ports?: string
    format?: PluginFormat
    hasUi?: boolean
    hasMidi?: boolean
  }
  excludes: string[]
}

/**
 * FX Chain preset (group of plugins)
 */
export interface FXChainPreset {
  id: string
  name: string
  description?: string
  pluginUris: string[]
  createdAt: number
  updatedAt: number
}
