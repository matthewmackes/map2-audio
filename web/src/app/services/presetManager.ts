/**
 * Preset Management System
 * Handles saving, loading, and managing plugin parameter presets
 * Persists to localStorage with plugin URI as key
 */

export interface Preset {
  id: string
  name: string
  pluginUri: string
  parameters: Record<string, number>
  createdAt: number
  updatedAt: number
  tags?: string[]
}

const PRESET_STORAGE_KEY = 'map2_presets'
const PLUGINS_WITH_PRESETS_KEY = 'map2_plugins_with_presets'

class PresetManager {
  private presets: Preset[] = []

  constructor() {
    this.loadFromStorage()
  }

  /**
   * Save a new preset or update existing
   */
  savePreset(
    pluginUri: string,
    presetName: string,
    parameters: Record<string, number>,
    tags?: string[]
  ): Preset {
    const existingIndex = this.presets.findIndex(
      (p) => p.pluginUri === pluginUri && p.name === presetName
    )

    const now = Date.now()
    const preset: Preset = {
      id: `preset_${pluginUri}_${presetName.replace(/\s+/g, '_')}_${now}`,
      name: presetName,
      pluginUri,
      parameters: { ...parameters },
      createdAt: existingIndex >= 0 ? this.presets[existingIndex].createdAt : now,
      updatedAt: now,
      tags,
    }

    if (existingIndex >= 0) {
      this.presets[existingIndex] = preset
    } else {
      this.presets.push(preset)
    }

    this.saveToStorage()
    return preset
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
    this.saveToStorage()
    return true
  }

  /**
   * Search presets by name or tag
   */
  searchPresets(query: string): Preset[] {
    const q = query.toLowerCase()
    return this.presets.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.pluginUri.toLowerCase().includes(q) ||
        (p.tags?.some((tag) => tag.toLowerCase().includes(q)) ?? false)
    )
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
}

// Export singleton instance
export const presetManager = new PresetManager()
