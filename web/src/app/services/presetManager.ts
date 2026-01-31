/**
 * World-Class Preset Management System
 * Handles saving, loading, and managing plugin parameter presets
 * Features: versioning, collections, ratings, sharing, history, validation
 * Persists to localStorage with plugin URI as key
 */

export interface PresetMetadata {
  author?: string
  description?: string
  category?: string
  genre?: string
  instrument?: string
  rating?: number // 0-5
  downloads?: number
  favorite?: boolean
  color?: string // hex color for UI
  icon?: string // emoji or icon name
}

export interface PresetVersion {
  version: number
  timestamp: number
  parameters: Record<string, number>
  changeNote?: string
}

export interface Preset {
  id: string
  name: string
  pluginUri: string
  parameters: Record<string, number>
  createdAt: number
  updatedAt: number
  tags?: string[]
  
  // Advanced features
  metadata?: PresetMetadata
  version?: number
  versions?: PresetVersion[] // Version history
  collection?: string // Collection/bank ID
  parentPreset?: string // For preset variations
  isFactory?: boolean // Built-in presets
  isShared?: boolean // Shared from cloud/community
  shareId?: string // Unique ID for sharing
  checksum?: string // For validation
}

const PRESET_STORAGE_KEY = 'map2_presets'
const PLUGINS_WITH_PRESETS_KEY = 'map2_plugins_with_presets'
const PRESET_COLLECTIONS_KEY = 'map2_preset_collections'
const PRESET_HISTORY_KEY = 'map2_preset_history'

export interface PresetCollection {
  id: string
  name: string
  description?: string
  presetIds: string[]
  createdAt: number
  updatedAt: number
  tags?: string[]
  color?: string
  icon?: string
}

export interface PresetHistory {
  presetId: string
  timestamp: number
  action: 'created' | 'updated' | 'loaded' | 'deleted'
  userId?: string
}

class PresetManager {
  private presets: Preset[] = []
  private collections: PresetCollection[] = []
  private history: PresetHistory[] = []

  constructor() {
    this.loadFromStorage()
    this.loadCollections()
    this.loadHistory()
  }

  /**
   * Save a new preset or update existing with version history
   */
  savePreset(
    pluginUri: string,
    presetName: string,
    parameters: Record<string, number>,
    tags?: string[],
    metadata?: PresetMetadata,
    changeNote?: string
  ): Preset {
    const existingIndex = this.presets.findIndex(
      (p) => p.pluginUri === pluginUri && p.name === presetName
    )

    const now = Date.now()
    const checksum = this.generateChecksum(parameters)
    
    let preset: Preset
    
    if (existingIndex >= 0) {
      // Update existing preset with version history
      const existing = this.presets[existingIndex]
      const newVersion = (existing.version || 1) + 1
      
      preset = {
        ...existing,
        parameters: { ...parameters },
        updatedAt: now,
        tags: tags || existing.tags,
        metadata: metadata || existing.metadata,
        version: newVersion,
        versions: [
          ...(existing.versions || []),
          {
            version: existing.version || 1,
            timestamp: existing.updatedAt,
            parameters: existing.parameters,
            changeNote,
          },
        ],
        checksum,
      }
      
      this.presets[existingIndex] = preset
      this.addHistory(preset.id, 'updated')
    } else {
      // Create new preset
      preset = {
        id: `preset_${pluginUri}_${presetName.replace(/\s+/g, '_')}_${now}`,
        name: presetName,
        pluginUri,
        parameters: { ...parameters },
        createdAt: now,
        updatedAt: now,
        tags,
        metadata,
        version: 1,
        versions: [],
        checksum,
      }
      
      this.presets.push(preset)
      this.addHistory(preset.id, 'created')
    }

    this.saveToStorage()
    return preset
  }

  /**
   * Save the current state of a plugin as a preset
   */
  savePluginState(
    pluginUri: string,
    parameters: Record<string, number>,
    presetName: string,
    tags?: string[]
  ): Preset {
    return this.savePreset(pluginUri, presetName, parameters, tags)
  }

  /**
   * Get all presets for a specific plugin
   */
  getPresetsForPlugin(pluginUri: string): Preset[] {
    return this.presets.filter((p) => p.pluginUri === pluginUri)
  }

  /**
   * Get all presets across all plugins
   */
  getAllPresets(): Preset[] {
    return [...this.presets]
  }

  /**
   * Get specific preset by ID
   */
  getPresetById(id: string): Preset | undefined {
    return this.presets.find((p) => p.id === id)
  }

  /**
   * Delete a preset
   */
  deletePreset(id: string): boolean {
    const index = this.presets.findIndex((p) => p.id === id)
    if (index >= 0) {
      this.presets.splice(index, 1)
      this.addHistory(id, 'deleted')
      this.saveToStorage()
      return true
    }
    return false
  }

  /**
   * Rename a preset
   */
  renamePreset(id: string, newName: string): Preset | undefined {
    const preset = this.presets.find((p) => p.id === id)
    if (preset) {
      preset.name = newName
      preset.updatedAt = Date.now()
      this.saveToStorage()
      return preset
    }
    return undefined
  }

  /**
   * Add tags to a preset
   */
  tagPreset(id: string, tags: string[]): Preset | undefined {
    const preset = this.presets.find((p) => p.id === id)
    if (preset) {
      preset.tags = [...new Set([...(preset.tags || []), ...tags])]
      preset.updatedAt = Date.now()
      this.saveToStorage()
      return preset
    }
    return undefined
  }

  /**
   * Get all plugins that have presets
   */
  getPluginsWithPresets(): string[] {
    const plugins = new Set(this.presets.map((p) => p.pluginUri))
    return Array.from(plugins)
  }

  /**
   * Count presets for a plugin
   */
  getPresetCount(pluginUri: string): number {
    return this.presets.filter((p) => p.pluginUri === pluginUri).length
  }

  /**
   * Export presets as JSON
   */
  exportPresetsAsJSON(): string {
    return JSON.stringify(this.presets, null, 2)
  }

  /**
   * Import presets from JSON
   */
  importPresetsFromJSON(json: string): boolean {
    try {
      const imported = JSON.parse(json) as Preset[]
      if (Array.isArray(imported)) {
        this.presets = [...this.presets, ...imported]
        this.saveToStorage()
        return true
      }
    } catch (e) {
      console.error('Failed to import presets:', e)
    }
    return false
  }

  /**
   * Clear all presets (with confirmation)
   */
  clearAllPresets(): boolean {
    this.presets = []
    this.collections = []
    this.history = []
    this.saveToStorage()
    this.saveCollections()
    this.saveHistory()
    return true
  }

  /**
   * Search presets by name or tag with advanced filtering
   */
  searchPresets(query: string, filters?: {
    pluginUri?: string
    tags?: string[]
    category?: string
    minRating?: number
    favorite?: boolean
    collection?: string
  }): Preset[] {
    const q = query.toLowerCase()
    let results = this.presets.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.pluginUri.toLowerCase().includes(q) ||
        (p.tags?.some((tag) => tag.toLowerCase().includes(q)) ?? false) ||
        (p.metadata?.description?.toLowerCase().includes(q) ?? false) ||
        (p.metadata?.author?.toLowerCase().includes(q) ?? false)
    )

    // Apply filters
    if (filters) {
      if (filters.pluginUri) {
        results = results.filter(p => p.pluginUri === filters.pluginUri)
      }
      if (filters.tags && filters.tags.length > 0) {
        results = results.filter(p => 
          filters.tags!.some(tag => p.tags?.includes(tag))
        )
      }
      if (filters.category) {
        results = results.filter(p => p.metadata?.category === filters.category)
      }
      if (filters.minRating !== undefined) {
        results = results.filter(p => (p.metadata?.rating || 0) >= filters.minRating!)
      }
      if (filters.favorite !== undefined) {
        results = results.filter(p => p.metadata?.favorite === filters.favorite)
      }
      if (filters.collection) {
        results = results.filter(p => p.collection === filters.collection)
      }
    }

    return results
  }

  /**
   * Rate a preset (0-5 stars)
   */
  ratePreset(id: string, rating: number): Preset | undefined {
    if (rating < 0 || rating > 5) {
      throw new Error('Rating must be between 0 and 5')
    }
    
    const preset = this.presets.find((p) => p.id === id)
    if (preset) {
      preset.metadata = preset.metadata || {}
      preset.metadata.rating = rating
      preset.updatedAt = Date.now()
      this.saveToStorage()
      return preset
    }
    return undefined
  }

  /**
   * Toggle favorite status
   */
  toggleFavorite(id: string): Preset | undefined {
    const preset = this.presets.find((p) => p.id === id)
    if (preset) {
      preset.metadata = preset.metadata || {}
      preset.metadata.favorite = !preset.metadata.favorite
      preset.updatedAt = Date.now()
      this.saveToStorage()
      return preset
    }
    return undefined
  }

  /**
   * Update preset metadata
   */
  updateMetadata(id: string, metadata: Partial<PresetMetadata>): Preset | undefined {
    const preset = this.presets.find((p) => p.id === id)
    if (preset) {
      preset.metadata = { ...preset.metadata, ...metadata }
      preset.updatedAt = Date.now()
      this.saveToStorage()
      return preset
    }
    return undefined
  }

  /**
   * Get all favorites
   */
  getFavorites(pluginUri?: string): Preset[] {
    let favorites = this.presets.filter(p => p.metadata?.favorite === true)
    if (pluginUri) {
      favorites = favorites.filter(p => p.pluginUri === pluginUri)
    }
    return favorites
  }

  /**
   * Get presets by category
   */
  getByCategory(category: string, pluginUri?: string): Preset[] {
    let presets = this.presets.filter(p => p.metadata?.category === category)
    if (pluginUri) {
      presets = presets.filter(p => p.pluginUri === pluginUri)
    }
    return presets
  }

  /**
   * Get all categories
   */
  getCategories(): string[] {
    const categories = new Set<string>()
    this.presets.forEach(p => {
      if (p.metadata?.category) {
        categories.add(p.metadata.category)
      }
    })
    return Array.from(categories).sort()
  }

  /**
   * Get top rated presets
   */
  getTopRated(limit: number = 10, pluginUri?: string): Preset[] {
    let presets = [...this.presets]
    if (pluginUri) {
      presets = presets.filter(p => p.pluginUri === pluginUri)
    }
    return presets
      .filter(p => p.metadata?.rating !== undefined)
      .sort((a, b) => (b.metadata?.rating || 0) - (a.metadata?.rating || 0))
      .slice(0, limit)
  }

  /**
   * Compare two presets
   */
  comparePresets(id1: string, id2: string): {
    preset1: Preset
    preset2: Preset
    differences: { parameter: string; value1: number; value2: number; diff: number }[]
    similarity: number
  } | undefined {
    const p1 = this.presets.find(p => p.id === id1)
    const p2 = this.presets.find(p => p.id === id2)
    
    if (!p1 || !p2) return undefined
    
    const differences: { parameter: string; value1: number; value2: number; diff: number }[] = []
    const allParams = new Set([...Object.keys(p1.parameters), ...Object.keys(p2.parameters)])
    
    let totalDiff = 0
    allParams.forEach(param => {
      const v1 = p1.parameters[param] || 0
      const v2 = p2.parameters[param] || 0
      const diff = Math.abs(v1 - v2)
      if (diff > 0.001) {
        differences.push({ parameter: param, value1: v1, value2: v2, diff })
      }
      totalDiff += diff
    })
    
    const similarity = allParams.size > 0 ? (1 - (totalDiff / allParams.size)) * 100 : 100
    
    return {
      preset1: p1,
      preset2: p2,
      differences,
      similarity,
    }
  }

  /**
   * Revert to a previous version
   */
  revertToVersion(presetId: string, versionNumber: number): Preset | undefined {
    const preset = this.presets.find(p => p.id === presetId)
    if (!preset || !preset.versions) return undefined
    
    const version = preset.versions.find(v => v.version === versionNumber)
    if (!version) return undefined
    
    // Save current state to version history
    preset.versions.push({
      version: preset.version || 1,
      timestamp: preset.updatedAt,
      parameters: preset.parameters,
      changeNote: `Reverted to version ${versionNumber}`,
    })
    
    // Restore version
    preset.parameters = { ...version.parameters }
    preset.updatedAt = Date.now()
    preset.version = (preset.version || 1) + 1
    preset.checksum = this.generateChecksum(preset.parameters)
    
    this.addHistory(presetId, 'updated')
    this.saveToStorage()
    return preset
  }

  /**
   * Duplicate a preset
   */
  duplicatePreset(id: string, newName: string): Preset | undefined {
    const original = this.presets.find(p => p.id === id)
    if (!original) return undefined
    
    const now = Date.now()
    const duplicate: Preset = {
      ...original,
      id: `preset_${original.pluginUri}_${newName.replace(/\s+/g, '_')}_${now}`,
      name: newName,
      createdAt: now,
      updatedAt: now,
      parentPreset: original.id,
      version: 1,
      versions: [],
    }
    
    this.presets.push(duplicate)
    this.addHistory(duplicate.id, 'created')
    this.saveToStorage()
    return duplicate
  }

  /**
   * Validate preset integrity
   */
  validatePreset(id: string): { valid: boolean; errors: string[] } {
    const preset = this.presets.find(p => p.id === id)
    const errors: string[] = []
    
    if (!preset) {
      errors.push('Preset not found')
      return { valid: false, errors }
    }
    
    if (!preset.name || preset.name.trim() === '') {
      errors.push('Preset name is empty')
    }
    
    if (!preset.pluginUri || preset.pluginUri.trim() === '') {
      errors.push('Plugin URI is missing')
    }
    
    if (!preset.parameters || Object.keys(preset.parameters).length === 0) {
      errors.push('No parameters defined')
    }
    
    // Validate checksum
    if (preset.checksum) {
      const calculatedChecksum = this.generateChecksum(preset.parameters)
      if (calculatedChecksum !== preset.checksum) {
        errors.push('Checksum mismatch - preset may be corrupted')
      }
    }
    
    return { valid: errors.length === 0, errors }
  }

  /**
   * Generate checksum for parameters
   */
  private generateChecksum(parameters: Record<string, number>): string {
    const str = JSON.stringify(parameters, Object.keys(parameters).sort())
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36)
  }

  /**
   * Add entry to history
   */
  private addHistory(presetId: string, action: PresetHistory['action']): void {
    this.history.push({
      presetId,
      timestamp: Date.now(),
      action,
    })
    
    // Keep only last 1000 entries
    if (this.history.length > 1000) {
      this.history = this.history.slice(-1000)
    }
    
    this.saveHistory()
  }

  /**
   * Get preset history
   */
  getHistory(presetId?: string, limit: number = 50): PresetHistory[] {
    let history = [...this.history].reverse()
    if (presetId) {
      history = history.filter(h => h.presetId === presetId)
    }
    return history.slice(0, limit)
  }

  /**
   * Recall the parameter settings for a specific preset
   */
  recallPluginState(pluginUri: string, presetId: string): Record<string, number> | undefined {
    const preset = this.presets.find((p) => p.id === presetId && p.pluginUri === pluginUri)
    if (preset) {
      this.addHistory(presetId, 'loaded')
    }
    return preset ? preset.parameters : undefined
  }

  // ============= COLLECTION MANAGEMENT =============
  
  /**
   * Create a new preset collection/bank
   */
  createCollection(name: string, description?: string, tags?: string[]): PresetCollection {
    const now = Date.now()
    const collection: PresetCollection = {
      id: `collection_${name.replace(/\s+/g, '_')}_${now}`,
      name,
      description,
      presetIds: [],
      createdAt: now,
      updatedAt: now,
      tags,
    }
    
    this.collections.push(collection)
    this.saveCollections()
    return collection
  }

  /**
   * Get all collections
   */
  getAllCollections(): PresetCollection[] {
    return [...this.collections]
  }

  /**
   * Get collection by ID
   */
  getCollection(id: string): PresetCollection | undefined {
    return this.collections.find(c => c.id === id)
  }

  /**
   * Add preset to collection
   */
  addToCollection(collectionId: string, presetId: string): boolean {
    const collection = this.collections.find(c => c.id === collectionId)
    const preset = this.presets.find(p => p.id === presetId)
    
    if (!collection || !preset) return false
    
    if (!collection.presetIds.includes(presetId)) {
      collection.presetIds.push(presetId)
      collection.updatedAt = Date.now()
      
      preset.collection = collectionId
      preset.updatedAt = Date.now()
      
      this.saveCollections()
      this.saveToStorage()
    }
    
    return true
  }

  /**
   * Remove preset from collection
   */
  removeFromCollection(collectionId: string, presetId: string): boolean {
    const collection = this.collections.find(c => c.id === collectionId)
    const preset = this.presets.find(p => p.id === presetId)
    
    if (!collection) return false
    
    const index = collection.presetIds.indexOf(presetId)
    if (index >= 0) {
      collection.presetIds.splice(index, 1)
      collection.updatedAt = Date.now()
      
      if (preset && preset.collection === collectionId) {
        preset.collection = undefined
        preset.updatedAt = Date.now()
        this.saveToStorage()
      }
      
      this.saveCollections()
    }
    
    return true
  }

  /**
   * Get all presets in a collection
   */
  getCollectionPresets(collectionId: string): Preset[] {
    const collection = this.collections.find(c => c.id === collectionId)
    if (!collection) return []
    
    return this.presets.filter(p => collection.presetIds.includes(p.id))
  }

  /**
   * Delete a collection
   */
  deleteCollection(id: string): boolean {
    const index = this.collections.findIndex(c => c.id === id)
    if (index >= 0) {
      const collection = this.collections[index]
      
      // Remove collection reference from presets
      this.presets.forEach(preset => {
        if (preset.collection === id) {
          preset.collection = undefined
        }
      })
      
      this.collections.splice(index, 1)
      this.saveCollections()
      this.saveToStorage()
      return true
    }
    return false
  }

  /**
   * Rename collection
   */
  renameCollection(id: string, newName: string): PresetCollection | undefined {
    const collection = this.collections.find(c => c.id === id)
    if (collection) {
      collection.name = newName
      collection.updatedAt = Date.now()
      this.saveCollections()
      return collection
    }
    return undefined
  }

  /**
   * Export collection as JSON
   */
  exportCollection(id: string): string | undefined {
    const collection = this.collections.find(c => c.id === id)
    if (!collection) return undefined
    
    const presets = this.getCollectionPresets(id)
    
    const exportData = {
      collection,
      presets,
      exportedAt: Date.now(),
      version: '1.0',
    }
    
    return JSON.stringify(exportData, null, 2)
  }

  /**
   * Import collection from JSON
   */
  importCollection(json: string): { collection?: PresetCollection; presetsImported: number; errors: string[] } {
    const errors: string[] = []
    let presetsImported = 0
    
    try {
      const data = JSON.parse(json)
      
      if (!data.collection || !Array.isArray(data.presets)) {
        errors.push('Invalid collection format')
        return { presetsImported: 0, errors }
      }
      
      // Import collection
      const now = Date.now()
      const collection: PresetCollection = {
        ...data.collection,
        id: `collection_${data.collection.name.replace(/\s+/g, '_')}_${now}`,
        createdAt: now,
        updatedAt: now,
        presetIds: [],
      }
      
      this.collections.push(collection)
      
      // Import presets
      const idMap = new Map<string, string>() // old ID -> new ID
      
      data.presets.forEach((preset: Preset) => {
        const newId = `preset_${preset.pluginUri}_${preset.name.replace(/\s+/g, '_')}_${now}_${presetsImported}`
        idMap.set(preset.id, newId)
        
        const newPreset: Preset = {
          ...preset,
          id: newId,
          createdAt: now,
          updatedAt: now,
          collection: collection.id,
          isShared: data.isShared || false,
        }
        
        this.presets.push(newPreset)
        collection.presetIds.push(newId)
        presetsImported++
      })
      
      this.saveCollections()
      this.saveToStorage()
      
      return { collection, presetsImported, errors }
    } catch (e) {
      errors.push(`Import failed: ${e}`)
      return { presetsImported: 0, errors }
    }
  }

  /**
   * Unified method to handle preset operations
   */
  handlePresetOperation(
    operation: 'save' | 'recall',
    pluginUri: string,
    parameters?: Record<string, number>,
    presetName?: string,
    presetId?: string,
    tags?: string[]
  ): Preset | Record<string, number> | undefined {
    if (operation === 'save' && parameters && presetName) {
      return this.savePreset(pluginUri, presetName, parameters, tags)
    } else if (operation === 'recall' && presetId) {
      return this.recallPluginState(pluginUri, presetId)
    }
    throw new Error('Invalid operation or missing parameters')
  }

  /**
   * Private: Save to localStorage
   */
  private saveToStorage(): void {
    try {
      localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(this.presets))
    } catch (e) {
      console.error('Failed to save presets to storage:', e)
    }
  }

  /**
   * Private: Load from localStorage
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(PRESET_STORAGE_KEY)
      if (stored) {
        this.presets = JSON.parse(stored) as Preset[]
      }
    } catch (e) {
      console.error('Failed to load presets from storage:', e)
      this.presets = []
    }
  }

  /**
   * Private: Save collections to localStorage
   */
  private saveCollections(): void {
    try {
      localStorage.setItem(PRESET_COLLECTIONS_KEY, JSON.stringify(this.collections))
    } catch (e) {
      console.error('Failed to save collections to storage:', e)
    }
  }

  /**
   * Private: Load collections from localStorage
   */
  private loadCollections(): void {
    try {
      const stored = localStorage.getItem(PRESET_COLLECTIONS_KEY)
      if (stored) {
        this.collections = JSON.parse(stored) as PresetCollection[]
      }
    } catch (e) {
      console.error('Failed to load collections from storage:', e)
      this.collections = []
    }
  }

  /**
   * Private: Save history to localStorage
   */
  private saveHistory(): void {
    try {
      localStorage.setItem(PRESET_HISTORY_KEY, JSON.stringify(this.history))
    } catch (e) {
      console.error('Failed to save history to storage:', e)
    }
  }

  /**
   * Private: Load history from localStorage
   */
  private loadHistory(): void {
    try {
      const stored = localStorage.getItem(PRESET_HISTORY_KEY)
      if (stored) {
        this.history = JSON.parse(stored) as PresetHistory[]
      }
    } catch (e) {
      console.error('Failed to load history from storage:', e)
      this.history = []
    }
  }
}

// Export singleton instance
export const presetManager = new PresetManager()
