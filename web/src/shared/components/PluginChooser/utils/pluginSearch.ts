// ============================================================================
// PluginChooser - Advanced Search Parser
// Supports query operators: author:name, type:category, ports:stereo, !exclude
// ============================================================================

import { UnifiedPlugin, ParsedSearchQuery, PluginFormat } from '../types'

/**
 * Parse a search query into structured filters
 * Supports:
 * - Regular terms: "delay reverb"
 * - Author filter: "author:guitarix"
 * - Type filter: "type:delay" or "type:dynamics"
 * - Ports filter: "ports:stereo" or "ports:mono"
 * - Format filter: "format:lv2" or "format:vst3" or "lv2" or "vst3"
 * - UI filter: "hasui" or "noui"
 * - MIDI filter: "midi"
 * - Exclusion: "!term" or "-term"
 */
export function parseSearchQuery(query: string): ParsedSearchQuery {
  const result: ParsedSearchQuery = {
    terms: [],
    filters: {},
    excludes: [],
  }

  if (!query.trim()) return result

  // Split by spaces but preserve quoted strings
  const tokens = query.match(/(?:[^\s"]+|"[^"]*")+/g) || []

  for (const token of tokens) {
    const lowerToken = token.toLowerCase().replace(/"/g, '')

    // Exclusion prefix
    if (token.startsWith('!') || token.startsWith('-')) {
      result.excludes.push(token.slice(1).toLowerCase())
      continue
    }

    // Author filter
    if (lowerToken.startsWith('author:')) {
      result.filters.author = lowerToken.slice(7)
      continue
    }

    // Type/category filter
    if (lowerToken.startsWith('type:') || lowerToken.startsWith('category:')) {
      result.filters.type = lowerToken.split(':')[1]
      continue
    }

    // Ports filter
    if (lowerToken.startsWith('ports:')) {
      result.filters.ports = lowerToken.slice(6)
      continue
    }

    // Format filter
    if (lowerToken.startsWith('format:')) {
      const format = lowerToken.slice(7)
      if (format === 'lv2' || format === 'vst3') {
        result.filters.format = format as PluginFormat
      }
      continue
    }

    // Shorthand format filters
    if (lowerToken === 'lv2') {
      result.filters.format = 'lv2'
      continue
    }
    if (lowerToken === 'vst3' || lowerToken === 'vst') {
      result.filters.format = 'vst3'
      continue
    }

    // UI filter
    if (lowerToken === 'hasui' || lowerToken === 'has-ui' || lowerToken === 'ui') {
      result.filters.hasUi = true
      continue
    }
    if (lowerToken === 'noui' || lowerToken === 'no-ui') {
      result.filters.hasUi = false
      continue
    }

    // MIDI filter
    if (lowerToken === 'midi') {
      result.filters.hasMidi = true
      continue
    }

    // Regular search term
    result.terms.push(lowerToken)
  }

  return result
}

/**
 * Calculate match score for a plugin against parsed query
 * Higher score = better match
 */
export function calculateMatchScore(plugin: UnifiedPlugin, query: ParsedSearchQuery): number {
  let score = 0

  // Check exclusions first - if any match, return 0
  for (const exclude of query.excludes) {
    if (
      plugin.name.toLowerCase().includes(exclude) ||
      plugin.authorName.toLowerCase().includes(exclude) ||
      plugin.category.toLowerCase().includes(exclude) ||
      plugin.tags.some(t => t.toLowerCase().includes(exclude))
    ) {
      return 0
    }
  }

  // Check required filters
  if (query.filters.author) {
    if (!plugin.authorName.toLowerCase().includes(query.filters.author)) {
      return 0
    }
    score += 10 // Bonus for matching author filter
  }

  if (query.filters.type) {
    const typeMatch =
      plugin.category.toLowerCase().includes(query.filters.type) ||
      plugin.displayType.toLowerCase().includes(query.filters.type)
    if (!typeMatch) {
      return 0
    }
    score += 10
  }

  if (query.filters.ports) {
    const portsFilter = query.filters.ports
    if (portsFilter === 'stereo' && !plugin.isStereo) return 0
    if (portsFilter === 'mono' && plugin.isStereo) return 0
    score += 5
  }

  if (query.filters.format) {
    if (plugin.format !== query.filters.format) return 0
    score += 5
  }

  if (query.filters.hasUi !== undefined) {
    if (plugin.hasUi !== query.filters.hasUi) return 0
    score += 5
  }

  if (query.filters.hasMidi) {
    if (!plugin.hasMidiInput && !plugin.hasMidiOutput) return 0
    score += 5
  }

  // Score regular search terms
  for (const term of query.terms) {
    const nameLower = plugin.name.toLowerCase()
    const authorLower = plugin.authorName.toLowerCase()
    const categoryLower = plugin.category.toLowerCase()
    const tagsLower = plugin.tags.map(t => t.toLowerCase())

    // Name match - highest priority
    if (nameLower === term) {
      score += 100 // Exact match
    } else if (nameLower.startsWith(term)) {
      score += 50 // Starts with
    } else if (nameLower.includes(term)) {
      score += 25 // Contains
    }

    // Author match
    if (authorLower.includes(term)) {
      score += 15
    }

    // Category match
    if (categoryLower.includes(term)) {
      score += 10
    }

    // Tag match
    if (tagsLower.some(t => t.includes(term))) {
      score += 8
    }

    // Description match
    if (plugin.description?.toLowerCase().includes(term)) {
      score += 5
    }
  }

  // Favorites boost
  if (plugin.isFavorite) {
    score += 50
  }

  // Recent usage boost
  if (plugin.lastUsed) {
    const hoursSinceUsed = (Date.now() - plugin.lastUsed) / (1000 * 60 * 60)
    if (hoursSinceUsed < 1) score += 20
    else if (hoursSinceUsed < 24) score += 10
    else if (hoursSinceUsed < 168) score += 5 // Within a week
  }

  // Usage frequency boost
  if (plugin.usageCount > 0) {
    score += Math.min(plugin.usageCount * 2, 20)
  }

  return score
}

/**
 * Filter and sort plugins by search query
 */
export function searchPlugins(
  plugins: UnifiedPlugin[],
  query: string
): UnifiedPlugin[] {
  const parsed = parseSearchQuery(query)

  // If no query, return all sorted by favorites/recent
  if (!query.trim()) {
    return [...plugins].sort((a, b) => {
      // Favorites first
      if (a.isFavorite !== b.isFavorite) {
        return a.isFavorite ? -1 : 1
      }
      // Then by recent usage
      if (a.lastUsed && b.lastUsed) {
        return b.lastUsed - a.lastUsed
      }
      if (a.lastUsed) return -1
      if (b.lastUsed) return 1
      // Then alphabetically
      return a.name.localeCompare(b.name)
    })
  }

  // Calculate scores and filter
  const scored = plugins
    .map(plugin => ({
      plugin,
      score: calculateMatchScore(plugin, parsed),
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)

  return scored.map(item => item.plugin)
}

/**
 * Get search suggestions based on available plugins
 */
export function getSearchSuggestions(
  plugins: UnifiedPlugin[],
  partialQuery: string
): string[] {
  const suggestions: string[] = []
  const seen = new Set<string>()
  const partial = partialQuery.toLowerCase()

  // Suggest authors
  for (const plugin of plugins) {
    const author = plugin.authorName.toLowerCase()
    if (author.includes(partial) && !seen.has(`author:${author}`)) {
      suggestions.push(`author:${plugin.authorName}`)
      seen.add(`author:${author}`)
    }
  }

  // Suggest categories
  for (const plugin of plugins) {
    const category = plugin.category.toLowerCase()
    if (category.includes(partial) && !seen.has(`type:${category}`)) {
      suggestions.push(`type:${plugin.category}`)
      seen.add(`type:${category}`)
    }
  }

  // Suggest plugin names
  for (const plugin of plugins) {
    if (plugin.name.toLowerCase().includes(partial) && !seen.has(plugin.name)) {
      suggestions.push(plugin.name)
      seen.add(plugin.name)
    }
  }

  return suggestions.slice(0, 10)
}

/**
 * Fuzzy match with typo tolerance
 */
export function fuzzyMatch(text: string, pattern: string): boolean {
  if (!pattern) return true
  if (!text) return false

  const textLower = text.toLowerCase()
  const patternLower = pattern.toLowerCase()

  // Exact or contains
  if (textLower.includes(patternLower)) return true

  // Simple Levenshtein-like check for short patterns
  if (patternLower.length <= 3) return false

  // Check if most characters match in order
  let patternIndex = 0
  for (let i = 0; i < textLower.length && patternIndex < patternLower.length; i++) {
    if (textLower[i] === patternLower[patternIndex]) {
      patternIndex++
    }
  }

  // Allow 1 missing character for longer patterns
  return patternIndex >= patternLower.length - 1
}
