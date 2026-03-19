/**
 * CommunitySnapshotBrowser - Browse, download, and rate community snapshots
 *
 * Features:
 * - Search and filter by plugin, category, tags
 * - Sort by downloads, rating, or newest
 * - Rate snapshots (1-5 stars)
 * - Download snapshots to local library
 * - Upload new snapshots to community
 */

import { useState, useCallback, useEffect } from 'react'
import {
  ChevronLeft as CaretLeft,
  ChevronRight as CaretRight,
  Download as CloudArrowDown,
  Download as DownloadSimple,
  Renew as ArrowsClockwise,
  Renew as SpinnerGap,
  Search as MagnifyingGlass,
  Star,
  StarFilled,
  Upload as UploadSimple,
  WarningAlt as WarningCircle,
} from '@carbon/icons-react'
import { sanitizeRestrictedDisplayText } from '../../../map2/displayNames'

interface CommunitySnapshot {
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

interface CommunitySnapshotBrowserProps {
  pluginUri?: string
  onSnapshotDownloaded?: (parameters: Record<string, number>) => void
  onUploadClick?: () => void
}

type SortOption = 'downloads' | 'rating' | 'newest'

export function CommunitySnapshotBrowser({
  pluginUri,
  onSnapshotDownloaded,
  onUploadClick,
}: CommunitySnapshotBrowserProps) {
  const [snapshots, setSnapshots] = useState<CommunitySnapshot[]>([])
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

  // Fetch snapshots
  const fetchSnapshots = useCallback(async () => {
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
        throw new Error(data.detail || 'Failed to load snapshots')
      }

      setSnapshots(data.presets)
      setTotal(data.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load snapshots')
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
    fetchSnapshots()
  }, [fetchSnapshots])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  // Download snapshot
  const handleDownload = useCallback(
    async (snapshot: CommunitySnapshot) => {
      try {
        const response = await fetch(`/api/preset-exchange/community/${snapshot.uuid}/download`, {
          method: 'POST',
        })
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.detail || 'Download failed')
        }

        // Update local snapshot count
        setSnapshots((prev) =>
          prev.map((entry) => (entry.uuid === snapshot.uuid ? { ...entry, downloads: entry.downloads + 1 } : entry))
        )

        if (onSnapshotDownloaded && data.parameters) {
          onSnapshotDownloaded(data.parameters)
        }

        // Show success toast (simplified)
        alert(`Downloaded "${snapshot.name}" successfully!`)
      } catch (err) {
        alert(`Download failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    },
    [onSnapshotDownloaded]
  )

  // Rate snapshot
  const handleRate = useCallback(async (snapshot: CommunitySnapshot, rating: number) => {
    try {
      // Generate device fingerprint
      const fingerprint = await generateFingerprint()

      const response = await fetch(
        `/api/preset-exchange/community/${snapshot.uuid}/rate?rating=${rating}&fingerprint=${fingerprint}`,
        { method: 'POST' }
      )
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Rating failed')
      }

      // Update local rating
      setSnapshots((prev) =>
        prev.map((entry) =>
          entry.uuid === snapshot.uuid
            ? { ...entry, rating: data.new_rating, rating_count: data.rating_count }
            : entry
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
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Community Snapshots</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={fetchSnapshots}
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
              <ArrowsClockwise size={16} className={loading ? 'animate-spin' : ''} />
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
              <UploadSimple size={16} />
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
          <MagnifyingGlass
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
            placeholder="Search snapshots..."
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
          <WarningCircle size={18} style={{ color: '#ef4444' }} />
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
          <SpinnerGap size={24} className="animate-spin" />
          <span style={{ marginLeft: '12px' }}>Loading snapshots...</span>
        </div>
      )}

      {/* Snapshot Grid */}
      {!loading && snapshots.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '16px',
          }}
        >
          {snapshots.map((snapshot) => (
            <SnapshotCard
              key={snapshot.uuid}
              snapshot={snapshot}
              onDownload={() => handleDownload(snapshot)}
              onRate={(rating) => handleRate(snapshot, rating)}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && snapshots.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '40px',
            color: 'var(--text-secondary, #888)',
          }}
        >
          <p>No snapshots found.</p>
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
            <CaretLeft size={18} />
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
            <CaretRight size={18} />
          </button>
        </div>
      )}
    </div>
  )
}

// Snapshot Card Component
function SnapshotCard({
  snapshot,
  onDownload,
  onRate,
}: {
  snapshot: CommunitySnapshot
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
          {snapshot.name}
        </h3>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #888)' }}>
          by {sanitizeRestrictedDisplayText(snapshot.author)}
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary, #666)' }}>
          for {sanitizeRestrictedDisplayText(snapshot.plugin_name) || 'Processor'}
        </div>
      </div>

      {/* Tags */}
      {snapshot.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '12px' }}>
          {snapshot.tags.slice(0, 3).map((tag) => (
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
          <CloudArrowDown size={14} />
          {snapshot.downloads}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {/* Rating stars */}
          {[1, 2, 3, 4, 5].map((star) => (
            star <= (hoverRating || snapshot.rating) ? (
              <StarFilled
                key={star}
                size={14}
                style={{ cursor: 'pointer', color: '#fbbf24' }}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => onRate(star)}
              />
            ) : (
              <Star
                key={star}
                size={14}
                style={{ cursor: 'pointer', color: '#666' }}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => onRate(star)}
              />
            )
          ))}
          <span style={{ marginLeft: '4px' }}>({snapshot.rating_count})</span>
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
        <DownloadSimple size={16} />
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

export default CommunitySnapshotBrowser
