import { Fragment, useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  MagnifyingGlass,
  SpeakerHigh,
  WaveSine,
  Lightning,
  MusicNote,
  SpinnerGap,
  ArrowsClockwise,
  Trash,
  CaretUp,
  CaretDown,
  CaretLeft,
  CaretRight,
  Check,
  Warning,
  FolderOpen,
  GearSix,
  ShareNetwork,
} from '@phosphor-icons/react'
import { irApi, namApi, soundfontApi, foldersApi, pluginsApi } from '../../../map2/api'
import type { NAMModel, IRFile } from '../../../map2/types'
import type { SoundFont } from '../../types/library'
import { getDisplayPluginName, sanitizeRestrictedDisplayText } from '../../../map2/displayNames'
import { useCluster } from '../../contexts/ClusterContext'

// Unified asset type for the table
type AssetType = 'nam' | 'cabinet' | 'reverb' | 'sfz' | 'native'

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
  folder?: string
  uri?: string
  availability?: AssetAvailability
  pathToken?: string
  sourceNodeId?: string
}

interface AssetAvailability {
  contentType: 'ir' | 'nam'
  pathToken: string
  sourceNodeId: string
  availableOn: string[]
  missingOn: string[]
  totalNodes: number
}

interface ClusterLibraryItem {
  path_token: string
  relative_path?: string
  filename: string
  size_bytes?: number
  checksum?: string
  asset_type: string
}

interface ClusterLibraryFanoutResponse {
  nodes?: Record<string, { body?: { items?: ClusterLibraryItem[] } }>
}

type SortField = 'name' | 'type' | 'source' | 'size' | 'category' | 'format' | 'sampleRate' | 'duration' | 'folder'
type SortDirection = 'asc' | 'desc'

// Column visibility state
interface ColumnVisibility {
  type: boolean
  name: boolean
  category: boolean
  source: boolean
  format: boolean
  sampleRate: boolean
  duration: boolean
  size: boolean
  folder: boolean
  status: boolean
}

const DEFAULT_COLUMNS: ColumnVisibility = {
  type: true,
  name: true,
  category: true,
  source: true,
  format: true,
  sampleRate: true,
  duration: true,
  size: true,
  folder: false,
  status: true,
}

const TYPE_CONFIG: Record<AssetType, { label: string; icon: typeof Lightning; color: string }> = {
  nam: { label: 'NAM', icon: Lightning, color: '#ff6b6b' },
  cabinet: { label: 'Cabinet IR', icon: SpeakerHigh, color: '#f97316' },
  reverb: { label: 'Reverb IR', icon: WaveSine, color: '#a855f7' },
  sfz: { label: 'SoundFont', icon: MusicNote, color: '#22c55e' },
  native: { label: 'Native Plugin', icon: Lightning, color: '#06b6d4' },
}

function formatSize(bytes?: number): string {
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatSampleRate(rate?: number): string {
  if (!rate) return '-'
  return `${(rate / 1000).toFixed(1)} kHz`
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '-'
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms`
  if (seconds < 60) return `${seconds.toFixed(2)} s`
  const mins = Math.floor(seconds / 60)
  const secs = (seconds % 60).toFixed(1)
  return `${mins}:${secs.padStart(4, '0')}`
}

function extractFolder(path: string): string {
  if (!path) return '-'
  const parts = path.split('/')
  if (parts.length < 2) return '-'
  return parts[parts.length - 2] || '-'
}

function getPathBasename(path: string): string {
  const parts = path.split('/')
  return (parts[parts.length - 1] || path).toLowerCase()
}

function getClusterLibraryItemKeys(item: ClusterLibraryItem): string[] {
  const keys = new Set<string>()
  const filename = item.filename?.toLowerCase()
  const size = item.size_bytes ?? 0
  if (filename) {
    keys.add(filename)
    keys.add(`${filename}::${size}`)
  }
  if (item.relative_path) {
    keys.add(item.relative_path.toLowerCase())
  }
  return Array.from(keys)
}

function getAssetAvailabilityKeys(asset: UnifiedAsset): string[] {
  const keys = new Set<string>()
  const basename = getPathBasename(asset.path || asset.name)
  if (basename) {
    keys.add(basename)
    keys.add(`${basename}::${asset.size ?? 0}`)
  }
  if (asset.path) {
    keys.add(asset.path.toLowerCase())
  }
  keys.add(asset.name.toLowerCase())
  return Array.from(keys)
}

const PAGE_SIZE = 100

interface InstalledAssetsTableProps {
  nodeId?: string | null
}

export function InstalledAssetsTable({ nodeId = null }: InstalledAssetsTableProps = {}) {
  const queryClient = useQueryClient()
  const { activeNodeId, nodes, localNodeId, isClusterMode, setActiveNode } = useCluster()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [sortField, setSortField] = useState<SortField>('type')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [typeFilter, setTypeFilter] = useState<AssetType | 'all'>('all')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showColumnSettings, setShowColumnSettings] = useState(false)
  const [columns, setColumns] = useState<ColumnVisibility>(DEFAULT_COLUMNS)
  const [currentPage, setCurrentPage] = useState(0)
  const [expandedAssetRows, setExpandedAssetRows] = useState<Set<string>>(new Set())
  const [deployAsset, setDeployAsset] = useState<UnifiedAsset | null>(null)
  const [deployTargetIds, setDeployTargetIds] = useState<Set<string>>(new Set())

  const effectiveNodeId = nodeId ?? activeNodeId
  const availabilityNodes = useMemo(
    () => (nodes.length ? nodes : [{ nodeId: localNodeId, hostname: 'local', role: 'LOCAL', isLocal: true, isOnline: true, latencyMs: 0, lastSeen: null }]),
    [localNodeId, nodes]
  )
  const apiNodeId = effectiveNodeId && effectiveNodeId !== 'all' && effectiveNodeId !== localNodeId ? effectiveNodeId : null
  const sourceNodeId = effectiveNodeId && effectiveNodeId !== 'all' ? effectiveNodeId : localNodeId
  const sourceNode = availabilityNodes.find((node) => node.nodeId === sourceNodeId) ?? availabilityNodes[0]
  const nodeLabelById = useMemo(
    () => new Map(availabilityNodes.map((node) => [node.nodeId, node.isLocal ? `${node.hostname} (Local)` : node.hostname])),
    [availabilityNodes]
  )
  const sourceNodeLabel = sourceNode ? (sourceNode.isLocal ? `${sourceNode.hostname} (Local)` : sourceNode.hostname) : 'Local'

  // Fetch all asset types
  const cabinetsQuery = useQuery({
    queryKey: ['ir', 'cabinets', sourceNodeId],
    queryFn: () => irApi.listCabinets(apiNodeId),
  })

  const reverbsQuery = useQuery({
    queryKey: ['ir', 'reverbs', sourceNodeId],
    queryFn: () => irApi.listReverbs(apiNodeId),
  })

  const namQuery = useQuery({
    queryKey: ['nam', 'models', sourceNodeId],
    queryFn: () => namApi.listModels(undefined, apiNodeId),
  })

  const soundfontsQuery = useQuery({
    queryKey: ['soundfonts', 'list', sourceNodeId],
    queryFn: () => soundfontApi.listSoundfonts(undefined, apiNodeId),
  })

  const nativePluginsQuery = useQuery({
    queryKey: ['plugins', 'native', sourceNodeId],
    queryFn: () => pluginsApi.discover(false, apiNodeId),
  })

  const irStatusQuery = useQuery({
    queryKey: ['ir', 'status', sourceNodeId],
    queryFn: () => irApi.getStatus(apiNodeId),
  })

  const namStatusQuery = useQuery({
    queryKey: ['nam', 'status', sourceNodeId],
    queryFn: () => namApi.getStatus(apiNodeId),
  })

  const clusterLibraryQuery = useQuery({
    queryKey: ['cluster', 'library', 'assets'],
    queryFn: async () => {
      const [irResponse, namResponse] = await Promise.all([
        fetch('/api/preset-exchange/cluster/library?content_type=ir&node_id=all'),
        fetch('/api/preset-exchange/cluster/library?content_type=nam&node_id=all'),
      ])

      if (!irResponse.ok || !namResponse.ok) {
        throw new Error('Failed to fetch cluster asset availability')
      }

      return {
        ir: (await irResponse.json()) as ClusterLibraryFanoutResponse,
        nam: (await namResponse.json()) as ClusterLibraryFanoutResponse,
      }
    },
    enabled: isClusterMode,
    staleTime: 30000,
  })

  // Scan mutation
  const scanMutation = useMutation({
    mutationFn: () => foldersApi.scanAll(apiNodeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ir'] })
      queryClient.invalidateQueries({ queryKey: ['nam'] })
      queryClient.invalidateQueries({ queryKey: ['soundfonts'] })
      queryClient.invalidateQueries({ queryKey: ['plugins', 'native'] })
    },
  })

  const availabilityLookup = useMemo(() => {
    const buildLookup = (
      response: ClusterLibraryFanoutResponse | undefined,
      contentType: 'ir' | 'nam'
    ) => {
      const nodesPayload = response?.nodes ?? {}
      const sourceItems = nodesPayload[sourceNodeId]?.body?.items ?? []
      const allNodeIds = availabilityNodes.map((node) => node.nodeId)
      const lookup = new Map<string, AssetAvailability>()

      sourceItems.forEach((item) => {
        const availableOn = Object.entries(nodesPayload)
          .filter(([, payload]) =>
            (payload.body?.items ?? []).some((candidate) => candidate.checksum && candidate.checksum === item.checksum)
          )
          .map(([nodeId]) => nodeId)
        const missingOn = allNodeIds.filter((candidateNodeId) => !availableOn.includes(candidateNodeId))
        const availability: AssetAvailability = {
          contentType,
          pathToken: item.path_token,
          sourceNodeId,
          availableOn,
          missingOn,
          totalNodes: allNodeIds.length,
        }

        getClusterLibraryItemKeys(item).forEach((key) => lookup.set(key, availability))
      })

      return lookup
    }

    return {
      ir: buildLookup(clusterLibraryQuery.data?.ir, 'ir'),
      nam: buildLookup(clusterLibraryQuery.data?.nam, 'nam'),
    }
  }, [availabilityNodes, clusterLibraryQuery.data?.ir, clusterLibraryQuery.data?.nam, sourceNodeId])

  const getAvailabilityForAsset = useCallback((asset: UnifiedAsset): AssetAvailability | undefined => {
    const contentType = asset.type === 'nam' ? 'nam' : asset.type === 'cabinet' || asset.type === 'reverb' ? 'ir' : null
    if (!contentType) return undefined

    const lookup = availabilityLookup[contentType]
    for (const key of getAssetAvailabilityKeys(asset)) {
      const match = lookup.get(key)
      if (match) return match
    }
    return undefined
  }, [availabilityLookup])

  const deployMutation = useMutation({
    mutationFn: async (params: { asset: UnifiedAsset; targetNodeIds: string[] }) => {
      const availability = params.asset.availability
      if (!availability) {
        throw new Error('This asset does not have deployable cluster metadata')
      }

      const response = await fetch('/api/preset-exchange/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content_type: availability.contentType,
          path_token: availability.pathToken,
          source_node_id: availability.sourceNodeId,
          target_node_ids: params.targetNodeIds,
        }),
      })

      if (!response.ok) {
        const body = await response.text()
        throw new Error(body || `Deploy failed with ${response.status}`)
      }

      return response.json() as Promise<{
        successful: string[]
        failed: string[]
      }>
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['cluster', 'library'] }),
        queryClient.invalidateQueries({ queryKey: ['ir'] }),
        queryClient.invalidateQueries({ queryKey: ['nam'] }),
        queryClient.invalidateQueries({ queryKey: ['soundfonts'] }),
      ])
      setDeployAsset(null)
      setDeployTargetIds(new Set())
    },
  })

  // Convert all assets to unified format
  const unifiedAssets = useMemo((): UnifiedAsset[] => {
    const assets: UnifiedAsset[] = []

    // Add cabinet IRs
    const cabinets = cabinetsQuery.data?.irs ?? []
    cabinets.forEach((ir: IRFile) => {
      const asset: UnifiedAsset = {
        id: `cabinet:${ir.path}`,
        name: ir.name,
        type: 'cabinet',
        path: ir.path,
        size: ir.size,
        source: 'Local',
        sampleRate: ir.sample_rate,
        duration: ir.duration,
        folder: extractFolder(ir.path),
        isActive: ir.name === irStatusQuery.data?.loaded_cabinet,
      }
      const availability = getAvailabilityForAsset(asset)
      assets.push({ ...asset, availability, pathToken: availability?.pathToken, sourceNodeId: availability?.sourceNodeId })
    })

    // Add reverb IRs
    const reverbs = reverbsQuery.data?.irs ?? []
    reverbs.forEach((ir: IRFile) => {
      const asset: UnifiedAsset = {
        id: `reverb:${ir.path}`,
        name: ir.name,
        type: 'reverb',
        path: ir.path,
        size: ir.size,
        source: 'Local',
        sampleRate: ir.sample_rate,
        duration: ir.duration,
        folder: extractFolder(ir.path),
        isActive: ir.name === irStatusQuery.data?.loaded_reverb,
      }
      const availability = getAvailabilityForAsset(asset)
      assets.push({ ...asset, availability, pathToken: availability?.pathToken, sourceNodeId: availability?.sourceNodeId })
    })

    // Add NAM models
    const nams = namQuery.data?.models ?? []
    nams.forEach((model: NAMModel) => {
      const asset: UnifiedAsset = {
        id: `nam:${model.path ?? model.name}`,
        name: model.name,
        type: 'nam',
        path: model.path ?? '',
        size: model.size,
        source: model.type || 'Unknown',
        category: model.type || undefined,
        folder: extractFolder(model.path ?? ''),
        isActive: model.name === namStatusQuery.data?.activeModel,
      }
      const availability = getAvailabilityForAsset(asset)
      assets.push({ ...asset, availability, pathToken: availability?.pathToken, sourceNodeId: availability?.sourceNodeId })
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
        format: sf.format?.toUpperCase(),
        category: sf.category,
        folder: extractFolder(sf.path),
      })
    })

    // Add Native Plugins (JUCE processors and LV2 plugins)
    const plugins = nativePluginsQuery.data?.plugins ?? []
    plugins.forEach((plugin: any) => {
      // Only include native JUCE processors for now
      if (plugin.is_native || plugin.format === 'JUCE') {
        assets.push({
          id: `native:${plugin.uri}`,
          name: getDisplayPluginName(plugin.name, plugin.uri),
          type: 'native',
          path: plugin.uri,
          source: sanitizeRestrictedDisplayText(plugin.author) || 'Built-in',
          category: plugin.category,
          uri: plugin.uri,
        })
      }
    })

    return assets
  }, [
    cabinetsQuery.data,
    reverbsQuery.data,
    namQuery.data,
    soundfontsQuery.data,
    nativePluginsQuery.data,
    irStatusQuery.data,
    namStatusQuery.data,
    getAvailabilityForAsset,
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
          a.category?.toLowerCase().includes(query) ||
          a.folder?.toLowerCase().includes(query) ||
          a.format?.toLowerCase().includes(query)
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
        case 'category':
          comparison = (a.category ?? '').localeCompare(b.category ?? '')
          break
        case 'format':
          comparison = (a.format ?? '').localeCompare(b.format ?? '')
          break
        case 'sampleRate':
          comparison = (a.sampleRate ?? 0) - (b.sampleRate ?? 0)
          break
        case 'duration':
          comparison = (a.duration ?? 0) - (b.duration ?? 0)
          break
        case 'size':
          comparison = (a.size ?? 0) - (b.size ?? 0)
          break
        case 'folder':
          comparison = (a.folder ?? '').localeCompare(b.folder ?? '')
          break
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })

    return result
  }, [unifiedAssets, typeFilter, searchQuery, sortField, sortDirection])

  // Paginate the filtered assets
  const totalPages = Math.ceil(filteredAssets.length / PAGE_SIZE)
  const paginatedAssets = useMemo(() => {
    const start = currentPage * PAGE_SIZE
    return filteredAssets.slice(start, start + PAGE_SIZE)
  }, [filteredAssets, currentPage])

  // Reset page when filters change
  const resetPage = useCallback(() => setCurrentPage(0), [])

  const isLoading =
    cabinetsQuery.isLoading ||
    reverbsQuery.isLoading ||
    namQuery.isLoading ||
    soundfontsQuery.isLoading ||
    nativePluginsQuery.isLoading

  const handleRefresh = useCallback(() => {
    cabinetsQuery.refetch()
    reverbsQuery.refetch()
    namQuery.refetch()
    soundfontsQuery.refetch()
    nativePluginsQuery.refetch()
    irStatusQuery.refetch()
    namStatusQuery.refetch()
    clusterLibraryQuery.refetch()
  }, [cabinetsQuery, reverbsQuery, namQuery, soundfontsQuery, nativePluginsQuery, irStatusQuery, namStatusQuery, clusterLibraryQuery])

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

  const toggleAssetRowExpanded = useCallback((id: string) => {
    setExpandedAssetRows((previous) => {
      const next = new Set(previous)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === paginatedAssets.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(paginatedAssets.map((a) => a.id)))
    }
  }, [selectedIds.size, paginatedAssets])

  const handleDeleteSelected = useCallback(async () => {
    const assetsToDelete = paginatedAssets.filter((a) => selectedIds.has(a.id))
    const errors: string[] = []

    for (const asset of assetsToDelete) {
      try {
        if (asset.type === 'nam') {
          // NAM models have a backend delete endpoint
          await namApi.deleteModel(asset.name, apiNodeId)
        } else {
          // Other asset types don't have delete endpoints yet
          errors.push(`${asset.name}: Delete not yet supported for ${asset.type} assets`)
        }
      } catch (err) {
        errors.push(`${asset.name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    if (errors.length > 0) {
      console.warn('Some deletions failed:', errors)
    }

    setShowDeleteConfirm(false)
    setSelectedIds(new Set())
    // After delete, refresh the lists
    handleRefresh()
  }, [apiNodeId, handleRefresh, paginatedAssets, selectedIds])

  const toggleColumn = useCallback((col: keyof ColumnVisibility) => {
    setColumns((prev) => ({ ...prev, [col]: !prev[col] }))
  }, [])

  const openDeployDialog = useCallback((asset: UnifiedAsset) => {
    if (!asset.availability) return
    setDeployAsset(asset)
    setDeployTargetIds(new Set(asset.availability.missingOn))
  }, [])

  const toggleDeployTarget = useCallback((nodeIdToToggle: string) => {
    setDeployTargetIds((previous) => {
      const next = new Set(previous)
      if (next.has(nodeIdToToggle)) {
        next.delete(nodeIdToToggle)
      } else {
        next.add(nodeIdToToggle)
      }
      return next
    })
  }, [])

  const getCounts = useCallback(() => {
    const nativeCount = (nativePluginsQuery.data?.plugins ?? []).filter(
      (p: any) => p.is_native || p.format === 'JUCE'
    ).length
    return {
      nam: namQuery.data?.total ?? 0,
      cabinet: cabinetsQuery.data?.count ?? 0,
      reverb: reverbsQuery.data?.count ?? 0,
      sfz: soundfontsQuery.data?.total ?? 0,
      native: nativeCount,
      total:
        (namQuery.data?.total ?? 0) +
        (cabinetsQuery.data?.count ?? 0) +
        (reverbsQuery.data?.count ?? 0) +
        (soundfontsQuery.data?.total ?? 0) +
        nativeCount,
    }
  }, [namQuery.data, cabinetsQuery.data, reverbsQuery.data, soundfontsQuery.data, nativePluginsQuery.data])

  const counts = getCounts()
  const remoteSelected = Boolean(apiNodeId)
  const allNodesScopeSelected = effectiveNodeId === 'all'

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return sortDirection === 'asc' ? (
      <CaretUp size={14} weight="bold" style={{ marginLeft: 4 }} />
    ) : (
      <CaretDown size={14} weight="bold" style={{ marginLeft: 4 }} />
    )
  }

  const thStyle = (clickable = true): React.CSSProperties => ({
    padding: '12px 16px',
    textAlign: 'left',
    cursor: clickable ? 'pointer' : 'default',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  })

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
                <Trash size={14} weight="duotone" />
                Delete ({selectedIds.size})
              </button>
            )}
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => setShowColumnSettings(!showColumnSettings)}
              title="Column settings"
            >
              <GearSix size={14} weight="duotone" />
            </button>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => scanMutation.mutate()}
              disabled={scanMutation.isPending}
            >
              {scanMutation.isPending ? (
                <SpinnerGap size={14} weight="duotone" className="spin" />
              ) : (
                <ArrowsClockwise size={14} weight="duotone" />
              )}
              Update
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleRefresh}
              disabled={isLoading}
            >
              <ArrowsClockwise size={14} weight="duotone" className={isLoading ? 'spin' : ''} />
            </button>
          </div>
        </div>

        {isClusterMode && (
          <div
            style={{
              marginBottom: 12,
              padding: '12px 14px',
              borderRadius: 10,
              border: '1px solid rgba(59, 130, 246, 0.22)',
              background: remoteSelected
                ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.14), rgba(15, 23, 42, 0.92))'
                : 'linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(15, 23, 42, 0.92))',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.1, color: '#94a3b8', marginBottom: 6 }}>
                  Content Source
                </div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  {sourceNodeLabel}
                </div>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>
                  {allNodesScopeSelected
                    ? 'All Nodes is a comparison scope. File operations are anchored to the local node while availability still spans the entire cluster.'
                    : remoteSelected
                      ? 'Browsing a remote node through the cluster proxy. Deploy actions will copy the selected asset from that node to the checked targets.'
                      : 'Availability badges show which nodes already have the asset. Use Deploy to copy IR and NAM files to missing nodes.'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignContent: 'flex-start' }}>
                {availabilityNodes.map((node) => (
                  <button
                    key={node.nodeId}
                    type="button"
                    className={sourceNodeId === node.nodeId ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                    onClick={() => setActiveNode(node.nodeId === localNodeId ? null : node.nodeId)}
                  >
                    {node.hostname}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Column Settings Dropdown */}
        {showColumnSettings && (
          <div
            style={{
              background: 'var(--bg-secondary)',
              borderRadius: 8,
              padding: 12,
              marginBottom: 12,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 12, color: 'var(--muted)', width: '100%', marginBottom: 4 }}>
              Show columns:
            </span>
            {(Object.keys(columns) as Array<keyof ColumnVisibility>).map((col) => (
              <label
                key={col}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 13,
                  cursor: 'pointer',
                  padding: '4px 8px',
                  background: columns[col] ? 'var(--primary-dim)' : 'transparent',
                  borderRadius: 4,
                }}
              >
                <input
                  type="checkbox"
                  checked={columns[col]}
                  onChange={() => toggleColumn(col)}
                  style={{ cursor: 'pointer' }}
                />
                {col.charAt(0).toUpperCase() + col.slice(1).replace(/([A-Z])/g, ' $1')}
              </label>
            ))}
          </div>
        )}

        {/* Filter chips */}
        <div className="flex" style={{ gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
          <button
            className={`btn btn-sm ${typeFilter === 'all' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => { setTypeFilter('all'); resetPage() }}
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
                onClick={() => { setTypeFilter(type); resetPage() }}
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
          <MagnifyingGlass size={16} weight="duotone" className="muted" />
          <input
            type="text"
            placeholder="Search by name, source, category, folder..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); resetPage() }}
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
      <div className="installed-assets-table-wrap" style={{ overflowX: 'auto' }}>
        {isLoading ? (
          <div className="flex" style={{ justifyContent: 'center', padding: 40 }}>
            <SpinnerGap size={24} weight="duotone" className="spin" style={{ color: 'var(--primary)' }} />
          </div>
        ) : filteredAssets.length === 0 ? (
          <div className="muted" style={{ textAlign: 'center', padding: 40 }}>
            No assets found
          </div>
        ) : (
          <table className="installed-assets-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="assets-col-select" style={{ padding: '12px 16px', textAlign: 'left', width: 40 }}>
                  <input
                    type="checkbox"
                    checked={
                      selectedIds.size === paginatedAssets.length && paginatedAssets.length > 0
                    }
                    onChange={toggleSelectAll}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                {columns.type && (
                  <th className="assets-col-type" style={{ ...thStyle(), width: 110 }} onClick={() => handleSort('type')}>
                    <div className="flex" style={{ alignItems: 'center' }}>
                      Type
                      <SortIcon field="type" />
                    </div>
                  </th>
                )}
                {columns.name && (
                  <th className="assets-col-name" style={thStyle()} onClick={() => handleSort('name')}>
                    <div className="flex" style={{ alignItems: 'center' }}>
                      Name
                      <SortIcon field="name" />
                    </div>
                  </th>
                )}
                {columns.category && (
                  <th className="assets-col-category" style={{ ...thStyle(), width: 120 }} onClick={() => handleSort('category')}>
                    <div className="flex" style={{ alignItems: 'center' }}>
                      Category
                      <SortIcon field="category" />
                    </div>
                  </th>
                )}
                {columns.source && (
                  <th className="assets-col-source" style={{ ...thStyle(), width: 120 }} onClick={() => handleSort('source')}>
                    <div className="flex" style={{ alignItems: 'center' }}>
                      Source
                      <SortIcon field="source" />
                    </div>
                  </th>
                )}
                {columns.format && (
                  <th className="assets-col-format" style={{ ...thStyle(), width: 80 }} onClick={() => handleSort('format')}>
                    <div className="flex" style={{ alignItems: 'center' }}>
                      Format
                      <SortIcon field="format" />
                    </div>
                  </th>
                )}
                {columns.sampleRate && (
                  <th
                    className="assets-col-sample-rate"
                    style={{ ...thStyle(), width: 100, textAlign: 'right' }}
                    onClick={() => handleSort('sampleRate')}
                  >
                    <div className="flex" style={{ alignItems: 'center', justifyContent: 'flex-end' }}>
                      Sample Rate
                      <SortIcon field="sampleRate" />
                    </div>
                  </th>
                )}
                {columns.duration && (
                  <th
                    className="assets-col-duration"
                    style={{ ...thStyle(), width: 90, textAlign: 'right' }}
                    onClick={() => handleSort('duration')}
                  >
                    <div className="flex" style={{ alignItems: 'center', justifyContent: 'flex-end' }}>
                      Duration
                      <SortIcon field="duration" />
                    </div>
                  </th>
                )}
                {columns.size && (
                  <th
                    className="assets-col-size"
                    style={{ ...thStyle(), width: 90, textAlign: 'right' }}
                    onClick={() => handleSort('size')}
                  >
                    <div className="flex" style={{ alignItems: 'center', justifyContent: 'flex-end' }}>
                      Size
                      <SortIcon field="size" />
                    </div>
                  </th>
                )}
                {columns.folder && (
                  <th className="assets-col-folder" style={{ ...thStyle(), width: 140 }} onClick={() => handleSort('folder')}>
                    <div className="flex" style={{ alignItems: 'center' }}>
                      <FolderOpen size={14} weight="duotone" style={{ marginRight: 4 }} />
                      Folder
                      <SortIcon field="folder" />
                    </div>
                  </th>
                )}
                {columns.status && (
                  <th className="assets-col-status" style={{ ...thStyle(false), width: 80, textAlign: 'center' }}>Status</th>
                )}
                <th className="assets-col-actions" style={{ padding: '12px 16px', textAlign: 'center', width: 120 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedAssets.map((asset) => {
                const config = TYPE_CONFIG[asset.type]
                const Icon = config.icon
                const isSelected = selectedIds.has(asset.id)
                const isExpanded = expandedAssetRows.has(asset.id)
                const availability = asset.availability
                const canDeploy = Boolean(availability && availability.missingOn.length > 0)
                const availabilitySummary = availability
                  ? `${availability.availableOn.length}/${availability.totalNodes} nodes`
                  : asset.type === 'sfz'
                    ? 'Local only'
                    : null

                return (
                  <Fragment key={asset.id}>
                  <tr
                    className={`installed-assets-row${isExpanded ? ' is-expanded' : ''}`}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: isSelected ? 'rgba(var(--primary-rgb), 0.05)' : undefined,
                    }}
                  >
                    <td className="assets-col-select" data-label="Select" style={{ padding: '10px 16px' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(asset.id)}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                    {columns.type && (
                      <td className="assets-col-type" data-label="Type" style={{ padding: '10px 16px' }}>
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
                    )}
                    {columns.name && (
                      <td className="assets-col-name" data-label="Name" style={{ padding: '10px 16px' }}>
                        <div style={{ fontWeight: 500 }}>{asset.name}</div>
                      </td>
                    )}
                    {columns.category && (
                      <td className="assets-col-category" data-label="Category" style={{ padding: '10px 16px', color: 'var(--muted)', fontSize: 13 }}>
                        {asset.category || '-'}
                      </td>
                    )}
                    {columns.source && (
                      <td className="assets-col-source" data-label="Source" style={{ padding: '10px 16px', color: 'var(--muted)', fontSize: 13 }}>
                        {asset.source || '-'}
                      </td>
                    )}
                    {columns.format && (
                      <td className="assets-col-format" data-label="Format" style={{ padding: '10px 16px' }}>
                        {asset.format ? (
                          <span
                            className="badge"
                            style={{
                              background: 'var(--bg-secondary)',
                              fontSize: 10,
                              textTransform: 'uppercase',
                            }}
                          >
                            {asset.format}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--muted)' }}>-</span>
                        )}
                      </td>
                    )}
                    {columns.sampleRate && (
                      <td
                        className="assets-col-sample-rate"
                        data-label="Sample Rate"
                        style={{
                          padding: '10px 16px',
                          textAlign: 'right',
                          color: 'var(--muted)',
                          fontSize: 13,
                        }}
                      >
                        {formatSampleRate(asset.sampleRate)}
                      </td>
                    )}
                    {columns.duration && (
                      <td
                        className="assets-col-duration"
                        data-label="Duration"
                        style={{
                          padding: '10px 16px',
                          textAlign: 'right',
                          color: 'var(--muted)',
                          fontSize: 13,
                        }}
                      >
                        {formatDuration(asset.duration)}
                      </td>
                    )}
                    {columns.size && (
                      <td
                        className="assets-col-size"
                        data-label="Size"
                        style={{
                          padding: '10px 16px',
                          textAlign: 'right',
                          color: 'var(--muted)',
                          fontSize: 13,
                        }}
                      >
                        {formatSize(asset.size)}
                      </td>
                    )}
                    {columns.folder && (
                      <td
                        className="assets-col-folder"
                        data-label="Folder"
                        style={{
                          padding: '10px 16px',
                          color: 'var(--muted)',
                          fontSize: 12,
                          maxWidth: 140,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={asset.path}
                      >
                        {asset.folder || '-'}
                      </td>
                    )}
                    {columns.status && (
                      <td className="assets-col-status" data-label="Status" style={{ padding: '10px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
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
                              <Check size={10} weight="bold" /> Active
                            </span>
                          )}
                          {isClusterMode && availabilitySummary && (
                            <span
                              className="pill"
                              style={{
                                background: availability?.missingOn.length ? 'rgba(245, 158, 11, 0.16)' : 'rgba(34, 197, 94, 0.16)',
                                color: availability?.missingOn.length ? '#fbbf24' : '#86efac',
                                padding: '2px 8px',
                                fontSize: 11,
                              }}
                            >
                              {availabilitySummary}
                            </span>
                          )}
                        </div>
                      </td>
                    )}
                    <td className="assets-col-actions" style={{ padding: '10px 16px', textAlign: 'center' }}>
                      <div className="installed-assets-actions">
                        <button
                          className="btn btn-ghost btn-sm installed-assets-expand-toggle"
                          style={{ padding: '4px 8px' }}
                          onClick={() => toggleAssetRowExpanded(asset.id)}
                          title={isExpanded ? 'Collapse details' : 'Expand details'}
                        >
                          {isExpanded ? <CaretUp size={14} weight="bold" /> : <CaretDown size={14} weight="bold" />}
                        </button>
                        {canDeploy && (
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ padding: 4, color: 'var(--primary)' }}
                            onClick={() => openDeployDialog(asset)}
                            title="Deploy to nodes"
                          >
                            <ShareNetwork size={14} weight="duotone" />
                          </button>
                        )}
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ padding: 4, color: 'var(--error)' }}
                          onClick={() => {
                            setSelectedIds(new Set([asset.id]))
                            setShowDeleteConfirm(true)
                          }}
                          title="Delete"
                        >
                          <Trash size={14} weight="duotone" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="installed-assets-mobile-details-row">
                      <td colSpan={12} style={{ padding: '0 16px 12px', borderBottom: '1px solid var(--border)' }}>
                        <div className="installed-assets-mobile-details-grid" style={{ marginBottom: isClusterMode ? 12 : 0 }}>
                          <div><strong>Source:</strong> {asset.source || '-'}</div>
                          <div><strong>Format:</strong> {asset.format || '-'}</div>
                          <div><strong>Sample Rate:</strong> {formatSampleRate(asset.sampleRate)}</div>
                          <div><strong>Duration:</strong> {formatDuration(asset.duration)}</div>
                          <div><strong>Size:</strong> {formatSize(asset.size)}</div>
                          <div><strong>Path:</strong> {asset.path || '-'}</div>
                        </div>
                        {isClusterMode && (
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 8,
                              padding: '12px 14px',
                              background: 'rgba(15, 23, 42, 0.6)',
                              borderRadius: 8,
                            }}
                          >
                            <div style={{ fontSize: 13, color: '#cbd5e1' }}>
                              <strong>Available on:</strong>{' '}
                              {availability?.availableOn.length
                                ? availability.availableOn.map((nodeId) => nodeLabelById.get(nodeId) ?? nodeId).join(', ')
                                : asset.type === 'sfz'
                                  ? 'Local library only'
                                  : 'Unknown'}
                            </div>
                            <div style={{ fontSize: 13, color: '#cbd5e1' }}>
                              <strong>Missing on:</strong>{' '}
                              {availability?.missingOn.length
                                ? availability.missingOn.map((nodeId) => nodeLabelById.get(nodeId) ?? nodeId).join(', ')
                                : 'No missing nodes'}
                            </div>
                            {canDeploy && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 12, color: '#94a3b8' }}>
                                  Deploy from {nodeLabelById.get(availability?.sourceNodeId ?? sourceNodeId) ?? sourceNodeId} to fill missing nodes.
                                </span>
                                <button className="btn btn-sm btn-primary" onClick={() => openDeployDialog(asset)}>
                                  <ShareNetwork size={14} weight="duotone" />
                                  Deploy to Nodes
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer with count and pagination */}
      <div
        style={{
          padding: '8px 16px',
          borderTop: '1px solid var(--border)',
          fontSize: 12,
          color: 'var(--muted)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>
          Showing {paginatedAssets.length > 0 ? currentPage * PAGE_SIZE + 1 : 0}-
          {Math.min((currentPage + 1) * PAGE_SIZE, filteredAssets.length)} of {filteredAssets.length}
          {filteredAssets.length !== unifiedAssets.length && ` (${unifiedAssets.length} total)`}
          {selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
        </span>
        {totalPages > 1 && (
          <div className="flex" style={{ gap: 4, alignItems: 'center' }}>
            <button
              className="btn btn-ghost btn-sm"
              style={{ padding: '2px 6px' }}
              onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
            >
              <CaretLeft size={14} weight="bold" />
            </button>
            <span style={{ minWidth: 80, textAlign: 'center' }}>
              Page {currentPage + 1} of {totalPages}
            </span>
            <button
              className="btn btn-ghost btn-sm"
              style={{ padding: '2px 6px' }}
              onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1}
            >
              <CaretRight size={14} weight="bold" />
            </button>
          </div>
        )}
        <span>
          Sorted by {sortField} ({sortDirection === 'asc' ? 'asc' : 'desc'})
        </span>
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
              <Warning size={24} weight="duotone" style={{ color: 'var(--warning)' }} />
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

      {deployAsset && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => {
            if (!deployMutation.isPending) {
              setDeployAsset(null)
              setDeployTargetIds(new Set())
            }
          }}
        >
          <div
            className="card"
            style={{ padding: 24, maxWidth: 520, width: '92%' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex" style={{ gap: 12, marginBottom: 16 }}>
              <ShareNetwork size={24} weight="duotone" style={{ color: 'var(--primary)' }} />
              <div>
                <h3 style={{ margin: 0, fontSize: 18 }}>Deploy Asset to Nodes</h3>
                <p style={{ margin: '8px 0 0', color: 'var(--muted)' }}>
                  Copy <strong>{deployAsset.name}</strong> from {nodeLabelById.get(deployAsset.availability?.sourceNodeId ?? sourceNodeId) ?? sourceNodeId}
                  {' '}to the selected target nodes.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
              {availabilityNodes
                .filter((node) => node.nodeId !== (deployAsset.availability?.sourceNodeId ?? sourceNodeId))
                .map((node) => {
                  const alreadyAvailable = deployAsset.availability?.availableOn.includes(node.nodeId) ?? false
                  const checked = deployTargetIds.has(node.nodeId)
                  return (
                    <label
                      key={node.nodeId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        padding: '10px 12px',
                        borderRadius: 8,
                        background: checked ? 'rgba(var(--primary-rgb), 0.08)' : 'var(--bg-secondary)',
                        border: checked ? '1px solid rgba(var(--primary-rgb), 0.35)' : '1px solid var(--border)',
                        opacity: node.isOnline ? 1 : 0.65,
                        cursor: node.isOnline ? 'pointer' : 'not-allowed',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>{nodeLabelById.get(node.nodeId) ?? node.nodeId}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                          {alreadyAvailable ? 'Already available' : 'Missing on target'}
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!node.isOnline}
                        onChange={() => toggleDeployTarget(node.nodeId)}
                      />
                    </label>
                  )
                })}
            </div>

            {deployMutation.isError && (
              <div
                style={{
                  marginBottom: 16,
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  color: '#fecaca',
                  fontSize: 13,
                }}
              >
                {deployMutation.error instanceof Error ? deployMutation.error.message : 'Deploy failed'}
              </div>
            )}

            {deployMutation.isSuccess && (
              <div
                style={{
                  marginBottom: 16,
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'rgba(34, 197, 94, 0.12)',
                  border: '1px solid rgba(34, 197, 94, 0.25)',
                  color: '#bbf7d0',
                  fontSize: 13,
                }}
              >
                Deployment started for {deployMutation.data?.successful.length ?? 0} node(s).
                {deployMutation.data?.failed.length ? ` Failed: ${deployMutation.data.failed.join(', ')}` : ''}
              </div>
            )}

            <div className="flex" style={{ gap: 8, justifyContent: 'flex-end' }}>
              <button
                className="btn btn-ghost"
                disabled={deployMutation.isPending}
                onClick={() => {
                  setDeployAsset(null)
                  setDeployTargetIds(new Set())
                }}
              >
                Close
              </button>
              <button
                className="btn btn-primary"
                disabled={deployTargetIds.size === 0 || deployMutation.isPending}
                onClick={() => deployMutation.mutate({ asset: deployAsset, targetNodeIds: Array.from(deployTargetIds) })}
              >
                {deployMutation.isPending ? (
                  <>
                    <SpinnerGap size={14} weight="duotone" className="spin" />
                    Deploying...
                  </>
                ) : (
                  <>
                    <ShareNetwork size={14} weight="duotone" />
                    Deploy
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
