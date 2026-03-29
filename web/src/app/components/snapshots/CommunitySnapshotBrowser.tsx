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

import { useState, useCallback, useEffect, useMemo } from 'react'
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
import { snapshotsApi } from '../../../map2/clients/snapshots'
import type {
  CommunitySnapshot as SharedCommunitySnapshot,
  SnapshotDetail,
} from '../../../map2/types'

interface CommunitySnapshotBrowserProps {
  pluginUri?: string
  onSnapshotDownloaded?: (snapshot: SnapshotDetail) => void
  onUploadClick?: () => void
}

type SortOption = 'downloads' | 'rating' | 'newest'

export function CommunitySnapshotBrowser({
  pluginUri,
  onSnapshotDownloaded,
  onUploadClick,
}: CommunitySnapshotBrowserProps) {
  const [snapshots, setSnapshots] = useState<SharedCommunitySnapshot[]>([])
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
      const response = await snapshotsApi.browseCommunity({
        query: search || undefined,
        tags: category ? [category] : undefined,
      })

      const filtered = pluginUri
        ? response.snapshots.filter((snapshot) => (
          snapshot.tags.some((tag) => tag.includes(pluginUri))
          || snapshot.description.toLowerCase().includes(pluginUri.toLowerCase())
        ))
        : response.snapshots

      const sorted = [...filtered].sort((left, right) => {
        if (sortBy === 'rating') {
          return (right.community_rating ?? 0) - (left.community_rating ?? 0)
        }
        if (sortBy === 'newest') {
          return (right.created_at ?? '').localeCompare(left.created_at ?? '')
        }
        return right.community_download_count - left.community_download_count
      })

      const tagCounts = new Map<string, number>()
      for (const snapshot of response.snapshots) {
        for (const tag of snapshot.tags) {
          tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
        }
      }

      setCategories(
        [...tagCounts.entries()]
          .map(([name, count]) => ({ name, count }))
          .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)),
      )
      setSnapshots(sorted)
      setTotal(sorted.length)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load snapshots')
    } finally {
      setLoading(false)
    }
  }, [pluginUri, category, search, sortBy, page])

  useEffect(() => {
    fetchSnapshots()
  }, [fetchSnapshots])

  // Download snapshot
  const handleDownload = useCallback(
    async (snapshot: SharedCommunitySnapshot) => {
      try {
        const data = await snapshotsApi.downloadCommunity(snapshot.community_uuid ?? '')

        // Update local snapshot count
        setSnapshots((prev) =>
          prev.map((entry) => (
            entry.community_uuid === snapshot.community_uuid
              ? { ...entry, community_download_count: entry.community_download_count + 1 }
              : entry
          ))
        )

        if (onSnapshotDownloaded) {
          onSnapshotDownloaded(data.snapshot)
        }

        alert(`Downloaded "${snapshot.name}" successfully!`)
      } catch (err) {
        alert(`Download failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    },
    [onSnapshotDownloaded]
  )

  // Rate snapshot
  const handleRate = useCallback(async (snapshot: SharedCommunitySnapshot, rating: number) => {
    try {
      const data = await snapshotsApi.rateCommunity(snapshot.community_uuid ?? '', rating)

      // Update local rating
      setSnapshots((prev) =>
        prev.map((entry) =>
          entry.community_uuid === snapshot.community_uuid
            ? {
              ...entry,
              community_rating: data.snapshot.community_rating,
              community_rating_count: data.snapshot.community_rating_count,
            }
            : entry
        )
      )
    } catch (err) {
      console.error('Rating failed:', err)
    }
  }, [])

  const visibleSnapshots = useMemo(
    () => snapshots.slice((page - 1) * pageSize, page * pageSize),
    [page, pageSize, snapshots],
  )
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
      {!loading && visibleSnapshots.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '16px',
          }}
        >
          {visibleSnapshots.map((snapshot) => (
            <SnapshotCard
              key={snapshot.community_uuid}
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
  snapshot: SharedCommunitySnapshot
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
          by {sanitizeRestrictedDisplayText(snapshot.community_author ?? 'Anonymous')}
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary, #666)' }}>
          {snapshot.description || `${snapshot.channel_count} channel snapshot`}
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
          {snapshot.community_download_count}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {/* Rating stars */}
          {[1, 2, 3, 4, 5].map((star) => (
            star <= (hoverRating || snapshot.community_rating || 0) ? (
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
          <span style={{ marginLeft: '4px' }}>({snapshot.community_rating_count})</span>
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

export default CommunitySnapshotBrowser
