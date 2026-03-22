/**
 * PlatformModal — the full platform control-panel and workspace rendered as a
 * near-fullscreen modal overlay anchored below the nav bar.
 *
 * Used by:
 *   - AppShell  (via the Platform nav dropdown trigger)
 *   - PlatformShellPage  (deep-link compatibility: ?layer= / ?panel=)
 */
import {
  ChartColumn,
  Close,
  DataBase,
  Devices,
  Information,
  Network_3,
  PaintBrush,
  Screen,
  Share,
  SettingsAdjust,
  Terminal,
  type CarbonIconType,
} from '@carbon/icons-react'
import {
  ClickableTile,
  DataTable,
  InlineLoading,
  InlineNotification,
  Pagination,
  SkeletonPlaceholder,
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
} from '@carbon/react'
import { AnimatePresence, motion } from 'framer-motion'
import { lazy, startTransition, Suspense, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import '../../pages/PlatformShellPage.css'
import {
  MAX_PINNED_NAV_ITEMS,
  allPinnableNavigationItems,
  type HardwareInterfaceMenuItem,
  type ShellNavigationItem,
} from '../../data/advancedMenuItems'
import { platformPinnedItems, type PlatformPinnedNavItem, type StandalonePanel } from '../../data/platformMenuItems'
import { useSpecialSettings } from '../../hooks/useSpecialSettings'
import { MidiClusterNodeCard } from '../MidiCluster/MidiClusterNodeCard'
import { MidiClusterTopology } from '../MidiCluster/MidiClusterTopology'
import { LabsWorkspace } from './LabsWorkspace'
import {
  useMidiClusterConnections,
  useMidiClusterEndpoints,
  useMidiClusterNodes,
} from '../../hooks/useMidiCluster'
import { usePlatformShellData } from '../../hooks/usePlatformShellData'
import type {
  PlatformAlert,
  PlatformGridItem,
  PlatformHealth,
  PlatformLayerData,
  PlatformLayerId,
  PlatformNotification,
  PlatformTableValue,
} from '../../platform/model'
import { isPlatformLayerId } from '../../platform/model'
import {
  usePlatformActions,
  usePlatformActiveLayer,
  usePlatformAlerts,
  usePlatformAnimationState,
  usePlatformSummaryMetrics,
} from '../../stores/platformStore'

const HostMachinePage = lazy(() => import('../../pages/HostMachinePage').then(m => ({ default: m.HostMachinePage })))
const AudioEnginePage = lazy(() => import('../../pages/AudioEnginePage').then(m => ({ default: m.AudioEnginePage })))
const ThemePage       = lazy(() => import('../../pages/ThemePage').then(m => ({ default: m.ThemePage })))
const AboutPage       = lazy(() => import('../../pages/AboutPage').then(m => ({ default: m.AboutPage })))

// ── Types ────────────────────────────────────────────────────────────────────

const PAGE_SIZES = [5, 10, 20]
const PLATFORM_CONTROL_PANEL_ICON_SIZE = 45
const DEFAULT_PLATFORM_LAYER: PlatformLayerId = 'overview'

const LAYER_ICONS: Record<PlatformLayerId, CarbonIconType> = {
  overview: ChartColumn,
  'single-node': Devices,
  'avb-routing': Network_3,
  'midi-cluster': Share,
  'api-observatory': Terminal,
  'cluster-dashboard': DataBase,
}

const PLATFORM_CONTROL_PANEL_ITEMS = platformPinnedItems

const STANDALONE_META: Record<StandalonePanel, { label: string; eyebrow: string; icon: CarbonIconType }> = {
  'host-machine': { label: 'Host Machine',   eyebrow: 'Hardware', icon: Screen },
  'audio-engine': { label: 'Audio Engine',   eyebrow: 'System',   icon: Terminal },
  'theme':        { label: 'Theme',          eyebrow: 'Platform', icon: PaintBrush },
  'about':        { label: 'Platform Guide', eyebrow: 'System',   icon: Information },
}

type PinnableNavTarget = PlatformPinnedNavItem | ShellNavigationItem | HardwareInterfaceMenuItem

// ── Helpers ──────────────────────────────────────────────────────────────────

function healthTagType(health: PlatformHealth): 'green' | 'warm-gray' | 'red' | 'cool-gray' {
  switch (health) {
    case 'healthy':  return 'green'
    case 'warning':  return 'warm-gray'
    case 'critical': return 'red'
    case 'offline':  return 'cool-gray'
    default:         return 'cool-gray'
  }
}

function severityKind(s: PlatformNotification['severity']): 'info' | 'warning' | 'error' {
  if (s === 'critical' || s === 'error') return 'error'
  if (s === 'warning') return 'warning'
  return 'info'
}

function humanizeStatus(v: string) { return v.replace(/_/g, ' ') }

function cellMatchesStatus(v: string): PlatformHealth | null {
  const n = v.toLowerCase()
  if (['healthy', 'ok', 'running'].includes(n))    return 'healthy'
  if (['warning', 'warn', 'degraded'].includes(n)) return 'warning'
  if (['critical', 'error'].includes(n))           return 'critical'
  if (['offline', 'disabled'].includes(n))         return 'offline'
  return null
}

function renderCellValue(headerKey: string, value: PlatformTableValue) {
  const text = value === null ? 'n/a' : String(value)
  if (headerKey === 'status') {
    const h = cellMatchesStatus(text) ?? 'unknown'
    return <Tag type={healthTagType(h)}>{humanizeStatus(text)}</Tag>
  }
  if (headerKey === 'alerts') {
    return <span className={`platform-shell__table-alert${text === 'Clear' ? ' is-clear' : ''}`}>{text}</span>
  }
  return text
}

function SidebarNavigation({
  activeId,
  pinnedRouteSet,
  pinningDisabled,
  onOpenLayer,
  onOpenStandalone,
  onOpenLabs,
  onTogglePin,
}: {
  activeId: string | null
  pinnedRouteSet: Set<string>
  pinningDisabled: boolean
  onOpenLayer: (id: PlatformLayerId) => void
  onOpenStandalone: (id: StandalonePanel) => void
  onOpenLabs: () => void
  onTogglePin: (item: PlatformPinnedNavItem, checked: boolean) => void
}) {
  return (
    <aside className="platform-shell__sidebar" aria-label="Platforms and Labs navigation">
      <div className="platform-shell__sidebar-head">
        <p className="platform-shell__sidebar-eyebrow">Navigation</p>
        <h2 className="platform-shell__sidebar-title">Platforms and Labs</h2>
        <p className="platform-shell__sidebar-copy">
          Move across platform workspaces from one rail, then drop into Labs for the former Advanced launchers.
        </p>
      </div>

      <div className="platform-shell__sidebar-list" role="list">
        {PLATFORM_CONTROL_PANEL_ITEMS.map((item) => {
          const Icon = item.icon
          const targetId = item.target.layer ?? item.target.panel ?? null
          const isSelected = activeId === targetId
          const isPinned = pinnedRouteSet.has(item.to)
          const limitReached = !isPinned && pinnedRouteSet.size >= MAX_PINNED_NAV_ITEMS
          const pinDisabled = pinningDisabled || limitReached

          return (
            <article
              key={item.to}
              role="listitem"
              className={`platform-shell__nav-item${isSelected ? ' is-selected' : ''}`}
            >
              <button
                type="button"
                className="platform-shell__nav-item-main"
                onClick={() => {
                  if (item.target.layer) {
                    onOpenLayer(item.target.layer)
                    return
                  }
                  if (item.target.panel) {
                    onOpenStandalone(item.target.panel)
                  }
                }}
                aria-label={`Open ${item.label} workspace`}
              >
                <span className="platform-shell__nav-item-icon" aria-hidden>
                  <Icon size={20} />
                </span>
                <span className="platform-shell__nav-item-copy">
                  <span className="platform-shell__nav-item-label">{item.label}</span>
                  <span className="platform-shell__nav-item-desc">{item.description}</span>
                </span>
              </button>
              <button
                type="button"
                className={`platform-shell__nav-item-pin${isPinned ? ' is-pinned' : ''}`}
                onClick={() => onTogglePin(item, !isPinned)}
                aria-label={isPinned ? `Unpin ${item.label}` : `Pin ${item.label}`}
                title={
                  limitReached
                    ? `Maximum ${MAX_PINNED_NAV_ITEMS} pinned routes`
                    : isPinned
                      ? 'Unpin from navigation bar'
                      : 'Pin to navigation bar'
                }
                aria-pressed={isPinned}
                disabled={pinDisabled}
              >
                {isPinned ? 'PINNED' : 'PIN'}
              </button>
            </article>
          )
        })}
      </div>

      <div className="platform-shell__sidebar-footer">
        <button
          type="button"
          className={`platform-shell__nav-item platform-shell__nav-item--labs${activeId === 'labs' ? ' is-selected' : ''}`}
          onClick={onOpenLabs}
          aria-label="Open Labs workspace"
        >
          <span className="platform-shell__nav-item-main">
            <span className="platform-shell__nav-item-icon" aria-hidden>
              <SettingsAdjust size={20} />
            </span>
            <span className="platform-shell__nav-item-copy">
              <span className="platform-shell__nav-item-chip">Labs</span>
              <span className="platform-shell__nav-item-desc">
                Advanced and experimental launchers formerly grouped under the old Advanced menu.
              </span>
            </span>
          </span>
        </button>
      </div>
    </aside>
  )
}

// ── Control Panel Grid ───────────────────────────────────────────────────────

function ControlPanelGrid({
  activeId,
  pinnedRouteSet,
  onOpenLayer,
  onOpenStandalone,
  onTogglePin,
  pinningDisabled,
}: {
  activeId: string | null
  pinnedRouteSet: Set<string>
  onOpenLayer: (id: PlatformLayerId) => void
  onOpenStandalone: (id: StandalonePanel) => void
  onTogglePin: (item: PlatformPinnedNavItem, checked: boolean) => void
  pinningDisabled: boolean
}) {
  return (
    <div className="platform-shell__cp-panel" role="region" aria-label="Platform Control Panel">
      <h2 className="platform-shell__cp-title">Platform Control Panel</h2>
      <div className="platform-shell__cp-grid" role="list">
        {PLATFORM_CONTROL_PANEL_ITEMS.map((item) => {
          const Icon = item.icon
          const targetId = item.target.layer ?? item.target.panel ?? null
          const isSelected = activeId === targetId
          const isPinned = pinnedRouteSet.has(item.to)
          const limitReached = !isPinned && pinnedRouteSet.size >= MAX_PINNED_NAV_ITEMS
          const pinDisabled = pinningDisabled || limitReached

          return (
            <article
              key={item.to}
              role="listitem"
              className={`platform-shell__cp-item${isSelected ? ' is-selected' : ''}`}
            >
              <button
                type="button"
                className={`platform-shell__cp-pin-btn${isPinned ? ' is-pinned' : ''}`}
                onClick={() => onTogglePin(item, !isPinned)}
                aria-label={isPinned ? `Unpin ${item.label}` : `Pin ${item.label}`}
                title={
                  limitReached
                    ? `Maximum ${MAX_PINNED_NAV_ITEMS} pinned routes`
                    : isPinned
                      ? 'Unpin from navigation bar'
                      : 'Pin to navigation bar'
                }
                aria-pressed={isPinned}
                disabled={pinDisabled}
              >
                {isPinned ? 'PINNED' : 'PIN'}
              </button>
              <button
                type="button"
                className="platform-shell__cp-item-open"
                onClick={() => {
                  if (item.target.layer) {
                    onOpenLayer(item.target.layer)
                    return
                  }
                  if (item.target.panel) {
                    onOpenStandalone(item.target.panel)
                  }
                }}
                aria-label={item.label}
              >
                <span className="platform-shell__cp-icon" aria-hidden><Icon size={PLATFORM_CONTROL_PANEL_ICON_SIZE} /></span>
                <span className="platform-shell__cp-label">{item.label}</span>
              </button>
            </article>
          )
        })}
      </div>
    </div>
  )
}

// ── Notification Strip ───────────────────────────────────────────────────────

function NotificationStrip({ alerts, onDismiss }: { alerts: PlatformAlert[]; onDismiss: (id: string) => void }) {
  if (!alerts.length) return null
  return (
    <section className="platform-shell__notification-strip" aria-label="Layer notifications">
      {alerts.map((a) => (
        <InlineNotification key={a.id} kind={severityKind(a.severity)} lowContrast
          title={a.title} subtitle={a.subtitle} onCloseButtonClick={() => onDismiss(a.id)} />
      ))}
    </section>
  )
}

// ── Summary Tiles ────────────────────────────────────────────────────────────

function LayerSummaryTiles({ items }: { items: PlatformGridItem[] }) {
  const [activeTileId, setActiveTileId] = useState<string | null>(items[0]?.id ?? null)
  useEffect(() => { setActiveTileId(items[0]?.id ?? null) }, [items])
  return (
    <section className="platform-shell__summary-tiles" aria-label="Layer summary tiles">
      {items.map((item) => (
        <ClickableTile key={item.id}
          className={`platform-shell__summary-tile${activeTileId === item.id ? ' is-active' : ''}`}
          onClick={() => setActiveTileId(item.id)}
        >
          <div className="platform-shell__summary-tile-head">
            <p>{item.eyebrow}</p>
            <Tag type={healthTagType(item.status)}>{humanizeStatus(item.status)}</Tag>
          </div>
          <strong>{item.metric}</strong>
          <span>{item.title}</span>
          <small>{item.helper}</small>
          {item.alertCount ? <em>{item.alertCount} alert{item.alertCount === 1 ? '' : 's'}</em> : null}
        </ClickableTile>
      ))}
    </section>
  )
}

// ── Data Table ───────────────────────────────────────────────────────────────

function LayerDataTable({ layer, onRowSelect, selectedRowId }: {
  layer: PlatformLayerData
  onRowSelect?: (rowId: string) => void
  selectedRowId?: string | null
}) {
  const [searchValue, setSearchValue] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZES[1])
  const deferredSearch = useDeferredValue(searchValue)
  const interactive = typeof onRowSelect === 'function'

  useEffect(() => { setSearchValue(''); setPage(1); setPageSize(PAGE_SIZES[1]) }, [layer.id])

  const filteredRows = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase()
    if (!needle) return layer.tableRows
    return layer.tableRows.filter((row) =>
      Object.entries(row).some(([k, v]) => k !== 'id' && String(v ?? '').toLowerCase().includes(needle)),
    )
  }, [deferredSearch, layer.tableRows])

  const visibleRows = filteredRows.slice((page - 1) * pageSize, page * pageSize)

  if (layer.isLoading && !layer.tableRows.length) {
    return <div className="platform-shell__table-state"><InlineLoading description={`Loading ${layer.label} data`} status="active" /></div>
  }
  if (layer.error && !layer.tableRows.length) {
    return <InlineNotification kind="error" lowContrast hideCloseButton title={`${layer.label} unavailable`} subtitle={layer.error} />
  }

  return (
    <div className="platform-shell__table-block">
      <DataTable rows={visibleRows} headers={layer.tableColumns} isSortable useZebraStyles>
        {({ rows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps, getToolbarProps }) => (
          <TableContainer {...getTableContainerProps()}
            title={layer.tableTitle}
            description={interactive ? `${layer.tableDescription} Select a row to inspect more detail.` : layer.tableDescription}
            className="platform-shell__table-container"
          >
            <TableToolbar {...getToolbarProps()}>
              <TableToolbarContent className="platform-shell__table-toolbar">
                <TableToolbarSearch persistent value={searchValue}
                  onChange={(_e, v) => { setSearchValue(v ?? ''); setPage(1) }} />
                <Tag type="cool-gray">{filteredRows.length} rows</Tag>
                <Tag type="cool-gray">{pageSize}/page</Tag>
              </TableToolbarContent>
            </TableToolbar>
            <Table {...getTableProps()} aria-label={`${layer.label} table`}>
              <TableHead>
                <TableRow>
                  {headers.map((h) => {
                    const { key: _k, ...hp } = getHeaderProps({ header: h })
                    return <TableHeader key={h.key} {...hp}>{h.header}</TableHeader>
                  })}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => {
                  const { key: _k, ...rp } = getRowProps({ row })
                  const isSel = selectedRowId === row.id
                  return (
                    <TableRow key={row.id} {...rp}
                      className={`platform-shell__table-row${interactive ? ' is-interactive' : ''}${isSel ? ' is-selected' : ''}`}
                      onClick={interactive ? () => onRowSelect?.(row.id) : undefined}
                      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowSelect?.(row.id) } } : undefined}
                      tabIndex={interactive ? 0 : undefined}
                      aria-selected={interactive ? isSel : undefined}
                    >
                      {row.cells.map((cell) => (
                        <TableCell key={cell.id}>{renderCellValue(cell.info.header, cell.value as PlatformTableValue)}</TableCell>
                      ))}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataTable>
      <Pagination page={page} pageSize={pageSize} pageSizes={PAGE_SIZES} totalItems={filteredRows.length} size="sm"
        onChange={({ page: p, pageSize: ps }) => { setPage(p); setPageSize(ps) }} />
    </div>
  )
}

// ── Cluster Dashboard ────────────────────────────────────────────────────────

function ClusterDashboardWorkspace({ layer }: { layer: PlatformLayerData }) {
  return (
    <div className="platform-shell__cluster-tabs">
      <div className="platform-shell__cluster-tab-panel">
        <LayerSummaryTiles items={layer.gridItems} />
        <LayerDataTable layer={layer} />
      </div>
    </div>
  )
}

// ── MIDI Node Detail ─────────────────────────────────────────────────────────

function MidiClusterNodeDetail({ selectedEndpointId }: { selectedEndpointId: string | null }) {
  const midiNodesQuery = useMidiClusterNodes()
  const midiConnectionsQuery = useMidiClusterConnections()
  const midiEndpointsQuery = useMidiClusterEndpoints()

  const midiNodes = midiNodesQuery.data ?? []
  const midiConnections = midiConnectionsQuery.data ?? []
  const midiEndpoints = midiEndpointsQuery.data ?? []
  const selectedEndpoint = midiEndpoints.find((ep) => ep.endpoint_id === selectedEndpointId) ?? null
  const selectedNode = midiNodes.find((n) => n.node_id === selectedEndpoint?.node_id) ?? null
  const nodeNameById = useMemo(() => new Map(midiNodes.map((n) => [n.node_id, n.hostname])), [midiNodes])
  const selectedConnections = useMemo(() => {
    if (!selectedNode) return []
    return midiConnections.filter((c) => c.source.node_id === selectedNode.node_id || c.destination.node_id === selectedNode.node_id)
  }, [midiConnections, selectedNode])

  if (!selectedEndpointId) {
    return (
      <section className="platform-shell__detail-empty" aria-label="MIDI node detail hint">
        <h3>Node Detail</h3>
        <p>Select a MIDI endpoint row above to inspect the owning cluster node and its active routes.</p>
      </section>
    )
  }
  if ((midiNodesQuery.isLoading && !midiNodes.length) || (midiConnectionsQuery.isLoading && !midiConnections.length)) {
    return (
      <section className="platform-shell__midi-node-detail">
        <SkeletonText heading paragraph lineCount={2} />
        <div className="platform-shell__midi-detail-grid">
          <SkeletonPlaceholder className="platform-shell__midi-detail-card" />
          <SkeletonPlaceholder className="platform-shell__midi-detail-card platform-shell__midi-detail-card--wide" />
        </div>
      </section>
    )
  }
  if (!selectedEndpoint || !selectedNode) {
    return <InlineNotification kind="warning" lowContrast hideCloseButton title="MIDI node detail unavailable" subtitle="The selected endpoint no longer maps to a discovered MIDI cluster node." />
  }

  return (
    <section className="platform-shell__midi-node-detail">
      <div className="platform-shell__detail-head">
        <div>
          <h3>Node Detail</h3>
          <p>{selectedNode.hostname} owns {selectedEndpoint.device_name} / {selectedEndpoint.port_name}.</p>
        </div>
        <div className="platform-shell__nodes-tags">
          <Tag type={selectedNode.online ? 'green' : 'red'}>{selectedNode.online ? 'online' : 'offline'}</Tag>
          <Tag type="cool-gray">{selectedConnections.length} connection{selectedConnections.length === 1 ? '' : 's'}</Tag>
        </div>
      </div>
      <div className="platform-shell__midi-detail-grid">
        <MidiClusterNodeCard node={selectedNode} connections={selectedConnections.map((c) => c.connection_id)} onSelect={() => undefined} />
        <MidiClusterTopology nodes={midiNodes} connections={midiConnections} />
      </div>
      <div className="platform-shell__detail-list" aria-label="Selected MIDI node routes">
        {selectedConnections.length === 0 ? (
          <p className="platform-shell__detail-empty-copy">No active cluster routes currently involve this node.</p>
        ) : selectedConnections.map((c) => (
          <div key={c.connection_id} className="platform-shell__detail-row">
            <strong>{nodeNameById.get(c.source.node_id) ?? c.source.node_id}{' -> '}{nodeNameById.get(c.destination.node_id) ?? c.destination.node_id}</strong>
            <span>{c.transport} · {c.state}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Standalone Workspace ─────────────────────────────────────────────────────

function StandaloneWorkspace({ panel }: { panel: StandalonePanel }) {
  const { label, eyebrow, icon: Icon } = STANDALONE_META[panel]
  return (
    <motion.section key={panel} className="platform-shell__workspace"
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      <div className="platform-shell__ws-header">
        <span className="platform-shell__ws-header-icon" aria-hidden><Icon size={20} /></span>
        <div className="platform-shell__ws-header-copy">
          <span className="platform-shell__ws-header-eyebrow">{eyebrow}</span>
          <h2 className="platform-shell__ws-header-title">{label}</h2>
        </div>
      </div>
      <Suspense fallback={<div className="platform-shell__table-state"><span>Loading…</span></div>}>
        {panel === 'host-machine' && <HostMachinePage />}
        {panel === 'audio-engine' && <AudioEnginePage />}
        {panel === 'theme'        && <ThemePage />}
        {panel === 'about'        && <AboutPage />}
      </Suspense>
    </motion.section>
  )
}

// ── Layer Workspace ──────────────────────────────────────────────────────────

function LayerWorkspace({ layer, alerts, onDismissAlert }: {
  layer: PlatformLayerData
  alerts: PlatformAlert[]
  onDismissAlert: (id: string) => void
}) {
  const Icon = LAYER_ICONS[layer.id]
  const [selectedMidiRowId, setSelectedMidiRowId] = useState<string | null>(null)
  const isClusterLayer = layer.id === 'cluster-dashboard'
  const isMidiLayer = layer.id === 'midi-cluster'

  useEffect(() => { setSelectedMidiRowId(null) }, [layer.id])
  useEffect(() => {
    if (!isMidiLayer || !selectedMidiRowId) return
    if (!layer.tableRows.some((r) => r.id === selectedMidiRowId)) setSelectedMidiRowId(null)
  }, [isMidiLayer, layer.tableRows, selectedMidiRowId])

  return (
    <motion.section key={layer.id} className="platform-shell__workspace"
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      <div className="platform-shell__ws-header">
        <span className="platform-shell__ws-header-icon" aria-hidden><Icon size={20} /></span>
        <div className="platform-shell__ws-header-copy">
          <span className="platform-shell__ws-header-eyebrow">{layer.shortLabel}</span>
          <h2 className="platform-shell__ws-header-title">{layer.label}</h2>
        </div>
      </div>
      <NotificationStrip alerts={alerts} onDismiss={onDismissAlert} />
      {layer.error && layer.tableRows.length > 0 && (
        <InlineNotification kind="warning" lowContrast hideCloseButton
          title={`${layer.label} loaded with gaps`} subtitle={layer.error} />
      )}
      {isClusterLayer ? (
        <ClusterDashboardWorkspace layer={layer} />
      ) : (
        <>
          <LayerSummaryTiles items={layer.gridItems} />
          <LayerDataTable layer={layer} onRowSelect={isMidiLayer ? setSelectedMidiRowId : undefined} selectedRowId={selectedMidiRowId} />
          {isMidiLayer && <MidiClusterNodeDetail selectedEndpointId={selectedMidiRowId} />}
        </>
      )}
    </motion.section>
  )
}

// ── Platform Modal Body ──────────────────────────────────────────────────────
// The scrollable content inside the modal. Shared by both AppShell modal and
// the standalone /platform page deep-link path.

export interface PlatformModalContentProps {
  /** Initial layer to open (from URL deep-link). Pass null for the grid. */
  initialLayer?: PlatformLayerId | null
  /** Initial standalone panel to open (from URL deep-link). */
  initialPanel?: StandalonePanel | null
  /** Open the Labs workspace as the initial routed destination. */
  initialLabs?: boolean
  /** Called when the user navigates to a layer/panel (for URL sync). */
  onNavigate?: (params: { layer?: PlatformLayerId; panel?: StandalonePanel } | null) => void
  /** Called when the user launches a Labs route from the unified modal host. */
  onLaunchRoute?: (to: string) => void
  /** Called when user clicks the × close button. */
  onClose: () => void
}

export function PlatformModalContent({
  initialLayer,
  initialPanel,
  initialLabs = false,
  onNavigate,
  onLaunchRoute,
  onClose,
}: PlatformModalContentProps) {
  const navigate = useNavigate()
  const { settings: specialSettings, isLoading: specialSettingsLoading, updateSettings } = useSpecialSettings()
  const { layers, layerHealth: nextLayerHealth, summaryMetrics: nextSummaryMetrics, alerts: nextAlerts } = usePlatformShellData()
  const activeLayerId = usePlatformActiveLayer()
  const alerts = usePlatformAlerts()
  const animationState = usePlatformAnimationState()
  const { openLayer, closeLayer, clearAnimation, setAlerts, setLayerHealth, setSummaryMetrics, dismissAlert } = usePlatformActions()
  const _summaryMetrics = usePlatformSummaryMetrics()

  const [activePanel, setActivePanel] = useState<StandalonePanel | null>(initialPanel ?? null)
  const [activeLabs, setActiveLabs] = useState(false)
  const pinnedRoutes = useMemo(() => specialSettings?.pinnedRoutes ?? [], [specialSettings?.pinnedRoutes])
  const pinnedRouteSet = useMemo(() => new Set(pinnedRoutes), [pinnedRoutes])

  // Sync live data into store
  useEffect(() => {
    setLayerHealth(nextLayerHealth)
    setSummaryMetrics(nextSummaryMetrics)
    setAlerts(nextAlerts)
  }, [nextAlerts, nextLayerHealth, nextSummaryMetrics, setAlerts, setLayerHealth, setSummaryMetrics])

  useEffect(() => {
    if (initialLabs) {
      startTransition(() => closeLayer())
      setActivePanel(null)
      setActiveLabs(true)
      return
    }

    if (initialPanel) {
      setActiveLabs(false)
      setActivePanel(initialPanel)
      startTransition(() => closeLayer())
      return
    }

    if (initialLayer && isPlatformLayerId(initialLayer)) {
      setActiveLabs(false)
      setActivePanel(null)
      startTransition(() => openLayer(initialLayer))
      return
    }

    if (!activeLabs && activePanel === null && activeLayerId === null) {
      startTransition(() => openLayer(DEFAULT_PLATFORM_LAYER))
    }
  }, [activeLabs, activeLayerId, activePanel, closeLayer, initialLabs, initialLayer, initialPanel, openLayer])

  // Animation cleanup
  useEffect(() => {
    if (!animationState.expandingLayer && !animationState.collapsingLayer) return
    const t = window.setTimeout(() => clearAnimation(), 420)
    return () => window.clearTimeout(t)
  }, [animationState, clearAnimation])

  const activeLayer = useMemo(
    () => layers.find((l) => l.id === activeLayerId) ?? null,
    [activeLayerId, layers],
  )

  const visibleAlerts = useMemo(() => {
    if (!activeLayer) return alerts
    return alerts.filter((a) => a.layerId === activeLayer.id)
  }, [activeLayer, alerts])

  const togglePinnedRoute = async (item: PinnableNavTarget, checked: boolean) => {
    if (!checked) {
      await updateSettings({ pinnedRoutes: pinnedRoutes.filter((route) => route !== item.to) })
      return
    }

    if (!pinnedRouteSet.has(item.to) && pinnedRoutes.length >= MAX_PINNED_NAV_ITEMS) {
      return
    }

    const candidateSet = new Set([...pinnedRoutes, item.to])
    const nextRoutes = allPinnableNavigationItems
      .filter((candidate) => candidate.to !== '/' && candidateSet.has(candidate.to))
      .map((candidate) => candidate.to)
      .slice(0, MAX_PINNED_NAV_ITEMS)

    await updateSettings({ pinnedRoutes: nextRoutes })
  }

  const handleOpenLayer = (layerId: PlatformLayerId) => {
    setActiveLabs(false)
    setActivePanel(null)
    startTransition(() => openLayer(layerId))
    onNavigate?.({ layer: layerId })
  }

  const handleOpenStandalone = (panel: StandalonePanel) => {
    setActiveLabs(false)
    startTransition(() => closeLayer())
    setActivePanel(panel)
    onNavigate?.({ panel })
  }

  const handleOpenLabs = () => {
    startTransition(() => closeLayer())
    setActivePanel(null)
    setActiveLabs(true)
    onNavigate?.(null)
  }

  const handleLaunchRoute = (to: string) => {
    if (onLaunchRoute) {
      onLaunchRoute(to)
      return
    }

    navigate(to)
    onClose()
  }

  const showStandalone = activePanel !== null
  const showLayer = !activeLabs && !showStandalone && activeLayer !== null
  const activeId = activeLabs ? 'labs' : (activePanel ?? activeLayerId)

  return (
    <div className="platform-modal__body platform-modal__body--expanded">
      <div className="platform-modal__header">
        <span className="platform-modal__header-title">Platforms and Labs</span>
        <button
          type="button"
          className="platform-modal__close"
          onClick={onClose}
          aria-label="Close Platforms and Labs window"
        >
          <Close size={20} aria-hidden />
        </button>
      </div>

      <div className="platform-modal__scroll">
        <div className="platform-shell-page">
          <div className="platform-shell__content">
            <div className="platform-shell__window">
              <SidebarNavigation
                activeId={activeId}
                pinnedRouteSet={pinnedRouteSet}
                onOpenLayer={handleOpenLayer}
                onOpenStandalone={handleOpenStandalone}
                onOpenLabs={handleOpenLabs}
                onTogglePin={(item, checked) => { void togglePinnedRoute(item, checked) }}
                pinningDisabled={specialSettingsLoading}
              />
              <div className="platform-shell__panel">
              <AnimatePresence mode="wait">
                {activeLabs && (
                  <LabsWorkspace
                    key="labs"
                    pinnedRouteSet={pinnedRouteSet}
                    pinningDisabled={specialSettingsLoading}
                    onTogglePin={(item, checked) => { void togglePinnedRoute(item, checked) }}
                    onLaunchRoute={handleLaunchRoute}
                  />
                )}
                {showStandalone && activePanel && (
                  <StandaloneWorkspace key={activePanel} panel={activePanel} />
                )}
                {showLayer && activeLayer && (
                  <LayerWorkspace key={activeLayer.id} layer={activeLayer} alerts={visibleAlerts} onDismissAlert={dismissAlert} />
                )}
                {!activeLabs && !showStandalone && !showLayer && (
                  <motion.section
                    key="platform-loading"
                    className="platform-shell__workspace platform-shell__workspace--empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.16, ease: 'easeOut' }}
                  >
                    <div className="platform-shell__table-state">
                      <InlineLoading description="Loading platform workspace" status="active" />
                    </div>
                  </motion.section>
                )}
              </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
