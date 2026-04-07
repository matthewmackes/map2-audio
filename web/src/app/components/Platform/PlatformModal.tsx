/**
 * Shared Platforms interface surface used by the routed `/platforms/*` shell,
 * with optional modal chrome retained for narrow legacy host flows that still
 * need an overlay wrapper.
 */
import type { ComponentType } from 'react'
import {
  Close,
  DataBase,
  Devices,
  Information,
  Network_3,
  PaintBrush,
  SettingsAdjust,
  Share,
  Terminal,
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
import { MapOs2DrivesIcon, MapOs2HomeIcon } from '../icons/map'
import { WorkspacePageTemplate } from '../layout/WorkspacePageTemplate'
import { PlatformGrafanaPanelDeck, type PlatformGrafanaPanelDefinition } from './PlatformGrafanaPanel'
import {
  isPlatformUtilityPanel,
  platformPanelItems,
  type StandalonePanel,
} from '../../data/platformMenuItems'
import { useSpecialSettings, type SpecialSettings } from '../../hooks/useSpecialSettings'
import { UnifiedWorkspaceSideNav, type UnifiedWorkspaceSideNavItem } from '../navigation/UnifiedWorkspaceSideNav'
import { PlatformLaunchersWorkspace } from './PlatformLaunchersWorkspace'
import { AvbRoutingWorkspace } from '../AvbRouting/AvbRoutingWorkspace'
import { ClusterDashboardWorkspace } from '../ClusterDashboard/ClusterDashboardWorkspace'
import { ManagementWorkspace } from '../ManagementWorkspace/ManagementWorkspace'
import { NetworkDiscoveryWorkspace } from '../NetworkDiscovery/NetworkDiscoveryWorkspace'
import {
  useNodeOperations,
  type HybridApplicationStatusInfo,
} from '../../hooks/useNodeOperations'
import { makePendingUpdateApplicationSteps } from '../../hooks/updateApplicationProgressModel'
import { usePlatformShellData } from '../../hooks/usePlatformShellData'
import { useNodeTopology } from '../../hooks/useNodeTopology'
import { useViewedNode } from '../../stores/viewedNodeStore'
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
import { NODE_PAGE_KEYS } from '../../utils/nodeDisplay'
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
type PlatformIcon = ComponentType<any>

const LAYER_ICONS: Record<PlatformLayerId, PlatformIcon> = {
  overview: MapOs2DrivesIcon,
  management: Devices,
  'avb-routing': Network_3,
  'network-discovery': Share,
  'cluster-dashboard': DataBase,
}

const PLATFORM_CONTROL_PANEL_ITEMS = platformPanelItems

const STANDALONE_META: Record<StandalonePanel, { label: string; eyebrow: string; icon: PlatformIcon }> = {
  'host-machine': { label: 'Host Machine',   eyebrow: 'Hardware', icon: MapOs2HomeIcon },
  'audio-engine': { label: 'Audio Engine',   eyebrow: 'System',   icon: Terminal },
  'theme':        { label: 'Theme',          eyebrow: 'Platform', icon: PaintBrush },
  'about':        { label: 'Platform Guide', eyebrow: 'System',   icon: Information },
  'adoption':     { label: 'Adoption',       eyebrow: 'Platform', icon: Information },
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

function parseMetricNumber(value: string | number | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value !== 'string') {
    return null
  }

  const ratioMatch = value.match(/^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/)
  if (ratioMatch) {
    const left = Number(ratioMatch[1])
    const right = Number(ratioMatch[2])
    return right > 0 ? (left / right) * 100 : null
  }

  const numericMatch = value.match(/-?\d+(?:\.\d+)?/)
  return numericMatch ? Number(numericMatch[0]) : null
}

function buildOverviewGrafanaPanels(layer: PlatformLayerData): PlatformGrafanaPanelDefinition[] {
  if (layer.id !== 'overview') {
    return []
  }

  const nodesOnline = parseMetricNumber(layer.summaryMetrics.find((metric) => metric.id === 'overview-nodes')?.value)
  const clusterScore = parseMetricNumber(layer.summaryMetrics.find((metric) => metric.id === 'overview-health')?.value)
  const activeStreams = parseMetricNumber(layer.summaryMetrics.find((metric) => metric.id === 'overview-audio')?.value)
  const activeAlerts = parseMetricNumber(layer.gridItems.find((item) => item.id === 'active-alerts')?.metric)
  const activeNodes = parseMetricNumber(layer.gridItems.find((item) => item.id === 'active-nodes')?.metric)
  const clusterCapacity = parseMetricNumber(layer.gridItems.find((item) => item.id === 'cluster-capacity')?.metric)

  return [
    {
      id: 'platform-overview-health',
      title: 'Cluster Reachability',
      description: '24-hour operational view for node availability, aggregate health score, and remaining cluster capacity.',
      yAxisDomain: [0, 100],
      series: [
        { key: 'nodesOnline', label: 'Nodes Online %', value: nodesOnline, color: 'var(--cds-support-success)' },
        { key: 'clusterScore', label: 'Cluster Score %', value: clusterScore, color: 'var(--cds-support-info)' },
        { key: 'clusterCapacity', label: 'Capacity %', value: clusterCapacity, color: 'var(--cds-support-warning)' },
      ],
    },
    {
      id: 'platform-overview-signals',
      title: 'Cross-Layer Signals',
      description: 'Alert and traffic pressure across the main Platforms overview surface.',
      series: [
        { key: 'activeStreams', label: 'Active Streams', value: activeStreams, color: 'var(--cds-link-primary)' },
        { key: 'activeAlerts', label: 'Active Alerts', value: activeAlerts, color: 'var(--cds-support-error)' },
        { key: 'activeNodes', label: 'Active Nodes %', value: activeNodes, color: 'var(--cds-text-primary)' },
      ],
    },
  ]
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
  onOpenWorkspaceCatalog,
}: {
  activeId: string | null
  onOpenLayer: (id: PlatformLayerId) => void
  onOpenStandalone: (id: StandalonePanel) => void
  onOpenWorkspaceCatalog: () => void
}) {
  const buildNavItem = (
    item: (typeof PLATFORM_CONTROL_PANEL_ITEMS)[number],
    variant: UnifiedWorkspaceSideNavItem['variant'] = 'default',
  ): UnifiedWorkspaceSideNavItem => {
    const targetId = item.target.layer ?? item.target.panel ?? null
    const isSelected = activeId === targetId

    return {
      key: item.to,
      label: item.label,
      description: item.description,
      to: item.to,
      icon: item.icon,
      active: isSelected,
      variant,
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
  }

  const items: UnifiedWorkspaceSideNavItem[] = PLATFORM_CONTROL_PANEL_ITEMS
    .filter((item) => !(item.target.panel && isPlatformUtilityPanel(item.target.panel)))
    .map((item) => buildNavItem(item))

  const utilityItems: UnifiedWorkspaceSideNavItem[] = PLATFORM_CONTROL_PANEL_ITEMS
    .filter((item) => item.target.panel && isPlatformUtilityPanel(item.target.panel))
    .map((item) => buildNavItem(item, 'utility'))

  utilityItems.push({
    key: '/platforms/workspace-catalog',
    label: 'Program Catalog',
    description: 'Program-manager object directory inside Platforms.',
    to: '/platforms/workspace-catalog',
    icon: SettingsAdjust,
    active: activeId === 'workspace-catalog',
    variant: 'utility',
    onOpen: onOpenWorkspaceCatalog,
  })

  return (
    <UnifiedWorkspaceSideNav
      className="platform-shell__sidebar"
      ariaLabel="Platforms interface navigation"
      eyebrow="System setup"
      title="Control Panel"
      description="Open workstation setup objects first, with utility program objects grouped below."
      items={items}
      footerTitle="Utilities"
      footerItems={utilityItems}
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

// ── Standalone Workspace ─────────────────────────────────────────────────────

function StandaloneWorkspace({ panel }: { panel: StandalonePanel }) {
  const { label, eyebrow, icon: Icon } = STANDALONE_META[panel]
  return (
    <motion.section key={panel} className={`platform-shell__workspace platform-shell__workspace--standalone platform-shell__workspace--${panel}`}
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
      <div className="platform-shell__standalone-surface">
        <Suspense fallback={<div className="platform-shell__table-state"><span>Loading…</span></div>}>
          {panel === 'host-machine' && <HostMachinePage />}
          {panel === 'audio-engine' && <AudioEnginePage />}
          {panel === 'theme'        && <ThemePage />}
          {panel === 'about'        && <AboutPage />}
          {panel === 'adoption'     && <PlatformAdoptionPage />}
        </Suspense>
      </div>
    </motion.section>
  )
}

// ── Management Operations Panel ──────────────────────────────────────────────

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
    <ComposedModal className="platform-shell__update-progress-shell" open={open} size="lg" onClose={onClose}>
      <ModalHeader
        title="Application Update Progress"
        label="Management"
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
  const topologyQuery = useNodeTopology()
  const topologyNodes = Array.isArray(topologyQuery.data?.nodes) ? topologyQuery.data.nodes : []
  const localNode = topologyNodes.find((node) => node.is_local) ?? topologyNodes[0] ?? null
  const viewedNodeId = useViewedNode(NODE_PAGE_KEYS.platform, localNode?.node_id ?? 'local')
  const viewedNode = topologyNodes.find((node) => node.node_id === viewedNodeId) ?? localNode
  const viewedNodeIsRemote = Boolean(viewedNode && localNode && viewedNode.node_id !== localNode.node_id)
  const viewedNodeLabel = viewedNode?.display_label
    ? `${viewedNode.hostname} (${viewedNode.display_label})`
    : viewedNode?.hostname ?? viewedNode?.node_id ?? 'selected node'
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
    <section className="platform-shell__node-operations" aria-label="Management operations">
      <div className="platform-shell__detail-head">
        <div>
          <h3>Management Actions</h3>
          <p>Version, deployment, update, backup, and remediation actions for the local management host.</p>
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

      {viewedNodeIsRemote && (
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          title="Remote management context selected"
          subtitle={`The current workspace is scoped to ${viewedNodeLabel}, but mutation actions below still apply only to the local management host.`}
        />
      )}

      <div className="platform-shell__node-ops-grid">
        <div className="platform-shell__node-ops-group">
          <h4>Updates</h4>
          <div className="platform-shell__node-ops-actions">
            <Button
              kind="primary"
              size="sm"
              disabled={viewedNodeIsRemote || updateActionPending}
              onClick={handleCheckForUpdates}
            >
              {updateActionPending && <InlineLoading description="" />}
              {updateLabel}
            </Button>
            {ops.updateStatus?.status === 'in_progress' && (
              <Button
                kind="danger--ghost"
                size="sm"
                disabled={viewedNodeIsRemote}
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

        <div className="platform-shell__node-ops-group">
          <h4>Backup &amp; Restore</h4>
          <div className="platform-shell__node-ops-actions">
            <Button
              kind="secondary"
              size="sm"
              disabled={viewedNodeIsRemote || ops.isBackingUp}
              onClick={() => ops.triggerBackup()}
            >
              {ops.isBackingUp && <InlineLoading description="" />}
              {backupLabel}
            </Button>
            {ops.backups.length > 0 && (
              <Button
                kind="ghost"
                size="sm"
                disabled={viewedNodeIsRemote || ops.isRestoring}
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

        <div className="platform-shell__node-ops-group">
          <h4>Deployment Mode</h4>
          <div className="platform-shell__node-ops-actions">
            {['ALL-IN-ONE', 'AUDIO-NODE', 'CONTROL-NODE', 'FRONTEND-ONLY'].map((mode) => (
              <Button
                key={mode}
                kind={ops.deploymentMode?.mode === mode ? 'primary' : 'ghost'}
                size="sm"
                disabled={viewedNodeIsRemote || ops.isSwitchingMode || ops.deploymentMode?.mode === mode}
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

        <div className="platform-shell__node-ops-group">
          <h4>Health &amp; Remediation</h4>
          <div className="platform-shell__node-ops-actions">
            <Button
              kind="ghost"
              size="sm"
              disabled={viewedNodeIsRemote || ops.isRemediating}
              onClick={() => ops.triggerRemediation('RESTART_BACKEND')}
            >
              Restart Backend
            </Button>
            <Button
              kind="ghost"
              size="sm"
              disabled={viewedNodeIsRemote || ops.isRemediating}
              onClick={() => ops.triggerRemediation('RESTART_WEB_UI')}
            >
              Restart Web UI
            </Button>
            <Button
              kind="ghost"
              size="sm"
              disabled={viewedNodeIsRemote || ops.isRemediating}
              onClick={() => ops.triggerRemediation('CHECK_NETWORK')}
            >
              Check Network
            </Button>
            <Button
              kind="ghost"
              size="sm"
              disabled={viewedNodeIsRemote || ops.isRemediating}
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
                  disabled={viewedNodeIsRemote}
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
                    disabled={viewedNodeIsRemote}
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
  const isClusterLayer = layer.id === 'cluster-dashboard'
  const isAvbLayer = layer.id === 'avb-routing'
  const isManagementLayer = layer.id === 'management'
  const isNetworkDiscoveryLayer = layer.id === 'network-discovery'
  const overviewGrafanaPanels = buildOverviewGrafanaPanels(layer)

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
      ) : isAvbLayer ? (
        <AvbRoutingWorkspace layer={layer} />
      ) : isManagementLayer ? (
        <>
          <ManagementWorkspace layer={layer} />
          <SingleNodeOperations />
        </>
      ) : isNetworkDiscoveryLayer ? (
        <NetworkDiscoveryWorkspace layer={layer} />
      ) : (
        <>
          <PlatformGrafanaPanelDeck panels={overviewGrafanaPanels} />
          <LayerSummaryTiles items={layer.gridItems} />
          <LayerDataTable layer={layer} />
        </>
      )}
    </motion.section>
  )
}

function WorkspaceCatalogWorkspace({
  settings,
  isLoading,
  updateSettings,
  onLaunchRoute,
}: {
  settings: SpecialSettings | null
  isLoading: boolean
  updateSettings: (newSettings: Partial<SpecialSettings>) => Promise<void>
  onLaunchRoute: (to: string) => void
}) {
  return (
    <motion.section key="workspace-catalog" className="platform-shell__workspace platform-shell__workspace--workspace-catalog"
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      <div className="platform-shell__ws-header">
        <span className="platform-shell__ws-header-icon" aria-hidden><SettingsAdjust size={20} /></span>
        <div className="platform-shell__ws-header-copy">
          <span className="platform-shell__ws-header-eyebrow">Program Manager</span>
          <h2 className="platform-shell__ws-header-title">Program Catalog</h2>
          <p className="platform-shell__ws-header-summary">
            Browse routed MAP2 program objects, inspect their directory records, and control desktop placement from one catalog window.
          </p>
        </div>
      </div>
      <div id="platform-launcher-organizer">
        <PlatformLaunchersWorkspace
          settings={settings}
          isLoading={isLoading}
          updateSettings={updateSettings}
          onLaunchRoute={onLaunchRoute}
        />
      </div>
    </motion.section>
  )
}

// ── Shared Platforms Surface ────────────────────────────────────────────────
// Route-native by default, with optional modal chrome retained for any narrow
// legacy host that still needs an overlay wrapper.

export interface PlatformModalContentProps {
  /** Render the shared workspace as routed page content or modal content. */
  surface?: 'route' | 'modal'
  /** Initial layer to open (from URL deep-link). Pass null for the grid. */
  initialLayer?: PlatformLayerId | null
  /** Initial standalone panel to open (from URL deep-link). */
  initialPanel?: StandalonePanel | null
  /** Open Workspace Catalog as the initial routed destination. */
  initialWorkspaceCatalog?: boolean
  /** Called when the user navigates to a layer/panel (for URL sync). */
  onNavigate?: (params: { layer?: PlatformLayerId; panel?: StandalonePanel } | null) => void
  /** Called when the user launches a route from the unified host. */
  onLaunchRoute?: (to: string) => void
  /** Called when user clicks the × close button. */
  onClose: () => void
}

export function PlatformModalContent({
  surface = 'route',
  initialLayer,
  initialPanel,
  initialWorkspaceCatalog = false,
  onNavigate,
  onLaunchRoute,
  onClose,
}: PlatformModalContentProps) {
  const navigate = useNavigate()
  const {
    settings: specialSettings,
    isLoading: specialSettingsLoading,
    updateSettings: updateSpecialSettings,
  } = useSpecialSettings()
  const { layers, layerHealth: nextLayerHealth, summaryMetrics: nextSummaryMetrics, alerts: nextAlerts } = usePlatformShellData()
  const activeLayerId = usePlatformActiveLayer()
  const alerts = usePlatformAlerts()
  const animationState = usePlatformAnimationState()
  const { openLayer, closeLayer, clearAnimation, setAlerts, setLayerHealth, setSummaryMetrics, dismissAlert } = usePlatformActions()
  const _summaryMetrics = usePlatformSummaryMetrics()

  const [activePanel, setActivePanel] = useState<StandalonePanel | null>(initialPanel ?? null)
  const [activeWorkspaceCatalog, setActiveWorkspaceCatalog] = useState(initialWorkspaceCatalog)

  // Sync live data into store
  useEffect(() => {
    setLayerHealth(nextLayerHealth)
    setSummaryMetrics(nextSummaryMetrics)
    setAlerts(nextAlerts)
  }, [nextAlerts, nextLayerHealth, nextSummaryMetrics, setAlerts, setLayerHealth, setSummaryMetrics])

  useEffect(() => {
    if (initialWorkspaceCatalog) {
      startTransition(() => closeLayer())
      setActivePanel(null)
      setActiveWorkspaceCatalog(true)
      return
    }

    if (initialPanel) {
      setActiveWorkspaceCatalog(false)
      setActivePanel(initialPanel)
      startTransition(() => closeLayer())
      return
    }

    if (initialLayer && isPlatformLayerId(initialLayer)) {
      setActiveWorkspaceCatalog(false)
      setActivePanel(null)
      startTransition(() => openLayer(initialLayer))
      return
    }

    if (!activeWorkspaceCatalog && activePanel === null && activeLayerId === null) {
      startTransition(() => openLayer(DEFAULT_PLATFORM_LAYER))
    }
  }, [activeWorkspaceCatalog, activeLayerId, activePanel, closeLayer, initialWorkspaceCatalog, initialLayer, initialPanel, openLayer])

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
    setActiveWorkspaceCatalog(false)
    setActivePanel(null)
    startTransition(() => openLayer(layerId))
    onNavigate?.({ layer: layerId })
  }

  const handleOpenStandalone = (panel: StandalonePanel) => {
    setActiveWorkspaceCatalog(false)
    startTransition(() => closeLayer())
    setActivePanel(panel)
    onNavigate?.({ panel })
  }

  const handleOpenWorkspaceCatalog = () => {
    startTransition(() => closeLayer())
    setActivePanel(null)
    setActiveWorkspaceCatalog(true)
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
  const showLayer = !activeWorkspaceCatalog && !showStandalone && activeLayer !== null
  const activeId = activeWorkspaceCatalog ? 'workspace-catalog' : (activePanel ?? activeLayerId)
  const workspaceShell = (
    <div className={`platform-shell-page${surface === 'route' ? ' platform-shell-page--route' : ''}`}>
      <WorkspacePageTemplate
        sidebar={(
          <SidebarNavigation
            activeId={activeId}
            onOpenLayer={handleOpenLayer}
            onOpenStandalone={handleOpenStandalone}
            onOpenWorkspaceCatalog={handleOpenWorkspaceCatalog}
          />
        )}
        contentClassName="platform-shell__panel"
        content={(
          <AnimatePresence mode="wait">
            {activeWorkspaceCatalog && (
              <WorkspaceCatalogWorkspace
                key="workspace-catalog"
                settings={specialSettings}
                isLoading={specialSettingsLoading}
                updateSettings={updateSpecialSettings}
                onLaunchRoute={handleLaunchRoute}
              />
            )}
            {showStandalone && activePanel && (
              <StandaloneWorkspace key={activePanel} panel={activePanel} />
            )}
            {showLayer && activeLayer && (
              <LayerWorkspace key={activeLayer.id} layer={activeLayer} alerts={visibleAlerts} onDismissAlert={dismissAlert} />
            )}
            {!activeWorkspaceCatalog && !showStandalone && !showLayer && (
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
        )}
      />
    </div>
  )

  if (surface === 'route') {
    return workspaceShell
  }

  return (
    <div className="platform-modal__body platform-modal__body--expanded">
      <div className="platform-modal__header">
        <span className="platform-modal__header-title">Platforms Interface</span>
        <button
          type="button"
          className="platform-modal__close"
          onClick={onClose}
          aria-label="Close Platforms interface window"
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
