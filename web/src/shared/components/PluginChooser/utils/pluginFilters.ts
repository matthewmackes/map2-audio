// ============================================================================
// PluginChooser - Filter and Sort Utilities
// ============================================================================

import { UnifiedPlugin, SortBy, CategoryNode } from '../types'
import { PluginType } from '../../../../pipedal/Lv2Plugin'

/**
 * Sort plugins by the specified criteria
 */
export function sortPlugins(
  plugins: UnifiedPlugin[],
  sortBy: SortBy,
  direction: 'asc' | 'desc'
): UnifiedPlugin[] {
  const sorted = [...plugins].sort((a, b) => {
    // Hardware plugins always sort first
    const aHw = a.format === 'hardware' ? 0 : 1
    const bHw = b.format === 'hardware' ? 0 : 1
    if (aHw !== bHw) return aHw - bHw

    let comparison = 0

    switch (sortBy) {
      case 'name':
        comparison = a.name.localeCompare(b.name)
        break
      case 'author':
        comparison = a.authorName.localeCompare(b.authorName)
        break
      case 'category':
        comparison = a.category.localeCompare(b.category)
        break
      case 'recent':
        const aRecent = a.lastUsed ?? 0
        const bRecent = b.lastUsed ?? 0
        comparison = bRecent - aRecent // Most recent first
        break
      case 'frequency':
        comparison = b.usageCount - a.usageCount // Most used first
        break
      case 'params':
        comparison = b.parameterCount - a.parameterCount // Most params first
        break
      default:
        comparison = a.name.localeCompare(b.name)
    }

    return direction === 'desc' ? -comparison : comparison
  })

  return sorted
}

/**
 * Filter plugins by category
 */
export function filterByCategory(
  plugins: UnifiedPlugin[],
  category: string | null
): UnifiedPlugin[] {
  if (!category) return plugins

  return plugins.filter(p => {
    const catLower = p.category.toLowerCase()
    const filterLower = category.toLowerCase()
    return (
      catLower === filterLower ||
      catLower.includes(filterLower) ||
      p.displayType.toLowerCase().includes(filterLower)
    )
  })
}

/**
 * Filter plugins by tags
 */
export function filterByTags(
  plugins: UnifiedPlugin[],
  tags: string[]
): UnifiedPlugin[] {
  if (tags.length === 0) return plugins

  return plugins.filter(p => {
    const pluginTags = [...p.tags, ...p.customTags].map(t => t.toLowerCase())
    return tags.every(tag => pluginTags.some(pt => pt.includes(tag.toLowerCase())))
  })
}

/**
 * Filter to favorites only
 */
export function filterFavorites(plugins: UnifiedPlugin[]): UnifiedPlugin[] {
  return plugins.filter(p => p.isFavorite)
}

/**
 * Filter to recently used
 */
export function filterRecent(
  plugins: UnifiedPlugin[],
  limit = 20
): UnifiedPlugin[] {
  return plugins
    .filter(p => p.lastUsed !== undefined)
    .sort((a, b) => (b.lastUsed ?? 0) - (a.lastUsed ?? 0))
    .slice(0, limit)
}

/**
 * Filter by folder
 */
export function filterByFolder(
  plugins: UnifiedPlugin[],
  folderPluginUris: string[]
): UnifiedPlugin[] {
  return plugins.filter(p => folderPluginUris.includes(p.uri))
}

/**
 * Build category tree from plugins
 */
export function buildCategoryTree(plugins: UnifiedPlugin[]): CategoryNode[] {
  const categoryMap = new Map<string, CategoryNode>()
  const rootCategories: CategoryNode[] = []

  // Count plugins per category
  const counts = new Map<string, number>()
  for (const plugin of plugins) {
    const cat = plugin.category || 'Uncategorized'
    counts.set(cat, (counts.get(cat) ?? 0) + 1)
  }

  // Build tree
  for (const [category, count] of counts) {
    const node: CategoryNode = {
      id: category.toLowerCase().replace(/\s+/g, '-'),
      name: category,
      displayName: category,
      pluginType: PluginType.Plugin,
      count,
      children: [],
      expanded: false,
    }
    categoryMap.set(category, node)
    rootCategories.push(node)
  }

  // Sort alphabetically
  rootCategories.sort((a, b) => a.displayName.localeCompare(b.displayName))

  return rootCategories
}

/**
 * Get unique tags from all plugins
 */
export function getUniqueTags(plugins: UnifiedPlugin[]): string[] {
  const tagSet = new Set<string>()
  for (const plugin of plugins) {
    for (const tag of plugin.tags) {
      tagSet.add(tag)
    }
    for (const tag of plugin.customTags) {
      tagSet.add(tag)
    }
  }
  return Array.from(tagSet).sort()
}

/**
 * Get unique authors from all plugins
 */
export function getUniqueAuthors(plugins: UnifiedPlugin[]): string[] {
  const authorSet = new Set<string>()
  for (const plugin of plugins) {
    if (plugin.authorName && plugin.authorName !== 'Unknown') {
      authorSet.add(plugin.authorName)
    }
  }
  return Array.from(authorSet).sort()
}

/**
 * Group plugins by category
 */
export function groupByCategory(
  plugins: UnifiedPlugin[]
): Map<string, UnifiedPlugin[]> {
  const groups = new Map<string, UnifiedPlugin[]>()

  for (const plugin of plugins) {
    const category = plugin.category || 'Uncategorized'
    if (!groups.has(category)) {
      groups.set(category, [])
    }
    groups.get(category)!.push(plugin)
  }

  return groups
}

/**
 * Group plugins by author
 */
export function groupByAuthor(
  plugins: UnifiedPlugin[]
): Map<string, UnifiedPlugin[]> {
  const groups = new Map<string, UnifiedPlugin[]>()

  for (const plugin of plugins) {
    const author = plugin.authorName || 'Unknown'
    if (!groups.has(author)) {
      groups.set(author, [])
    }
    groups.get(author)!.push(plugin)
  }

  return groups
}

/**
 * Get plugins similar to a given plugin
 * Based on category and I/O configuration
 */
export function getSimilarPlugins(
  plugins: UnifiedPlugin[],
  targetPlugin: UnifiedPlugin,
  limit = 5
): UnifiedPlugin[] {
  return plugins
    .filter(p => p.uri !== targetPlugin.uri)
    .map(p => {
      let similarity = 0

      // Same category
      if (p.category === targetPlugin.category) {
        similarity += 50
      }

      // Same I/O configuration
      if (p.audioInputs === targetPlugin.audioInputs) similarity += 10
      if (p.audioOutputs === targetPlugin.audioOutputs) similarity += 10
      if (p.isStereo === targetPlugin.isStereo) similarity += 15

      // Same format
      if (p.format === targetPlugin.format) similarity += 5

      // Overlapping tags
      const targetTags = new Set(targetPlugin.tags)
      for (const tag of p.tags) {
        if (targetTags.has(tag)) similarity += 5
      }

      return { plugin: p, similarity }
    })
    .filter(item => item.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
    .map(item => item.plugin)
}

/**
 * Get frequently used together with a plugin
 * Uses stored co-usage statistics, falls back to similar plugins
 */
export function getFrequentlyUsedWith(
  plugins: UnifiedPlugin[],
  targetPlugin: UnifiedPlugin,
  statsMap?: Record<string, { frequentlyUsedWith?: string[] }>
): UnifiedPlugin[] {
  // Try to get co-usage data from stats
  const stats = statsMap?.[targetPlugin.uri]
  if (stats?.frequentlyUsedWith && stats.frequentlyUsedWith.length > 0) {
    const coUsedPlugins = stats.frequentlyUsedWith
      .map(uri => plugins.find(p => p.uri === uri))
      .filter((p): p is UnifiedPlugin => p !== undefined)
      .slice(0, 5)

    if (coUsedPlugins.length > 0) {
      return coUsedPlugins
    }
  }

  // Fall back to similar plugins based on category and I/O
  return getSimilarPlugins(plugins, targetPlugin, 5)
}
