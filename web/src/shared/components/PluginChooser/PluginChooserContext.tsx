// ============================================================================
// PluginChooser - React Context
// Provides state and actions for the unified plugin selection component
// ============================================================================

import React, { createContext, useContext, useReducer, useCallback, ReactNode, useMemo, useState } from 'react'
import {
  PluginChooserState,
  UnifiedPlugin,
  ViewMode,
  SortBy,
  PluginFolder,
} from './types'
import * as storage from './utils/pluginStorage'
import { searchPlugins } from './utils/pluginSearch'
import {
  sortPlugins,
  filterByCategory,
  filterByTags,
  filterFavorites,
  filterRecent,
  filterByFolder,
} from './utils/pluginFilters'

// ==================== State ====================

const initialState: PluginChooserState = {
  searchQuery: '',
  searchHistory: storage.getSearchHistory(),
  selectedCategory: null,
  selectedTags: [],
  selectedFolder: null,
  showFavoritesOnly: false,
  showRecentOnly: false,
  viewMode: storage.getViewMode(),
  sortBy: storage.getSortSettings().sortBy,
  sortDirection: storage.getSortSettings().sortDirection,
  selectedPluginUri: null,
  hoveredPluginUri: null,
  previewPanelOpen: storage.getPreviewPanelOpen(),
  sidebarCollapsed: storage.getSidebarCollapsed(),
}

// ==================== Actions ====================

type Action =
  | { type: 'SET_SEARCH_QUERY'; query: string }
  | { type: 'SET_CATEGORY'; category: string | null }
  | { type: 'SET_TAGS'; tags: string[] }
  | { type: 'SET_FOLDER'; folderId: string | null }
  | { type: 'SET_FAVORITES_ONLY'; enabled: boolean }
  | { type: 'SET_RECENT_ONLY'; enabled: boolean }
  | { type: 'SET_VIEW_MODE'; mode: ViewMode }
  | { type: 'SET_SORT'; sortBy: SortBy; direction: 'asc' | 'desc' }
  | { type: 'SELECT_PLUGIN'; uri: string | null }
  | { type: 'HOVER_PLUGIN'; uri: string | null }
  | { type: 'TOGGLE_PREVIEW_PANEL' }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'RESET_FILTERS' }

function reducer(state: PluginChooserState, action: Action): PluginChooserState {
  switch (action.type) {
    case 'SET_SEARCH_QUERY':
      return { ...state, searchQuery: action.query }

    case 'SET_CATEGORY':
      return {
        ...state,
        selectedCategory: action.category,
        showFavoritesOnly: false,
        showRecentOnly: false,
        selectedFolder: null,
      }

    case 'SET_TAGS':
      return { ...state, selectedTags: action.tags }

    case 'SET_FOLDER':
      return {
        ...state,
        selectedFolder: action.folderId,
        showFavoritesOnly: false,
        showRecentOnly: false,
        selectedCategory: null,
      }

    case 'SET_FAVORITES_ONLY':
      return {
        ...state,
        showFavoritesOnly: action.enabled,
        showRecentOnly: false,
        selectedFolder: null,
        selectedCategory: null,
      }

    case 'SET_RECENT_ONLY':
      return {
        ...state,
        showRecentOnly: action.enabled,
        showFavoritesOnly: false,
        selectedFolder: null,
        selectedCategory: null,
      }

    case 'SET_VIEW_MODE':
      storage.setViewMode(action.mode)
      return { ...state, viewMode: action.mode }

    case 'SET_SORT':
      storage.setSortSettings(action.sortBy, action.direction)
      return { ...state, sortBy: action.sortBy, sortDirection: action.direction }

    case 'SELECT_PLUGIN':
      return { ...state, selectedPluginUri: action.uri }

    case 'HOVER_PLUGIN':
      return { ...state, hoveredPluginUri: action.uri }

    case 'TOGGLE_PREVIEW_PANEL':
      const newPreviewState = !state.previewPanelOpen
      storage.setPreviewPanelOpen(newPreviewState)
      return { ...state, previewPanelOpen: newPreviewState }

    case 'TOGGLE_SIDEBAR':
      const newSidebarState = !state.sidebarCollapsed
      storage.setSidebarCollapsed(newSidebarState)
      return { ...state, sidebarCollapsed: newSidebarState }

    case 'RESET_FILTERS':
      return {
        ...state,
        searchQuery: '',
        selectedCategory: null,
        selectedTags: [],
        selectedFolder: null,
        showFavoritesOnly: false,
        showRecentOnly: false,
      }

    default:
      return state
  }
}

// ==================== Context ====================

interface PluginChooserContextValue {
  state: PluginChooserState
  plugins: UnifiedPlugin[]
  filteredPlugins: UnifiedPlugin[]
  folders: PluginFolder[]
  selectedPlugin: UnifiedPlugin | null

  // Actions
  setSearchQuery: (query: string) => void
  setCategory: (category: string | null) => void
  setTags: (tags: string[]) => void
  setFolder: (folderId: string | null) => void
  setFavoritesOnly: (enabled: boolean) => void
  setRecentOnly: (enabled: boolean) => void
  setViewMode: (mode: ViewMode) => void
  setSort: (sortBy: SortBy, direction: 'asc' | 'desc') => void
  selectPlugin: (uri: string | null) => void
  hoverPlugin: (uri: string | null) => void
  togglePreviewPanel: () => void
  toggleSidebar: () => void
  resetFilters: () => void

  // Plugin actions
  toggleFavorite: (uri: string) => void
  recordUsage: (uri: string) => void
  createFolder: (name: string) => PluginFolder
  deleteFolder: (folderId: string) => void
  addToFolder: (folderId: string, pluginUri: string) => void
  removeFromFolder: (folderId: string, pluginUri: string) => void
}

const PluginChooserContext = createContext<PluginChooserContextValue | null>(null)

// ==================== Provider ====================

interface PluginChooserProviderProps {
  children: ReactNode
  plugins: UnifiedPlugin[]
  onPluginsChange?: (plugins: UnifiedPlugin[]) => void
}

export function PluginChooserProvider({
  children,
  plugins: allPlugins,
  onPluginsChange,
}: PluginChooserProviderProps) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [folders, setFolders] = useState<PluginFolder[]>(storage.getFolders())

  // Filter and sort plugins
  const filteredPlugins = useMemo(() => {
    let result = [...allPlugins]

    // Apply search
    if (state.searchQuery) {
      result = searchPlugins(result, state.searchQuery)
    }

    // Apply category filter
    if (state.selectedCategory) {
      result = filterByCategory(result, state.selectedCategory)
    }

    // Apply tag filter
    if (state.selectedTags.length > 0) {
      result = filterByTags(result, state.selectedTags)
    }

    // Apply folder filter
    if (state.selectedFolder) {
      const folder = folders.find(f => f.id === state.selectedFolder)
      if (folder) {
        result = filterByFolder(result, folder.pluginUris)
      }
    }

    // Apply favorites filter
    if (state.showFavoritesOnly) {
      result = filterFavorites(result)
    }

    // Apply recent filter
    if (state.showRecentOnly) {
      result = filterRecent(result)
    }

    // Apply sorting (unless search is active - search already sorts by relevance)
    if (!state.searchQuery) {
      result = sortPlugins(result, state.sortBy, state.sortDirection)
    }

    return result
  }, [allPlugins, state, folders])

  // Selected plugin
  const selectedPlugin = useMemo(() => {
    return allPlugins.find(p => p.uri === state.selectedPluginUri) ?? null
  }, [allPlugins, state.selectedPluginUri])

  // Actions
  const setSearchQuery = useCallback((query: string) => {
    dispatch({ type: 'SET_SEARCH_QUERY', query })
    if (query.length >= 3) {
      storage.addToSearchHistory(query)
    }
  }, [])

  const setCategory = useCallback((category: string | null) => {
    dispatch({ type: 'SET_CATEGORY', category })
  }, [])

  const setTags = useCallback((tags: string[]) => {
    dispatch({ type: 'SET_TAGS', tags })
  }, [])

  const setFolder = useCallback((folderId: string | null) => {
    dispatch({ type: 'SET_FOLDER', folderId })
  }, [])

  const setFavoritesOnly = useCallback((enabled: boolean) => {
    dispatch({ type: 'SET_FAVORITES_ONLY', enabled })
  }, [])

  const setRecentOnly = useCallback((enabled: boolean) => {
    dispatch({ type: 'SET_RECENT_ONLY', enabled })
  }, [])

  const setViewMode = useCallback((mode: ViewMode) => {
    dispatch({ type: 'SET_VIEW_MODE', mode })
  }, [])

  const setSort = useCallback((sortBy: SortBy, direction: 'asc' | 'desc') => {
    dispatch({ type: 'SET_SORT', sortBy, direction })
  }, [])

  const selectPlugin = useCallback((uri: string | null) => {
    dispatch({ type: 'SELECT_PLUGIN', uri })
  }, [])

  const hoverPlugin = useCallback((uri: string | null) => {
    dispatch({ type: 'HOVER_PLUGIN', uri })
  }, [])

  const togglePreviewPanel = useCallback(() => {
    dispatch({ type: 'TOGGLE_PREVIEW_PANEL' })
  }, [])

  const toggleSidebar = useCallback(() => {
    dispatch({ type: 'TOGGLE_SIDEBAR' })
  }, [])

  const resetFilters = useCallback(() => {
    dispatch({ type: 'RESET_FILTERS' })
  }, [])

  // Plugin actions
  const toggleFavorite = useCallback((uri: string) => {
    const newState = storage.toggleFavorite(uri)
    // Trigger re-render by updating plugins
    onPluginsChange?.(
      allPlugins.map(p =>
        p.uri === uri ? { ...p, isFavorite: newState } : p
      )
    )
  }, [allPlugins, onPluginsChange])

  const recordUsage = useCallback((uri: string) => {
    storage.recordUsage(uri)
  }, [])

  const createFolderAction = useCallback((name: string) => {
    const folder = storage.createFolder(name)
    setFolders(storage.getFolders())
    return folder
  }, [])

  const deleteFolderAction = useCallback((folderId: string) => {
    storage.deleteFolder(folderId)
    setFolders(storage.getFolders())
    if (state.selectedFolder === folderId) {
      dispatch({ type: 'SET_FOLDER', folderId: null })
    }
  }, [state.selectedFolder])

  const addToFolderAction = useCallback((folderId: string, pluginUri: string) => {
    storage.addToFolder(folderId, pluginUri)
    setFolders(storage.getFolders())
  }, [])

  const removeFromFolderAction = useCallback((folderId: string, pluginUri: string) => {
    storage.removeFromFolder(folderId, pluginUri)
    setFolders(storage.getFolders())
  }, [])

  const value: PluginChooserContextValue = {
    state,
    plugins: allPlugins,
    filteredPlugins,
    folders,
    selectedPlugin,

    setSearchQuery,
    setCategory,
    setTags,
    setFolder,
    setFavoritesOnly,
    setRecentOnly,
    setViewMode,
    setSort,
    selectPlugin,
    hoverPlugin,
    togglePreviewPanel,
    toggleSidebar,
    resetFilters,

    toggleFavorite,
    recordUsage,
    createFolder: createFolderAction,
    deleteFolder: deleteFolderAction,
    addToFolder: addToFolderAction,
    removeFromFolder: removeFromFolderAction,
  }

  return (
    <PluginChooserContext.Provider value={value}>
      {children}
    </PluginChooserContext.Provider>
  )
}

// ==================== Hook ====================

export function usePluginChooser(): PluginChooserContextValue {
  const context = useContext(PluginChooserContext)
  if (!context) {
    throw new Error('usePluginChooser must be used within a PluginChooserProvider')
  }
  return context
}

