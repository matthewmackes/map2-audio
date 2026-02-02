/**
 * usePluginTags - React hook for plugin tag management
 *
 * Provides access to predefined tags and plugin metadata management.
 */

import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// ========================================
// Types
// ========================================

export interface TagCategories {
  instrument_type: string[]
  effect_type: string[]
  genre: string[]
  tone: string[]
  use_case: string[]
  quality: string[]
  technical: string[]
}

export interface AvailableTags {
  categories: TagCategories
  all_tags: string[]
}

export interface PluginMetadata {
  uri: string
  name: string
  tags: string[]
  is_favorite: boolean
  is_hidden: boolean
  user_description: string
}

export interface PluginSearchResult {
  uri: string
  name: string
  tags: string[]
  category: string
}

// ========================================
// Hook
// ========================================

export function usePluginTags() {
  const queryClient = useQueryClient()

  // ========================================
  // Queries
  // ========================================

  // Get available tags
  const availableTagsQuery = useQuery({
    queryKey: ['plugin-tags', 'available'],
    queryFn: async (): Promise<AvailableTags> => {
      const res = await fetch('/api/plugins/tags/available')
      if (!res.ok) throw new Error('Failed to fetch available tags')
      return res.json()
    },
    staleTime: 1000 * 60 * 60, // 1 hour - tags don't change often
  })

  // Get favorites
  const favoritesQuery = useQuery({
    queryKey: ['plugin-tags', 'favorites'],
    queryFn: async () => {
      const res = await fetch('/api/plugins/tags/favorites')
      if (!res.ok) throw new Error('Failed to fetch favorites')
      return res.json()
    },
    staleTime: 5000,
  })

  // ========================================
  // Mutations
  // ========================================

  // Update plugin metadata
  const updateMetadata = useMutation({
    mutationFn: async ({
      uri,
      metadata,
    }: {
      uri: string
      metadata: Partial<{
        tags: string[]
        is_favorite: boolean
        is_hidden: boolean
        user_description: string
      }>
    }) => {
      const res = await fetch(`/api/plugins/tags/plugin/${encodeURIComponent(uri)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metadata),
      })
      if (!res.ok) throw new Error('Failed to update plugin metadata')
      return res.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['plugin-tags', 'plugin', variables.uri] })
      queryClient.invalidateQueries({ queryKey: ['plugin-tags', 'favorites'] })
    },
  })

  // Add tags to plugin
  const addTags = useMutation({
    mutationFn: async ({ uri, tags }: { uri: string; tags: string[] }) => {
      const res = await fetch(`/api/plugins/tags/plugin/${encodeURIComponent(uri)}/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags }),
      })
      if (!res.ok) throw new Error('Failed to add tags')
      return res.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['plugin-tags', 'plugin', variables.uri] })
    },
  })

  // Remove tags from plugin
  const removeTags = useMutation({
    mutationFn: async ({ uri, tags }: { uri: string; tags: string[] }) => {
      const res = await fetch(`/api/plugins/tags/plugin/${encodeURIComponent(uri)}/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags }),
      })
      if (!res.ok) throw new Error('Failed to remove tags')
      return res.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['plugin-tags', 'plugin', variables.uri] })
    },
  })

  // Toggle favorite
  const toggleFavorite = useMutation({
    mutationFn: async ({ uri, is_favorite }: { uri: string; is_favorite: boolean }) => {
      const res = await fetch(
        `/api/plugins/tags/plugin/${encodeURIComponent(uri)}/favorite?is_favorite=${is_favorite}`,
        { method: 'POST' }
      )
      if (!res.ok) throw new Error('Failed to toggle favorite')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugin-tags', 'favorites'] })
    },
  })

  // Bulk update tags
  const bulkUpdateTags = useMutation({
    mutationFn: async ({
      uris,
      addTags,
      removeTags,
    }: {
      uris: string[]
      addTags: string[]
      removeTags: string[]
    }) => {
      const res = await fetch('/api/plugins/tags/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uris,
          add_tags: addTags,
          remove_tags: removeTags,
        }),
      })
      if (!res.ok) throw new Error('Failed to bulk update tags')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugin-tags'] })
    },
  })

  // ========================================
  // Convenience functions
  // ========================================

  const getPluginMetadata = useCallback(
    async (uri: string): Promise<PluginMetadata> => {
      const res = await fetch(`/api/plugins/tags/plugin/${encodeURIComponent(uri)}`)
      if (!res.ok) throw new Error('Failed to fetch plugin metadata')
      return res.json()
    },
    []
  )

  const searchByTags = useCallback(
    async (tags: string[], matchAll: boolean = false): Promise<PluginSearchResult[]> => {
      const tagString = tags.join(',')
      const res = await fetch(
        `/api/plugins/tags/search?tags=${encodeURIComponent(tagString)}&match_all=${matchAll}`
      )
      if (!res.ok) throw new Error('Failed to search by tags')
      const data = await res.json()
      return data.plugins
    },
    []
  )

  const setPluginTags = useCallback(
    (uri: string, tags: string[]) => {
      return updateMetadata.mutateAsync({ uri, metadata: { tags } })
    },
    [updateMetadata]
  )

  const setPluginFavorite = useCallback(
    (uri: string, is_favorite: boolean) => {
      return toggleFavorite.mutateAsync({ uri, is_favorite })
    },
    [toggleFavorite]
  )

  const setPluginHidden = useCallback(
    (uri: string, is_hidden: boolean) => {
      return updateMetadata.mutateAsync({ uri, metadata: { is_hidden } })
    },
    [updateMetadata]
  )

  const setPluginDescription = useCallback(
    (uri: string, description: string) => {
      return updateMetadata.mutateAsync({ uri, metadata: { user_description: description } })
    },
    [updateMetadata]
  )

  // ========================================
  // Return
  // ========================================

  return {
    // Available tags
    availableTags: availableTagsQuery.data,
    tagCategories: availableTagsQuery.data?.categories,
    allTags: availableTagsQuery.data?.all_tags ?? [],
    isLoadingTags: availableTagsQuery.isLoading,

    // Favorites
    favorites: favoritesQuery.data?.plugins ?? [],
    favoritesCount: favoritesQuery.data?.count ?? 0,
    isLoadingFavorites: favoritesQuery.isLoading,

    // Functions
    getPluginMetadata,
    searchByTags,
    setPluginTags,
    setPluginFavorite,
    setPluginHidden,
    setPluginDescription,

    // Mutations
    addTagsToPlugin: (uri: string, tags: string[]) => addTags.mutateAsync({ uri, tags }),
    removeTagsFromPlugin: (uri: string, tags: string[]) => removeTags.mutateAsync({ uri, tags }),
    bulkUpdateTags: bulkUpdateTags.mutateAsync,

    // Mutation states
    isUpdating:
      updateMetadata.isPending ||
      addTags.isPending ||
      removeTags.isPending ||
      toggleFavorite.isPending ||
      bulkUpdateTags.isPending,
  }
}

// ========================================
// Hook for single plugin metadata
// ========================================

export function usePluginMetadata(uri: string) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['plugin-tags', 'plugin', uri],
    queryFn: async (): Promise<PluginMetadata> => {
      const res = await fetch(`/api/plugins/tags/plugin/${encodeURIComponent(uri)}`)
      if (!res.ok) throw new Error('Failed to fetch plugin metadata')
      return res.json()
    },
    enabled: !!uri,
    staleTime: 5000,
  })

  const updateMutation = useMutation({
    mutationFn: async (metadata: Partial<PluginMetadata>) => {
      const res = await fetch(`/api/plugins/tags/plugin/${encodeURIComponent(uri)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metadata),
      })
      if (!res.ok) throw new Error('Failed to update plugin metadata')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugin-tags', 'plugin', uri] })
      queryClient.invalidateQueries({ queryKey: ['plugin-tags', 'favorites'] })
    },
  })

  return {
    metadata: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    update: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    refetch: query.refetch,
  }
}

export default usePluginTags
