/**
 * TagSelector Component
 *
 * Multi-select tag picker with predefined categories.
 * Allows users to assign tags to plugins from a categorized list.
 */

import { useState, useMemo } from 'react'
import { usePluginTags, usePluginMetadata } from '../../hooks/usePluginTags'
import { Star, StarOff, Eye, EyeOff, X, ChevronDown, ChevronUp, Check } from 'lucide-react'

interface TagSelectorProps {
  pluginUri: string
  pluginName?: string
  onClose?: () => void
  compact?: boolean
}

export function TagSelector({
  pluginUri,
  pluginName,
  onClose,
  compact = false
}: TagSelectorProps) {
  const { tagCategories, isLoadingTags } = usePluginTags()
  const { metadata, isLoading, update, isUpdating } = usePluginMetadata(pluginUri)

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['effect_type']))
  const [searchQuery, setSearchQuery] = useState('')

  const selectedTags = useMemo(() => new Set(metadata?.tags ?? []), [metadata?.tags])

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(category)) {
      newExpanded.delete(category)
    } else {
      newExpanded.add(category)
    }
    setExpandedCategories(newExpanded)
  }

  const toggleTag = async (tag: string) => {
    if (!metadata) return

    const newTags = new Set(metadata.tags)
    if (newTags.has(tag)) {
      newTags.delete(tag)
    } else {
      newTags.add(tag)
    }

    await update({ tags: Array.from(newTags) })
  }

  const toggleFavorite = async () => {
    if (!metadata) return
    await update({ is_favorite: !metadata.is_favorite })
  }

  const toggleHidden = async () => {
    if (!metadata) return
    await update({ is_hidden: !metadata.is_hidden })
  }

  const clearAllTags = async () => {
    if (!metadata) return
    await update({ tags: [] })
  }

  const categoryLabels: Record<string, string> = {
    instrument_type: 'Instrument',
    effect_type: 'Effect Type',
    genre: 'Genre',
    tone: 'Tone',
    use_case: 'Use Case',
    quality: 'Quality',
    technical: 'Technical'
  }

  const categoryColors: Record<string, string> = {
    instrument_type: '#f59e0b',
    effect_type: '#10b981',
    genre: '#8b5cf6',
    tone: '#ec4899',
    use_case: '#06b6d4',
    quality: '#f97316',
    technical: '#6366f1'
  }

  // Filter tags by search query
  const filteredCategories = useMemo(() => {
    if (!tagCategories || !searchQuery.trim()) return tagCategories

    const query = searchQuery.toLowerCase()
    const filtered: Record<string, string[]> = {}

    for (const [category, tags] of Object.entries(tagCategories)) {
      const matchingTags = tags.filter((tag: string) =>
        tag.toLowerCase().includes(query)
      )
      if (matchingTags.length > 0) {
        filtered[category] = matchingTags
      }
    }

    return filtered
  }, [tagCategories, searchQuery])

  if (isLoadingTags || isLoading) {
    return (
      <div className="tag-selector loading">
        <div className="loading-spinner" />
        <span>Loading tags...</span>
      </div>
    )
  }

  return (
    <div className={`tag-selector ${compact ? 'compact' : ''}`}>
      {/* Header */}
      <div className="tag-selector-header">
        <div className="tag-selector-title">
          <h3>{pluginName || 'Plugin Tags'}</h3>
          {onClose && (
            <button className="close-btn" onClick={onClose} title="Close">
              <X size={18} />
            </button>
          )}
        </div>

        {/* Quick Actions */}
        <div className="quick-actions">
          <button
            className={`action-btn ${metadata?.is_favorite ? 'active favorite' : ''}`}
            onClick={toggleFavorite}
            disabled={isUpdating}
            title={metadata?.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            {metadata?.is_favorite ? <Star size={16} /> : <StarOff size={16} />}
            <span>Favorite</span>
          </button>
          <button
            className={`action-btn ${metadata?.is_hidden ? 'active hidden' : ''}`}
            onClick={toggleHidden}
            disabled={isUpdating}
            title={metadata?.is_hidden ? 'Show plugin' : 'Hide plugin'}
          >
            {metadata?.is_hidden ? <EyeOff size={16} /> : <Eye size={16} />}
            <span>Hidden</span>
          </button>
        </div>
      </div>

      {/* Selected Tags */}
      {selectedTags.size > 0 && (
        <div className="selected-tags">
          <div className="selected-tags-header">
            <span>Selected ({selectedTags.size})</span>
            <button className="clear-btn" onClick={clearAllTags} disabled={isUpdating}>
              Clear all
            </button>
          </div>
          <div className="selected-tags-list">
            {Array.from(selectedTags).map(tag => (
              <span
                key={tag}
                className="selected-tag"
                onClick={() => toggleTag(tag)}
              >
                {tag}
                <X size={12} />
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="tag-search">
        <input
          type="text"
          placeholder="Search tags..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button className="clear-search" onClick={() => setSearchQuery('')}>
            <X size={14} />
          </button>
        )}
      </div>

      {/* Tag Categories */}
      <div className="tag-categories">
        {filteredCategories && Object.entries(filteredCategories).map(([category, tags]) => (
          <div key={category} className="tag-category">
            <button
              className="category-header"
              onClick={() => toggleCategory(category)}
              style={{ '--category-color': categoryColors[category] } as React.CSSProperties}
            >
              <span className="category-name">{categoryLabels[category] || category}</span>
              <span className="category-count">{tags.length}</span>
              {expandedCategories.has(category) ? (
                <ChevronUp size={14} />
              ) : (
                <ChevronDown size={14} />
              )}
            </button>

            {expandedCategories.has(category) && (
              <div className="category-tags">
                {tags.map((tag: string) => {
                  const isSelected = selectedTags.has(tag)
                  return (
                    <button
                      key={tag}
                      className={`tag-chip ${isSelected ? 'selected' : ''}`}
                      onClick={() => toggleTag(tag)}
                      disabled={isUpdating}
                      style={{
                        '--tag-color': categoryColors[category]
                      } as React.CSSProperties}
                    >
                      {isSelected && <Check size={12} />}
                      {tag}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      <style>{`
        .tag-selector {
          background: #1a1a1a;
          border: 1px solid #333;
          border-radius: 8px;
          padding: 16px;
          max-width: 400px;
          max-height: 500px;
          overflow-y: auto;
        }

        .tag-selector.compact {
          max-width: 320px;
          padding: 12px;
        }

        .tag-selector.loading {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 100px;
          color: #888;
        }

        .loading-spinner {
          width: 20px;
          height: 20px;
          border: 2px solid #333;
          border-top-color: #888;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .tag-selector-header {
          margin-bottom: 12px;
        }

        .tag-selector-title {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .tag-selector-title h3 {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
          color: #fff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .close-btn {
          background: none;
          border: none;
          color: #666;
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
        }

        .close-btn:hover {
          color: #fff;
        }

        .quick-actions {
          display: flex;
          gap: 8px;
        }

        .action-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          background: #222;
          border: 1px solid #444;
          border-radius: 4px;
          color: #888;
          font-size: 11px;
          padding: 4px 8px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .action-btn:hover {
          background: #333;
          color: #fff;
        }

        .action-btn.active.favorite {
          background: #4a3520;
          border-color: #f59e0b;
          color: #f59e0b;
        }

        .action-btn.active.hidden {
          background: #3a2020;
          border-color: #ef4444;
          color: #ef4444;
        }

        .selected-tags {
          margin-bottom: 12px;
          padding: 8px;
          background: #222;
          border-radius: 6px;
        }

        .selected-tags-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
          font-size: 11px;
          color: #888;
        }

        .clear-btn {
          background: none;
          border: none;
          color: #666;
          font-size: 10px;
          cursor: pointer;
        }

        .clear-btn:hover {
          color: #ff6666;
        }

        .selected-tags-list {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }

        .selected-tag {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: #444;
          border-radius: 4px;
          padding: 2px 6px;
          font-size: 11px;
          color: #fff;
          cursor: pointer;
        }

        .selected-tag:hover {
          background: #555;
        }

        .tag-search {
          position: relative;
          margin-bottom: 12px;
        }

        .tag-search input {
          width: 100%;
          background: #222;
          border: 1px solid #444;
          border-radius: 4px;
          padding: 8px 30px 8px 10px;
          font-size: 12px;
          color: #fff;
        }

        .tag-search input:focus {
          outline: none;
          border-color: #666;
        }

        .clear-search {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: #666;
          cursor: pointer;
          display: flex;
        }

        .clear-search:hover {
          color: #fff;
        }

        .tag-categories {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .tag-category {
          border: 1px solid #333;
          border-radius: 6px;
          overflow: hidden;
        }

        .category-header {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 8px;
          background: #222;
          border: none;
          padding: 8px 10px;
          cursor: pointer;
          color: #fff;
          font-size: 12px;
          text-align: left;
        }

        .category-header:hover {
          background: #2a2a2a;
        }

        .category-name {
          flex: 1;
          font-weight: 500;
          color: var(--category-color, #fff);
        }

        .category-count {
          font-size: 10px;
          color: #666;
          background: #333;
          padding: 2px 6px;
          border-radius: 10px;
        }

        .category-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          padding: 8px;
          background: #1a1a1a;
        }

        .tag-chip {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: #2a2a2a;
          border: 1px solid #444;
          border-radius: 4px;
          padding: 4px 8px;
          font-size: 11px;
          color: #aaa;
          cursor: pointer;
          transition: all 0.15s;
        }

        .tag-chip:hover {
          background: #333;
          border-color: var(--tag-color, #666);
          color: #fff;
        }

        .tag-chip.selected {
          background: color-mix(in srgb, var(--tag-color, #666) 20%, #1a1a1a);
          border-color: var(--tag-color, #666);
          color: var(--tag-color, #fff);
        }

        .tag-chip:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  )
}

export default TagSelector
