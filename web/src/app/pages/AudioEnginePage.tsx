/**
 * AudioEnginePage redesign duplication map
 *
 * Removed from the legacy implementation:
 * - repeated inline token objects and presentation-only micro-components
 * - tabbed navigation that hid live metering and routing state
 * - duplicated empty/loading surfaces across overview, routing, and diagnostics
 * - Phosphor icon usage inside page chrome
 *
 * The Carbon rebuild keeps the live hooks and data queries, then re-composes
 * them as a single sectioned operator page.
 */

import './AudioEnginePage.css'
import { Fragment, useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Accordion,
  AccordionItem,
  Button,
  Column,
  Dropdown,
  Grid,
  InlineLoading,
  InlineNotification,
  Layer,
  ProgressBar,
  RadioButton,
  RadioButtonGroup,
  Select,
  SelectItem,
  StructuredListBody,
  StructuredListCell,
  StructuredListRow,
  StructuredListWrapper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableExpandHeader,
  TableExpandRow,
  TableExpandedRow,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  TableToolbarContent,
  Tag,
  Tile,
} from '@carbon/react'
import {
  Activity,
  ChartLine,
  Chip,
  CheckmarkFilled,
  Misuse,
  Renew,
  SettingsAdjust,
  SettingsView,
  Timer,
  WarningAltFilled,
} from '@carbon/icons-react'
import { usePipeWire } from '../hooks/usePipeWire'
import { audioApi } from '../../map2/api'
import { LoadingState } from '../components/shared/LoadingState'
import type {
  AudioSourceTruthPayload,
  PipeWireAlert,
  PipeWireDeviceInfo,
  PipeWireLinkInfo,
  PipeWireNodeInfo,
  PipeWireStreamInfo,
} from '../../map2/types'
import { useCluster } from '../contexts/useCluster'
import { ClusterEngineGrid } from '../components/AudioEngine/ClusterEngineGrid'
import { useSetShellWindow } from '../layout/useSetShellWindow'
import { useNodePageContext } from '../hooks/useNodePageContext'
import { useViewedNodeStore } from '../stores/viewedNodeStore'
import { NODE_PAGE_KEYS } from '../utils/nodeDisplay'
import { SpectrumAnalyzer } from '../components/Visualizations/SpectrumAnalyzer'
import { LoudnessMeter } from '../components/Visualizations/LoudnessMeter'
import { PlatformGrafanaPanelDeck, type PlatformGrafanaPanelDefinition } from '../components/Platform/PlatformGrafanaPanel'
import { CPUMeterPanel } from '../components/Visualizations/CPUMeterPanel'
import { LatencyDisplay } from '../components/Visualizations/LatencyDisplay'
import { PhaseCorrelationMeter } from '../components/Visualizations/PhaseCorrelationMeter'
import { VuMeterDisplay } from '../components/Visualizations/VuMeterDisplay'
import { DynamicsMeteringPanel } from '../components/Visualizations/DynamicsMeteringPanel'
import { SegmentedLedText } from '../components/Displays/SegmentedLedText'
import { useLatencyPressure } from '../hooks/useLatencyPressure'
import { AudioEngineWorkspaceGraph } from '../components/AudioEngine/AudioEngineWorkspaceGraph'
import { JuceSourceTruthGraph } from '../components/AudioEngine/JuceSourceTruthGraph'
import {
  buildAudioEngineWorkspaceGraphModel,
  type AudioEngineWorkspaceAnchorId,
} from '../components/AudioEngine/audioEngineWorkspaceGraph'
import {
  buildJuceSourceTruthGraphModel,
  type JuceSourceTruthConnectionRow,
  type JuceSourceTruthNodeId,
} from '../components/AudioEngine/juceSourceTruthGraph'

type TableCellValue = string | number | boolean | null | undefined

type RoutingDetailItem = {
  label: string
  value: React.ReactNode
}

type RoutingAction = {
  label: string
  kind?: 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'danger--tertiary'
  onClick: () => void
}

type RoutingRow = {
  id: string
  cells: Record<string, TableCellValue>
  details: RoutingDetailItem[]
  actions?: RoutingAction[]
}

type RoutingDefinition = {
  id: string
  title: string
  anchorId: AudioEngineWorkspaceAnchorId
  headers: Array<{ key: string; header: string }>
  rows: RoutingRow[]
}

type NodeOption = {
  id: string
  label: string
}

function useIsMobile(breakpoint = 672) {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(`(max-width: ${breakpoint - 1}px)`).matches)

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const handleChange = (event: MediaQueryListEvent) => setIsMobile(event.matches)
    setIsMobile(query.matches)

    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', handleChange)
      return () => query.removeEventListener('change', handleChange)
    }

    query.addListener(handleChange)
    return () => query.removeListener(handleChange)
  }, [breakpoint])

  return isMobile
}

function clusterHealthType(nodes: Array<{ isOnline: boolean; latencyMs: number | null }>) {
  if (nodes.some((node) => !node.isOnline)) {
    return 'red' as const
  }

  if (nodes.some((node) => (node.latencyMs ?? 0) > 20)) {
    return 'warm-gray' as const
  }

  return 'green' as const
}

function engineStatusTag(status: 'ok' | 'warning' | 'error' | 'offline') {
  switch (status) {
    case 'ok':
      return { type: 'green' as const, label: 'Running', icon: CheckmarkFilled }
    case 'warning':
      return { type: 'warm-gray' as const, label: 'Warning', icon: WarningAltFilled }
    case 'error':
      return { type: 'red' as const, label: 'Error', icon: Misuse }
    default:
      return { type: 'warm-gray' as const, label: 'Stopped', icon: Misuse }
  }
}

function nodeStateTag(state: string) {
  const lowered = state.toLowerCase()
  if (lowered.includes('run') || lowered.includes('active')) {
    return 'green' as const
  }
  if (lowered.includes('pause') || lowered.includes('idle')) {
    return 'warm-gray' as const
  }
  return 'red' as const
}

function renderValue(value: TableCellValue) {
  if (value == null || value === '') {
    return '—'
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  return String(value)
}

function buildSparklinePaths(points: number[], maxValue = 100) {
  if (points.length === 0) {
    return { linePath: '', areaPath: '' }
  }

  const coordinates = points.map((value, index) => {
    const x = points.length === 1 ? 100 : (index / (points.length - 1)) * 100
    const y = 100 - (Math.min(maxValue, Math.max(0, value)) / maxValue) * 100
    return { x, y }
  })

  const linePath = coordinates
    .map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ')
  const lastX = coordinates[coordinates.length - 1]?.x ?? 100
  const areaPath = `${linePath} L ${lastX.toFixed(2)} 100 L 0 100 Z`

  return { linePath, areaPath }
}

function SourceOfTruthSection({
  payload,
  isLoading,
  error,
  highlighted = false,
}: {
  payload: AudioSourceTruthPayload | null
  isLoading: boolean
  error: unknown
  highlighted?: boolean
}) {
  if (isLoading && !payload) {
    return (
      <Tile className={`audio-engine-page__section-tile${highlighted ? ' is-highlighted' : ''}`}>
        <div className="audio-engine-page__section-header">
          <div>
            <h2 className="audio-engine-page__section-title">Source of truth</h2>
          </div>
        </div>
        <LoadingState description="Loading source-of-truth snapshot" />
      </Tile>
    )
  }

  if (!payload) {
    return (
      <Tile className={`audio-engine-page__section-tile${highlighted ? ' is-highlighted' : ''}`}>
        <div className="audio-engine-page__section-header">
          <div>
            <h2 className="audio-engine-page__section-title">Source of truth</h2>
          </div>
        </div>
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Source of truth unavailable"
          subtitle={error instanceof Error ? error.message : 'Audio source-of-truth query failed.'}
        />
      </Tile>
    )
  }

  const tone = payload.status === 'aligned' ? 'green' : payload.status === 'warning' ? 'warm-gray' : 'red'

  const cells = [
    ['Profile', payload.profile.selected_profile],
    ['Clock master', payload.profile.clock_master],
    ['Target rate', `${payload.configured.engine_rate_hz} Hz`],
    ['Buffer', `${payload.configured.buffer_size_samples} smp`],
    ['Bit depth', `${payload.configured.bits_per_sample}-bit`],
    ['Engine runtime', `${payload.runtime.engine.sample_rate_hz || 0} Hz / ${payload.runtime.engine.buffer_size_samples || 0} smp`],
    ['PipeWire runtime', `${payload.runtime.pipewire.effective_rate_hz || 0} Hz / ${payload.runtime.pipewire.effective_quantum_samples || 0} smp`],
    ['S/PDIF', `${payload.configured.spdif.enabled ? 'Enabled' : 'Disabled'} · ${payload.configured.spdif_rate_hz} Hz`],
    ['AVB', `${payload.runtime.avb.enabled ? 'Enabled' : 'Disabled'} · ${payload.runtime.avb.state}`],
    ['Allowed rates', payload.configured.allowed_rates_hz.join(', ')],
  ]

  return (
    <Tile className={`audio-engine-page__section-tile${highlighted ? ' is-highlighted' : ''}`}>
      <div className="audio-engine-page__section-header">
        <div>
          <h2 className="audio-engine-page__section-title">Source of truth</h2>
        </div>
        <div className="audio-engine-page__tag-row">
          <Tag type={tone}>{payload.status.toUpperCase()}</Tag>
          <Tag type="cool-gray">{new Date(payload.timestamp).toLocaleTimeString()}</Tag>
        </div>
      </div>

      <div className="audio-engine-page__kv-grid">
        {cells.map(([label, value]) => (
          <div key={label} className="audio-engine-page__kv-tile">
            <span className="audio-engine-page__kv-label">{label}</span>
            <span className="audio-engine-page__kv-value">{value}</span>
          </div>
        ))}
      </div>

      {payload.consistency.issues.length > 0 ? (
        <div className="audio-engine-page__issues">
          {payload.consistency.issues.slice(0, 3).map((issue) => (
            <InlineNotification
              key={issue.id}
              kind={issue.severity === 'error' ? 'error' : issue.severity === 'warning' ? 'warning' : 'info'}
              lowContrast
              hideCloseButton
              title={issue.id}
              subtitle={issue.message}
            />
          ))}
        </div>
      ) : null}
    </Tile>
  )
}

function HealthList({
  title,
  rows,
}: {
  title: string
  rows: Array<{ label: string; value: string; tag?: React.ReactNode }>
}) {
  return (
    <Tile className="audio-engine-page__health-tile">
      <div className="audio-engine-page__section-header">
        <h3 className="audio-engine-page__section-title">{title}</h3>
      </div>
      <StructuredListWrapper aria-label={title}>
        <StructuredListBody>
          {rows.map((row) => (
            <StructuredListRow key={row.label}>
              <StructuredListCell>{row.label}</StructuredListCell>
              <StructuredListCell className="audio-engine-page__mono">{row.value}</StructuredListCell>
              <StructuredListCell>{row.tag ?? null}</StructuredListCell>
            </StructuredListRow>
          ))}
        </StructuredListBody>
      </StructuredListWrapper>
    </Tile>
  )
}

function LatencyMonitorPanel({ pressure }: { pressure: ReturnType<typeof useLatencyPressure> }) {
  const [pressureHistory, setPressureHistory] = useState<number[]>([])

  useEffect(() => {
    if (typeof pressure.pressurePercent !== 'number') {
      return
    }

    setPressureHistory((previous) => [...previous.slice(-59), pressure.pressurePercent ?? 0])
  }, [pressure.pressurePercent])

  const graphPaths = useMemo(() => buildSparklinePaths(pressureHistory, 100), [pressureHistory])
  const pressureStyle = useMemo(
    () => ({
      '--audio-engine-pressure-color': pressure.toneColor,
      '--audio-engine-pressure-fill': pressure.fillColor,
    }) as CSSProperties,
    [pressure.fillColor, pressure.toneColor],
  )

  return (
    <Tile className="audio-engine-page__latency-monitor" style={pressureStyle}>
      <div className="audio-engine-page__section-header">
        <div>
          <h3 className="audio-engine-page__section-title">Latency monitor</h3>
          <p className="audio-engine-page__muted">
            Shared operator score driven by latency, callback budget, jitter, headroom, and xruns.
          </p>
        </div>
        <Button kind="danger--tertiary" size="sm" renderIcon={Renew} onClick={() => void pressure.resetXruns()} disabled={pressure.isResetting}>
          {pressure.isResetting ? 'Resetting…' : 'Reset xruns'}
        </Button>
      </div>
      <div className="audio-engine-page__latency-grid">
        <div className="audio-engine-page__latency-score-card">
          <span className="audio-engine-page__kv-label">Score</span>
          <SegmentedLedText
            value={pressure.scoreDisplay}
            size="md"
            color={pressure.toneColor}
            className="audio-engine-page__latency-score-digits"
          />
          <span className="audio-engine-page__latency-status">{pressure.statusLabel}</span>
        </div>
        <div className="audio-engine-page__pressure-graph-card">
          <span className="audio-engine-page__kv-label">Latency pressure</span>
          <svg viewBox="0 0 100 100" className="audio-engine-page__sparkline" role="img" aria-label="Latency pressure history">
            <line x1="0" x2="100" y1="30" y2="30" className="audio-engine-page__pressure-threshold" />
            {graphPaths.areaPath ? <path d={graphPaths.areaPath} className="audio-engine-page__pressure-area" /> : null}
            {graphPaths.linePath ? <path d={graphPaths.linePath} className="audio-engine-page__pressure-line" /> : null}
          </svg>
          <div className="audio-engine-page__pressure-meta">
            <span>{pressure.pressurePercent != null ? `${pressure.pressurePercent}% pressure` : 'Waiting for telemetry'}</span>
            <span>
              {pressure.inputs.effectiveLatencyMs != null
                ? `RTL p95 ${pressure.inputs.effectiveLatencyMs.toFixed(2)} ms`
                : 'RTL p95 —'}
            </span>
            <span>
              {pressure.inputs.callbackLoadPercent != null
                ? `Callback ${pressure.inputs.callbackLoadPercent}% of budget`
                : 'Callback —'}
            </span>
          </div>
        </div>
        <div className="audio-engine-page__latency-score-card">
          <span className="audio-engine-page__kv-label">XRuns</span>
          <span className="audio-engine-page__latency-stat">{pressure.isAvailable ? (pressure.inputs.xrunCount ?? 0) : '—'}</span>
          <span className="audio-engine-page__muted">
            {pressure.inputs.jitterP95Ms != null
              ? `Jitter p95 ${pressure.inputs.jitterP95Ms.toFixed(3)} ms`
              : 'Jitter p95 —'}
          </span>
        </div>
      </div>
    </Tile>
  )
}

function RoutingDetailsPanel({ row }: { row: RoutingRow }) {
  return (
    <div className="audio-engine-page__expanded-row">
      <div className="audio-engine-page__expanded-grid">
        {row.details.map((detail) => (
          <div key={detail.label} className="audio-engine-page__expanded-card">
            <span className="audio-engine-page__kv-label">{detail.label}</span>
            <div className="audio-engine-page__expanded-value">{detail.value}</div>
          </div>
        ))}
      </div>
      {row.actions?.length ? (
        <div className="audio-engine-page__expanded-actions">
          {row.actions.map((action) => (
            <Button key={action.label} kind={action.kind ?? 'tertiary'} size="sm" onClick={action.onClick}>
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function RoutingTable({
  definition,
  mobile,
  highlighted = false,
  renderCell,
}: {
  definition: RoutingDefinition
  mobile: boolean
  highlighted?: boolean
  renderCell?: (row: RoutingRow, headerKey: string, value: TableCellValue) => React.ReactNode
}) {
  const [expandedRowIds, setExpandedRowIds] = useState<Record<string, boolean>>({})

  const table = (
    <TableContainer title={definition.title} className="audio-engine-page__table-container">
      <TableToolbar>
        <TableToolbarContent>
          <Tag type="cool-gray">{definition.rows.length} rows</Tag>
          <Tag type="green">Expandable detail</Tag>
        </TableToolbarContent>
      </TableToolbar>
      <Table aria-label={definition.title}>
        <TableHead>
          <TableRow>
            <TableExpandHeader aria-label={`Expand rows for ${definition.title}`} />
            {definition.headers.map((header) => (
              <TableHeader key={header.key}>{header.header}</TableHeader>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {definition.rows.map((row) => {
            const isExpanded = expandedRowIds[row.id] ?? false
            const expandedRowId = `${definition.id}:${row.id}:expanded`

            return (
              <Fragment key={row.id}>
                <TableExpandRow
                  aria-label={`Expand row for ${renderValue(row.cells[definition.headers[0]?.key])}`}
                  aria-controls={expandedRowId}
                  isExpanded={isExpanded}
                  onExpand={() => {
                    setExpandedRowIds((previous) => ({
                      ...previous,
                      [row.id]: !isExpanded,
                    }))
                  }}
                >
                  {definition.headers.map((header) => {
                    const value = row.cells[header.key]

                    return (
                      <TableCell key={`${row.id}:${header.key}`}>
                        {renderCell ? renderCell(row, header.key, value) : renderValue(value)}
                      </TableCell>
                    )
                  })}
                </TableExpandRow>
                <TableExpandedRow id={expandedRowId} colSpan={definition.headers.length + 1}>
                  <RoutingDetailsPanel row={row} />
                </TableExpandedRow>
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )

  if (!mobile) {
    return (
      <Tile id={definition.anchorId} className={`audio-engine-page__table-tile${highlighted ? ' is-highlighted' : ''}`}>
        {table}
      </Tile>
    )
  }

  return (
    <div id={definition.anchorId}>
      <Accordion align="start" className="audio-engine-page__mobile-accordion">
        <AccordionItem title={`${definition.title} (${definition.rows.length})`}>
          <div className="audio-engine-page__accordion-body">{table}</div>
        </AccordionItem>
      </Accordion>
    </div>
  )
}

function JuceSourceTruthTable({
  rows,
  selectedNodeId,
}: {
  rows: JuceSourceTruthConnectionRow[]
  selectedNodeId: JuceSourceTruthNodeId | null
}) {
  const [expandedRowIds, setExpandedRowIds] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!selectedNodeId) {
      return
    }

    const matchingRows = rows.filter((row) => row.sourceId === selectedNodeId || row.targetId === selectedNodeId)
    if (matchingRows.length === 0) {
      return
    }

    setExpandedRowIds(() => (
      Object.fromEntries(
        rows.map((row) => [row.id, matchingRows.some((match) => match.id === row.id)]),
      )
    ))

    requestAnimationFrame(() => {
      document.getElementById(`juce-source-truth-row-${matchingRows[0].id}`)?.scrollIntoView?.({
        behavior: 'smooth',
        block: 'nearest',
      })
    })
  }, [rows, selectedNodeId])

  return (
    <TableContainer title="Connection details" className="audio-engine-page__table-container">
      <TableToolbar>
        <TableToolbarContent>
          <Tag type="cool-gray">{rows.length} connections</Tag>
          <Tag type={selectedNodeId ? 'green' : 'cool-gray'}>
            {selectedNodeId ? `Node focus: ${selectedNodeId}` : 'Select a graph node'}
          </Tag>
        </TableToolbarContent>
      </TableToolbar>
      <Table aria-label="JUCE source-of-truth connections">
        <TableHead>
          <TableRow>
            <TableExpandHeader aria-label="Expand source-of-truth connection row" />
            <TableHeader>Source</TableHeader>
            <TableHeader>Target</TableHeader>
            <TableHeader>Relationship</TableHeader>
            <TableHeader>Status</TableHeader>
            <TableHeader>Summary</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => {
            const isExpanded = expandedRowIds[row.id] ?? false
            const isLinked = selectedNodeId != null && (row.sourceId === selectedNodeId || row.targetId === selectedNodeId)
            const expandedRowId = `juce-source-truth-expanded-${row.id}`

            return (
              <Fragment key={row.id}>
                <TableExpandRow
                  id={`juce-source-truth-row-${row.id}`}
                  className={isLinked ? 'audio-engine-page__source-truth-row is-linked' : 'audio-engine-page__source-truth-row'}
                  isExpanded={isExpanded}
                  aria-controls={expandedRowId}
                  aria-label={`Expand connection ${row.sourceLabel} to ${row.targetLabel}`}
                  onExpand={() => {
                    setExpandedRowIds((previous) => ({
                      ...previous,
                      [row.id]: !isExpanded,
                    }))
                  }}
                >
                  <TableCell>{row.sourceLabel}</TableCell>
                  <TableCell>{row.targetLabel}</TableCell>
                  <TableCell>{row.relationship}</TableCell>
                  <TableCell>
                    <Tag type={row.status === 'Aligned' ? 'green' : row.status === 'Critical' ? 'red' : row.status === 'Review' ? 'warm-gray' : 'cool-gray'}>
                      {row.status}
                    </Tag>
                  </TableCell>
                  <TableCell>{row.summary}</TableCell>
                </TableExpandRow>
                <TableExpandedRow id={expandedRowId} colSpan={6}>
                  <div className="audio-engine-page__expanded-row">
                    <div className="audio-engine-page__expanded-grid">
                      {row.details.map((detail) => (
                        <div key={`${row.id}-${detail.label}`} className="audio-engine-page__expanded-card">
                          <span className="audio-engine-page__kv-label">{detail.label}</span>
                          <div className="audio-engine-page__expanded-value">{detail.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </TableExpandedRow>
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

export function AudioEnginePage() {
  const { activeNodeId, nodes, localNodeId, isClusterMode, setActiveNode } = useCluster()
  const setViewedNode = useViewedNodeStore((state) => state.setViewedNode)
  const { viewedNode, viewedNodeId } = useNodePageContext(NODE_PAGE_KEYS.audioEngine)
  const isMobile = useIsMobile()
  const [selectedAnchorId, setSelectedAnchorId] = useState<AudioEngineWorkspaceAnchorId | null>(null)
  const [selectedJuceSourceTruthNodeId, setSelectedJuceSourceTruthNodeId] = useState<JuceSourceTruthNodeId | null>(null)
  const localNode = nodes.find((node) => node.nodeId === localNodeId) ?? {
    nodeId: localNodeId,
    hostname: window.location.hostname || 'local',
    role: 'Standalone',
    isLocal: true,
    isOnline: true,
    latencyMs: 0,
    lastSeen: null,
  }

  const clusterOptions = useMemo<NodeOption[]>(
    () => [
      { id: 'all', label: 'All nodes' },
      ...nodes.map((node) => ({ id: node.nodeId, label: `${node.hostname}${node.isLocal ? ' (Local)' : ''}` })),
    ],
    [nodes],
  )

  const selectedOptionId = activeNodeId === 'all' ? 'all' : viewedNodeId
  const selectedClusterOption = clusterOptions.find((option) => option.id === selectedOptionId) ?? clusterOptions[0]
  const detailNode = activeNodeId === 'all'
    ? localNode
    : (viewedNode?.node_id === viewedNodeId ? viewedNode : null)
      ?? nodes.find((node) => node.nodeId === viewedNodeId)
      ?? localNode
  const detailNodeMeta = 'node_id' in detailNode
    ? {
        nodeId: detailNode.node_id,
        hostname: detailNode.hostname,
        role: detailNode.role,
        isLocal: detailNode.is_local,
      }
    : detailNode
  const detailNodeId = detailNodeMeta.isLocal ? null : detailNodeMeta.nodeId
  const sourceOfTruthQuery = useQuery<AudioSourceTruthPayload>({
    queryKey: ['audio-source-of-truth', detailNodeId ?? 'local'],
    queryFn: () => audioApi.getSourceOfTruth(detailNodeId),
    refetchInterval: 5000,
    staleTime: 2000,
  })
  const pw = usePipeWire({ nodeId: detailNodeId })
  const latencyPressure = useLatencyPressure({ nodeId: detailNodeId })
  const sourceOfTruth = sourceOfTruthQuery.data ?? null

  const handleSelectWorkspaceAnchor = useCallback((anchorId: AudioEngineWorkspaceAnchorId) => {
    setSelectedAnchorId(anchorId)
    const target = document.getElementById(anchorId)
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  const audioWorkspaceGraph = useMemo(() => buildAudioEngineWorkspaceGraphModel({
    sourceOfTruth,
    detailNodeLabel: detailNodeMeta.hostname,
    devices: pw.devices,
    nodes: pw.nodes,
    streams: pw.streams,
    links: pw.links,
    effectiveRate: pw.effectiveRate,
    effectiveQuantum: pw.effectiveQuantum,
    totalLatencyMs: pw.totalLatencyMs,
    xruns: pw.xruns,
    pressurePercent: latencyPressure.pressurePercent,
    selectedAnchorId,
  }), [
    detailNodeMeta.hostname,
    latencyPressure.pressurePercent,
    pw.devices,
    pw.effectiveQuantum,
    pw.effectiveRate,
    pw.links,
    pw.nodes,
    pw.streams,
    pw.totalLatencyMs,
    pw.xruns,
    selectedAnchorId,
    sourceOfTruth,
  ])
  const juceSourceTruthGraph = useMemo(() => buildJuceSourceTruthGraphModel({
    payload: sourceOfTruth,
    selectedNodeId: selectedJuceSourceTruthNodeId,
  }), [selectedJuceSourceTruthNodeId, sourceOfTruth])
  const grafanaPanels = useMemo<PlatformGrafanaPanelDefinition[]>(() => [
    {
      id: 'audio-engine-runtime',
      title: 'Engine Runtime',
      description: '24-hour runtime trend for latency pressure, xruns, and effective transport latency.',
      yAxisDomain: [0, 100],
      series: [
        { key: 'pressurePercent', label: 'Pressure %', value: latencyPressure.pressurePercent ?? null, color: 'var(--cds-support-warning)' },
        { key: 'xruns', label: 'XRuns', value: pw.xruns, color: 'var(--cds-support-error)' },
        { key: 'latencyMs', label: 'Latency ms', value: pw.totalLatencyMs, color: 'var(--cds-support-info)' },
      ],
    },
    {
      id: 'audio-engine-topology',
      title: 'Signal Topology',
      description: 'Node-context trend for device, stream, and link pressure inside the audio engine workspace.',
      series: [
        { key: 'devices', label: 'Devices', value: pw.devices.length, color: 'var(--cds-support-success)' },
        { key: 'streams', label: 'Streams', value: pw.streams.length, color: 'var(--cds-link-primary)' },
        { key: 'links', label: 'Links', value: pw.links.length, color: 'var(--cds-text-primary)' },
      ],
    },
  ], [latencyPressure.pressurePercent, pw.devices.length, pw.links.length, pw.streams.length, pw.totalLatencyMs, pw.xruns])

  const health = engineStatusTag(pw.overallStatus)
  const clusterHealth = clusterHealthType(nodes)
  const currentQuantum = pw.settings.clock_force_quantum || pw.settings.clock_quantum
  const quantumOptions = [32, 64, 128, 256, 512, 1024, 2048]
  const clockSourceValue = pw.settings.clock_force_rate > 0 ? 'forced' : 'pipewire'
  const clockRoleValue = detailNodeMeta.isLocal ? 'master' : 'slave'

  const pipewireRows = [
    {
      label: 'Daemon',
      value: pw.daemonVersion || 'Unavailable',
      tag: <Tag type={health.type} renderIcon={health.icon}>{health.label}</Tag>,
    },
    {
      label: 'Sample rate',
      value: `${pw.effectiveRate} Hz`,
      tag: <Tag type="cool-gray">Current</Tag>,
    },
    {
      label: 'Quantum',
      value: `${pw.effectiveQuantum} smp`,
      tag: <Tag type="cool-gray">Current</Tag>,
    },
    {
      label: 'Latency',
      value: `${pw.totalLatencyMs.toFixed(2)} ms`,
      tag: <Tag type={pw.isHighLatency ? 'warm-gray' : 'green'}>{pw.isHighLatency ? 'Review' : 'Nominal'}</Tag>,
    },
    {
      label: 'XRuns',
      value: String(pw.xruns),
      tag: <Tag type={pw.hasXruns ? 'red' : 'green'}>{pw.hasXruns ? 'Detected' : 'Clean'}</Tag>,
    },
  ]

  const juceRows = [
    {
      label: 'Detail node',
      value: detailNodeMeta.hostname,
      tag: <Tag type={detailNodeMeta.isLocal ? 'green' : 'cool-gray'}>{detailNodeMeta.isLocal ? 'Local' : 'Remote'}</Tag>,
    },
    {
      label: 'Devices',
      value: String(pw.devices.length),
      tag: <Tag type="cool-gray">Available</Tag>,
    },
    {
      label: 'Nodes',
      value: String(pw.nodes.length),
      tag: <Tag type="cool-gray">Observed</Tag>,
    },
    {
      label: 'Links',
      value: String(pw.links.length),
      tag: <Tag type="cool-gray">Observed</Tag>,
    },
    {
      label: 'Streams',
      value: String(pw.streams.length),
      tag: <Tag type="cool-gray">Observed</Tag>,
    },
  ]

  const devicesDefinition = useMemo<RoutingDefinition>(() => ({
    id: 'devices',
    title: 'Audio devices',
    anchorId: 'audio-engine-routing-devices',
    headers: [
      { key: 'name', header: 'Name' },
      { key: 'type', header: 'Type' },
      { key: 'rate', header: 'Rate' },
      { key: 'channels', header: 'Channels' },
      { key: 'status', header: 'Status' },
    ],
    rows: pw.devices.map((device: PipeWireDeviceInfo) => ({
      id: `device-${device.id}`,
      cells: {
        name: device.nick || device.name,
        type: device.bus || device.media_class,
        rate: String(device.properties?.['audio.rate'] ?? pw.effectiveRate),
        channels: String(device.properties?.['audio.channels'] ?? '—'),
        status: device.is_default ? 'default' : 'available',
      },
      details: [
        { label: 'Device ID', value: <span className="audio-engine-page__mono">{device.id}</span> },
        { label: 'Driver', value: device.driver || '—' },
        { label: 'Media class', value: device.media_class },
        { label: 'Bus', value: device.bus || '—' },
        { label: 'Clock source', value: device.is_default ? 'Default runtime device' : 'Standby / secondary' },
        { label: 'Observed channels', value: renderValue(device.properties?.['audio.channels'] ?? '—') },
      ],
    })),
  }), [pw.devices, pw.effectiveRate])

  const sinkNodes = useMemo(() => pw.nodes.filter((node) => node.media_class.includes('Sink')), [pw.nodes])
  const sourceNodes = useMemo(() => pw.nodes.filter((node) => node.media_class.includes('Source')), [pw.nodes])

  const sinksDefinition = useMemo<RoutingDefinition>(() => ({
    id: 'sinks',
    title: 'Sink nodes',
    anchorId: 'audio-engine-routing-sinks',
    headers: [
      { key: 'name', header: 'Name' },
      { key: 'channels', header: 'Channels' },
      { key: 'links', header: 'Links' },
      { key: 'state', header: 'State' },
    ],
    rows: sinkNodes.map((node: PipeWireNodeInfo) => {
      const linkCount = pw.links.filter((link) => link.output_node === node.id || link.input_node === node.id).length

      return {
        id: `sink-${node.id}`,
        cells: {
          name: node.nick || node.name,
          channels: node.channels,
          links: linkCount,
          state: node.state,
        },
        details: [
          { label: 'Node ID', value: <span className="audio-engine-page__mono">{node.id}</span> },
          { label: 'Media class', value: node.media_class },
          { label: 'Sample rate', value: `${node.sample_rate ?? pw.effectiveRate} Hz` },
          { label: 'Format', value: node.format || '—' },
          { label: 'Volume', value: `${Math.round(node.volume * 100)}%` },
          { label: 'Muted', value: node.muted ? 'Yes' : 'No' },
        ],
        actions: [
          {
            label: node.muted ? 'Unmute output node' : 'Mute output node',
            onClick: () => {
              void pw.setMute(node.id, !node.muted)
            },
          },
        ],
      }
    }),
  }), [pw.effectiveRate, pw.links, pw.setMute, sinkNodes])

  const sourcesDefinition = useMemo<RoutingDefinition>(() => ({
    id: 'sources',
    title: 'Source nodes',
    anchorId: 'audio-engine-routing-sources',
    headers: [
      { key: 'name', header: 'Name' },
      { key: 'channels', header: 'Channels' },
      { key: 'links', header: 'Links' },
      { key: 'state', header: 'State' },
    ],
    rows: sourceNodes.map((node: PipeWireNodeInfo) => {
      const linkCount = pw.links.filter((link) => link.output_node === node.id || link.input_node === node.id).length

      return {
        id: `source-${node.id}`,
        cells: {
          name: node.nick || node.name,
          channels: node.channels,
          links: linkCount,
          state: node.state,
        },
        details: [
          { label: 'Node ID', value: <span className="audio-engine-page__mono">{node.id}</span> },
          { label: 'Media class', value: node.media_class },
          { label: 'Sample rate', value: `${node.sample_rate ?? pw.effectiveRate} Hz` },
          { label: 'Format', value: node.format || '—' },
          { label: 'Volume', value: `${Math.round(node.volume * 100)}%` },
          { label: 'Driver node', value: node.is_driver ? 'Yes' : 'No' },
        ],
        actions: [
          {
            label: node.muted ? 'Unmute input node' : 'Mute input node',
            onClick: () => {
              void pw.setMute(node.id, !node.muted)
            },
          },
        ],
      }
    }),
  }), [pw.effectiveRate, pw.links, pw.setMute, sourceNodes])

  const streamsDefinition = useMemo<RoutingDefinition>(() => ({
    id: 'streams',
    title: 'Active streams',
    anchorId: 'audio-engine-routing-streams',
    headers: [
      { key: 'path', header: 'Source → Sink' },
      { key: 'format', header: 'Format' },
      { key: 'latency', header: 'Latency' },
      { key: 'state', header: 'State' },
    ],
    rows: pw.streams.map((stream: PipeWireStreamInfo) => ({
      id: `stream-${stream.id}`,
      cells: {
        path: `${stream.client_name} → ${stream.media_name}`,
        format: `${stream.sample_rate ?? pw.effectiveRate} Hz / ${stream.channels} ch`,
        latency: `${pw.totalLatencyMs.toFixed(2)} ms`,
        state: stream.state || stream.direction,
      },
      details: [
        { label: 'Stream ID', value: <span className="audio-engine-page__mono">{stream.id}</span> },
        { label: 'Client PID', value: <span className="audio-engine-page__mono">{stream.client_pid}</span> },
        { label: 'Direction', value: stream.direction },
        { label: 'Channels', value: `${stream.channels}` },
        { label: 'Sample rate', value: `${stream.sample_rate ?? pw.effectiveRate} Hz` },
        { label: 'Observed latency', value: `${pw.totalLatencyMs.toFixed(2)} ms` },
      ],
    })),
  }), [pw.effectiveRate, pw.streams, pw.totalLatencyMs])

  const portsDefinition = useMemo<RoutingDefinition>(() => ({
    id: 'ports',
    title: 'Port connections',
    anchorId: 'audio-engine-routing-links',
    headers: [
      { key: 'source', header: 'Source port' },
      { key: 'dest', header: 'Dest port' },
      { key: 'type', header: 'Type' },
      { key: 'state', header: 'State' },
    ],
    rows: pw.links.map((link: PipeWireLinkInfo) => ({
      id: `link-${link.id}`,
      cells: {
        source: `${link.output_node}:${link.output_port}`,
        dest: `${link.input_node}:${link.input_port}`,
        type: 'Audio',
        state: link.state,
      },
      details: [
        { label: 'Link ID', value: <span className="audio-engine-page__mono">{link.id}</span> },
        { label: 'Output node', value: <span className="audio-engine-page__mono">{link.output_node}</span> },
        { label: 'Output port', value: link.output_port },
        { label: 'Input node', value: <span className="audio-engine-page__mono">{link.input_node}</span> },
        { label: 'Input port', value: link.input_port },
        { label: 'State', value: link.state },
      ],
    })),
  }), [pw.links])

  const alerts = pw.alerts

  useSetShellWindow({
    title: 'Audio Engine',
    kicker: 'Platform / Audio Engine',
    actions: [
      { id: 'health', label: health.label, status: (health.type === 'green' ? 'ok' : health.type === 'red' ? 'error' : 'warn') as "ok" | "warn" | "error" | "info", disabled: true },
    ],
  }, [health.label, health.type])

  return (
    <div className="audio-engine-page">
      <Layer className="audio-engine-page__surface">
        {isClusterMode ? (
          <div className="audio-engine-page__header-band audio-engine-page__header-band--dropdown">
            <div className="audio-engine-page__header-control">
              <Dropdown
                id="audio-engine-node-selector"
                titleText="Detail node"
                label="Select a node"
                items={clusterOptions}
                selectedItem={selectedClusterOption}
                itemToString={(item) => item?.label ?? ''}
                onChange={({ selectedItem }) => {
                  if (!selectedItem) {
                    return
                  }
                  if (selectedItem.id === 'all') {
                    setActiveNode('all')
                    return
                  }
                  setActiveNode(null)
                  setViewedNode(NODE_PAGE_KEYS.audioEngine, selectedItem.id)
                }}
              />
            </div>
          </div>
        ) : null}

        <div className="audio-engine-page__header-band">
          {isClusterMode ? (
            <div className="audio-engine-page__header-summary">
              <div>
                <h2 className="audio-engine-page__section-title">Cluster mode</h2>
              </div>
              <div className="audio-engine-page__tag-row">
                <Tag type={clusterHealth}>Cluster health</Tag>
                <Tag type="cool-gray">{nodes.length} nodes</Tag>
              </div>
            </div>
          ) : (
            <div className="audio-engine-page__header-summary">
              <div>
                <h2 className="audio-engine-page__section-title">{detailNodeMeta.hostname}</h2>
              </div>
              <div className="audio-engine-page__tag-row">
                <Tag type="warm-gray">{detailNodeMeta.role || 'Standalone'}</Tag>
                <Tag type="cool-gray">Single Node</Tag>
              </div>
            </div>
          )}
        </div>

        {isClusterMode ? (
          <Accordion align="start" className="audio-engine-page__cluster-accordion">
            <AccordionItem title="Cluster engine overview">
              <div className="audio-engine-page__accordion-body">
                <ClusterEngineGrid />
              </div>
            </AccordionItem>
          </Accordion>
        ) : (
          <div id="audio-engine-source-of-truth">
            <SourceOfTruthSection
              payload={sourceOfTruth}
              isLoading={sourceOfTruthQuery.isLoading}
              error={sourceOfTruthQuery.error}
              highlighted={selectedAnchorId === 'audio-engine-source-of-truth'}
            />
          </div>
        )}

        <section className="audio-engine-page__section" aria-labelledby="audio-engine-workspace">
          <div className="audio-engine-page__section-header">
            <div>
              <h2 id="audio-engine-workspace" className="audio-engine-page__section-title">Audio Flow Workspace</h2>
              <p className="audio-engine-page__muted">{audioWorkspaceGraph.pulseCopy}</p>
            </div>
            <div className="audio-engine-page__tag-row">
              {audioWorkspaceGraph.summaryTags.map((tag) => (
                <Tag key={tag.label} type={tag.type}>{tag.label}</Tag>
              ))}
            </div>
          </div>
          <Tile className="audio-engine-page__workspace-hero">
            <AudioEngineWorkspaceGraph model={audioWorkspaceGraph} onSelectAnchor={handleSelectWorkspaceAnchor} />
          </Tile>
        </section>

        <section className="audio-engine-page__section" aria-labelledby="audio-engine-juce-source-truth">
          <div className="audio-engine-page__section-header">
            <div>
              <h2 id="audio-engine-juce-source-truth" className="audio-engine-page__section-title">JUCE Graph: Source of Truth</h2>
              <p className="audio-engine-page__muted">{juceSourceTruthGraph.pulseCopy}</p>
            </div>
            <div className="audio-engine-page__tag-row">
              {juceSourceTruthGraph.summaryTags.map((tag) => (
                <Tag key={tag.label} type={tag.type}>{tag.label}</Tag>
              ))}
            </div>
          </div>
          <Tile className="audio-engine-page__source-truth-card">
            <div className="audio-engine-page__source-truth-card-section">
              <JuceSourceTruthGraph
                model={juceSourceTruthGraph}
                onSelectNode={setSelectedJuceSourceTruthNodeId}
              />
            </div>
            <div className="audio-engine-page__source-truth-card-section audio-engine-page__source-truth-card-section--table">
              {juceSourceTruthGraph.rows.length > 0 ? (
                <JuceSourceTruthTable
                  rows={juceSourceTruthGraph.rows}
                  selectedNodeId={selectedJuceSourceTruthNodeId}
                />
              ) : (
                <InlineNotification
                  kind="error"
                  lowContrast
                  hideCloseButton
                  title="Source-of-truth connections unavailable"
                  subtitle={sourceOfTruthQuery.error instanceof Error ? sourceOfTruthQuery.error.message : 'No authority chain is available for this node yet.'}
                />
              )}
            </div>
          </Tile>
        </section>

        <section className="audio-engine-page__section" aria-labelledby="audio-engine-grafana-trends">
          <div className="audio-engine-page__section-header">
            <div>
              <h2 id="audio-engine-grafana-trends" className="audio-engine-page__section-title">Grafana Trends</h2>
              <p className="audio-engine-page__muted">Read-only 24-hour operator trends for the active audio-engine context.</p>
            </div>
          </div>
          <PlatformGrafanaPanelDeck panels={grafanaPanels} />
        </section>

        <section className="audio-engine-page__section" aria-labelledby="audio-engine-metering">
          <div className="audio-engine-page__section-header">
            <h2 id="audio-engine-metering" className="audio-engine-page__section-title">Live Metering</h2>
          </div>

          <Grid condensed fullWidth>
              <Column sm={4} md={4} lg={4}>
                <Tile className="audio-engine-page__panel-tile">
                  <div className="audio-engine-page__panel-header">
                    <ChartLine size={20} />
                    <h3 className="audio-engine-page__panel-title">Frequency Spectrum</h3>
                  </div>
                  <SpectrumAnalyzer nodeId={detailNodeId} mode="bars" height={220} barCount={64} showLabels showPeaks />
                </Tile>
              </Column>
              <Column sm={4} md={4} lg={4}>
                <VuMeterDisplay nodeId={detailNodeId} showInput showOutput />
              </Column>
              <Column sm={4} md={4} lg={4}>
                <Tile className="audio-engine-page__panel-tile">
                  <div className="audio-engine-page__panel-header">
                    <Activity size={20} />
                    <h3 className="audio-engine-page__panel-title">Loudness (LUFS)</h3>
                  </div>
                  <LoudnessMeter nodeId={detailNodeId} targetLufs={-14} truePeakLimit={-1} compact={false} />
                </Tile>
              </Column>
              <Column sm={4} md={4} lg={4}>
                <div className="audio-engine-page__stack">
                  <Tile className="audio-engine-page__panel-tile">
                    <div className="audio-engine-page__panel-header">
                      <Activity size={20} />
                      <h3 className="audio-engine-page__panel-title">Phase Correlation</h3>
                    </div>
                    <PhaseCorrelationMeter nodeId={detailNodeId} showStereoInfo orientation="horizontal" />
                  </Tile>
                  <DynamicsMeteringPanel nodeId={detailNodeId} showCompressor showLimiter showGate />
                </div>
              </Column>
          </Grid>
        </section>

        <section className="audio-engine-page__section" aria-labelledby="audio-engine-health">
          <div className="audio-engine-page__section-header">
            <h2 id="audio-engine-health" className="audio-engine-page__section-title">Engine Health</h2>
          </div>

          <Grid condensed fullWidth>
              <Column sm={4} md={4} lg={8}>
                <HealthList
                  title="PipeWire daemon"
                  rows={pipewireRows}
                />
              </Column>
              <Column sm={4} md={4} lg={8}>
                <HealthList
                  title="JUCE engine"
                  rows={juceRows}
                />
              </Column>
          </Grid>

          {alerts.length > 0 ? (
            <div className="audio-engine-page__issues">
              {alerts.map((alert: PipeWireAlert, index) => (
                <InlineNotification
                  key={`${alert.severity}-${index}`}
                  kind={alert.severity === 'error' ? 'error' : alert.severity === 'warning' ? 'warning' : 'info'}
                  lowContrast
                  hideCloseButton
                  title={`Alert ${index + 1}`}
                  subtitle={alert.message}
                />
              ))}
            </div>
          ) : null}
        </section>

        <section className="audio-engine-page__section" aria-labelledby="audio-engine-routing">
          <div className="audio-engine-page__section-header">
            <div>
              <h2 id="audio-engine-routing" className="audio-engine-page__section-title">Signal Path &amp; Routing</h2>
              <p className="audio-engine-page__muted">Each row expands for deeper diagnostics, quick mute actions, and the same device or node detail surfaced by the graph above.</p>
            </div>
          </div>

          <Grid condensed fullWidth>
              <Column sm={4} md={4} lg={8}>
                <RoutingTable
                  definition={devicesDefinition}
                  mobile={isMobile}
                  highlighted={selectedAnchorId === devicesDefinition.anchorId}
                  renderCell={(_row, headerKey, value) => {
                    if (headerKey === 'status') {
                      return <Tag type={String(value) === 'default' ? 'green' : 'cool-gray'}>{renderValue(value)}</Tag>
                    }

                    return renderValue(value)
                  }}
                />
              </Column>
              <Column sm={4} md={4} lg={8}>
                <RoutingTable
                  definition={sinksDefinition}
                  mobile={isMobile}
                  highlighted={selectedAnchorId === sinksDefinition.anchorId}
                  renderCell={(_row, headerKey, value) => {
                    if (headerKey === 'state') {
                      return <Tag type={nodeStateTag(renderValue(value))}>{renderValue(value)}</Tag>
                    }

                    return renderValue(value)
                  }}
                />
              </Column>
              <Column sm={4} md={4} lg={8}>
                <RoutingTable
                  definition={sourcesDefinition}
                  mobile={isMobile}
                  highlighted={selectedAnchorId === sourcesDefinition.anchorId}
                  renderCell={(_row, headerKey, value) => {
                    if (headerKey === 'state') {
                      return <Tag type={nodeStateTag(renderValue(value))}>{renderValue(value)}</Tag>
                    }

                    return renderValue(value)
                  }}
                />
              </Column>
              <Column sm={4} md={4} lg={8}>
                <RoutingTable
                  definition={streamsDefinition}
                  mobile={isMobile}
                  highlighted={selectedAnchorId === streamsDefinition.anchorId}
                  renderCell={(_row, headerKey, value) => {
                    if (headerKey === 'state') {
                      return <Tag type={nodeStateTag(renderValue(value))}>{renderValue(value)}</Tag>
                    }

                    return renderValue(value)
                  }}
                />
              </Column>
              <Column sm={4} md={8} lg={16}>
                <RoutingTable
                  definition={portsDefinition}
                  mobile={isMobile}
                  highlighted={selectedAnchorId === portsDefinition.anchorId}
                  renderCell={(_row, headerKey, value) => {
                    if (headerKey === 'state') {
                      return <Tag type={nodeStateTag(renderValue(value))}>{renderValue(value)}</Tag>
                    }

                    return renderValue(value)
                  }}
                />
              </Column>
          </Grid>
        </section>

        <section
          id="audio-engine-diagnostics"
          className={`audio-engine-page__section${selectedAnchorId === 'audio-engine-diagnostics' ? ' is-highlighted' : ''}`}
          aria-labelledby="audio-engine-diagnostics-title"
        >
          <div className="audio-engine-page__section-header">
            <h2 id="audio-engine-diagnostics-title" className="audio-engine-page__section-title">Diagnostics &amp; Controls</h2>
          </div>

          <Grid condensed fullWidth>
              <Column sm={4} md={4} lg={8}>
                <div className="audio-engine-page__stack">
                  <Tile className="audio-engine-page__panel-tile">
                    <div className="audio-engine-page__panel-header">
                      <Chip size={20} />
                      <h3 className="audio-engine-page__panel-title">CPU &amp; DSP load</h3>
                    </div>
                    <CPUMeterPanel nodeId={detailNodeId} showBreakdown compact={false} />
                  </Tile>
                  <Tile className="audio-engine-page__panel-tile">
                    <div className="audio-engine-page__panel-header">
                      <Timer size={20} />
                      <h3 className="audio-engine-page__panel-title">Latency analysis</h3>
                    </div>
                    <LatencyDisplay nodeId={detailNodeId} showBreakdown compact={false} />
                  </Tile>
                  <LatencyMonitorPanel pressure={latencyPressure} />
                </div>
              </Column>
              <Column sm={4} md={4} lg={8}>
                <div className="audio-engine-page__stack">
                  <Tile className="audio-engine-page__panel-tile">
                    <div className="audio-engine-page__panel-header">
                      <SettingsAdjust size={20} />
                      <h3 className="audio-engine-page__panel-title">Buffer Size (samples)</h3>
                    </div>
                    <RadioButtonGroup
                      legendText="Quantum"
                      name="audio-engine-quantum"
                      valueSelected={String(currentQuantum)}
                      orientation="vertical"
                      onChange={(value) => {
                        void pw.setQuantum(Number(value))
                      }}
                    >
                      {quantumOptions.map((value) => (
                        <RadioButton
                          key={value}
                          id={`audio-engine-quantum-${value}`}
                          labelText={`${value} samples`}
                          value={String(value)}
                        />
                      ))}
                    </RadioButtonGroup>
                  </Tile>

                  <Tile className="audio-engine-page__panel-tile">
                    <div className="audio-engine-page__panel-header">
                      <SettingsView size={20} />
                      <h3 className="audio-engine-page__panel-title">Clock Configuration</h3>
                    </div>
                    <div className="audio-engine-page__stack">
                      <Select id="audio-engine-clock-source" labelText="Clock source" value={clockSourceValue} disabled>
                        <SelectItem value="pipewire" text="PipeWire clock" />
                        <SelectItem value="forced" text="Forced rate" />
                      </Select>
                      <RadioButtonGroup
                        legendText="Role"
                        name="audio-engine-clock-role"
                        valueSelected={clockRoleValue}
                        orientation="vertical"
                      >
                        <RadioButton id="audio-engine-clock-master" labelText="Master" value="master" disabled />
                        <RadioButton id="audio-engine-clock-slave" labelText="Slave" value="slave" disabled />
                      </RadioButtonGroup>
                    </div>
                  </Tile>

                  <Tile className="audio-engine-page__panel-tile">
                    <div className="audio-engine-page__panel-header">
                      <Timer size={20} />
                      <h3 className="audio-engine-page__panel-title">Latency breakdown</h3>
                    </div>
                    <StructuredListWrapper aria-label="Latency breakdown">
                      <StructuredListBody>
                        <StructuredListRow>
                          <StructuredListCell>Graph</StructuredListCell>
                          <StructuredListCell className="audio-engine-page__mono">{pw.graphLatencyMs.toFixed(2)} ms</StructuredListCell>
                        </StructuredListRow>
                        <StructuredListRow>
                          <StructuredListCell>Driver</StructuredListCell>
                          <StructuredListCell className="audio-engine-page__mono">{pw.driverLatencyMs.toFixed(2)} ms</StructuredListCell>
                        </StructuredListRow>
                        <StructuredListRow>
                          <StructuredListCell>Total</StructuredListCell>
                          <StructuredListCell className="audio-engine-page__mono">{pw.totalLatencyMs.toFixed(2)} ms</StructuredListCell>
                        </StructuredListRow>
                      </StructuredListBody>
                    </StructuredListWrapper>
                    <ProgressBar
                      label="Latency pressure"
                      helperText={latencyPressure.helperText}
                      max={100}
                      value={latencyPressure.pressurePercent ?? 0}
                      status={latencyPressure.tone === 'red' ? 'error' : 'active'}
                    />
                    <div className="audio-engine-page__pressure-progress-summary" style={{ '--audio-engine-pressure-color': latencyPressure.toneColor } as CSSProperties}>
                      <SegmentedLedText
                        value={latencyPressure.scoreDisplay}
                        size="sm"
                        color={latencyPressure.toneColor}
                      />
                      <span>{latencyPressure.statusLabel}</span>
                    </div>
                  </Tile>
                </div>
              </Column>
          </Grid>
        </section>
      </Layer>
    </div>
  )
}

export default AudioEnginePage
