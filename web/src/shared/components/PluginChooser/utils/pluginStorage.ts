// ============================================================================
// PluginChooser - Storage Utility
// LocalStorage persistence for preferences, favorites, folders, and stats
// ============================================================================

import {
  PluginChooserPreferences,
  PluginFolder,
  PluginStats,
  ViewMode,
  SortBy,
} from '../types'

const STORAGE_KEY = 'map2.pluginChooser'

/**
 * Default preferences
 */
const defaultPreferences: PluginChooserPreferences = {
  viewMode: 'grid',
  sortBy: 'name',
  sortDirection: 'asc',
  sidebarCollapsed: false,
  previewPanelOpen: true,
  favorites: [],
  folders: [],
  customTags: {},
  stats: [],
  searchHistory: [],
}

/**
 * Load preferences from localStorage
 */
export function loadPreferences(): PluginChooserPreferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return { ...defaultPreferences, ...parsed }
    }
  } catch (e) {
    console.warn('Failed to load PluginChooser preferences:', e)
  }
  return { ...defaultPreferences }
}

/**
 * Save preferences to localStorage
 */
export function savePreferences(prefs: Partial<PluginChooserPreferences>): void {
  try {
    const current = loadPreferences()
    const updated = { ...current, ...prefs }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch (e) {
    console.warn('Failed to save PluginChooser preferences:', e)
  }
}

// ==================== Favorites ====================

/**
 * Check if a plugin is favorited
 */
export function isFavorite(uri: string): boolean {
  const prefs = loadPreferences()
  return prefs.favorites.includes(uri)
}

/**
 * Toggle favorite status
 */
export function toggleFavorite(uri: string): boolean {
  const prefs = loadPreferences()
  const index = prefs.favorites.indexOf(uri)
  if (index === -1) {
    prefs.favorites.push(uri)
  } else {
    prefs.favorites.splice(index, 1)
  }
  savePreferences({ favorites: prefs.favorites })
  return index === -1 // returns new state
}

/**
 * Get all favorites
 */
export function getFavorites(): string[] {
  return loadPreferences().favorites
}

// ==================== Folders ====================

/**
 * Create a new folder
 */
export function createFolder(name: string, icon?: string, color?: string): PluginFolder {
  const prefs = loadPreferences()
  const folder: PluginFolder = {
    id: `folder-${Date.now()}`,
    name,
    icon,
    color,
    pluginUris: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  prefs.folders.push(folder)
  savePreferences({ folders: prefs.folders })
  return folder
}

/**
 * Delete a folder
 */
export function deleteFolder(folderId: string): void {
  const prefs = loadPreferences()
  prefs.folders = prefs.folders.filter(f => f.id !== folderId)
  savePreferences({ folders: prefs.folders })
}

/**
 * Rename a folder
 */
export function renameFolder(folderId: string, newName: string): void {
  const prefs = loadPreferences()
  const folder = prefs.folders.find(f => f.id === folderId)
  if (folder) {
    folder.name = newName
    folder.updatedAt = Date.now()
    savePreferences({ folders: prefs.folders })
  }
}

/**
 * Add plugin to folder
 */
export function addToFolder(folderId: string, pluginUri: string): void {
  const prefs = loadPreferences()
  const folder = prefs.folders.find(f => f.id === folderId)
  if (folder && !folder.pluginUris.includes(pluginUri)) {
    folder.pluginUris.push(pluginUri)
    folder.updatedAt = Date.now()
    savePreferences({ folders: prefs.folders })
  }
}

/**
 * Remove plugin from folder
 */
export function removeFromFolder(folderId: string, pluginUri: string): void {
  const prefs = loadPreferences()
  const folder = prefs.folders.find(f => f.id === folderId)
  if (folder) {
    folder.pluginUris = folder.pluginUris.filter(uri => uri !== pluginUri)
    folder.updatedAt = Date.now()
    savePreferences({ folders: prefs.folders })
  }
}

/**
 * Get all folders
 */
export function getFolders(): PluginFolder[] {
  return loadPreferences().folders
}

/**
 * Get folders containing a plugin
 */
export function getPluginFolders(pluginUri: string): string[] {
  const prefs = loadPreferences()
  return prefs.folders.filter(f => f.pluginUris.includes(pluginUri)).map(f => f.id)
}

// ==================== Custom Tags ====================

/**
 * Get custom tags for a plugin
 */
export function getCustomTags(pluginUri: string): string[] {
  const prefs = loadPreferences()
  return prefs.customTags[pluginUri] || []
}

/**
 * Set custom tags for a plugin
 */
export function setCustomTags(pluginUri: string, tags: string[]): void {
  const prefs = loadPreferences()
  prefs.customTags[pluginUri] = tags
  savePreferences({ customTags: prefs.customTags })
}

/**
 * Add a custom tag to a plugin
 */
export function addCustomTag(pluginUri: string, tag: string): void {
  const prefs = loadPreferences()
  const current = prefs.customTags[pluginUri] || []
  if (!current.includes(tag)) {
    prefs.customTags[pluginUri] = [...current, tag]
    savePreferences({ customTags: prefs.customTags })
  }
}

/**
 * Remove a custom tag from a plugin
 */
export function removeCustomTag(pluginUri: string, tag: string): void {
  const prefs = loadPreferences()
  const current = prefs.customTags[pluginUri] || []
  prefs.customTags[pluginUri] = current.filter(t => t !== tag)
  savePreferences({ customTags: prefs.customTags })
}

// ==================== Usage Statistics ====================

/**
 * Record plugin usage
 */
export function recordUsage(pluginUri: string): void {
  const prefs = loadPreferences()
  const existing = prefs.stats.find(s => s.uri === pluginUri)
  if (existing) {
    existing.usageCount++
    existing.lastUsed = Date.now()
  } else {
    prefs.stats.push({
      uri: pluginUri,
      usageCount: 1,
      lastUsed: Date.now(),
      frequentlyUsedWith: [],
    })
  }
  savePreferences({ stats: prefs.stats })
}

/**
 * Record plugins used together (in same chain)
 */
export function recordUsedTogether(pluginUris: string[]): void {
  const prefs = loadPreferences()
  for (const uri of pluginUris) {
    const stat = prefs.stats.find(s => s.uri === uri)
    if (stat) {
      const others = pluginUris.filter(u => u !== uri)
      for (const other of others) {
        if (!stat.frequentlyUsedWith.includes(other)) {
          stat.frequentlyUsedWith.push(other)
        }
      }
      // Keep only top 10 frequently used with
      stat.frequentlyUsedWith = stat.frequentlyUsedWith.slice(0, 10)
    }
  }
  savePreferences({ stats: prefs.stats })
}

/**
 * Get usage stats for a plugin
 */
export function getPluginStats(pluginUri: string): PluginStats | undefined {
  const prefs = loadPreferences()
  return prefs.stats.find(s => s.uri === pluginUri)
}

/**
 * Get recently used plugins
 */
export function getRecentlyUsed(limit = 10): PluginStats[] {
  const prefs = loadPreferences()
  return [...prefs.stats]
    .sort((a, b) => b.lastUsed - a.lastUsed)
    .slice(0, limit)
}

/**
 * Get most frequently used plugins
 */
export function getMostUsed(limit = 10): PluginStats[] {
  const prefs = loadPreferences()
  return [...prefs.stats]
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, limit)
}

// ==================== Search History ====================

/**
 * Add to search history
 */
export function addToSearchHistory(query: string): void {
  if (!query.trim()) return
  const prefs = loadPreferences()
  // Remove if already exists
  prefs.searchHistory = prefs.searchHistory.filter(q => q !== query)
  // Add to front
  prefs.searchHistory.unshift(query)
  // Keep only last 20
  prefs.searchHistory = prefs.searchHistory.slice(0, 20)
  savePreferences({ searchHistory: prefs.searchHistory })
}

/**
 * Get search history
 */
export function getSearchHistory(): string[] {
  return loadPreferences().searchHistory
}

/**
 * Clear search history
 */
export function clearSearchHistory(): void {
  savePreferences({ searchHistory: [] })
}

// ==================== View Preferences ====================

/**
 * Get view mode
 */
export function getViewMode(): ViewMode {
  return loadPreferences().viewMode
}

/**
 * Set view mode
 */
export function setViewMode(mode: ViewMode): void {
  savePreferences({ viewMode: mode })
}

/**
 * Get sort settings
 */
export function getSortSettings(): { sortBy: SortBy; sortDirection: 'asc' | 'desc' } {
  const prefs = loadPreferences()
  return { sortBy: prefs.sortBy, sortDirection: prefs.sortDirection }
}

/**
 * Set sort settings
 */
export function setSortSettings(sortBy: SortBy, sortDirection: 'asc' | 'desc'): void {
  savePreferences({ sortBy, sortDirection })
}

/**
 * Get sidebar collapsed state
 */
export function getSidebarCollapsed(): boolean {
  return loadPreferences().sidebarCollapsed
}

/**
 * Set sidebar collapsed state
 */
export function setSidebarCollapsed(collapsed: boolean): void {
  savePreferences({ sidebarCollapsed: collapsed })
}

/**
 * Get preview panel open state
 */
export function getPreviewPanelOpen(): boolean {
  return loadPreferences().previewPanelOpen
}

/**
 * Set preview panel open state
 */
export function setPreviewPanelOpen(open: boolean): void {
  savePreferences({ previewPanelOpen: open })
}
