import {
  ArrowLeft,
  ChartColumn,
  DataBase,
  Devices,
  Network_3,
  Share,
  Terminal,
  type CarbonIconType,
} from '@carbon/icons-react'
import {
  Button,
  ClickableTile,
  DataTable,
  Header,
  InlineLoading,
  InlineNotification,
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
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { usePlatformShellData } from '../hooks/usePlatformShellData'
import type {
  PlatformAlert,
  PlatformGridItem,
  PlatformHealth,
  PlatformLayerData,
  PlatformLayerId,
  PlatformNotification,
  PlatformSummaryMetric,
  PlatformTableValue,
} from '../platform/model'
import { PLATFORM_LAYER_META, buildPlatformHref, isPlatformLayerId } from '../platform/model'
import {
  usePlatformActions,
  usePlatformActiveLayer,
  usePlatformAlerts,
  usePlatformAnimationState,
  usePlatformLayerHealth,
  usePlatformSummaryMetrics,
  usePlatformView,
} from '../stores/platformStore'
import './PlatformShellPage.css'

const PAGE_SIZES = [5, 10, 20]

const LAYER_ICONS: Record<PlatformLayerId, CarbonIconType> = {
  overview: ChartColumn,
  'single-node': Devices,
  'avb-routing': Network_3,
  'midi-cluster': Share,
  'api-observatory': Terminal,
  'cluster-dashboard': DataBase,
}

function healthTagType(health: PlatformHealth): 'green' | 'warm-gray' | 'red' | 'cool-gray' {
  switch (health) {
    case 'healthy':
      return 'green'
    case 'warning':
      return 'warm-gray'
    case 'critical':
      return 'red'
    case 'offline':
      return 'cool-gray'
    default:
      return 'cool-gray'
  }
}

function severityKind(severity: PlatformNotification['severity']): 'info' | 'warning' | 'error' {
  switch (severity) {
    case 'critical':
    case 'error':
      return 'error'
    case 'warning':
      return 'warning'
    default:
      return 'info'
  }
}

function humanizeStatus(value: string): string {
  return value.replace(/_/g, ' ')
}

function cellMatchesStatus(value: string): PlatformHealth | null {
  const normalized = value.toLowerCase()
  if (['healthy', 'ok', 'running'].includes(normalized)) return 'healthy'
  if (['warning', 'warn', 'degraded'].includes(normalized)) return 'warning'
  if (['critical', 'error'].includes(normalized)) return 'critical'
  if (['offline', 'disabled'].includes(normalized)) return 'offline'
  return null
}

function renderCellValue(headerKey: string, value: PlatformTableValue) {
  const text = value === null ? 'n/a' : String(value)
  if (headerKey === 'status') {
    const health = cellMatchesStatus(text) ?? 'unknown'
    return <Tag type={healthTagType(health)}>{humanizeStatus(text)}</Tag>
  }
  if (headerKey === 'alerts') {
    const isClear = text === 'Clear'
    return <span className={`platform-shell__table-alert${isClear ? ' is-clear' : ''}`}>{text}</span>
  }
  return text
}

function StackPlane({
  layer,
  layerHealth,
  onOpen,
  index,
  reducedMotion,
}: {
  layer: PlatformLayerData
  layerHealth: PlatformHealth
  onOpen: (layerId: PlatformLayerId) => void
  index: number
  reducedMotion: boolean
}) {
  const Icon = LAYER_ICONS[layer.id]
  const offsetX = (index % 2 === 0 ? -1 : 1) * (18 + index * 9)
  const offsetY = index * 28
  const rotate = -30 + index * 1.4

  return (
    <button
      type="button"
      className="platform-shell__plane-button"
      onClick={() => onOpen(layer.id)}
      aria-label={`Open ${layer.label} layer`}
      style={{
        zIndex: PLATFORM_LAYER_META.length - index,
      }}
    >
      <motion.div
        layoutId={`platform-layer-surface-${layer.id}`}
        className={`platform-shell__plane-surface health-${layerHealth}`}
        style={{
          ['--platform-layer-accent' as string]: layer.accent,
          ['--platform-layer-offset-x' as string]: `${offsetX}px`,
          ['--platform-layer-offset-y' as string]: `${offsetY}px`,
          ['--platform-layer-rotate-z' as string]: `${rotate}deg`,
        }}
        whileHover={reducedMotion ? undefined : { y: -8, scale: 1.02 }}
        transition={{ type: 'spring', stiffness: 220, damping: 26 }}
      >
        <div className="platform-shell__plane-head">
          <span className="platform-shell__plane-icon">
            <Icon size={18} aria-hidden />
          </span>
          <Tag type={healthTagType(layerHealth)}>{humanizeStatus(layerHealth)}</Tag>
        </div>
        <div className="platform-shell__plane-copy">
          <p>{layer.shortLabel}</p>
          <h2>{layer.label}</h2>
        </div>
        <p className="platform-shell__plane-description">{layer.description}</p>
        <div className="platform-shell__plane-footer">
          <span>{layer.alertCount} alerts</span>
          <span>{Math.round(layer.activityLevel)}% activity</span>
        </div>
        <div className="platform-shell__plane-meter" aria-hidden="true">
          <span style={{ width: `${Math.max(8, layer.activityLevel)}%` }} />
        </div>
      </motion.div>
    </button>
  )
}

function NotificationStrip({
  alerts,
  onDismiss,
}: {
  alerts: PlatformAlert[]
  onDismiss: (alertId: string) => void
}) {
  if (alerts.length === 0) {
    return null
  }

  return (
    <section className="platform-shell__notification-strip" aria-label="Layer notifications">
      {alerts.map((alert) => (
        <InlineNotification
          key={alert.id}
          kind={severityKind(alert.severity)}
          lowContrast
          title={alert.title}
          subtitle={alert.subtitle}
          onCloseButtonClick={() => onDismiss(alert.id)}
        />
      ))}
    </section>
  )
}

function LayerSummaryTiles({
  items,
}: {
  items: PlatformGridItem[]
}) {
  const [activeTileId, setActiveTileId] = useState<string | null>(items[0]?.id ?? null)

  useEffect(() => {
    setActiveTileId(items[0]?.id ?? null)
  }, [items])

  return (
    <section className="platform-shell__summary-tiles" aria-label="Layer summary tiles">
      {items.map((item) => (
        <ClickableTile
          key={item.id}
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

function LayerDataTable({ layer }: { layer: PlatformLayerData }) {
  const [searchValue, setSearchValue] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZES[1])
  const deferredSearch = useDeferredValue(searchValue)

  useEffect(() => {
    setSearchValue('')
    setPage(1)
    setPageSize(PAGE_SIZES[1])
  }, [layer.id])

  const filteredRows = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase()
    if (!needle) {
      return layer.tableRows
    }
    return layer.tableRows.filter((row) =>
      Object.entries(row).some(([key, value]) => key !== 'id' && String(value ?? '').toLowerCase().includes(needle)),
    )
  }, [deferredSearch, layer.tableRows])

  const startIndex = (page - 1) * pageSize
  const visibleRows = filteredRows.slice(startIndex, startIndex + pageSize)

  if (layer.isLoading && layer.tableRows.length === 0) {
    return (
      <div className="platform-shell__table-state">
        <InlineLoading description={`Loading ${layer.label} data`} status="active" />
      </div>
    )
  }

  if (layer.error && layer.tableRows.length === 0) {
    return (
      <InlineNotification
        kind="error"
        lowContrast
        hideCloseButton
        title={`${layer.label} unavailable`}
        subtitle={layer.error}
      />
    )
  }

  return (
    <div className="platform-shell__table-block">
      <DataTable rows={visibleRows} headers={layer.tableColumns} isSortable useZebraStyles>
        {({ rows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps, getToolbarProps }) => (
          <TableContainer
            {...getTableContainerProps()}
            title={layer.tableTitle}
            description={layer.tableDescription}
            className="platform-shell__table-container"
          >
            <TableToolbar {...getToolbarProps()}>
              <TableToolbarContent className="platform-shell__table-toolbar">
                <TableToolbarSearch
                  persistent
                  value={searchValue}
                  onChange={(_event, value) => {
                    setSearchValue(value ?? '')
                    setPage(1)
                  }}
                />
                <Tag type="cool-gray">{filteredRows.length} rows</Tag>
                <Tag type="cool-gray">{pageSize}/page</Tag>
              </TableToolbarContent>
            </TableToolbar>
            <Table {...getTableProps()} aria-label={`${layer.label} table`}>
              <TableHead>
                <TableRow>
                  {headers.map((header) => {
                    const { key: _headerKey, ...headerProps } = getHeaderProps({ header })
                    return (
                      <TableHeader key={header.key} {...headerProps}>
                        {header.header}
                      </TableHeader>
                    )
                  })}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => {
                  const { key: _rowKey, ...rowProps } = getRowProps({ row })
                  return (
                    <TableRow key={row.id} {...rowProps}>
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
      <Pagination
        page={page}
        pageSize={pageSize}
        pageSizes={PAGE_SIZES}
        totalItems={filteredRows.length}
        size="sm"
        onChange={({ page: nextPage, pageSize: nextPageSize }) => {
          setPage(nextPage)
          setPageSize(nextPageSize)
        }}
      />
    </div>
  )
}

function LayerWorkspace({
  layer,
  alerts,
  onBack,
  onDismissAlert,
}: {
  layer: PlatformLayerData
  alerts: PlatformAlert[]
  onBack: () => void
  onDismissAlert: (alertId: string) => void
}) {
  const Icon = LAYER_ICONS[layer.id]

  return (
    <motion.section
      key={layer.id}
      className="platform-shell__workspace"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
    >
      <div className="platform-shell__workspace-head">
        <motion.div
          layoutId={`platform-layer-surface-${layer.id}`}
          className={`platform-shell__workspace-hero health-${layer.health}`}
          style={{ ['--platform-layer-accent' as string]: layer.accent }}
        >
          <div className="platform-shell__workspace-hero-copy">
            <p>{layer.shortLabel}</p>
            <h2>{layer.label}</h2>
            <span>{layer.description}</span>
          </div>
          <div className="platform-shell__workspace-hero-meta">
            <span className="platform-shell__workspace-hero-icon">
              <Icon size={20} aria-hidden />
            </span>
            <Tag type={healthTagType(layer.health)}>{humanizeStatus(layer.health)}</Tag>
            <strong>{Math.round(layer.activityLevel)}% activity</strong>
          </div>
        </motion.div>

        <Button kind="ghost" size="sm" renderIcon={ArrowLeft} onClick={onBack}>
          Back to Platform Stack
        </Button>
      </div>

      <NotificationStrip alerts={alerts} onDismiss={onDismissAlert} />

      {layer.error && layer.tableRows.length > 0 ? (
        <InlineNotification
          kind="warning"
          lowContrast
          hideCloseButton
          title={`${layer.label} loaded with gaps`}
          subtitle={layer.error}
        />
      ) : null}

      <LayerSummaryTiles items={layer.gridItems} />
      <LayerDataTable layer={layer} />
    </motion.section>
  )
}

function GlobalHeader({
  metrics,
  activeLayerId,
  onOpenLayer,
}: {
  metrics: PlatformSummaryMetric[]
  activeLayerId: PlatformLayerId | null
  onOpenLayer: (layerId: PlatformLayerId) => void
}) {
  return (
    <Header className="platform-shell__global-header" aria-label="Unified platform stack">
      <div className="platform-shell__global-bar">
        <div className="platform-shell__global-copy">
          <p>Unified Platform Stack</p>
          <h1>One route for overview, node, AVB, MIDI, API, and cluster operations.</h1>
        </div>

        <div className="platform-shell__global-metrics" aria-label="Platform summary metrics">
          {metrics.map((metric) => (
            <div key={metric.id} className={`platform-shell__metric-card tone-${metric.tone}`}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.helper}</small>
            </div>
          ))}
        </div>

        <div className="platform-shell__global-actions" aria-label="Platform layer shortcuts">
          {PLATFORM_LAYER_META.map((layer) => (
            <button
              key={layer.id}
              type="button"
              className={`platform-shell__global-action${activeLayerId === layer.id ? ' is-active' : ''}`}
              onClick={() => onOpenLayer(layer.id)}
            >
              {layer.shortLabel}
            </button>
          ))}
        </div>
      </div>
    </Header>
  )
}

export function PlatformShellPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedLayer = searchParams.get('layer')
  const reducedMotion = useReducedMotion()

  const { layers, layerHealth: nextLayerHealth, summaryMetrics: nextSummaryMetrics, alerts: nextAlerts } = usePlatformShellData()
  const currentView = usePlatformView()
  const activeLayerId = usePlatformActiveLayer()
  const summaryMetrics = usePlatformSummaryMetrics()
  const layerHealth = usePlatformLayerHealth()
  const alerts = usePlatformAlerts()
  const animationState = usePlatformAnimationState()
  const {
    openLayer,
    closeLayer,
    clearAnimation,
    setAlerts,
    setLayerHealth,
    setSummaryMetrics,
    dismissAlert,
  } = usePlatformActions()

  useEffect(() => {
    setLayerHealth(nextLayerHealth)
    setSummaryMetrics(nextSummaryMetrics)
    setAlerts(nextAlerts)
  }, [nextAlerts, nextLayerHealth, nextSummaryMetrics, setAlerts, setLayerHealth, setSummaryMetrics])

  useEffect(() => {
    if (isPlatformLayerId(requestedLayer)) {
      if (activeLayerId !== requestedLayer || currentView !== 'layer') {
        startTransition(() => openLayer(requestedLayer))
      }
      return
    }

    if (currentView !== 'stack' || activeLayerId !== null) {
      startTransition(() => closeLayer())
    }
  }, [activeLayerId, closeLayer, currentView, openLayer, requestedLayer])

  useEffect(() => {
    if (!animationState.expandingLayer && !animationState.collapsingLayer) {
      return
    }
    const timeout = window.setTimeout(() => clearAnimation(), reducedMotion ? 0 : 420)
    return () => window.clearTimeout(timeout)
  }, [animationState, clearAnimation, reducedMotion])

  const activeLayer = useMemo(
    () => layers.find((layer) => layer.id === activeLayerId) ?? null,
    [activeLayerId, layers],
  )

  const visibleAlerts = useMemo(() => {
    if (!activeLayer) {
      return alerts
    }
    return alerts.filter((alert) => alert.layerId === activeLayer.id)
  }, [activeLayer, alerts])

  const handleOpenLayer = (layerId: PlatformLayerId) => {
    startTransition(() => {
      setSearchParams(new URLSearchParams([['layer', layerId]]))
    })
  }

  const handleBack = () => {
    startTransition(() => {
      setSearchParams(new URLSearchParams())
    })
  }

  return (
    <section className="platform-shell-page">
      <GlobalHeader metrics={summaryMetrics} activeLayerId={activeLayerId} onOpenLayer={handleOpenLayer} />

      <div className="platform-shell__content">
        {currentView === 'stack' || !activeLayer ? (
          <div className="platform-shell__stack">
            <div className="platform-shell__stack-copy">
              <p>Stack View</p>
              <h2>Choose a layer to flatten the stack into a focused workspace.</h2>
              <span>
                Deep link directly with <code>{buildPlatformHref('overview')}</code> or any other <code>?layer=</code> id.
              </span>
            </div>
            <div className="platform-shell__stack-stage">
              {layers.map((layer, index) => (
                <StackPlane
                  key={layer.id}
                  layer={layer}
                  layerHealth={layerHealth[layer.id] ?? layer.health}
                  onOpen={handleOpenLayer}
                  index={index}
                  reducedMotion={Boolean(reducedMotion)}
                />
              ))}
            </div>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <LayerWorkspace layer={activeLayer} alerts={visibleAlerts} onBack={handleBack} onDismissAlert={dismissAlert} />
          </AnimatePresence>
        )}
      </div>
    </section>
  )
}

export default PlatformShellPage
