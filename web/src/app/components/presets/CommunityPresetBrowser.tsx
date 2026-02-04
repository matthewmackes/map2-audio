/**
 * CommunityPresetBrowser - Browse, download, and rate community presets
 *
 * Features:
 * - Search and filter by plugin, category, tags
 * - Sort by downloads, rating, or newest
 * - Rate presets (1-5 stars)
 * - Download presets to local library
 * - Upload new presets to community
 */

import { useState, useCallback, useEffect } from 'react'
import {
  Search,
  Download,
  Star,
  Upload,
  Filter,
  ChevronLeft,
  ChevronRight,
  CloudDownload,
  AlertCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react'

interface CommunityPreset {
  uuid: string
  name: string
  plugin_uri: string
  plugin_name: string
  author: string
  category: string
  tags: string[]
  downloads: number
  rating: number
  rating_count: number
  created_at: string
}

interface CommunityPresetBrowserProps {
  pluginUri?: string
  onPresetDownloaded?: (parameters: Record<string, number>) => void
  onUploadClick?: () => void
}

type SortOption = 'downloads' | 'rating' | 'newest'

export function CommunityPresetBrowser({
  pluginUri,
  onPresetDownloaded,
  onUploadClick,
}: CommunityPresetBrowserProps) {
  const [presets, setPresets] = useState<CommunityPreset[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('downloads')

  // Pagination
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 20

  // Categories
  const [categories, setCategories] = useState<{ name: string; count: number }[]>([])

  // Fetch presets
  const fetchPresets = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        sort_by: sortBy,
        page: String(page),
        page_size: String(pageSize),
      })

      if (pluginUri) params.set('plugin_uri', pluginUri)
      if (category) params.set('category', category)
      if (search) params.set('search', search)

      const response = await fetch(`/api/preset-exchange/community/browse?${params}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to load presets')
      }

      setPresets(data.presets)
      setTotal(data.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load presets')
    } finally {
      setLoading(false)
    }
  }, [pluginUri, category, search, sortBy, page])

  // Fetch categories
  const fetchCategories = useCallback(async () => {
    try {
      const response = await fetch('/api/preset-exchange/community/categories')
      const data = await response.json()
      setCategories(data.categories || [])
    } catch (err) {
      console.error('Failed to load categories:', err)
    }
  }, [])

  useEffect(() => {
    fetchPresets()
  }, [fetchPresets])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  // Download preset
  const handleDownload = useCallback(
    async (preset: CommunityPreset) => {
      try {
        const response = await fetch(`/api/preset-exchange/community/${preset.uuid}/download`, {
          method: 'POST',
        })
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.detail || 'Download failed')
        }

        // Update local preset count
        setPresets((prev) =>
          prev.map((p) => (p.uuid === preset.uuid ? { ...p, downloads: p.downloads + 1 } : p))
        )

        if (onPresetDownloaded && data.parameters) {
          onPresetDownloaded(data.parameters)
        }

        // Show success toast (simplified)
        alert(`Downloaded "${preset.name}" successfully!`)
      } catch (err) {
        alert(`Download failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    },
    [onPresetDownloaded]
  )

  // Rate preset
  const handleRate = useCallback(async (preset: CommunityPreset, rating: number) => {
    try {
      // Generate device fingerprint
      const fingerprint = await generateFingerprint()

      const response = await fetch(
        `/api/preset-exchange/community/${preset.uuid}/rate?rating=${rating}&fingerprint=${fingerprint}`,
        { method: 'POST' }
      )
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Rating failed')
      }

      // Update local rating
      setPresets((prev) =>
        prev.map((p) =>
          p.uuid === preset.uuid
            ? { ...p, rating: data.new_rating, rating_count: data.rating_count }
            : p
        )
      )
    } catch (err) {
      console.error('Rating failed:', err)
    }
  }, [])

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div style={{ padding: '16px' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Community Presets</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={fetchPresets}
            disabled={loading}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border, #444)',
              background: 'transparent',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: 'var(--text-primary, #fff)',
            }}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          {onUploadClick && (
            <button
              onClick={onUploadClick}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                background: 'var(--accent, #7c3aed)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: 'white',
                fontWeight: 500,
              }}
            >
              <Upload size={16} />
              Upload
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '16px',
          flexWrap: 'wrap',
        }}
      >
        {/* Search */}
        <div style={{ flex: '1 1 200px', position: 'relative' }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-secondary, #888)',
            }}
          />
          <input
            type="text"
            placeholder="Search presets..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            style={{
              width: '100%',
              padding: '8px 12px 8px 36px',
              borderRadius: '6px',
              border: '1px solid var(--border, #444)',
              background: 'var(--bg-tertiary, #2a2a3e)',
              color: 'var(--text-primary, #fff)',
              outline: 'none',
            }}
          />
        </div>

        {/* Category */}
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value)
            setPage(1)
          }}
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid var(--border, #444)',
            background: 'var(--bg-tertiary, #2a2a3e)',
            color: 'var(--text-primary, #fff)',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat.name} value={cat.name}>
              {cat.name} ({cat.count})
            </option>
          ))}
        </select>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => {
            setSortBy(e.target.value as SortOption)
            setPage(1)
          }}
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid var(--border, #444)',
            background: 'var(--bg-tertiary, #2a2a3e)',
            color: 'var(--text-primary, #fff)',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          <option value="downloads">Most Downloaded</option>
          <option value="rating">Highest Rated</option>
          <option value="newest">Newest</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            padding: '12px',
            borderRadius: '8px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '16px',
          }}
        >
          <AlertCircle size={18} style={{ color: '#ef4444' }} />
          <span style={{ color: '#ef4444' }}>{error}</span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px',
            color: 'var(--text-secondary, #888)',
          }}
        >
          <Loader2 size={24} className="animate-spin" />
          <span style={{ marginLeft: '12px' }}>Loading presets...</span>
        </div>
      )}

      {/* Preset Grid */}
      {!loading && presets.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '16px',
          }}
        >
          {presets.map((preset) => (
            <PresetCard
              key={preset.uuid}
              preset={preset}
              onDownload={() => handleDownload(preset)}
              onRate={(rating) => handleRate(preset, rating)}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && presets.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '40px',
            color: 'var(--text-secondary, #888)',
          }}
        >
          <p>No presets found.</p>
          {search && <p>Try adjusting your search or filters.</p>}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            marginTop: '24px',
          }}
        >
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border, #444)',
              background: 'transparent',
              cursor: page === 1 ? 'not-allowed' : 'pointer',
              opacity: page === 1 ? 0.5 : 1,
              display: 'flex',
              alignItems: 'center',
              color: 'var(--text-primary, #fff)',
            }}
          >
            <ChevronLeft size={18} />
            Previous
          </button>
          <span style={{ color: 'var(--text-secondary, #888)' }}>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border, #444)',
              background: 'transparent',
              cursor: page === totalPages ? 'not-allowed' : 'pointer',
              opacity: page === totalPages ? 0.5 : 1,
              display: 'flex',
              alignItems: 'center',
              color: 'var(--text-primary, #fff)',
            }}
          >
            Next
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </div>
  )
}

// Preset Card Component
function PresetCard({
  preset,
  onDownload,
  onRate,
}: {
  preset: CommunityPreset
  onDownload: () => void
  onRate: (rating: number) => void
}) {
  const [hoverRating, setHoverRating] = useState(0)

  return (
    <div
      style={{
        background: 'var(--bg-secondary, #1e1e2e)',
        borderRadius: '8px',
        padding: '16px',
        border: '1px solid var(--border, #333)',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: '8px' }}>
        <h3
          style={{
            margin: '0 0 4px 0',
            fontSize: '1rem',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {preset.name}
        </h3>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #888)' }}>
          by {preset.author}
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary, #666)' }}>
          for {preset.plugin_name}
        </div>
      </div>

      {/* Tags */}
      {preset.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '12px' }}>
          {preset.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              style={{
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '0.7rem',
                background: 'var(--bg-tertiary, #2a2a3e)',
                color: 'var(--text-secondary, #888)',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Stats */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          marginBottom: '12px',
          fontSize: '0.85rem',
          color: 'var(--text-secondary, #888)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <CloudDownload size={14} />
          {preset.downloads}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {/* Rating stars */}
          {[1, 2, 3, 4, 5].map((star) => (
            <Star
              key={star}
              size={14}
              fill={star <= (hoverRating || preset.rating) ? '#fbbf24' : 'transparent'}
              stroke={star <= (hoverRating || preset.rating) ? '#fbbf24' : '#666'}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              onClick={() => onRate(star)}
            />
          ))}
          <span style={{ marginLeft: '4px' }}>({preset.rating_count})</span>
        </div>
      </div>

      {/* Download Button */}
      <button
        onClick={onDownload}
        style={{
          width: '100%',
          padding: '8px',
          borderRadius: '6px',
          border: 'none',
          background: 'var(--accent, #7c3aed)',
          cursor: 'pointer',
          color: 'white',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
        }}
      >
        <Download size={16} />
        Download
      </button>
    </div>
  )
}

// Generate anonymous device fingerprint
async function generateFingerprint(): Promise<string> {
  const data = [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    new Date().getTimezoneOffset(),
  ].join('|')

  const encoder = new TextEncoder()
  const dataBuffer = encoder.encode(data)
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

export default CommunityPresetBrowser
