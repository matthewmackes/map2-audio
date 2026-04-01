/**
 * Shared Platforms/Labs workspace surface used by the routed `/platforms/*`
 * and `/labs` shells, with optional modal chrome retained for narrow legacy
 * host flows that still need an overlay wrapper.
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
  SettingsAdjust,
  Share,
  Terminal,
  type CarbonIconType,
} from '@carbon/icons-react'
import {
  Button,
  ClickableTile,
  ComposedModal,
  DataTable,
  InlineLoading,
  InlineNotification,
  ModalBody,
  ModalFooter,
  ModalHeader,
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

import './PlatformModal.css'
import {
  platformPanelItems,
  type StandalonePanel,
} from '../../data/platformMenuItems'
import { useSpecialSettings } from '../../hooks/useSpecialSettings'
import { MidiClusterNodeCard } from '../MidiCluster/MidiClusterNodeCard'
import { MidiClusterTopology } from '../MidiCluster/MidiClusterTopology'
import { UnifiedWorkspaceSideNav, type UnifiedWorkspaceSideNavItem } from '../navigation/UnifiedWorkspaceSideNav'
import { LabsWorkspace } from './LabsWorkspace'
import { PlatformLaunchersWorkspace } from './PlatformLaunchersWorkspace'
import {
  useMidiClusterConnections,
  useMidiClusterEndpoints,
  useMidiClusterNodes,
} from '../../hooks/useMidiCluster'
import {
  useNodeOperations,
  type HybridApplicationStatusInfo,
} from '../../hooks/useNodeOperations'
import { makePendingUpdateApplicationSteps } from '../../hooks/updateApplicationProgressModel'
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
const PlatformAdoptionPage = lazy(() => import('../../pages/PlatformAdoptionPage').then(m => ({ default: m.PlatformAdoptionPage })))

// ── Types ────────────────────────────────────────────────────────────────────

const PAGE_SIZES = [5, 10, 20]
const DEFAULT_PLATFORM_LAYER: PlatformLayerId = 'overview'

const LAYER_ICONS: Record<PlatformLayerId, CarbonIconType> = {
  overview: ChartColumn,
  'single-node': Devices,
  'avb-routing': Network_3,
  'midi-cluster': Share,
  'api-observatory': Terminal,
  'cluster-dashboard': DataBase,
}

const PLATFORM_CONTROL_PANEL_ITEMS = platformPanelItems

const STANDALONE_META: Record<StandalonePanel, { label: string; eyebrow: string; icon: CarbonIconType }> = {
  'host-machine': { label: 'Host Machine',   eyebrow: 'Hardware', icon: Screen },
  'audio-engine': { label: 'Audio Engine',   eyebrow: 'System',   icon: Terminal },
  'theme':        { label: 'Theme',          eyebrow: 'Platform', icon: PaintBrush },
  'about':        { label: 'Platform Guide', eyebrow: 'System',   icon: Information },
  'adoption':     { label: 'Adoption',       eyebrow: 'Platform', icon: Information },
  'launchers':    { label: 'Launchers',      eyebrow: 'Platform', icon: SettingsAdjust },
}

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

function updateProgressTagType(status: string): 'green' | 'warm-gray' | 'red' | 'cool-gray' | 'blue' {
  switch (status) {
    case 'completed':
      return 'green'
    case 'running':
      return 'blue'
    case 'failed':
      return 'red'
    case 'skipped':
      return 'warm-gray'
    default:
      return 'cool-gray'
  }
}

function updateProgressLabel(status: string): string {
  switch (status) {
    case 'running':
      return 'In Progress'
    case 'completed':
      return 'Completed'
    case 'failed':
      return 'Failed'
    case 'skipped':
      return 'Skipped'
    case 'idle':
      return 'Idle'
    default:
      return humanizeStatus(status)
  }
}

function formatIsoTimestamp(value?: string | null): string | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

function SidebarNavigation({
  activeId,
  onOpenLayer,
  onOpenStandalone,
  onOpenLabs,
}: {
  activeId: string | null
  onOpenLayer: (id: PlatformLayerId) => void
  onOpenStandalone: (id: StandalonePanel) => void
  onOpenLabs: () => void
}) {
  const items: UnifiedWorkspaceSideNavItem[] = PLATFORM_CONTROL_PANEL_ITEMS.map((item) => {
    const targetId = item.target.layer ?? item.target.panel ?? null
    const isSelected = activeId === targetId

    return {
      key: item.to,
      label: item.label,
      description: item.description,
      to: item.to,
      icon: item.icon,
      active: isSelected,
      onOpen: () => {
        if (item.target.layer) {
          onOpenLayer(item.target.layer)
          return
        }
        if (item.target.panel) {
          onOpenStandalone(item.target.panel)
        }
      },
    }
  })

  return (
    <UnifiedWorkspaceSideNav
      className="platform-shell__sidebar"
      ariaLabel="Platforms and Labs navigation"
      eyebrow="Navigation"
      title="Platforms and Labs"
      description="Move across platform workspaces from one rail, then drop into Labs for the former Advanced launchers."
      items={items}
      footer={(
        <button
          type="button"
          className={`platform-shell__nav-item platform-shell__nav-item--labs${activeId === 'labs' ? ' is-selected' : ''}`}
          onClick={onOpenLabs}
          aria-label="Open Labs workspace"
        >
          <span className="platform-shell__nav-item-main">
            <span className="platform-shell__nav-item-copy">
              <span className="platform-shell__nav-item-chip">Labs</span>
              <span className="platform-shell__nav-item-desc">
                Advanced and experimental launchers formerly grouped under the old Advanced menu.
              </span>
            </span>
          </span>
        </button>
      )}
    />
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
        {panel === 'adoption'     && <PlatformAdoptionPage />}
      </Suspense>
    </motion.section>
  )
}

// ── Single-Node Operations Panel ─────────────────────────────────────────────

function UpdateProgressModal({
  open,
  status,
  hybridVersion,
  launchError,
  onClose,
}: {
  open: boolean
  status: HybridApplicationStatusInfo | undefined
  hybridVersion: { version?: string; mode?: string; branch?: string; updated_at?: string } | undefined
  launchError: string | null
  onClose: () => void
}) {
  const steps = status?.steps?.length ? status.steps : makePendingUpdateApplicationSteps()
  const activeStepIndex = status?.current_step_index ?? steps.findIndex((step) => step.status === 'running')
  const activeStep = activeStepIndex >= 0 ? steps[activeStepIndex] : null
  const versionLabel = status?.current_version ?? hybridVersion?.version ?? 'pending'
  const modeLabel = status?.mode ?? hybridVersion?.mode ?? 'unknown'
  const branchLabel = hybridVersion?.branch
  const startedAt = formatIsoTimestamp(status?.started_at)
  const completedAt = formatIsoTimestamp(status?.completed_at)
  const progressError = launchError ?? status?.error ?? null

  return (
    <ComposedModal open={open} size="lg" onClose={onClose}>
      <ModalHeader
        title="Application Update Progress"
        label="Single Node"
        closeModal={onClose}
      />
      <ModalBody hasScrollingContent>
        <div className="platform-shell__update-progress-modal">
          <div className="platform-shell__update-progress-summary">
            <div className="platform-shell__update-progress-tags">
              <Tag type={updateProgressTagType(status?.status ?? 'idle')}>
                {updateProgressLabel(status?.status ?? 'idle')}
              </Tag>
              <Tag type="cool-gray">{modeLabel.toUpperCase()}</Tag>
              {branchLabel && <Tag type="cool-gray">{branchLabel}</Tag>}
            </div>
            <p className="platform-shell__update-progress-copy">
              The backend is answering 10 update questions one at a time so you can verify exactly what happens after clicking update.
            </p>
            <div className="platform-shell__update-progress-meta">
              <span>Current build: {versionLabel}</span>
              {startedAt && <span>Started: {startedAt}</span>}
              {completedAt && <span>Finished: {completedAt}</span>}
            </div>
          </div>

          {activeStep ? (
            <div className="platform-shell__update-progress-current">
              <span className="platform-shell__update-progress-current-eyebrow">
                Question {activeStepIndex + 1} of {steps.length}
              </span>
              <h4>{activeStep.question}</h4>
              <p>{activeStep.result ?? status?.message ?? activeStep.detail}</p>
            </div>
          ) : (
            <div className="platform-shell__update-progress-current">
              <span className="platform-shell__update-progress-current-eyebrow">
                {status?.status === 'completed' ? 'All 10 questions answered' : 'Waiting for update activity'}
              </span>
              <h4>{status?.status === 'failed' ? 'Update failed before completing the workflow' : 'Update workflow ready'}</h4>
              <p>{status?.message ?? 'Open the update flow to inspect each question as it is answered.'}</p>
            </div>
          )}

          {progressError && (
            <InlineNotification
              kind="error"
              lowContrast
              hideCloseButton
              title="Update error"
              subtitle={progressError}
            />
          )}

          <ol className="platform-shell__update-progress-steps">
            {steps.map((step, index) => {
              const isRunning = step.status === 'running'
              const isCompleted = step.status === 'completed'
              const isFailed = step.status === 'failed'
              const className = [
                'platform-shell__update-progress-step',
                isRunning ? 'is-running' : '',
                isCompleted ? 'is-completed' : '',
                isFailed ? 'is-failed' : '',
              ].filter(Boolean).join(' ')

              return (
                <li key={step.key} className={className}>
                  <div className="platform-shell__update-progress-step-index">{index + 1}</div>
                  <div className="platform-shell__update-progress-step-copy">
                    <div className="platform-shell__update-progress-step-title-row">
                      <strong>{step.question}</strong>
                      <Tag type={updateProgressTagType(step.status)}>{updateProgressLabel(step.status)}</Tag>
                    </div>
                    <p>{step.result ?? step.detail}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={onClose}>
          Close
        </Button>
      </ModalFooter>
    </ComposedModal>
  )
}

function SingleNodeOperations() {
  const ops = useNodeOperations()
  const [updateModalOpen, setUpdateModalOpen] = useState(false)
  const [updateLaunchError, setUpdateLaunchError] = useState<string | null>(null)

  const updateInProgress = Boolean(ops.applicationStatus?.running)
  const updateActionPending = ops.isUpdating && !updateInProgress
  const updateLabel = updateInProgress ? 'View Update Progress' : updateActionPending ? 'Updating…' : 'Check for Updates'
  const backupLabel = ops.isBackingUp ? 'Creating…' : 'Create Backup'
  const updateBranch = ops.hybridVersion?.branch ?? 'master'

  useEffect(() => {
    if (ops.applicationStatus?.running) {
      setUpdateModalOpen(true)
      setUpdateLaunchError(null)
    }
  }, [ops.applicationStatus?.running])

  const handleCheckForUpdates = () => {
    setUpdateModalOpen(true)
    setUpdateLaunchError(null)
    if (updateInProgress) return
    void ops.triggerUpdate({ branch: updateBranch }).catch((error: unknown) => {
      setUpdateLaunchError(error instanceof Error ? error.message : 'Failed to start update')
    })
  }

  return (
    <section className="platform-shell__node-operations" aria-label="Node operations">
      <div className="platform-shell__detail-head">
        <div>
          <h3>Node Operations</h3>
          <p>Version, deployment, update, backup, and remediation actions for this node.</p>
        </div>
        <div className="platform-shell__nodes-tags">
          {ops.version && (
            <Tag type={ops.version.dirty ? 'warm-gray' : 'green'}>
              v{ops.version.version?.slice(0, 8)}{ops.version.dirty ? '*' : ''}
            </Tag>
          )}
          {ops.deploymentMode && (
            <Tag type="cool-gray">{ops.deploymentMode.mode}</Tag>
          )}
          {(updateInProgress || updateActionPending) && (
            <Tag type="blue">Update in progress</Tag>
          )}
        </div>
      </div>

      <div className="platform-shell__node-ops-grid">
        {/* Update actions */}
        <div className="platform-shell__node-ops-group">
          <h4>Updates</h4>
          <div className="platform-shell__node-ops-actions">
            <Button
              kind="primary"
              size="sm"
              disabled={updateActionPending}
              onClick={handleCheckForUpdates}
            >
              {updateActionPending && <InlineLoading description="" />}
              {updateLabel}
            </Button>
            {ops.updateStatus?.status === 'in_progress' && (
              <Button
                kind="danger--ghost"
                size="sm"
                onClick={() => ops.abortUpdate()}
              >
                Abort Update
              </Button>
            )}
          </div>
          {ops.hybridVersion && (
            <p className="platform-shell__node-ops-detail">
              Mode: {ops.hybridVersion.mode} · {ops.hybridVersion.branch ?? ops.hybridVersion.version}
              {ops.hybridVersion.updated_at && ` · Updated ${new Date(ops.hybridVersion.updated_at).toLocaleDateString()}`}
            </p>
          )}
          {ops.applicationStatus && (
            <p className="platform-shell__node-ops-detail">
              {ops.applicationStatus.running && ops.applicationStatus.current_step_index !== null && ops.applicationStatus.current_step_index !== undefined
                ? `Question ${ops.applicationStatus.current_step_index + 1}/10 · ${ops.applicationStatus.message}`
                : ops.applicationStatus.message}
            </p>
          )}
        </div>

        {/* Backup actions */}
        <div className="platform-shell__node-ops-group">
          <h4>Backup &amp; Restore</h4>
          <div className="platform-shell__node-ops-actions">
            <Button
              kind="secondary"
              size="sm"
              disabled={ops.isBackingUp}
              onClick={() => ops.triggerBackup()}
            >
              {ops.isBackingUp && <InlineLoading description="" />}
              {backupLabel}
            </Button>
            {ops.backups.length > 0 && (
              <Button
                kind="ghost"
                size="sm"
                disabled={ops.isRestoring}
                onClick={() => ops.restoreBackup(ops.backups[0].backup_id)}
              >
                {ops.isRestoring ? 'Restoring…' : `Restore Latest (${new Date(ops.backups[0].created_at).toLocaleDateString()})`}
              </Button>
            )}
          </div>
          <p className="platform-shell__node-ops-detail">
            {ops.backupStatus?.total_backups ?? 0} snapshots
            {ops.backupStatus?.latest_backup_date && ` · Latest: ${new Date(ops.backupStatus.latest_backup_date).toLocaleDateString()}`}
          </p>
        </div>

        {/* Deployment mode actions */}
        <div className="platform-shell__node-ops-group">
          <h4>Deployment Mode</h4>
          <div className="platform-shell__node-ops-actions">
            {['ALL-IN-ONE', 'AUDIO-NODE', 'CONTROL-NODE', 'FRONTEND-ONLY'].map((mode) => (
              <Button
                key={mode}
                kind={ops.deploymentMode?.mode === mode ? 'primary' : 'ghost'}
                size="sm"
                disabled={ops.isSwitchingMode || ops.deploymentMode?.mode === mode}
                onClick={() => ops.switchDeploymentMode(mode)}
              >
                {mode.replace(/-/g, ' ')}
              </Button>
            ))}
          </div>
          {ops.deploymentStatus?.services && (
            <p className="platform-shell__node-ops-detail">
              {Object.entries(ops.deploymentStatus.services)
                .filter(([, v]) => v.status === 'running')
                .map(([k]) => k)
                .join(', ') || 'No services running'}
            </p>
          )}
        </div>

        {/* Health & Remediation */}
        <div className="platform-shell__node-ops-group">
          <h4>Health &amp; Remediation</h4>
          <div className="platform-shell__node-ops-actions">
            <Button
              kind="ghost"
              size="sm"
              disabled={ops.isRemediating}
              onClick={() => ops.triggerRemediation('RESTART_BACKEND')}
            >
              Restart Backend
            </Button>
            <Button
              kind="ghost"
              size="sm"
              disabled={ops.isRemediating}
              onClick={() => ops.triggerRemediation('RESTART_WEB_UI')}
            >
              Restart Web UI
            </Button>
            <Button
              kind="ghost"
              size="sm"
              disabled={ops.isRemediating}
              onClick={() => ops.triggerRemediation('CHECK_NETWORK')}
            >
              Check Network
            </Button>
            <Button
              kind="ghost"
              size="sm"
              disabled={ops.isRemediating}
              onClick={() => ops.triggerRemediation('REDISCOVER_PEERS')}
            >
              Rediscover Peers
            </Button>
          </div>
          {ops.manifestDrift?.drifted && (
            <>
              <InlineNotification
                kind="warning"
                lowContrast
                hideCloseButton
                title="Manifest drift detected"
                subtitle={`${ops.manifestDrift.nodes?.length ?? 0} node(s) have drifted packages.`}
              />
              <div className="platform-shell__node-ops-actions" style={{ marginTop: '0.5rem' }}>
                <Button
                  kind="tertiary"
                  size="sm"
                  onClick={() => {
                    const localNodeId = ops.health ? 'local' : ''
                    ops.captureManifest(localNodeId)
                  }}
                >
                  Capture Manifest
                </Button>
                {ops.manifestDrift.nodes?.map((node) => (
                  <Button
                    key={node.node_id}
                    kind="danger--tertiary"
                    size="sm"
                    onClick={() => ops.enforceManifest(node.node_id)}
                  >
                    Enforce on {node.hostname}
                  </Button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {ops.errors.length > 0 && ops.errors.map((err, i) => (
        <InlineNotification
          key={i}
          kind="error"
          lowContrast
          hideCloseButton
          title="Operation error"
          subtitle={err}
        />
      ))}

      <UpdateProgressModal
        open={updateModalOpen}
        status={ops.applicationStatus}
        hybridVersion={ops.hybridVersion}
        launchError={updateLaunchError}
        onClose={() => setUpdateModalOpen(false)}
      />
    </section>
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
  const isSingleNodeLayer = layer.id === 'single-node'

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
          {isSingleNodeLayer && <SingleNodeOperations />}
        </>
      )}
    </motion.section>
  )
}

// ── Shared Platforms/Labs Surface ────────────────────────────────────────────
// Route-native by default, with optional modal chrome retained for any narrow
// legacy host that still needs an overlay wrapper.

export interface PlatformModalContentProps {
  /** Render the shared workspace as routed page content or modal content. */
  surface?: 'route' | 'modal'
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
  surface = 'route',
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
  const landingTileRouteSet = useMemo(
    () => new Set((specialSettings?.landingTiles ?? []).map((tile) => tile.route)),
    [specialSettings?.landingTiles],
  )

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

  const showLaunchers = activePanel === 'launchers'
  const showStandalone = activePanel !== null && activePanel !== 'launchers'
  const showLayer = !activeLabs && !showStandalone && !showLaunchers && activeLayer !== null
  const activeId = activeLabs ? 'labs' : (activePanel ?? activeLayerId)
  const workspaceShell = (
    <div className={`platform-shell-page${surface === 'route' ? ' platform-shell-page--route' : ''}`}>
      <div className="platform-shell__content">
        <div className="platform-shell__window">
          <SidebarNavigation
            activeId={activeId}
            onOpenLayer={handleOpenLayer}
            onOpenStandalone={handleOpenStandalone}
            onOpenLabs={handleOpenLabs}
          />
          <div className="platform-shell__panel">
            <AnimatePresence mode="wait">
              {activeLabs && (
                <LabsWorkspace
                  key="labs"
                  pinnedRouteSet={pinnedRouteSet}
                  landingTileRouteSet={landingTileRouteSet}
                  onLaunchRoute={handleLaunchRoute}
                />
              )}
              {showLaunchers && (
                <PlatformLaunchersWorkspace
                  key="launchers"
                  settings={specialSettings}
                  isLoading={specialSettingsLoading}
                  updateSettings={updateSettings}
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
  )

  if (surface === 'route') {
    return workspaceShell
  }

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
        {workspaceShell}
      </div>
    </div>
  )
}
