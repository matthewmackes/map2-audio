import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  DataTable,
  FileUploader,
  InlineLoading,
  Layer,
  Modal,
  OverflowMenu,
  OverflowMenuItem,
  Pagination,
  Select,
  SelectItem,
  SkeletonText,
  Tag,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Tile,
} from '@carbon/react'
import type { CarbonIconType } from '@carbon/icons-react'
import {
  ArrowRight,
  Catalog,
  ChevronRight,
  Close,
  CloudUpload,
  FolderDetails,
  MachineLearningModel,
  Music,
  Network_4,
  Package,
  Play,
  Renew,
  Search,
  TrashCan,
  Upload,
  VolumeUp,
  Waveform,
} from '@carbon/icons-react'
import { pluginsApi, irApi, namApi, soundfontApi } from '../../map2/api'
import { ArtifactDownloadModal } from '../components/artifacts/ArtifactDownloadModal'
import { SnapshotArtifactsWorkspace } from '../components/artifacts/SnapshotArtifactsWorkspace'
import { useCluster } from '../contexts/ClusterContext'
import { useNodePageContext } from '../hooks/useNodePageContext'
import { usePluginBrowser } from '../hooks/usePluginBrowser'
import { useRealtimeCadence } from '../hooks/useRealtimeCadence'
import { useRouteActive } from '../hooks/useRouteActive'
import { useToasts } from '../components/Toasts'
import { getDisplayPluginName } from '../../map2/displayNames'
import { WorkspacePageTemplate } from '../components/layout/WorkspacePageTemplate'
import { UnifiedWorkspaceSideNav, type UnifiedWorkspaceSideNavItem } from '../components/navigation/UnifiedWorkspaceSideNav'
import { NODE_PAGE_KEYS } from '../utils/nodeDisplay'
import './AudioArtifactsPage.css'

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [25, 50, 100]
const SYNC_QUEUE_KEY = 'map2_artifact_sync_queue'

type ArtifactCategory =
  | 'lv2-plugins'
  | 'nam-models'
  | 'cabinet-irs'
  | 'reverb-irs'
  | 'soundfonts'
  | 'native-juce'
  | 'snapshots'

interface CategoryMeta {
  id: ArtifactCategory
  label: string
  shortLabel: string
  icon: CarbonIconType
  description: string
  primaryAction: string
  statusLabel: (item: ArtifactRow) => string
  statusType: (item: ArtifactRow) => 'green' | 'gray' | 'blue' | 'warm-gray' | 'red'
  columns: Array<{ key: string; header: string }>
}

interface ArtifactRow {
  id: string
  name: string
  node: string
  size?: string
  status: string
  statusRaw: string
  [key: string]: unknown
}

interface SyncJob {
  id: string
  artifactName: string
  category: ArtifactCategory
  direction: 'push' | 'pull'
  fromNode: string
  toNode: string
  progress: number
  status: 'queued' | 'syncing' | 'done' | 'error'
  error?: string
  startedAt: string
}

const DISCOVER_TAB_BY_CATEGORY: Record<ArtifactCategory, 'plugin-packs' | 'nam' | 'cabinet-irs' | 'reverb-irs' | 'soundfonts'> = {
  'lv2-plugins': 'plugin-packs',
  'nam-models': 'nam',
  'cabinet-irs': 'cabinet-irs',
  'reverb-irs': 'reverb-irs',
  soundfonts: 'soundfonts',
  'native-juce': 'plugin-packs',
  snapshots: 'plugin-packs',
}

// ─── Category Definitions ─────────────────────────────────────────────────────

const CATEGORIES: CategoryMeta[] = [
  {
    id: 'lv2-plugins',
    label: 'LV2 Plugins',
    shortLabel: 'LV2',
    icon: Package,
    description: 'Linux audio plugin standard — effects, instruments, and utilities',
    primaryAction: 'Load to Graph',
    statusLabel: (item) => item.statusRaw === 'active' ? 'Active' : 'Inactive',
    statusType: (item) => item.statusRaw === 'active' ? 'green' : 'warm-gray',
    columns: [
      { key: 'name', header: 'Name' },
      { key: 'author', header: 'Author' },
      { key: 'format', header: 'Format' },
      { key: 'category', header: 'Category' },
      { key: 'node', header: 'Node' },
      { key: 'status', header: 'Status' },
    ],
  },
  {
    id: 'nam-models',
    label: 'NAM Models',
    shortLabel: 'NAM',
    icon: MachineLearningModel,
    description: 'Neural Amp Modeler captures for amp simulation',
    primaryAction: 'Activate Model',
    statusLabel: (item) => item.statusRaw === 'active' ? 'Loaded' : 'Unloaded',
    statusType: (item) => item.statusRaw === 'active' ? 'green' : 'gray',
    columns: [
      { key: 'name', header: 'Name' },
      { key: 'ampType', header: 'Amp Type' },
      { key: 'ampName', header: 'Amp Name' },
      { key: 'author', header: 'Author' },
      { key: 'sampleRate', header: 'Sample Rate' },
      { key: 'node', header: 'Node' },
      { key: 'status', header: 'Status' },
    ],
  },
  {
    id: 'cabinet-irs',
    label: 'Cabinet IRs',
    shortLabel: 'Cabs',
    icon: VolumeUp,
    description: 'Guitar and bass cabinet impulse responses',
    primaryAction: 'Set as Cabinet',
    statusLabel: (item) => item.statusRaw === 'loaded' ? 'Loaded' : 'Unloaded',
    statusType: (item) => item.statusRaw === 'loaded' ? 'green' : 'gray',
    columns: [
      { key: 'name', header: 'Name' },
      { key: 'sampleRate', header: 'Sample Rate' },
      { key: 'duration', header: 'Duration' },
      { key: 'size', header: 'Size' },
      { key: 'node', header: 'Node' },
      { key: 'status', header: 'Status' },
    ],
  },
  {
    id: 'reverb-irs',
    label: 'Reverb IRs',
    shortLabel: 'Reverbs',
    icon: Waveform,
    description: 'Room, hall, plate, and space impulse responses',
    primaryAction: 'Set as Reverb',
    statusLabel: (item) => item.statusRaw === 'loaded' ? 'Loaded' : 'Unloaded',
    statusType: (item) => item.statusRaw === 'loaded' ? 'green' : 'gray',
    columns: [
      { key: 'name', header: 'Name' },
      { key: 'sampleRate', header: 'Sample Rate' },
      { key: 'duration', header: 'Duration' },
      { key: 'size', header: 'Size' },
      { key: 'node', header: 'Node' },
      { key: 'status', header: 'Status' },
    ],
  },
  {
    id: 'soundfonts',
    label: 'SoundFonts',
    shortLabel: 'SF2',
    icon: Music,
    description: 'Sampled instrument libraries for MIDI playback',
    primaryAction: 'Load to Sampler',
    statusLabel: (item) => item.statusRaw === 'loaded' ? 'Loaded' : 'Unloaded',
    statusType: (item) => item.statusRaw === 'loaded' ? 'green' : 'gray',
    columns: [
      { key: 'name', header: 'Name' },
      { key: 'presetCount', header: 'Presets' },
      { key: 'size', header: 'Size' },
      { key: 'node', header: 'Node' },
      { key: 'status', header: 'Status' },
    ],
  },
  {
    id: 'native-juce',
    label: 'Native JUCE',
    shortLabel: 'JUCE',
    icon: Music,
    description: 'Built-in JUCE audio processors and native plugins',
    primaryAction: 'Load to Graph',
    statusLabel: (item) => item.statusRaw === 'active' ? 'Active' : 'Inactive',
    statusType: (item) => item.statusRaw === 'active' ? 'green' : 'warm-gray',
    columns: [
      { key: 'name', header: 'Name' },
      { key: 'version', header: 'Version' },
      { key: 'category', header: 'Category' },
      { key: 'node', header: 'Node' },
      { key: 'status', header: 'Status' },
    ],
  },
  {
    id: 'snapshots',
    label: 'Snapshots',
    shortLabel: 'Shots',
    icon: FolderDetails,
    description: 'Saved signal-state artifacts with lifecycle, full content visibility, and best-effort cluster deployment context',
    primaryAction: 'Inspect Snapshot',
    statusLabel: (item) => String(item.status ?? 'Saved'),
    statusType: (item) => item.statusRaw === 'active' ? 'green' : item.statusRaw === 'dirty' ? 'blue' : 'warm-gray',
    columns: [
      { key: 'name', header: 'Name' },
      { key: 'flag', header: 'Flag' },
      { key: 'midiPc', header: 'MIDI PC' },
    ],
  },
]

// ─── Sync Queue Helpers ───────────────────────────────────────────────────────

function loadSyncQueue(): SyncJob[] {
  try {
    const raw = localStorage.getItem(SYNC_QUEUE_KEY)
    return raw ? (JSON.parse(raw) as SyncJob[]) : []
  } catch {
    return []
  }
}

function saveSyncQueue(jobs: SyncJob[]) {
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(jobs))
}

function formatBytes(bytes?: number): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatSampleRate(hz?: number): string {
  if (!hz) return '—'
  return `${(hz / 1000).toFixed(1)} kHz`
}

function formatDuration(secs?: number): string {
  if (!secs) return '—'
  return `${secs.toFixed(2)} s`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface SyncQueueDrawerProps {
  open: boolean
  onClose: () => void
  jobs: SyncJob[]
  onDismissJob: (id: string) => void
}

function SyncQueueDrawer({ open, onClose, jobs, onDismissJob }: SyncQueueDrawerProps) {
  if (!open) return null
  return (
    <Tile className="aap-sync-drawer" role="complementary" aria-label="Sync queue">
      <div className="aap-sync-drawer__header">
        <span className="aap-sync-drawer__title">Sync Queue</span>
        <Tag type="blue">{jobs.filter((j) => j.status !== 'done').length} active</Tag>
        <Button kind="ghost" size="sm" renderIcon={Close} iconDescription="Close sync queue" hasIconOnly onClick={onClose} />
      </div>
      <div className="aap-sync-drawer__body">
        {jobs.length === 0 ? (
          <p className="aap-sync-drawer__empty">No sync jobs. Pull or push an artifact to start.</p>
        ) : (
          jobs.map((job) => (
            <div key={job.id} className={`aap-sync-drawer__job aap-sync-drawer__job--${job.status}`}>
              <div className="aap-sync-drawer__job-header">
                <span className="aap-sync-drawer__job-name">{job.artifactName}</span>
                {job.status === 'done' || job.status === 'error' ? (
                  <Button
                    kind="ghost"
                    size="sm"
                    renderIcon={Close}
                    iconDescription="Dismiss"
                    hasIconOnly
                    onClick={() => onDismissJob(job.id)}
                  />
                ) : null}
              </div>
              <div className="aap-sync-drawer__job-meta">
                <Tag type="cool-gray" size="sm">{job.direction === 'push' ? 'Push' : 'Pull'}</Tag>
                <span className="aap-sync-drawer__job-nodes">
                  {job.fromNode} <ArrowRight size={12} aria-hidden="true" /> {job.toNode}
                </span>
              </div>
              {job.status === 'syncing' ? (
                <div className="aap-sync-drawer__job-progress-wrap">
                  <div className="aap-sync-drawer__job-progress-bar" style={{ '--progress': `${job.progress}%` } as React.CSSProperties} />
                  <span className="aap-sync-drawer__job-pct">{job.progress}%</span>
                </div>
              ) : null}
              {job.status === 'done' ? <Tag type="green" size="sm">Done</Tag> : null}
              {job.status === 'error' ? <Tag type="red" size="sm">{job.error ?? 'Error'}</Tag> : null}
              {job.status === 'queued' ? <Tag type="warm-gray" size="sm">Queued</Tag> : null}
            </div>
          ))
        )}
      </div>
    </Tile>
  )
}

interface ArtifactDetailPanelProps {
  open: boolean
  item: ArtifactRow | null
  category: CategoryMeta
  onClose: () => void
  onPrimaryAction: (item: ArtifactRow) => void
  onPushToNode: (item: ArtifactRow, nodeId: string) => void
  onPullFromNode: (item: ArtifactRow, nodeId: string) => void
  onDelete: (item: ArtifactRow) => void
  nodes: Array<{ nodeId: string; hostname: string; isLocal: boolean }>
  localNodeId: string
  primaryActionPending: boolean
}

function ArtifactDetailPanel({
  open,
  item,
  category,
  onClose,
  onPrimaryAction,
  onPushToNode,
  onPullFromNode,
  onDelete,
  nodes,
  localNodeId,
  primaryActionPending,
}: ArtifactDetailPanelProps) {
  if (!open || !item) {
    return null
  }

  return (
    <Tile className="aap-detail-panel" role="complementary" aria-label="Artifact details">
      <div className="aap-detail-panel__header">
        <div className="aap-detail-panel__header-top">
          <span className="aap-detail-panel__category-label">{category.label}</span>
          <Button kind="ghost" size="sm" renderIcon={Close} iconDescription="Close panel" hasIconOnly onClick={onClose} />
        </div>
        <h2 className="aap-detail-panel__title">{item.name as string}</h2>
        <div className="aap-detail-panel__status-row">
          <Tag type={category.statusType(item)}>{category.statusLabel(item)}</Tag>
          <Tag type="cool-gray" size="sm">{item.node as string}</Tag>
        </div>
      </div>

      <div className="aap-detail-panel__body">
        <div className="aap-detail-panel__section">
          <h3 className="aap-detail-panel__section-title">Details</h3>
          <dl className="aap-detail-panel__dl">
            {Object.entries(item)
              .filter(([k]) => !['id', 'name', 'status', 'statusRaw', 'node'].includes(k))
              .map(([k, v]) => (
                <div key={k} className="aap-detail-panel__dl-row">
                  <dt className="aap-detail-panel__dt">{k.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}</dt>
                  <dd className="aap-detail-panel__dd">{String(v ?? '—')}</dd>
                </div>
              ))}
          </dl>
        </div>

        <div className="aap-detail-panel__section">
          <h3 className="aap-detail-panel__section-title">Primary action</h3>
          <Button
            kind="primary"
            size="md"
            renderIcon={Play}
            onClick={() => onPrimaryAction(item)}
            disabled={primaryActionPending}
            className="aap-detail-panel__primary-btn"
          >
            {primaryActionPending ? 'Working…' : category.primaryAction}
          </Button>
        </div>

        {nodes.length > 1 ? (
          <div className="aap-detail-panel__section">
            <h3 className="aap-detail-panel__section-title">Node sync</h3>
            <div className="aap-detail-panel__node-list">
              {nodes.map((node) => (
                <div key={node.nodeId} className="aap-detail-panel__node-row">
                  <span className="aap-detail-panel__node-name">
                    {node.hostname}
                    {node.isLocal ? <Tag type="green" size="sm">Local</Tag> : null}
                  </span>
                  <div className="aap-detail-panel__node-actions">
                    {!node.isLocal ? (
                      <>
                        <Button
                          kind="tertiary"
                          size="sm"
                          renderIcon={ArrowRight}
                          onClick={() => onPushToNode(item, node.nodeId)}
                        >
                          Push
                        </Button>
                        <Button
                          kind="ghost"
                          size="sm"
                          renderIcon={ArrowRight}
                          onClick={() => onPullFromNode(item, node.nodeId)}
                        >
                          Pull
                        </Button>
                      </>
                    ) : <Tag type="warm-gray" size="sm">This node</Tag>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="aap-detail-panel__section aap-detail-panel__section--danger">
          <h3 className="aap-detail-panel__section-title">Danger zone</h3>
          <Button
            kind="danger--ghost"
            size="sm"
            renderIcon={TrashCan}
            onClick={() => onDelete(item)}
          >
            Delete artifact
          </Button>
        </div>
      </div>
    </Tile>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────

interface EmptyStateProps {
  category: CategoryMeta
  onUpload: () => void
  isClusterMode: boolean
  onBrowseNodes: () => void
  onOpenDownload: () => void
  onScan: (type: 'plugins' | 'folders' | 'both') => void
  isScanning: boolean
}

function ArtifactEmptyState({ category, onUpload, isClusterMode, onBrowseNodes, onOpenDownload, onScan, isScanning }: EmptyStateProps) {
  const Icon = category.icon
  const isPluginCategory = category.id === 'lv2-plugins' || category.id === 'native-juce'

  return (
    <Tile className="aap-empty">
      <div className="aap-empty__icon-wrap">
        <Icon size={48} aria-hidden="true" />
      </div>
      <h3 className="aap-empty__title">No {category.label} found on this node</h3>
      <p className="aap-empty__subtitle">{category.description}</p>
      <div className="aap-empty__actions">
        {isPluginCategory ? (
          <div className="aap-empty__scan-group">
            <div className="aap-empty__scan-wrap">
              <Button
                kind="primary"
                size="md"
                renderIcon={Search}
                onClick={() => onScan('plugins')}
                disabled={isScanning}
              >
                Scan for plugins
              </Button>
              <OverflowMenu
                ariaLabel="More scan options"
                size="md"
                flipped
                disabled={isScanning}
              >
                <OverflowMenuItem itemText="Scan plugins only" onClick={() => onScan('plugins')} />
                <OverflowMenuItem itemText="Scan all folders" onClick={() => onScan('folders')} />
                <OverflowMenuItem itemText="Scan plugins and folders" onClick={() => onScan('both')} />
              </OverflowMenu>
            </div>
            {isScanning ? (
              <InlineLoading
                className="aap-empty__loading"
                description="Scanning plugins"
                status="active"
              />
            ) : null}
          </div>
        ) : (
          <Button kind="primary" size="md" renderIcon={Upload} onClick={onUpload}>
            Upload {category.shortLabel}
          </Button>
        )}
        <Button kind="tertiary" size="md" renderIcon={CloudUpload} onClick={onOpenDownload}>
          Download {category.shortLabel}
        </Button>
        {isClusterMode ? (
          <Button kind="ghost" size="md" renderIcon={Network_4} onClick={onBrowseNodes}>
            Browse other nodes
          </Button>
        ) : null}
      </div>
    </Tile>
  )
}

// ─── Skeleton rows ────────────────────────────────────────────────────────────

function SkeletonRows({ columns, count = 8 }: { columns: number; count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: columns }).map((__, j) => (
            <TableCell key={j}><SkeletonText /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

interface AudioArtifactsPageProps {
  discoverMode?: boolean
}

export function AudioArtifactsPage({ discoverMode = false }: AudioArtifactsPageProps) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()

  const { activeNodeId, nodes, localNodeId, isClusterMode } = useCluster()
  const { localNode: pageLocalNode, topology: nodeTopology } = useNodePageContext(NODE_PAGE_KEYS.lv2Plugins)

  // ── URL-driven state ─────────────────────────────────────────────────────
  const rawCategory = searchParams.get('category') as ArtifactCategory | null
  const activeCategory: ArtifactCategory = CATEGORIES.find((c) => c.id === rawCategory)?.id ?? 'lv2-plugins'
  const rawPage = parseInt(searchParams.get('page') ?? '1', 10)
  const currentPage = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1
  const rawPageSize = parseInt(searchParams.get('pageSize') ?? '25', 10)
  const pageSize = PAGE_SIZE_OPTIONS.includes(rawPageSize) ? rawPageSize : 25
  const searchQuery = searchParams.get('q') ?? ''
  const viewedNodeParam = searchParams.get('node') ?? ''

  // ── Local UI state ───────────────────────────────────────────────────────
  const [selectedItem, setSelectedItem] = useState<ArtifactRow | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<ArtifactRow | null>(null)
  const [syncDrawerOpen, setSyncDrawerOpen] = useState(false)
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [syncJobs, setSyncJobs] = useState<SyncJob[]>(loadSyncQueue)
  const [primaryActionPending, setPrimaryActionPending] = useState(false)
  const [navAnimated, setNavAnimated] = useState(false)
  const [tableAnimated, setTableAnimated] = useState(false)
  const { pushToast: pushGlobalToast } = useToasts()

  const selectedNodeId = viewedNodeParam || (activeNodeId && activeNodeId !== 'all' ? activeNodeId : localNodeId)
  const detailNodeId = selectedNodeId === localNodeId ? null : selectedNodeId

  // ── Category helpers ──────────────────────────────────────────────────────
  const category = CATEGORIES.find((c) => c.id === activeCategory)!

  const updateParams = useCallback((updates: Record<string, string | null>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(updates)) {
        if (v === null) {
          next.delete(k)
        } else {
          next.set(k, v)
        }
      }
      return next
    }, { replace: true })
  }, [setSearchParams])

  const openDiscoverRoute = useCallback(() => {
    const currentSearch = searchParams.toString()
    navigate({
      pathname: '/artifacts/discover',
      search: currentSearch ? `?${currentSearch}` : '',
    })
  }, [navigate, searchParams])

  const closeDiscoverRoute = useCallback(() => {
    const currentSearch = searchParams.toString()
    navigate({
      pathname: '/artifacts',
      search: currentSearch ? `?${currentSearch}` : '',
    }, { replace: true })
  }, [navigate, searchParams])

  const selectCategory = useCallback((id: ArtifactCategory) => {
    setSelectedItem(null)
    setDetailOpen(false)
    setTableAnimated(false)
    updateParams({ category: id, page: '1', q: null })
    setTimeout(() => setTableAnimated(true), 80)
  }, [updateParams])

  const openCategoryRoute = useCallback((id: ArtifactCategory) => {
    if (discoverMode) {
      const nextSearch = new URLSearchParams(searchParams)
      nextSearch.set('category', id)
      nextSearch.set('page', '1')
      nextSearch.delete('q')
      navigate({
        pathname: '/artifacts',
        search: `?${nextSearch.toString()}`,
      })
      return
    }

    selectCategory(id)
  }, [discoverMode, navigate, searchParams, selectCategory])

  // ── Staggered entry animation ─────────────────────────────────────────────
  useEffect(() => {
    const t1 = setTimeout(() => setNavAnimated(true), 60)
    const t2 = setTimeout(() => setTableAnimated(true), 240)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  // ── Sync queue persistence ────────────────────────────────────────────────
  useEffect(() => {
    saveSyncQueue(syncJobs)
  }, [syncJobs])

  const pushToast = useCallback((kind: 'error' | 'info' | 'success' | 'warning', title: string, subtitle?: string) => {
    const message = subtitle ? `${title} ${subtitle}` : title
    pushGlobalToast(message, kind === 'warning' ? 'warn' : kind)
  }, [pushGlobalToast])

  const artifactsRouteActive = useRouteActive(['/artifacts'])
  const artifactsStatusCadence = useRealtimeCadence({
    routeActive: artifactsRouteActive,
    visibleMs: 10_000,
    hiddenMs: 30_000,
    inactiveMs: false,
  })
  const artifactsInventoryCadence = useRealtimeCadence({
    routeActive: artifactsRouteActive,
    visibleMs: 30_000,
    hiddenMs: 120_000,
    inactiveMs: false,
  })

  // ── Data queries ──────────────────────────────────────────────────────────
  const pluginBrowser = usePluginBrowser({ nodeId: detailNodeId })

  // Native JUCE plugins come from /plugins/discover (format='JUCE', is_native=true)
  const nativePluginsQuery = useQuery({
    queryKey: ['plugins', 'discover', 'native', selectedNodeId],
    queryFn: async () => {
      const result = await pluginsApi.discover(false, detailNodeId)
      const list: any[] = Array.isArray(result) ? result : (result as any)?.plugins ?? []
      return list.filter((p: any) => p.format === 'JUCE' || p.is_native === true)
    },
    enabled: activeCategory === 'native-juce',
    staleTime: 30000,
  })

  const irCabinetsQuery = useQuery({
    queryKey: ['ir', 'cabinets', selectedNodeId],
    queryFn: () => irApi.listCabinets(detailNodeId),
    enabled: activeCategory === 'cabinet-irs',
    staleTime: 15000,
    refetchInterval: artifactsInventoryCadence,
  })

  const irReverbsQuery = useQuery({
    queryKey: ['ir', 'reverbs', selectedNodeId],
    queryFn: () => irApi.listReverbs(detailNodeId),
    enabled: activeCategory === 'reverb-irs',
    staleTime: 15000,
    refetchInterval: artifactsInventoryCadence,
  })

  const irStatusQuery = useQuery({
    queryKey: ['ir', 'status', selectedNodeId],
    queryFn: () => irApi.getStatus(detailNodeId),
    enabled: activeCategory === 'cabinet-irs' || activeCategory === 'reverb-irs',
    staleTime: 5000,
    refetchInterval: artifactsStatusCadence,
  })

  const namStatusQuery = useQuery({
    queryKey: ['nam', 'status', selectedNodeId],
    queryFn: () => namApi.getStatus(detailNodeId),
    enabled: activeCategory === 'nam-models',
    staleTime: 5000,
    refetchInterval: artifactsStatusCadence,
  })

  const namModelsQuery = useQuery({
    queryKey: ['nam', 'models', selectedNodeId],
    queryFn: () => namApi.listModels({ limit: 500 }, detailNodeId),
    enabled: activeCategory === 'nam-models',
    staleTime: 15000,
    refetchInterval: artifactsInventoryCadence,
  })

  const soundfontsQuery = useQuery({
    queryKey: ['soundfonts', 'list', selectedNodeId],
    queryFn: () => soundfontApi.listSoundfonts({ limit: 500 } as any, detailNodeId),
    enabled: activeCategory === 'soundfonts',
    staleTime: 15000,
    refetchInterval: artifactsInventoryCadence,
  })

  // ── Build rows from API data ───────────────────────────────────────────────
  const allRows: ArtifactRow[] = useMemo(() => {
    const nodeName = nodes.find((n) => n.nodeId === selectedNodeId)?.hostname ?? 'Local'

    if (activeCategory === 'snapshots') {
      return []
    }

    if (activeCategory === 'lv2-plugins') {
      return (pluginBrowser.allPlugins ?? []).map((p) => ({
        id: p.uri,
        name: getDisplayPluginName(p.name, p.uri),
        author: p.author ?? '—',
        format: p.format ?? 'LV2',
        category: p.category ?? '—',
        node: nodeName,
        status: 'active',
        statusRaw: 'active',
        uri: p.uri,
        version: p.version ?? '—',
      }))
    }

    if (activeCategory === 'nam-models') {
      const active = namStatusQuery.data?.activeModel ?? null
      return (namModelsQuery.data?.models ?? []).map((m: any) => ({
        id: m.name ?? m.id ?? String(m),
        name: m.name ?? String(m),
        ampType: m.amp_type ?? '—',
        ampName: m.amp_name ?? '—',
        author: m.author ?? '—',
        sampleRate: formatSampleRate(m.sample_rate),
        size: formatBytes(m.file_size),
        node: nodeName,
        status: active === (m.name ?? m) ? 'loaded' : 'unloaded',
        statusRaw: active === (m.name ?? m) ? 'active' : 'inactive',
        tags: Array.isArray(m.tags) ? m.tags.join(', ') : '—',
      }))
    }

    if (activeCategory === 'cabinet-irs') {
      const loaded = irStatusQuery.data?.loaded_cabinet ?? null
      return (irCabinetsQuery.data?.irs ?? []).map((ir: any) => ({
        id: ir.name,
        name: ir.name,
        sampleRate: formatSampleRate(ir.sample_rate),
        duration: formatDuration(ir.duration),
        size: formatBytes(ir.size),
        node: nodeName,
        status: loaded === ir.name ? 'loaded' : 'unloaded',
        statusRaw: loaded === ir.name ? 'loaded' : 'unloaded',
        path: ir.path ?? '—',
      }))
    }

    if (activeCategory === 'reverb-irs') {
      const loaded = irStatusQuery.data?.loaded_reverb ?? null
      return (irReverbsQuery.data?.irs ?? []).map((ir: any) => ({
        id: ir.name,
        name: ir.name,
        sampleRate: formatSampleRate(ir.sample_rate),
        duration: formatDuration(ir.duration),
        size: formatBytes(ir.size),
        node: nodeName,
        status: loaded === ir.name ? 'loaded' : 'unloaded',
        statusRaw: loaded === ir.name ? 'loaded' : 'unloaded',
        path: ir.path ?? '—',
      }))
    }

    if (activeCategory === 'soundfonts') {
      return ((soundfontsQuery.data as any)?.soundfonts ?? (soundfontsQuery.data as any)?.items ?? []).map((sf: any) => ({
        id: sf.name ?? sf.filename ?? String(sf),
        name: sf.name ?? sf.filename ?? String(sf),
        presetCount: sf.preset_count ?? sf.presets ?? '—',
        size: formatBytes(sf.file_size ?? sf.size),
        node: nodeName,
        status: 'unloaded',
        statusRaw: 'inactive',
      }))
    }

    // native-juce — from /plugins/discover filtered to format='JUCE' / is_native=true
    return (nativePluginsQuery.data ?? []).map((p: any) => ({
      id: p.uri,
      name: getDisplayPluginName(p.name, p.uri),
      version: p.version ?? '—',
      category: p.category ?? p.class_label ?? '—',
      node: nodeName,
      status: 'active',
      statusRaw: 'active',
    }))
  }, [
    activeCategory,
    pluginBrowser.allPlugins,
    namModelsQuery.data,
    namStatusQuery.data,
    irCabinetsQuery.data,
    irReverbsQuery.data,
    irStatusQuery.data,
    soundfontsQuery.data,
    nativePluginsQuery.data,
    nodes,
    selectedNodeId,
  ])

  // ── Filter + paginate ─────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return allRows
    return allRows.filter((row) =>
      Object.values(row).some((v) => typeof v === 'string' && v.toLowerCase().includes(q))
    )
  }, [allRows, searchQuery])

  const totalItems = filteredRows.length
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, currentPage, pageSize])

  const tableRows = useMemo(() =>
    pagedRows.map((row) => ({ id: row.id, ...row })),
    [pagedRows]
  )

  // ── Loading state ─────────────────────────────────────────────────────────
  const isLoading =
    (activeCategory === 'snapshots' && false) ||
    (activeCategory === 'lv2-plugins' && pluginBrowser.isLoading) ||
    (activeCategory === 'nam-models' && namModelsQuery.isLoading) ||
    (activeCategory === 'cabinet-irs' && irCabinetsQuery.isLoading) ||
    (activeCategory === 'reverb-irs' && irReverbsQuery.isLoading) ||
    (activeCategory === 'soundfonts' && soundfontsQuery.isLoading) ||
    (activeCategory === 'native-juce' && nativePluginsQuery.isLoading)

  // ── Primary actions ───────────────────────────────────────────────────────
  const loadCabinetMutation = useMutation({
    mutationFn: (name: string) => irApi.loadCabinet(name, detailNodeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ir', 'status'] })
      pushToast('success', 'Cabinet IR loaded')
    },
    onError: (e: Error) => pushToast('error', 'Failed to load cabinet', e.message),
  })

  const loadReverbMutation = useMutation({
    mutationFn: (name: string) => irApi.loadReverb(name, detailNodeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ir', 'status'] })
      pushToast('success', 'Reverb IR loaded')
    },
    onError: (e: Error) => pushToast('error', 'Failed to load reverb', e.message),
  })

  const activateNamMutation = useMutation({
    mutationFn: (name: string) => namApi.activateModel(name, detailNodeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['nam', 'status'] })
      pushToast('success', 'NAM model activated')
    },
    onError: (e: Error) => pushToast('error', 'Failed to activate model', e.message),
  })

  const handleScan = useCallback(async (type: 'plugins' | 'folders' | 'both') => {
    setIsScanning(true)
    try {
      if (type === 'plugins' || type === 'both') {
        await pluginBrowser.scanPlugins()
      }
      if (type === 'folders' || type === 'both') {
        await fetch('/api/folders/scan/all', { method: 'POST' })
        void queryClient.invalidateQueries({ queryKey: ['ir'] })
        void queryClient.invalidateQueries({ queryKey: ['nam'] })
        void queryClient.invalidateQueries({ queryKey: ['soundfonts'] })
      }
      pushToast('success', 'Scan complete', 'Artifact list refreshed')
    } catch (e: unknown) {
      pushToast('error', 'Scan failed', e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setIsScanning(false)
    }
  }, [pluginBrowser, queryClient, pushToast])

  const handlePrimaryAction = useCallback(async (item: ArtifactRow) => {
    setPrimaryActionPending(true)
    try {
      if (activeCategory === 'cabinet-irs') {
        await loadCabinetMutation.mutateAsync(item.name as string)
      } else if (activeCategory === 'reverb-irs') {
        await loadReverbMutation.mutateAsync(item.name as string)
      } else if (activeCategory === 'nam-models') {
        await activateNamMutation.mutateAsync(item.name as string)
      } else {
        pushToast('info', `${item.name as string} — ${category.primaryAction}`, 'Action sent to engine')
      }
    } finally {
      setPrimaryActionPending(false)
    }
  }, [activeCategory, category, loadCabinetMutation, loadReverbMutation, activateNamMutation, pushToast])

  // ── Sync actions ──────────────────────────────────────────────────────────
  const enqueueSyncJob = useCallback((
    item: ArtifactRow,
    direction: 'push' | 'pull',
    remoteNodeId: string,
  ) => {
    const remoteNode = nodes.find((n) => n.nodeId === remoteNodeId)
    const localNode = nodes.find((n) => n.nodeId === localNodeId)
    const job: SyncJob = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      artifactName: item.name as string,
      category: activeCategory,
      direction,
      fromNode: direction === 'pull' ? (remoteNode?.hostname ?? remoteNodeId) : (localNode?.hostname ?? 'Local'),
      toNode: direction === 'pull' ? (localNode?.hostname ?? 'Local') : (remoteNode?.hostname ?? remoteNodeId),
      progress: 0,
      status: 'queued',
      startedAt: new Date().toISOString(),
    }
    setSyncJobs((prev) => [...prev, job])
    setSyncDrawerOpen(true)

    // Simulate progress (real implementation would hook into a transfer API)
    let progress = 0
    const interval = window.setInterval(() => {
      progress = Math.min(progress + Math.random() * 20, 100)
      setSyncJobs((prev) => prev.map((j) =>
        j.id === job.id
          ? { ...j, status: progress >= 100 ? 'done' : 'syncing', progress: Math.floor(progress) }
          : j
      ))
      if (progress >= 100) {
        window.clearInterval(interval)
        pushToast('success', `${item.name as string} synced`, `${direction === 'push' ? 'Pushed to' : 'Pulled from'} ${remoteNode?.hostname ?? remoteNodeId}`)
      }
    }, 400)
  }, [nodes, localNodeId, activeCategory, pushToast])

  // ── Upload ────────────────────────────────────────────────────────────────
  const handleUploadFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]
    try {
      if (activeCategory === 'cabinet-irs') {
        await irApi.uploadCabinet(file)
        void queryClient.invalidateQueries({ queryKey: ['ir', 'cabinets'] })
        pushToast('success', 'Cabinet IR uploaded')
      } else if (activeCategory === 'reverb-irs') {
        await irApi.uploadReverb(file)
        void queryClient.invalidateQueries({ queryKey: ['ir', 'reverbs'] })
        pushToast('success', 'Reverb IR uploaded')
      } else if (activeCategory === 'nam-models') {
        await namApi.upload(file)
        void queryClient.invalidateQueries({ queryKey: ['nam', 'models'] })
        pushToast('success', 'NAM model uploaded')
      } else if (activeCategory === 'soundfonts') {
        await soundfontApi.upload(file)
        void queryClient.invalidateQueries({ queryKey: ['soundfonts'] })
        pushToast('success', 'SoundFont uploaded')
      } else {
        pushToast('info', 'Upload', `Upload for ${category.label} is managed via the package system`)
      }
    } catch (e: unknown) {
      pushToast('error', 'Upload failed', e instanceof Error ? e.message : 'Unknown error')
    }
    setUploadModalOpen(false)
  }, [activeCategory, category, queryClient, pushToast])

  // ── Mobile: category select ───────────────────────────────────────────────
  const [mobileCategory, setMobileCategory] = useState<ArtifactCategory>(activeCategory)
  useEffect(() => { setMobileCategory(activeCategory) }, [activeCategory])

  // ── Active sync jobs badge ────────────────────────────────────────────────
  const activeSyncCount = syncJobs.filter((j) => j.status === 'syncing' || j.status === 'queued').length
  const showArtifactsAside = !discoverMode && activeCategory !== 'snapshots' && ((detailOpen && selectedItem !== null) || syncDrawerOpen)
  const discoverInitialTab = DISCOVER_TAB_BY_CATEGORY[activeCategory]
  const selectedNodeLabel = nodes.find((node) => node.nodeId === selectedNodeId)?.hostname ?? 'this node'
  const { primaryNavItems, utilityNavItems } = useMemo(() => {
    const items: UnifiedWorkspaceSideNavItem[] = CATEGORIES.map((item) => ({
      key: item.id,
      label: item.label,
      description: item.description,
      to: `/artifacts?category=${item.id}`,
      icon: item.icon,
      active: !discoverMode && item.id === activeCategory,
      onOpen: () => openCategoryRoute(item.id),
      meta: !discoverMode && item.id === activeCategory ? `${totalItems} items` : item.primaryAction,
    }))

    const utilities: UnifiedWorkspaceSideNavItem[] = [
      {
        key: 'discover',
        label: 'Download & Discover',
        description: 'Open the route-native intake workspace for plugin packs, models, impulse responses, and SoundFonts.',
        to: '/artifacts/discover',
        icon: CloudUpload,
        active: discoverMode,
        onOpen: openDiscoverRoute,
        meta: discoverMode ? 'Current route' : 'Intake',
        variant: 'utility',
      },
    ]

    return { primaryNavItems: items, utilityNavItems: utilities }
  }, [activeCategory, discoverMode, openCategoryRoute, openDiscoverRoute, totalItems])

  const artifactsContent = (
    <>
      <div className="aap__header">
        <div className="aap__header-left">
          <div className="aap__header-icon" aria-hidden="true">
            <Catalog size={32} />
          </div>
          <div>
            <h1 className="aap__title">Audio Artifacts</h1>
            <p className="aap__subtitle">
              {discoverMode
                ? 'Route-native discovery for plugin packs, models, impulse responses, and SoundFonts.'
                : isClusterMode
                  ? `${CATEGORIES.length} artifact types · node-aware · ${nodes.length} nodes`
                  : `${CATEGORIES.length} artifact types — plugins, models, IRs, and instruments`}
            </p>
          </div>
        </div>
        <div className="aap__header-actions">
          {discoverMode ? (
            <Button kind="tertiary" size="sm" renderIcon={ChevronRight} onClick={closeDiscoverRoute}>
              Return to library
            </Button>
          ) : (
            <>
              {activeSyncCount > 0 ? (
                <Button
                  kind="tertiary"
                  size="sm"
                  renderIcon={Network_4}
                  onClick={() => setSyncDrawerOpen(true)}
                >
                  Sync queue ({activeSyncCount})
                </Button>
              ) : (
                <Button
                  kind="ghost"
                  size="sm"
                  renderIcon={FolderDetails}
                  onClick={() => setSyncDrawerOpen((prev) => !prev)}
                >
                  Sync queue
                </Button>
              )}
              <Button
                kind="secondary"
                size="sm"
                renderIcon={CloudUpload}
                onClick={openDiscoverRoute}
              >
                Download &amp; Discover
              </Button>
              <Button
                kind="primary"
                size="sm"
                renderIcon={Upload}
                onClick={() => {
                  if (activeCategory === 'snapshots') {
                    pushToast('info', 'Use the Snapshots workspace actions', 'Create and import actions are available inside the Snapshots category.')
                    return
                  }
                  setUploadModalOpen(true)
                }}
              >
                {activeCategory === 'snapshots' ? 'Workspace actions' : 'Upload'}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="aap__mobile-nav">
        <Select
          id="aap-mobile-category"
          labelText="Category"
          value={mobileCategory}
          onChange={(e) => openCategoryRoute(e.target.value as ArtifactCategory)}
        >
          {CATEGORIES.map((c) => (
            <SelectItem key={c.id} value={c.id} text={c.label} />
          ))}
        </Select>
        <Button
          kind={discoverMode ? 'tertiary' : 'secondary'}
          size="sm"
          renderIcon={discoverMode ? ChevronRight : CloudUpload}
          onClick={discoverMode ? closeDiscoverRoute : openDiscoverRoute}
        >
          {discoverMode ? 'Return to library' : 'Download & Discover'}
        </Button>
      </div>

      {discoverMode ? (
        <ArtifactDownloadModal
          surface="embedded"
          onClose={closeDiscoverRoute}
          nodeId={detailNodeId}
          initialTab={discoverInitialTab}
        />
      ) : (
        <>
          <div className="aap__category-header">
            <div className="aap__category-header-left">
              <h2 className="aap__category-title">{category.label}</h2>
              <p className="aap__category-desc">{category.description}</p>
            </div>
            <div className="aap__category-header-right">
              <Tag type="cool-gray">{selectedNodeLabel}</Tag>
              <Tag type="cool-gray">{totalItems} items</Tag>
              <Button
                kind="ghost"
                size="sm"
                renderIcon={Renew}
                iconDescription="Refresh"
                hasIconOnly
                onClick={() => {
                  void queryClient.invalidateQueries({ queryKey: ['ir'] })
                  void queryClient.invalidateQueries({ queryKey: ['nam'] })
                  void queryClient.invalidateQueries({ queryKey: ['plugins'] })
                  void queryClient.invalidateQueries({ queryKey: ['soundfonts'] })
                }}
              />
            </div>
          </div>

          {activeCategory === 'snapshots' ? (
            <SnapshotArtifactsWorkspace
              searchQuery={searchQuery}
              onSearchQueryChange={(value) => updateParams({ q: value || null, page: '1' })}
              isClusterMode={isClusterMode}
              nodes={nodes}
              localNodeId={localNodeId}
              onToast={pushToast}
            />
          ) : isLoading ? (
            <Tile className="aap__table-tile">
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      {category.columns.map((col) => (
                        <TableHeader key={col.key}>{col.header}</TableHeader>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    <SkeletonRows columns={category.columns.length} />
                  </TableBody>
                </Table>
              </TableContainer>
            </Tile>
          ) : allRows.length === 0 ? (
            <ArtifactEmptyState
              category={category}
              onUpload={() => setUploadModalOpen(true)}
              isClusterMode={isClusterMode}
              onBrowseNodes={() => {
                const firstRemote = nodes.find((n) => !n.isLocal)
                if (firstRemote) updateParams({ node: firstRemote.nodeId })
              }}
              onOpenDownload={openDiscoverRoute}
              onScan={handleScan}
              isScanning={isScanning}
            />
          ) : (
            <Tile className="aap__table-tile">
              <DataTable
                rows={tableRows}
                headers={category.columns}
                isSortable
                useZebraStyles
              >
                {({
                  rows,
                  headers,
                  getHeaderProps,
                  getRowProps,
                  getTableProps,
                  getTableContainerProps,
                  getToolbarProps,
                }) => (
                  <TableContainer
                    {...getTableContainerProps()}
                    className="aap__table-container"
                  >
                    <TableToolbar {...getToolbarProps()}>
                      <TableToolbarContent>
                        <TableToolbarSearch
                          persistent
                          value={searchQuery}
                          onChange={(_e, val) => updateParams({ q: val || null, page: '1' })}
                          placeholder={`Search ${category.label}…`}
                        />
                      </TableToolbarContent>
                    </TableToolbar>
                    <Table {...getTableProps()} aria-label={`${category.label} table`}>
                      <TableHead>
                        <TableRow>
                          {headers.map((header) => {
                            const { key: _k, ...hProps } = getHeaderProps({ header })
                            return (
                              <TableHeader key={header.key} {...hProps}>
                                {header.header}
                              </TableHeader>
                            )
                          })}
                          <TableHeader>Actions</TableHeader>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {rows.map((row) => {
                          const artifactRow = filteredRows.find((r) => r.id === row.id)
                          if (!artifactRow) return null
                          const { key: _k, ...rowProps } = getRowProps({ row })
                          const isSelected = selectedItem?.id === row.id
                          return (
                            <TableRow
                              key={row.id}
                              {...rowProps}
                              className={`aap__table-row${isSelected ? ' aap__table-row--selected' : ''}`}
                              onClick={() => {
                                setSelectedItem(artifactRow)
                                setDetailOpen(true)
                              }}
                            >
                              {row.cells.map((cell) => {
                                if (cell.info.header === 'status') {
                                  return (
                                    <TableCell key={cell.id}>
                                      <Tag type={category.statusType(artifactRow)}>
                                        {category.statusLabel(artifactRow)}
                                      </Tag>
                                    </TableCell>
                                  )
                                }
                                if (cell.info.header === 'format') {
                                  return (
                                    <TableCell key={cell.id}>
                                      <Tag type="blue">{String(cell.value)}</Tag>
                                    </TableCell>
                                  )
                                }
                                if (cell.info.header === 'node') {
                                  const isLocal = nodes.find((n) => n.hostname === String(cell.value))?.isLocal
                                  return (
                                    <TableCell key={cell.id}>
                                      <Tag type={isLocal ? 'green' : 'teal'} size="sm">
                                        {String(cell.value)}
                                      </Tag>
                                    </TableCell>
                                  )
                                }
                                return <TableCell key={cell.id}>{String(cell.value ?? '—')}</TableCell>
                              })}
                              <TableCell>
                                <Button
                                  kind="ghost"
                                  size="sm"
                                  renderIcon={ChevronRight}
                                  iconDescription="View details"
                                  hasIconOnly
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setSelectedItem(artifactRow)
                                    setDetailOpen(true)
                                  }}
                                />
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </DataTable>

              {totalItems > pageSize ? (
                <Pagination
                  totalItems={totalItems}
                  pageSize={pageSize}
                  pageSizes={PAGE_SIZE_OPTIONS}
                  page={currentPage}
                  onChange={({ page: p, pageSize: ps }) => {
                    updateParams({ page: String(p), pageSize: String(ps) })
                  }}
                  className="aap__pagination"
                />
              ) : null}
            </Tile>
          )}
        </>
      )}
    </>
  )

  const artifactsAside = showArtifactsAside ? (
    <>
      <ArtifactDetailPanel
        open={detailOpen}
        item={selectedItem}
        category={category}
        onClose={() => { setDetailOpen(false); setSelectedItem(null) }}
        onPrimaryAction={(item) => { void handlePrimaryAction(item) }}
        onPushToNode={(item, nodeId) => enqueueSyncJob(item, 'push', nodeId)}
        onPullFromNode={(item, nodeId) => enqueueSyncJob(item, 'pull', nodeId)}
        onDelete={(item) => { setDeleteConfirmItem(item); setDetailOpen(false) }}
        nodes={nodes}
        localNodeId={localNodeId}
        primaryActionPending={primaryActionPending}
      />

      <SyncQueueDrawer
        open={syncDrawerOpen}
        onClose={() => setSyncDrawerOpen(false)}
        jobs={syncJobs}
        onDismissJob={(id) => setSyncJobs((prev) => prev.filter((j) => j.id !== id))}
      />
    </>
  ) : undefined

  return (
    <section className="aap">
      <Layer className="aap__surface">
        <WorkspacePageTemplate
          className="aap__template"
          windowClassName={`aap__body${showArtifactsAside ? ' aap__body--with-aside' : ''}${discoverMode ? ' aap__body--discover' : ''}`}
          sidebarClassName={`aap__sidenav${navAnimated ? ' aap__sidenav--visible' : ''}`}
          contentClassName={`aap__content${tableAnimated ? ' aap__content--visible' : ''}`}
          asideClassName="aap__aside"
          sidebar={(
            <UnifiedWorkspaceSideNav
              ariaLabel="Artifact categories"
              className="aap__carbon-sidenav"
              eyebrow="Navigation"
              title="Artifacts Library"
              description="Move between intake and node-aware artifact families from one rail while keeping the working table and detail context in place."
              items={primaryNavItems}
              footerTitle="Utilities"
              footerItems={utilityNavItems}
              footer={(
                <>
                  <div className="aap__sidebar-stats" aria-label="Artifacts workspace status">
                    <div className="aap__sidebar-stat">
                      <span>Current node</span>
                      <strong>{selectedNodeLabel}</strong>
                    </div>
                    <div className="aap__sidebar-stat">
                      <span>Items in view</span>
                      <strong>{discoverMode ? 'Discovery' : totalItems}</strong>
                    </div>
                    <div className="aap__sidebar-stat">
                      <span>Sync queue</span>
                      <strong>{activeSyncCount > 0 ? `${activeSyncCount} active` : 'Idle'}</strong>
                    </div>
                  </div>

                  <div className="aap__sidebar-note">
                    <p>Cluster-aware library, discovery, and inline detail workflows stay in the routed workspace rather than breaking into a separate product shell.</p>
                  </div>
                </>
              )}
            />
          )}
          content={artifactsContent}
          aside={artifactsAside}
        />
      </Layer>

      {/* Upload modal */}
      <Modal
        open={uploadModalOpen}
        modalHeading={`Upload ${category.label}`}
        primaryButtonText="Upload"
        secondaryButtonText="Cancel"
        onRequestClose={() => setUploadModalOpen(false)}
        onRequestSubmit={() => {
          if (pendingUploadFile) {
            const dt = new DataTransfer()
            dt.items.add(pendingUploadFile)
            void handleUploadFiles(dt.files)
          }
        }}
        primaryButtonDisabled={!pendingUploadFile}
        className="aap-upload-modal"
      >
        <p className="aap-upload-modal__desc">{category.description}</p>
        <FileUploader
          labelTitle={`Select ${category.shortLabel} file`}
          labelDescription="Drag and drop a file here, or click to browse"
          buttonLabel="Browse files"
          accept={
            activeCategory === 'cabinet-irs' || activeCategory === 'reverb-irs'
              ? ['.wav', '.flac']
              : activeCategory === 'nam-models'
                ? ['.nam']
                : activeCategory === 'soundfonts'
                  ? ['.sf2', '.sfz']
                  : []
          }
          filenameStatus="edit"
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0] ?? null
            setPendingUploadFile(file)
          }}
        />
      </Modal>

      {/* Delete confirm modal */}
      <Modal
        danger
        open={deleteConfirmItem !== null}
        modalHeading="Delete artifact"
        primaryButtonText="Delete"
        secondaryButtonText="Cancel"
        onRequestClose={() => setDeleteConfirmItem(null)}
        onRequestSubmit={async () => {
          if (!deleteConfirmItem) return
          try {
            if (activeCategory === 'lv2-plugins' || activeCategory === 'native-juce') {
              await pluginsApi.delete(deleteConfirmItem.id, detailNodeId)
              void queryClient.invalidateQueries({ queryKey: ['plugins'] })
            }
            pushToast('success', `${deleteConfirmItem.name as string} deleted`)
          } catch (e: unknown) {
            pushToast('error', 'Delete failed', e instanceof Error ? e.message : 'Unknown error')
          }
          setDeleteConfirmItem(null)
        }}
      >
        {deleteConfirmItem ? (
          <p>
            Permanently delete <strong>{deleteConfirmItem.name as string}</strong> from{' '}
            {nodes.find((n) => n.nodeId === selectedNodeId)?.hostname ?? 'this node'}? This cannot be undone.
          </p>
        ) : null}
      </Modal>
    </section>
  )
}
