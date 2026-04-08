import { Fragment, useCallback, useMemo, useState } from 'react'
import {
  Button,
  Checkbox,
  InlineLoading,
  InlineNotification,
  Modal,
  Search,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
} from '@carbon/react'
import {
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  FolderOpen,
  MachineLearningModel,
  Music,
  Plug,
  Renew,
  Settings,
  Share,
  TrashCan,
  VolumeUp,
  WarningAlt,
  Waveform,
} from '@carbon/icons-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { foldersApi, irApi, namApi, pluginsApi, soundfontApi } from '../../../map2/api'
import { getDisplayPluginName, sanitizeRestrictedDisplayText } from '../../../map2/displayNames'
import type { IRFile, NAMModel } from '../../../map2/types'
import { useCluster } from '../../contexts/useCluster'
import type { SoundFont } from '../../types/library'
import './InstalledAssetsTable.css'

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
}

interface ClusterLibraryFanoutResponse {
  nodes?: Record<string, { body?: { items?: ClusterLibraryItem[] } }>
}

type SortField = 'name' | 'type' | 'source' | 'size' | 'category' | 'format' | 'sampleRate' | 'duration' | 'folder'
type SortDirection = 'asc' | 'desc'

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

type IconComponent = React.ComponentType<{ className?: string; size?: number; 'aria-hidden'?: boolean }>

const TYPE_CONFIG: Record<AssetType, { label: string; icon: IconComponent; tagType: 'red' | 'magenta' | 'purple' | 'green' | 'cyan' }> = {
  nam: { label: 'NAM', icon: MachineLearningModel, tagType: 'red' },
  cabinet: { label: 'Cabinet IR', icon: VolumeUp, tagType: 'magenta' },
  reverb: { label: 'Reverb IR', icon: Waveform, tagType: 'purple' },
  sfz: { label: 'SoundFont', icon: Music, tagType: 'green' },
  native: { label: 'Native plugin', icon: Plug, tagType: 'cyan' },
}

const PAGE_SIZE = 100

interface InstalledAssetsTableProps {
  nodeId?: string | null
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

function columnLabel(column: keyof ColumnVisibility): string {
  return column.charAt(0).toUpperCase() + column.slice(1).replace(/([A-Z])/g, ' $1')
}

function sortText(sortField: SortField, sortDirection: SortDirection) {
  return `${sortField} (${sortDirection})`
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
    () =>
      nodes.length
        ? nodes
        : [
            {
              nodeId: localNodeId,
              hostname: 'local',
              role: 'LOCAL',
              isLocal: true,
              isOnline: true,
              latencyMs: 0,
              lastSeen: null,
            },
          ],
    [localNodeId, nodes],
  )
  const apiNodeId = effectiveNodeId && effectiveNodeId !== 'all' && effectiveNodeId !== localNodeId ? effectiveNodeId : null
  const sourceNodeId = effectiveNodeId && effectiveNodeId !== 'all' ? effectiveNodeId : localNodeId
  const sourceNode = availabilityNodes.find((node) => node.nodeId === sourceNodeId) ?? availabilityNodes[0]
  const nodeLabelById = useMemo(
    () => new Map(availabilityNodes.map((node) => [node.nodeId, node.isLocal ? `${node.hostname} (Local)` : node.hostname])),
    [availabilityNodes],
  )
  const sourceNodeLabel = sourceNode ? (sourceNode.isLocal ? `${sourceNode.hostname} (Local)` : sourceNode.hostname) : 'Local'

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
    const buildLookup = (response: ClusterLibraryFanoutResponse | undefined, contentType: 'ir' | 'nam') => {
      const nodesPayload = response?.nodes ?? {}
      const sourceItems = nodesPayload[sourceNodeId]?.body?.items ?? []
      const allNodeIds = availabilityNodes.map((node) => node.nodeId)
      const lookup = new Map<string, AssetAvailability>()

      sourceItems.forEach((item) => {
        const availableOn = Object.entries(nodesPayload)
          .filter(([, payload]) => (payload.body?.items ?? []).some((candidate) => candidate.checksum && candidate.checksum === item.checksum))
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

  const getAvailabilityForAsset = useCallback(
    (asset: UnifiedAsset): AssetAvailability | undefined => {
      const contentType = asset.type === 'nam' ? 'nam' : asset.type === 'cabinet' || asset.type === 'reverb' ? 'ir' : null
      if (!contentType) return undefined

      const lookup = availabilityLookup[contentType]
      for (const key of getAssetAvailabilityKeys(asset)) {
        const match = lookup.get(key)
        if (match) return match
      }
      return undefined
    },
    [availabilityLookup],
  )

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

      return response.json() as Promise<{ successful: string[]; failed: string[] }>
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

  const unifiedAssets = useMemo((): UnifiedAsset[] => {
    const assets: UnifiedAsset[] = []

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

    const soundfonts = soundfontsQuery.data?.soundfonts ?? []
    soundfonts.forEach((soundFont: SoundFont) => {
      assets.push({
        id: `sfz:${soundFont.path}`,
        name: soundFont.name,
        type: 'sfz',
        path: soundFont.path,
        size: soundFont.size,
        source: soundFont.library || 'Local',
        format: soundFont.format?.toUpperCase(),
        category: soundFont.category,
        folder: extractFolder(soundFont.path),
      })
    })

    const plugins = nativePluginsQuery.data?.plugins ?? []
    plugins.forEach((plugin: any) => {
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

  const filteredAssets = useMemo(() => {
    let result = unifiedAssets

    if (typeFilter !== 'all') {
      result = result.filter((asset) => asset.type === typeFilter)
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (asset) =>
          asset.name.toLowerCase().includes(query) ||
          asset.source?.toLowerCase().includes(query) ||
          asset.category?.toLowerCase().includes(query) ||
          asset.folder?.toLowerCase().includes(query) ||
          asset.format?.toLowerCase().includes(query),
      )
    }

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

  const totalPages = Math.ceil(filteredAssets.length / PAGE_SIZE)
  const paginatedAssets = useMemo(() => {
    const start = currentPage * PAGE_SIZE
    return filteredAssets.slice(start, start + PAGE_SIZE)
  }, [filteredAssets, currentPage])

  const visibleColumnCount = useMemo(
    () => Object.values(columns).filter(Boolean).length + 2,
    [columns],
  )

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
    setSortField((previous) => {
      if (previous === field) {
        setSortDirection((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'))
        return previous
      }
      setSortDirection('asc')
      return field
    })
  }, [])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous)
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
      setSelectedIds(new Set(paginatedAssets.map((asset) => asset.id)))
    }
  }, [selectedIds.size, paginatedAssets])

  const handleDeleteSelected = useCallback(async () => {
    const assetsToDelete = paginatedAssets.filter((asset) => selectedIds.has(asset.id))
    const errors: string[] = []

    for (const asset of assetsToDelete) {
      try {
        if (asset.type === 'nam') {
          await namApi.deleteModel(asset.name, apiNodeId)
        } else {
          errors.push(`${asset.name}: Delete is not yet supported for ${asset.type} assets`)
        }
      } catch (error) {
        errors.push(`${asset.name}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    if (errors.length > 0) {
      console.warn('Some deletions failed:', errors)
    }

    setShowDeleteConfirm(false)
    setSelectedIds(new Set())
    handleRefresh()
  }, [apiNodeId, handleRefresh, paginatedAssets, selectedIds])

  const toggleColumn = useCallback((column: keyof ColumnVisibility) => {
    setColumns((previous) => ({ ...previous, [column]: !previous[column] }))
  }, [])

  const openDeployDialog = useCallback(
    (asset: UnifiedAsset) => {
      if (!asset.availability) return
      deployMutation.reset()
      setDeployAsset(asset)
      setDeployTargetIds(new Set(asset.availability.missingOn))
    },
    [deployMutation],
  )

  const closeDeployDialog = useCallback(() => {
    if (deployMutation.isPending) return
    deployMutation.reset()
    setDeployAsset(null)
    setDeployTargetIds(new Set())
  }, [deployMutation])

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

  const counts = useMemo(() => {
    const nativeCount = (nativePluginsQuery.data?.plugins ?? []).filter((plugin: any) => plugin.is_native || plugin.format === 'JUCE').length
    const namCount = namQuery.data?.total ?? 0
    const cabinetCount = cabinetsQuery.data?.count ?? 0
    const reverbCount = reverbsQuery.data?.count ?? 0
    const sfzCount = soundfontsQuery.data?.total ?? 0
    return {
      nam: namCount,
      cabinet: cabinetCount,
      reverb: reverbCount,
      sfz: sfzCount,
      native: nativeCount,
      total: namCount + cabinetCount + reverbCount + sfzCount + nativeCount,
    }
  }, [namQuery.data, cabinetsQuery.data, reverbsQuery.data, soundfontsQuery.data, nativePluginsQuery.data])

  const remoteSelected = Boolean(apiNodeId)
  const allNodesScopeSelected = effectiveNodeId === 'all'

  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) return null
    return sortDirection === 'asc' ? <CaretUp size={16} aria-hidden /> : <CaretDown size={16} aria-hidden />
  }

  const renderSortHeader = (label: string, field: SortField, align: 'left' | 'right' = 'left') => (
    <button
      type="button"
      className={`installed-assets-table__sort-button${align === 'right' ? ' is-right' : ''}`}
      onClick={() => handleSort(field)}
      aria-label={`Sort by ${label.toLowerCase()}`}
    >
      <span>{label}</span>
      {renderSortIndicator(field)}
    </button>
  )

  const summaryStart = paginatedAssets.length > 0 ? currentPage * PAGE_SIZE + 1 : 0
  const summaryEnd = Math.min((currentPage + 1) * PAGE_SIZE, filteredAssets.length)
  const deploySourceLabel =
    deployAsset ? nodeLabelById.get(deployAsset.availability?.sourceNodeId ?? sourceNodeId) ?? sourceNodeId : sourceNodeLabel

  return (
    <section className="installed-assets-table-card">
      <header className="installed-assets-table-toolbar">
        <div className="installed-assets-table-toolbar__top">
          <div className="installed-assets-table-toolbar__title">
            <h3>Installed assets</h3>
            <Tag type="cool-gray">{counts.total}</Tag>
          </div>
          <div className="installed-assets-table-toolbar__actions">
            {selectedIds.size > 0 && (
              <Button
                kind="danger--tertiary"
                size="sm"
                renderIcon={TrashCan}
                onClick={() => setShowDeleteConfirm(true)}
              >
                Delete ({selectedIds.size})
              </Button>
            )}
            <Button
              kind={showColumnSettings ? 'secondary' : 'ghost'}
              size="sm"
              hasIconOnly
              iconDescription={showColumnSettings ? 'Hide column settings' : 'Show column settings'}
              renderIcon={Settings}
              onClick={() => setShowColumnSettings((previous) => !previous)}
            />
            <Button
              kind="primary"
              size="sm"
              renderIcon={Renew}
              disabled={scanMutation.isPending}
              onClick={() => scanMutation.mutate()}
            >
              {scanMutation.isPending ? 'Updating' : 'Update'}
            </Button>
            <Button
              kind="ghost"
              size="sm"
              hasIconOnly
              iconDescription="Refresh asset data"
              renderIcon={Renew}
              disabled={isLoading}
              onClick={handleRefresh}
            />
          </div>
        </div>

        {isClusterMode && (
          <div className="installed-assets-table__cluster-banner">
            <div className="installed-assets-table__cluster-copy">
              <p className="installed-assets-table__cluster-label">Content source</p>
              <p className="installed-assets-table__cluster-node">{sourceNodeLabel}</p>
              <p className="installed-assets-table__cluster-description">
                {allNodesScopeSelected
                  ? 'All nodes is a comparison scope. File operations stay on the local node while availability still spans the full cluster.'
                  : remoteSelected
                    ? 'Browsing a remote node through the cluster proxy. Deploy copies the selected asset from this node to checked targets.'
                    : 'Availability tags show node coverage. Use deploy to copy IR and NAM assets to missing nodes.'}
              </p>
            </div>
            <div className="installed-assets-table__cluster-switcher">
              {availabilityNodes.map((node) => (
                <Button
                  key={node.nodeId}
                  kind={sourceNodeId === node.nodeId ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveNode(node.nodeId === localNodeId ? null : node.nodeId)}
                >
                  {node.hostname}
                </Button>
              ))}
            </div>
          </div>
        )}

        {showColumnSettings && (
          <div className="installed-assets-table__column-settings">
            <p>Show columns</p>
            <div className="installed-assets-table__column-grid">
              {(Object.keys(columns) as Array<keyof ColumnVisibility>).map((column) => (
                <Checkbox
                  key={column}
                  id={`installed-assets-column-${column}`}
                  labelText={columnLabel(column)}
                  checked={columns[column]}
                  onChange={() => toggleColumn(column)}
                />
              ))}
            </div>
          </div>
        )}

        <div className="installed-assets-table__filter-row">
          <Button
            size="sm"
            kind={typeFilter === 'all' ? 'primary' : 'ghost'}
            onClick={() => {
              setTypeFilter('all')
              resetPage()
            }}
          >
            All ({counts.total})
          </Button>
          {(Object.keys(TYPE_CONFIG) as AssetType[]).map((type) => {
            const config = TYPE_CONFIG[type]
            const count = counts[type]
            return (
              <Button
                key={type}
                size="sm"
                kind={typeFilter === type ? 'primary' : 'ghost'}
                renderIcon={config.icon}
                onClick={() => {
                  setTypeFilter(type)
                  resetPage()
                }}
              >
                {config.label} ({count})
              </Button>
            )
          })}
        </div>

        <Search
          id="installed-assets-search"
          size="lg"
          labelText="Search assets"
          closeButtonLabelText="Clear search"
          placeholder="Search by name, source, category, or folder"
          value={searchQuery}
          onChange={(event) => {
            setSearchQuery(event.target.value)
            resetPage()
          }}
        />
      </header>

      <div className="installed-assets-table-wrap">
        {isLoading ? (
          <div className="installed-assets-table__state">
            <InlineLoading description="Loading assets" status="active" />
          </div>
        ) : filteredAssets.length === 0 ? (
          <div className="installed-assets-table__state">
            <InlineNotification
              kind="info"
              lowContrast
              hideCloseButton
              title="No assets found"
              subtitle="Adjust your filters or refresh the library scan."
            />
          </div>
        ) : (
          <TableContainer>
            <Table size="sm" className="installed-assets-table">
              <TableHead>
                <TableRow>
                  <TableHeader className="assets-col-select">
                    <Checkbox
                      id="installed-assets-select-all"
                      hideLabel
                      labelText="Select all rows"
                      checked={selectedIds.size === paginatedAssets.length && paginatedAssets.length > 0}
                      onChange={toggleSelectAll}
                    />
                  </TableHeader>
                  {columns.type && <TableHeader className="assets-col-type">{renderSortHeader('Type', 'type')}</TableHeader>}
                  {columns.name && <TableHeader className="assets-col-name">{renderSortHeader('Name', 'name')}</TableHeader>}
                  {columns.category && <TableHeader className="assets-col-category">{renderSortHeader('Category', 'category')}</TableHeader>}
                  {columns.source && <TableHeader className="assets-col-source">{renderSortHeader('Source', 'source')}</TableHeader>}
                  {columns.format && <TableHeader className="assets-col-format">{renderSortHeader('Format', 'format')}</TableHeader>}
                  {columns.sampleRate && (
                    <TableHeader className="assets-col-sample-rate">{renderSortHeader('Sample rate', 'sampleRate', 'right')}</TableHeader>
                  )}
                  {columns.duration && (
                    <TableHeader className="assets-col-duration">{renderSortHeader('Duration', 'duration', 'right')}</TableHeader>
                  )}
                  {columns.size && <TableHeader className="assets-col-size">{renderSortHeader('Size', 'size', 'right')}</TableHeader>}
                  {columns.folder && (
                    <TableHeader className="assets-col-folder">
                      <span className="installed-assets-table__header-with-icon">
                        <FolderOpen size={16} aria-hidden />
                        {renderSortHeader('Folder', 'folder')}
                      </span>
                    </TableHeader>
                  )}
                  {columns.status && <TableHeader className="assets-col-status">Status</TableHeader>}
                  <TableHeader className="assets-col-actions">Actions</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedAssets.map((asset) => {
                  const config = TYPE_CONFIG[asset.type]
                  const TypeIcon = config.icon
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
                      <TableRow
                        className={`installed-assets-row${isExpanded ? ' is-expanded' : ''}`}
                        data-selected={isSelected ? 'true' : 'false'}
                      >
                        <TableCell className="assets-col-select" data-label="Select">
                          <Checkbox
                            id={`installed-assets-select-${asset.id}`}
                            hideLabel
                            labelText={`Select ${asset.name}`}
                            checked={isSelected}
                            onChange={() => toggleSelect(asset.id)}
                          />
                        </TableCell>
                        {columns.type && (
                          <TableCell className="assets-col-type" data-label="Type">
                            <div className="installed-assets-table__type-cell">
                              <TypeIcon size={16} aria-hidden />
                              <Tag type={config.tagType}>{config.label}</Tag>
                            </div>
                          </TableCell>
                        )}
                        {columns.name && (
                          <TableCell className="assets-col-name" data-label="Name">
                            <span className="installed-assets-table__name-cell">{asset.name}</span>
                          </TableCell>
                        )}
                        {columns.category && (
                          <TableCell className="assets-col-category" data-label="Category">
                            {asset.category || '-'}
                          </TableCell>
                        )}
                        {columns.source && (
                          <TableCell className="assets-col-source" data-label="Source">
                            {asset.source || '-'}
                          </TableCell>
                        )}
                        {columns.format && (
                          <TableCell className="assets-col-format" data-label="Format">
                            {asset.format ? <Tag type="cool-gray">{asset.format}</Tag> : '-'}
                          </TableCell>
                        )}
                        {columns.sampleRate && (
                          <TableCell className="assets-col-sample-rate" data-label="Sample rate">
                            {formatSampleRate(asset.sampleRate)}
                          </TableCell>
                        )}
                        {columns.duration && (
                          <TableCell className="assets-col-duration" data-label="Duration">
                            {formatDuration(asset.duration)}
                          </TableCell>
                        )}
                        {columns.size && (
                          <TableCell className="assets-col-size" data-label="Size">
                            {formatSize(asset.size)}
                          </TableCell>
                        )}
                        {columns.folder && (
                          <TableCell className="assets-col-folder" data-label="Folder" title={asset.path}>
                            {asset.folder || '-'}
                          </TableCell>
                        )}
                        {columns.status && (
                          <TableCell className="assets-col-status" data-label="Status">
                            <div className="installed-assets-table__status-cell">
                              {asset.isActive && <Tag type="green">Active</Tag>}
                              {isClusterMode && availabilitySummary && (
                                <Tag type={availability?.missingOn.length ? 'warm-gray' : 'teal'}>{availabilitySummary}</Tag>
                              )}
                            </div>
                          </TableCell>
                        )}
                        <TableCell className="assets-col-actions">
                          <div className="installed-assets-actions">
                            <Button
                              kind="ghost"
                              size="sm"
                              hasIconOnly
                              iconDescription={isExpanded ? 'Collapse details' : 'Expand details'}
                              renderIcon={isExpanded ? CaretUp : CaretDown}
                              onClick={() => toggleAssetRowExpanded(asset.id)}
                            />
                            {canDeploy && (
                              <Button
                                kind="ghost"
                                size="sm"
                                hasIconOnly
                                iconDescription="Deploy to nodes"
                                renderIcon={Share}
                                onClick={() => openDeployDialog(asset)}
                              />
                            )}
                            <Button
                              kind="ghost"
                              size="sm"
                              hasIconOnly
                              iconDescription={`Delete ${asset.name}`}
                              renderIcon={TrashCan}
                              onClick={() => {
                                setSelectedIds(new Set([asset.id]))
                                setShowDeleteConfirm(true)
                              }}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow className="installed-assets-mobile-details-row">
                          <TableCell colSpan={visibleColumnCount}>
                            <div className="installed-assets-mobile-details-grid">
                              <div>
                                <strong>Source:</strong> {asset.source || '-'}
                              </div>
                              <div>
                                <strong>Format:</strong> {asset.format || '-'}
                              </div>
                              <div>
                                <strong>Sample rate:</strong> {formatSampleRate(asset.sampleRate)}
                              </div>
                              <div>
                                <strong>Duration:</strong> {formatDuration(asset.duration)}
                              </div>
                              <div>
                                <strong>Size:</strong> {formatSize(asset.size)}
                              </div>
                              <div>
                                <strong>Path:</strong> {asset.path || '-'}
                              </div>
                            </div>
                            {isClusterMode && (
                              <div className="installed-assets-table__availability-card">
                                <p>
                                  <strong>Available on:</strong>{' '}
                                  {availability?.availableOn.length
                                    ? availability.availableOn.map((node) => nodeLabelById.get(node) ?? node).join(', ')
                                    : asset.type === 'sfz'
                                      ? 'Local library only'
                                      : 'Unknown'}
                                </p>
                                <p>
                                  <strong>Missing on:</strong>{' '}
                                  {availability?.missingOn.length
                                    ? availability.missingOn.map((node) => nodeLabelById.get(node) ?? node).join(', ')
                                    : 'No missing nodes'}
                                </p>
                                {canDeploy && (
                                  <Button kind="primary" size="sm" renderIcon={Share} onClick={() => openDeployDialog(asset)}>
                                    Deploy to nodes
                                  </Button>
                                )}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </div>

      <footer className="installed-assets-table-footer">
        <span className="installed-assets-table-footer__summary">
          Showing {summaryStart}-{summaryEnd} of {filteredAssets.length}
          {filteredAssets.length !== unifiedAssets.length ? ` (${unifiedAssets.length} total)` : ''}
          {selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ''}
        </span>
        {totalPages > 1 && (
          <div className="installed-assets-table-footer__pagination">
            <Button
              kind="ghost"
              size="sm"
              hasIconOnly
              iconDescription="Previous page"
              renderIcon={CaretLeft}
              disabled={currentPage === 0}
              onClick={() => setCurrentPage((previous) => Math.max(0, previous - 1))}
            />
            <span>
              Page {currentPage + 1} of {totalPages}
            </span>
            <Button
              kind="ghost"
              size="sm"
              hasIconOnly
              iconDescription="Next page"
              renderIcon={CaretRight}
              disabled={currentPage >= totalPages - 1}
              onClick={() => setCurrentPage((previous) => Math.min(totalPages - 1, previous + 1))}
            />
          </div>
        )}
        <span className="installed-assets-table-footer__sort">{`Sorted by ${sortText(sortField, sortDirection)}`}</span>
      </footer>

      <Modal
        open={showDeleteConfirm}
        danger
        modalLabel="Asset library"
        modalHeading="Delete selected assets"
        primaryButtonText="Delete"
        secondaryButtonText="Cancel"
        onRequestClose={() => setShowDeleteConfirm(false)}
        onSecondarySubmit={() => setShowDeleteConfirm(false)}
        onRequestSubmit={() => {
          void handleDeleteSelected()
        }}
      >
        <div className="installed-assets-table__modal-body">
          <WarningAlt size={24} aria-hidden />
          <p>
            Delete {selectedIds.size} asset{selectedIds.size === 1 ? '' : 's'}? This action cannot be undone.
          </p>
        </div>
      </Modal>

      <Modal
        open={Boolean(deployAsset)}
        size="md"
        modalLabel="Cluster deployment"
        modalHeading="Deploy asset to nodes"
        primaryButtonText={deployMutation.isPending ? 'Deploying...' : 'Deploy'}
        secondaryButtonText="Cancel"
        primaryButtonDisabled={!deployAsset || deployTargetIds.size === 0 || deployMutation.isPending}
        onRequestClose={closeDeployDialog}
        onSecondarySubmit={closeDeployDialog}
        onRequestSubmit={() => {
          if (!deployAsset || deployMutation.isPending) return
          deployMutation.mutate({ asset: deployAsset, targetNodeIds: Array.from(deployTargetIds) })
        }}
      >
        {deployAsset && (
          <div className="installed-assets-table__deploy-dialog">
            <p className="installed-assets-table__deploy-copy">
              Copy <strong>{deployAsset.name}</strong> from <strong>{deploySourceLabel}</strong> to selected target nodes.
            </p>
            <div className="installed-assets-table__deploy-targets">
              {availabilityNodes
                .filter((node) => node.nodeId !== (deployAsset.availability?.sourceNodeId ?? sourceNodeId))
                .map((node) => {
                  const alreadyAvailable = deployAsset.availability?.availableOn.includes(node.nodeId) ?? false
                  const checked = deployTargetIds.has(node.nodeId)
                  return (
                    <label
                      key={node.nodeId}
                      className={`installed-assets-table__deploy-target${checked ? ' is-selected' : ''}${node.isOnline ? '' : ' is-offline'}`}
                    >
                      <div>
                        <p>{nodeLabelById.get(node.nodeId) ?? node.nodeId}</p>
                        <span>{alreadyAvailable ? 'Already available' : 'Missing on target'}</span>
                      </div>
                      <Checkbox
                        id={`deploy-node-${node.nodeId}`}
                        hideLabel
                        labelText={`Deploy to ${node.hostname}`}
                        checked={checked}
                        disabled={!node.isOnline || deployMutation.isPending}
                        onChange={() => toggleDeployTarget(node.nodeId)}
                      />
                    </label>
                  )
                })}
            </div>
            {deployMutation.isError && (
              <InlineNotification
                kind="error"
                lowContrast
                hideCloseButton
                title="Deploy failed"
                subtitle={deployMutation.error instanceof Error ? deployMutation.error.message : 'Deploy failed'}
              />
            )}
          </div>
        )}
      </Modal>
    </section>
  )
}
