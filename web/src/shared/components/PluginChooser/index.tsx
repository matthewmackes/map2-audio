// ============================================================================
// PluginChooser - Module Exports
// Unified plugin selection component for MAP2 Audio Platform
// ============================================================================

// Main component
export { PluginChooserWithData as PluginChooser } from './PluginChooser'
export { PluginChooserWithData } from './PluginChooser'

// Context and hooks
export { PluginChooserProvider, usePluginChooser } from './PluginChooserContext'

// Types
export type {
  PluginChooserProps,
  PluginChooserState,
  UnifiedPlugin,
  PluginFolder,
  PluginFormat,
  ViewMode,
  SortBy,
  ChooserMode,
  ParameterPreview,
  PluginStats,
  PluginChooserPreferences,
  CategoryNode,
  ParsedSearchQuery,
  FXChainPreset,
} from './types'

// Utilities
export {
  normalizeUiPlugin,
  normalizeMap2Plugin,
  normalizeUiPlugins,
  normalizeMap2Plugins,
  isVirtualPlugin,
  getIODisplayName,
  getIOBadgeColor,
} from './utils/pluginBridge'

export { searchPlugins, parseSearchQuery, getSearchSuggestions } from './utils/pluginSearch'

export {
  sortPlugins,
  filterByCategory,
  filterByTags,
  filterFavorites,
  filterRecent,
  filterByFolder,
  buildCategoryTree,
  getUniqueTags,
  getUniqueAuthors,
  groupByCategory,
  groupByAuthor,
  getSimilarPlugins,
  getFrequentlyUsedWith,
} from './utils/pluginFilters'

export {
  loadPreferences,
  savePreferences,
  isFavorite,
  toggleFavorite,
  getFavorites,
  createFolder,
  deleteFolder,
  renameFolder,
  addToFolder,
  removeFromFolder,
  getFolders,
  getPluginFolders,
  getCustomTags,
  setCustomTags,
  addCustomTag,
  removeCustomTag,
  recordUsage,
  recordUsedTogether,
  getPluginStats,
  getRecentlyUsed,
  getMostUsed,
  addToSearchHistory,
  getSearchHistory,
  clearSearchHistory,
  getViewMode,
  setViewMode,
  getSortSettings,
  setSortSettings,
} from './utils/pluginStorage'

// Sub-components (for custom layouts)
export { default as PluginCard } from './components/PluginCard'
export { default as PluginFormatBadge, LV2Logo, VST3Logo } from './components/PluginFormatBadge'
export { default as PluginIOIndicator, PluginIOBadge } from './components/PluginIOIndicator'
export { default as CategorySidebar } from './components/CategorySidebar'
export { default as PluginGrid } from './components/PluginGrid'
export { default as PluginChooserHeader } from './components/PluginChooserHeader'
export { default as PluginPreviewPanel } from './components/PluginPreviewPanel'
export { default as QuickAddButtons } from './components/QuickAddButtons'
