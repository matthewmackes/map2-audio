import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  Speaker,
  Waves,
  Zap,
  Music,
  Loader2,
  RefreshCw,
  Trash2,
  ChevronUp,
  ChevronDown,
  Check,
  AlertTriangle,
} from 'lucide-react'
import { irApi, namApi, soundfontApi, foldersApi } from '../../../map2/api'
import type { NAMModel, IRFile } from '../../../map2/types'
import type { SoundFont } from '../../types/library'

// Unified asset type for the table
type AssetType = 'nam' | 'cabinet' | 'reverb' | 'sfz'

interface UnifiedAsset {
  id: string
  name: string
  type: AssetType
  path: string
  size?: number
  source?: string
  format?: string
  sampleRate?: number
  duration?: number
  category?: string
  isActive?: boolean
}

type SortField = 'name' | 'type' | 'source' | 'size'
type SortDirection = 'asc' | 'desc'

const TYPE_CONFIG: Record<AssetType, { label: string; icon: typeof Zap; color: string }> = {
  nam: { label: 'NAM', icon: Zap, color: '#ff6b6b' },
  cabinet: { label: 'Cabinet IR', icon: Speaker, color: '#f97316' },
  reverb: { label: 'Reverb IR', icon: Waves, color: '#a855f7' },
  sfz: { label: 'SoundFont', icon: Music, color: '#22c55e' },
}

function formatSize(bytes?: number): string {
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function InstalledAssetsTable() {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [sortField, setSortField] = useState<SortField>('type')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [typeFilter, setTypeFilter] = useState<AssetType | 'all'>('all')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Fetch all asset types
  const cabinetsQuery = useQuery({
    queryKey: ['ir', 'cabinets'],
    queryFn: irApi.listCabinets,
  })

  const reverbsQuery = useQuery({
    queryKey: ['ir', 'reverbs'],
    queryFn: irApi.listReverbs,
  })

  const namQuery = useQuery({
    queryKey: ['nam', 'models'],
    queryFn: () => namApi.listModels(),
  })

  const soundfontsQuery = useQuery({
    queryKey: ['soundfonts', 'list'],
    queryFn: () => soundfontApi.listSoundfonts(),
  })

  const irStatusQuery = useQuery({
    queryKey: ['ir', 'status'],
    queryFn: irApi.getStatus,
  })

  const namStatusQuery = useQuery({
    queryKey: ['nam', 'status'],
    queryFn: namApi.getStatus,
  })

  // Scan mutation
  const scanMutation = useMutation({
    mutationFn: () => foldersApi.scanAll(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ir'] })
      queryClient.invalidateQueries({ queryKey: ['nam'] })
      queryClient.invalidateQueries({ queryKey: ['soundfonts'] })
    },
  })

  // Convert all assets to unified format
  const unifiedAssets = useMemo((): UnifiedAsset[] => {
    const assets: UnifiedAsset[] = []

    // Add cabinet IRs
    const cabinets = cabinetsQuery.data?.irs ?? []
    cabinets.forEach((ir: IRFile) => {
      assets.push({
        id: `cabinet:${ir.path}`,
        name: ir.name,
        type: 'cabinet',
        path: ir.path,
        size: ir.size,
        source: 'Local',
        sampleRate: ir.sample_rate,
        duration: ir.duration,
        isActive: ir.name === irStatusQuery.data?.loaded_cabinet,
      })
    })

    // Add reverb IRs
    const reverbs = reverbsQuery.data?.irs ?? []
    reverbs.forEach((ir: IRFile) => {
      assets.push({
        id: `reverb:${ir.path}`,
        name: ir.name,
        type: 'reverb',
        path: ir.path,
        size: ir.size,
        source: 'Local',
        sampleRate: ir.sample_rate,
        duration: ir.duration,
        isActive: ir.name === irStatusQuery.data?.loaded_reverb,
      })
    })

    // Add NAM models
    const nams = namQuery.data?.models ?? []
    nams.forEach((model: NAMModel) => {
      assets.push({
        id: `nam:${model.path ?? model.name}`,
        name: model.name,
        type: 'nam',
        path: model.path ?? '',
        size: model.size,
        source: model.type || 'Unknown',
        isActive: model.name === namStatusQuery.data?.activeModel,
      })
    })

    // Add SoundFonts
    const soundfonts = soundfontsQuery.data?.soundfonts ?? []
    soundfonts.forEach((sf: SoundFont) => {
      assets.push({
        id: `sfz:${sf.path}`,
        name: sf.name,
        type: 'sfz',
        path: sf.path,
        size: sf.size,
        source: sf.library || 'Local',
        format: sf.format,
        category: sf.category,
      })
    })

    return assets
  }, [
    cabinetsQuery.data,
    reverbsQuery.data,
    namQuery.data,
    soundfontsQuery.data,
    irStatusQuery.data,
    namStatusQuery.data,
  ])

  // Filter and sort assets
  const filteredAssets = useMemo(() => {
    let result = unifiedAssets

    // Apply type filter
    if (typeFilter !== 'all') {
      result = result.filter((a) => a.type === typeFilter)
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(query) ||
          a.source?.toLowerCase().includes(query) ||
          a.category?.toLowerCase().includes(query)
      )
    }

    // Apply sorting
    result = [...result].sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
        case 'type':
          comparison = a.type.localeCompare(b.type)
          break
        case 'source':
          comparison = (a.source ?? '').localeCompare(b.source ?? '')
          break
        case 'size':
          comparison = (a.size ?? 0) - (b.size ?? 0)
          break
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })

    return result
  }, [unifiedAssets, typeFilter, searchQuery, sortField, sortDirection])

  const isLoading =
    cabinetsQuery.isLoading ||
    reverbsQuery.isLoading ||
    namQuery.isLoading ||
    soundfontsQuery.isLoading

  const handleRefresh = useCallback(() => {
    cabinetsQuery.refetch()
    reverbsQuery.refetch()
    namQuery.refetch()
    soundfontsQuery.refetch()
    irStatusQuery.refetch()
    namStatusQuery.refetch()
  }, [cabinetsQuery, reverbsQuery, namQuery, soundfontsQuery, irStatusQuery, namStatusQuery])

  const handleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
        return prev
      }
      setSortDirection('asc')
      return field
    })
  }, [])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredAssets.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredAssets.map((a) => a.id)))
    }
  }, [selectedIds.size, filteredAssets])

  const handleDeleteSelected = useCallback(() => {
    // For now, just show confirmation and clear selection
    // TODO: Implement actual delete API calls
    setShowDeleteConfirm(false)
    setSelectedIds(new Set())
    // After delete, refresh the lists
    handleRefresh()
  }, [handleRefresh])

  const getCounts = useCallback(() => {
    return {
      nam: namQuery.data?.total ?? 0,
      cabinet: cabinetsQuery.data?.count ?? 0,
      reverb: reverbsQuery.data?.count ?? 0,
      sfz: soundfontsQuery.data?.total ?? 0,
      total:
        (namQuery.data?.total ?? 0) +
        (cabinetsQuery.data?.count ?? 0) +
        (reverbsQuery.data?.count ?? 0) +
        (soundfontsQuery.data?.total ?? 0),
    }
  }, [namQuery.data, cabinetsQuery.data, reverbsQuery.data, soundfontsQuery.data])

  const counts = getCounts()

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return sortDirection === 'asc' ? (
      <ChevronUp size={14} style={{ marginLeft: 4 }} />
    ) : (
      <ChevronDown size={14} style={{ marginLeft: 4 }} />
    )
  }

  return (
    <div className="card">
      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--border)', padding: '12px 16px' }}>
        <div className="flex-between" style={{ marginBottom: 12 }}>
          <div className="flex" style={{ gap: 8, alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Installed Assets</h3>
            <span className="badge">{counts.total}</span>
          </div>
          <div className="flex" style={{ gap: 8 }}>
            {selectedIds.size > 0 && (
              <button
                className="btn btn-sm"
                style={{ background: 'var(--error)', color: '#fff' }}
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 size={14} />
                Delete ({selectedIds.size})
              </button>
            )}
            <button
              className="btn btn-sm btn-primary"
              onClick={() => scanMutation.mutate()}
              disabled={scanMutation.isPending}
            >
              {scanMutation.isPending ? (
                <Loader2 size={14} className="spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              Update
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleRefresh}
              disabled={isLoading}
            >
              <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
            </button>
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex" style={{ gap: 4, marginBottom: 12 }}>
          <button
            className={`btn btn-sm ${typeFilter === 'all' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTypeFilter('all')}
          >
            All ({counts.total})
          </button>
          {(Object.keys(TYPE_CONFIG) as AssetType[]).map((type) => {
            const config = TYPE_CONFIG[type]
            const Icon = config.icon
            const count = counts[type]
            return (
              <button
                key={type}
                className={`btn btn-sm ${typeFilter === type ? '' : 'btn-ghost'}`}
                style={{
                  background: typeFilter === type ? `${config.color}20` : undefined,
                  color: typeFilter === type ? config.color : undefined,
                  borderColor: typeFilter === type ? config.color : undefined,
                }}
                onClick={() => setTypeFilter(type)}
              >
                <Icon size={14} />
                {config.label} ({count})
              </button>
            )
          })}
        </div>

        {/* Search bar */}
        <div
          className="flex"
          style={{
            gap: 8,
            alignItems: 'center',
            background: 'var(--bg-secondary)',
            borderRadius: 6,
            padding: '8px 12px',
          }}
        >
          <Search size={16} className="muted" />
          <input
            type="text"
            placeholder="Search assets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              color: 'inherit',
              fontSize: 14,
            }}
          />
          {searchQuery && (
            <button
              className="btn btn-ghost"
              onClick={() => setSearchQuery('')}
              style={{ padding: 4 }}
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        {isLoading ? (
          <div className="flex" style={{ justifyContent: 'center', padding: 40 }}>
            <Loader2 size={24} className="spin" style={{ color: 'var(--primary)' }} />
          </div>
        ) : filteredAssets.length === 0 ? (
          <div className="muted" style={{ textAlign: 'center', padding: 40 }}>
            No assets found
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', width: 40 }}>
                  <input
                    type="checkbox"
                    checked={
                      selectedIds.size === filteredAssets.length && filteredAssets.length > 0
                    }
                    onChange={toggleSelectAll}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                <th
                  style={{
                    padding: '12px 16px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    userSelect: 'none',
                    width: 120,
                  }}
                  onClick={() => handleSort('type')}
                >
                  <div className="flex" style={{ alignItems: 'center' }}>
                    Type
                    <SortIcon field="type" />
                  </div>
                </th>
                <th
                  style={{
                    padding: '12px 16px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                  onClick={() => handleSort('name')}
                >
                  <div className="flex" style={{ alignItems: 'center' }}>
                    Name
                    <SortIcon field="name" />
                  </div>
                </th>
                <th
                  style={{
                    padding: '12px 16px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    userSelect: 'none',
                    width: 150,
                  }}
                  onClick={() => handleSort('source')}
                >
                  <div className="flex" style={{ alignItems: 'center' }}>
                    Source
                    <SortIcon field="source" />
                  </div>
                </th>
                <th
                  style={{
                    padding: '12px 16px',
                    textAlign: 'right',
                    cursor: 'pointer',
                    userSelect: 'none',
                    width: 100,
                  }}
                  onClick={() => handleSort('size')}
                >
                  <div
                    className="flex"
                    style={{ alignItems: 'center', justifyContent: 'flex-end' }}
                  >
                    Size
                    <SortIcon field="size" />
                  </div>
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'center', width: 80 }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', width: 60 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssets.map((asset) => {
                const config = TYPE_CONFIG[asset.type]
                const Icon = config.icon
                const isSelected = selectedIds.has(asset.id)

                return (
                  <tr
                    key={asset.id}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: isSelected ? 'rgba(var(--primary-rgb), 0.05)' : undefined,
                    }}
                  >
                    <td style={{ padding: '10px 16px' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(asset.id)}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <div className="flex" style={{ alignItems: 'center', gap: 6 }}>
                        <Icon size={14} style={{ color: config.color }} />
                        <span
                          className="badge"
                          style={{
                            background: `${config.color}20`,
                            color: config.color,
                            fontSize: 11,
                          }}
                        >
                          {config.label}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ fontWeight: 500 }}>{asset.name}</div>
                      {asset.category && (
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{asset.category}</div>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--muted)' }}>
                      {asset.source || '-'}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--muted)' }}>
                      {formatSize(asset.size)}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                      {asset.isActive && (
                        <span
                          className="pill"
                          style={{
                            background: 'var(--success)',
                            color: '#fff',
                            padding: '2px 8px',
                            fontSize: 11,
                          }}
                        >
                          <Check size={10} /> Active
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ padding: 4, color: 'var(--error)' }}
                        onClick={() => {
                          setSelectedIds(new Set([asset.id]))
                          setShowDeleteConfirm(true)
                        }}
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="card"
            style={{ padding: 24, maxWidth: 400, width: '90%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex" style={{ gap: 12, marginBottom: 16 }}>
              <AlertTriangle size={24} style={{ color: 'var(--warning)' }} />
              <div>
                <h3 style={{ margin: 0, fontSize: 18 }}>Confirm Delete</h3>
                <p style={{ margin: '8px 0 0', color: 'var(--muted)' }}>
                  Are you sure you want to delete {selectedIds.size} asset
                  {selectedIds.size !== 1 ? 's' : ''}? This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex" style={{ gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </button>
              <button
                className="btn"
                style={{ background: 'var(--error)', color: '#fff' }}
                onClick={handleDeleteSelected}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
