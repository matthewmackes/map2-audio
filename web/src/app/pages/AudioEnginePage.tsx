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
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Accordion,
  AccordionItem,
  Button,
  Column,
  DataTable,
  Dropdown,
  Grid,
  InlineLoading,
  InlineNotification,
  Layer,
  ProgressBar,
  RadioButton,
  RadioButtonGroup,
  Row,
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
  DataTable as DataTableIcon,
  Misuse,
  Network_4,
  Renew,
  SettingsAdjust,
  SettingsView,
  Timer,
  WarningAltFilled,
  Wifi,
} from '@carbon/icons-react'
import { usePipeWire } from '../hooks/usePipeWire'
import { audioApi, latencyV2Api } from '../../map2/api'
import type { LatencyJitterStats } from '../../map2/api'
import type {
  AudioSourceTruthPayload,
  PipeWireAlert,
  PipeWireDeviceInfo,
  PipeWireLinkInfo,
  PipeWireNodeInfo,
  PipeWireStreamInfo,
} from '../../map2/types'
import { useCluster } from '../contexts/ClusterContext'
import { ClusterEngineGrid } from '../components/AudioEngine/ClusterEngineGrid'
import { NodeContextBanner } from '../components/NodeContextBanner/NodeContextBanner'
import { NodeContextPicker } from '../components/NodeContextPicker/NodeContextPicker'
import { PageHeader } from '../components/PageHeader'
import { useNodePageContext } from '../hooks/useNodePageContext'
import { useViewedNodeStore } from '../stores/viewedNodeStore'
import { NODE_PAGE_KEYS } from '../utils/nodeDisplay'
import { SpectrumAnalyzer } from '../components/Visualizations/SpectrumAnalyzer'
import { LoudnessMeter } from '../components/Visualizations/LoudnessMeter'
import { CPUMeterPanel } from '../components/Visualizations/CPUMeterPanel'
import { LatencyDisplay } from '../components/Visualizations/LatencyDisplay'
import { PhaseCorrelationMeter } from '../components/Visualizations/PhaseCorrelationMeter'
import { VuMeterDisplay } from '../components/Visualizations/VuMeterDisplay'
import { DynamicsMeteringPanel } from '../components/Visualizations/DynamicsMeteringPanel'

type TableCellValue = string | number | boolean | null | undefined
type RoutingRow = {
  id: string
  [key: string]: TableCellValue
}

type RoutingDefinition = {
  id: string
  title: string
  description: string
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

function SourceOfTruthSection({ nodeId }: { nodeId?: string | null }) {
  const sourceOfTruthQuery = useQuery<AudioSourceTruthPayload>({
    queryKey: ['audio-source-of-truth', nodeId ?? 'local'],
    queryFn: () => audioApi.getSourceOfTruth(nodeId),
    refetchInterval: 5000,
    staleTime: 2000,
  })

  if (sourceOfTruthQuery.isLoading && !sourceOfTruthQuery.data) {
    return (
      <Tile className="audio-engine-page__section-tile">
        <div className="audio-engine-page__section-header">
          <div>
            <h2 className="audio-engine-page__section-title">Source of truth</h2>
            <p className="audio-engine-page__muted">Loading rate, clock, and transport alignment.</p>
          </div>
        </div>
        <InlineLoading description="Loading source-of-truth snapshot" />
      </Tile>
    )
  }

  if (!sourceOfTruthQuery.data) {
    return (
      <InlineNotification
        kind="error"
        lowContrast
        hideCloseButton
        title="Source of truth unavailable"
        subtitle={sourceOfTruthQuery.error instanceof Error ? sourceOfTruthQuery.error.message : 'Audio source-of-truth query failed.'}
      />
    )
  }

  const payload = sourceOfTruthQuery.data
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
    <Tile className="audio-engine-page__section-tile">
      <div className="audio-engine-page__section-header">
        <div>
          <h2 className="audio-engine-page__section-title">Source of truth</h2>
          <p className="audio-engine-page__muted">Single-node alignment snapshot for engine, PipeWire, S/PDIF, and AVB state.</p>
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
  description,
  rows,
}: {
  title: string
  description: string
  rows: Array<{ label: string; value: string; tag?: React.ReactNode }>
}) {
  return (
    <Tile className="audio-engine-page__health-tile">
      <div className="audio-engine-page__section-header">
        <div>
          <h3 className="audio-engine-page__section-title">{title}</h3>
          <p className="audio-engine-page__muted">{description}</p>
        </div>
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

function LatencyMonitorPanel({ nodeId }: { nodeId?: string | null }) {
  const [history, setHistory] = useState<number[]>([])
  const [isResetting, setIsResetting] = useState(false)

  const jitterQuery = useQuery<LatencyJitterStats>({
    queryKey: ['latency-jitter-stats', nodeId ?? 'local'],
    queryFn: () => latencyV2Api.getJitterStats(nodeId),
    refetchInterval: 1000,
    staleTime: 500,
  })

  useEffect(() => {
    const nextPoint = jitterQuery.data?.p95_ms
    if (typeof nextPoint !== 'number') {
      return
    }

    setHistory((previous) => [...previous.slice(-59), nextPoint])
  }, [jitterQuery.data?.p95_ms])

  const maxValue = Math.max(1, ...history)
  const sparklinePath = history.map((value, index) => {
    const x = history.length <= 1 ? 0 : (index / (history.length - 1)) * 100
    const y = 100 - (value / maxValue) * 100
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
  }).join(' ')

  const resetXruns = async () => {
    try {
      setIsResetting(true)
      await latencyV2Api.resetXruns(nodeId)
      await jitterQuery.refetch()
    } finally {
      setIsResetting(false)
    }
  }

  return (
    <Tile className="audio-engine-page__latency-monitor">
      <div className="audio-engine-page__section-header">
        <div>
          <h3 className="audio-engine-page__section-title">Latency monitor</h3>
          <p className="audio-engine-page__muted">Round-trip latency, callback jitter, and xrun recovery.</p>
        </div>
        <Button kind="danger--tertiary" size="sm" renderIcon={Renew} onClick={() => void resetXruns()} disabled={isResetting}>
          {isResetting ? 'Resetting…' : 'Reset xruns'}
        </Button>
      </div>
      <div className="audio-engine-page__latency-grid">
        <div className="audio-engine-page__kv-tile">
          <span className="audio-engine-page__kv-label">RTL P95</span>
          <span className="audio-engine-page__kv-value">{(jitterQuery.data?.rtl_p95_ms ?? 0).toFixed(2)} ms</span>
        </div>
        <div className="audio-engine-page__sparkline-card">
          <span className="audio-engine-page__kv-label">Jitter sparkline</span>
          <svg viewBox="0 0 100 100" className="audio-engine-page__sparkline" role="img" aria-label="Jitter sparkline">
            {sparklinePath ? <path d={sparklinePath} className="audio-engine-page__sparkline-path" /> : null}
          </svg>
          <span className="audio-engine-page__muted">p95 {(jitterQuery.data?.p95_ms ?? 0).toFixed(3)} ms</span>
        </div>
        <div className="audio-engine-page__kv-tile">
          <span className="audio-engine-page__kv-label">XRuns</span>
          <span className="audio-engine-page__kv-value">{jitterQuery.data?.xrun_count ?? 0}</span>
        </div>
      </div>
    </Tile>
  )
}

function RoutingTable({
  definition,
  mobile,
  renderCell,
}: {
  definition: RoutingDefinition
  mobile: boolean
  renderCell?: (rowId: string, headerKey: string, value: TableCellValue) => React.ReactNode
}) {
  const table = (
    <DataTable rows={definition.rows} headers={definition.headers} useZebraStyles>
      {({ rows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps, getToolbarProps }) => (
        <TableContainer
          {...getTableContainerProps()}
          title={definition.title}
          description={definition.description}
          className="audio-engine-page__table-container"
        >
          <TableToolbar {...getToolbarProps()}>
            <TableToolbarContent>
              <Tag type="cool-gray">{definition.rows.length} rows</Tag>
            </TableToolbarContent>
          </TableToolbar>
          <Table {...getTableProps()} aria-label={definition.title}>
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
                      <TableCell key={cell.id}>
                        {renderCell ? renderCell(row.id, cell.info.header, cell.value) : renderValue(cell.value)}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </DataTable>
  )

  if (!mobile) {
    return <Tile className="audio-engine-page__table-tile">{table}</Tile>
  }

  return (
    <Accordion align="start" className="audio-engine-page__mobile-accordion">
      <AccordionItem title={`${definition.title} (${definition.rows.length})`}>
        <div className="audio-engine-page__accordion-body">{table}</div>
      </AccordionItem>
    </Accordion>
  )
}

export function AudioEnginePage() {
  const { activeNodeId, nodes, localNodeId, isClusterMode, setActiveNode } = useCluster()
  const setViewedNode = useViewedNodeStore((state) => state.setViewedNode)
  const { localNode: pageLocalNode, topology: nodeTopology, viewedNodeId } = useNodePageContext(NODE_PAGE_KEYS.audioEngine)
  const isMobile = useIsMobile()
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
    : nodeTopology?.nodes.find((node) => node.node_id === viewedNodeId)
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
  const pw = usePipeWire({ nodeId: detailNodeId })

  const health = engineStatusTag(pw.overallStatus)
  const clusterHealth = clusterHealthType(nodes)
  const currentQuantum = pw.settings.clock_force_quantum || pw.settings.clock_quantum
  const quantumOptions = [32, 64, 128, 256, 512, 1024, 2048]
  const clockSourceValue = pw.settings.clock_force_rate > 0 ? 'forced' : 'pipewire'
  const clockRoleValue = detailNodeMeta.isLocal ? 'master' : 'slave'
  const sourceHost = window.location.hostname || detailNodeMeta.hostname

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
    description: 'Physical and logical devices discovered from PipeWire.',
    headers: [
      { key: 'name', header: 'Name' },
      { key: 'type', header: 'Type' },
      { key: 'rate', header: 'Rate' },
      { key: 'channels', header: 'Channels' },
      { key: 'status', header: 'Status' },
    ],
    rows: pw.devices.map((device: PipeWireDeviceInfo) => ({
      id: `device-${device.id}`,
      name: device.nick || device.name,
      type: device.bus || device.media_class,
      rate: String(device.properties?.['audio.rate'] ?? pw.effectiveRate),
      channels: String(device.properties?.['audio.channels'] ?? '—'),
      status: device.is_default ? 'default' : 'available',
    })),
  }), [pw.devices, pw.effectiveRate])

  const sinkNodes = useMemo(() => pw.nodes.filter((node) => node.media_class.includes('Sink')), [pw.nodes])
  const sourceNodes = useMemo(() => pw.nodes.filter((node) => node.media_class.includes('Source')), [pw.nodes])

  const sinksDefinition = useMemo<RoutingDefinition>(() => ({
    id: 'sinks',
    title: 'Sink nodes',
    description: 'Output nodes and their current channel/link state.',
    headers: [
      { key: 'name', header: 'Name' },
      { key: 'channels', header: 'Channels' },
      { key: 'links', header: 'Links' },
      { key: 'state', header: 'State' },
    ],
    rows: sinkNodes.map((node: PipeWireNodeInfo) => ({
      id: `sink-${node.id}`,
      name: node.nick || node.name,
      channels: node.channels,
      links: pw.links.filter((link) => link.output_node === node.id || link.input_node === node.id).length,
      state: node.state,
    })),
  }), [pw.links, sinkNodes])

  const sourcesDefinition = useMemo<RoutingDefinition>(() => ({
    id: 'sources',
    title: 'Source nodes',
    description: 'Input nodes and their current channel/link state.',
    headers: [
      { key: 'name', header: 'Name' },
      { key: 'channels', header: 'Channels' },
      { key: 'links', header: 'Links' },
      { key: 'state', header: 'State' },
    ],
    rows: sourceNodes.map((node: PipeWireNodeInfo) => ({
      id: `source-${node.id}`,
      name: node.nick || node.name,
      channels: node.channels,
      links: pw.links.filter((link) => link.output_node === node.id || link.input_node === node.id).length,
      state: node.state,
    })),
  }), [pw.links, sourceNodes])

  const streamsDefinition = useMemo<RoutingDefinition>(() => ({
    id: 'streams',
    title: 'Active streams',
    description: 'Client-to-media stream activity observed on the detail node.',
    headers: [
      { key: 'path', header: 'Source → Sink' },
      { key: 'format', header: 'Format' },
      { key: 'latency', header: 'Latency' },
      { key: 'state', header: 'State' },
    ],
    rows: pw.streams.map((stream: PipeWireStreamInfo) => ({
      id: `stream-${stream.id}`,
      path: `${stream.client_name} → ${stream.media_name}`,
      format: `${stream.sample_rate ?? pw.effectiveRate} Hz / ${stream.channels} ch`,
      latency: `${pw.totalLatencyMs.toFixed(2)} ms`,
      state: stream.state || stream.direction,
    })),
  }), [pw.effectiveRate, pw.streams, pw.totalLatencyMs])

  const portsDefinition = useMemo<RoutingDefinition>(() => ({
    id: 'ports',
    title: 'Port connections',
    description: 'Expanded link map for all active PipeWire ports.',
    headers: [
      { key: 'source', header: 'Source port' },
      { key: 'dest', header: 'Dest port' },
      { key: 'type', header: 'Type' },
      { key: 'state', header: 'State' },
    ],
    rows: pw.links.map((link: PipeWireLinkInfo) => ({
      id: `link-${link.id}`,
      source: `${link.output_node}:${link.output_port}`,
      dest: `${link.input_node}:${link.input_port}`,
      type: 'Audio',
      state: link.state,
    })),
  }), [pw.links])

  const alerts = pw.alerts

  return (
    <div className="audio-engine-page">
      {pageLocalNode ? (
        <NodeContextBanner pageKey={NODE_PAGE_KEYS.audioEngine} localNode={pageLocalNode} topology={nodeTopology} />
      ) : null}
      <Layer className="audio-engine-page__surface">
        <PageHeader
          title="Audio Engine"
          subtitle="Carbon operator surface for engine status, live metering, routing, and diagnostics."
          icon={<Activity size={32} />}
          actions={(
            <div className="audio-engine-page__header-actions">
              {isClusterMode ? (
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
              ) : null}
              <Tag type={health.type} renderIcon={health.icon}>
                {health.label}
              </Tag>
            </div>
          )}
        />

        <NodeContextPicker pageKey={NODE_PAGE_KEYS.audioEngine} topology={nodeTopology} />

        <div className="audio-engine-page__header-band">
          {isClusterMode ? (
            <div className="audio-engine-page__header-summary">
              <div>
                <h2 className="audio-engine-page__section-title">Cluster mode</h2>
                <p className="audio-engine-page__muted">
                  Compare all nodes, then drive detailed panels from {detailNodeMeta.hostname}.
                </p>
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
                <p className="audio-engine-page__muted">IP / host: {sourceHost}</p>
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
          <SourceOfTruthSection nodeId={detailNodeId} />
        )}

        <section className="audio-engine-page__section" aria-labelledby="audio-engine-metering">
          <div className="audio-engine-page__section-header">
            <div>
              <h2 id="audio-engine-metering" className="audio-engine-page__section-title">Live Metering</h2>
              <p className="audio-engine-page__muted">Always-visible operator strip for spectrum, levels, loudness, and dynamics.</p>
            </div>
          </div>

          <Grid condensed fullWidth>
            <Row>
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
                <Tile className="audio-engine-page__panel-tile">
                  <div className="audio-engine-page__panel-header">
                    <Wifi size={20} />
                    <h3 className="audio-engine-page__panel-title">Signal Levels</h3>
                  </div>
                  <VuMeterDisplay nodeId={detailNodeId} showInput showOutput />
                </Tile>
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
                  <Tile className="audio-engine-page__panel-tile">
                    <div className="audio-engine-page__panel-header">
                      <Chip size={20} />
                      <h3 className="audio-engine-page__panel-title">Dynamics</h3>
                    </div>
                    <DynamicsMeteringPanel nodeId={detailNodeId} showCompressor showLimiter showGate />
                  </Tile>
                </div>
              </Column>
            </Row>
          </Grid>
        </section>

        <section className="audio-engine-page__section" aria-labelledby="audio-engine-health">
          <div className="audio-engine-page__section-header">
            <div>
              <h2 id="audio-engine-health" className="audio-engine-page__section-title">Engine Health</h2>
              <p className="audio-engine-page__muted">PipeWire daemon status, JUCE engine state, and operational alerts.</p>
            </div>
          </div>

          <Grid condensed fullWidth>
            <Row>
              <Column sm={4} md={4} lg={8}>
                <HealthList
                  title="PipeWire daemon"
                  description="Clocking, latency, and transport state for the current detail node."
                  rows={pipewireRows}
                />
              </Column>
              <Column sm={4} md={4} lg={8}>
                <HealthList
                  title="JUCE engine"
                  description="Operator-facing summary of audio graph scale and node placement."
                  rows={juceRows}
                />
              </Column>
            </Row>
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
              <p className="audio-engine-page__muted">Always-expanded topology tables on desktop and tablet, with mobile accordions below 672px.</p>
            </div>
          </div>

          <Grid condensed fullWidth>
            <Row>
              <Column sm={4} md={4} lg={8}>
                <RoutingTable
                  definition={devicesDefinition}
                  mobile={isMobile}
                  renderCell={(_rowId, headerKey, value) => {
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
                  renderCell={(_rowId, headerKey, value) => {
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
                  renderCell={(_rowId, headerKey, value) => {
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
                  renderCell={(_rowId, headerKey, value) => {
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
                  renderCell={(_rowId, headerKey, value) => {
                    if (headerKey === 'state') {
                      return <Tag type={nodeStateTag(renderValue(value))}>{renderValue(value)}</Tag>
                    }

                    return renderValue(value)
                  }}
                />
              </Column>
            </Row>
          </Grid>
        </section>

        <section className="audio-engine-page__section" aria-labelledby="audio-engine-diagnostics">
          <div className="audio-engine-page__section-header">
            <div>
              <h2 id="audio-engine-diagnostics" className="audio-engine-page__section-title">Diagnostics &amp; Controls</h2>
              <p className="audio-engine-page__muted">Read-only metrics on the left, operator controls on the right.</p>
            </div>
          </div>

          <Grid condensed fullWidth>
            <Row>
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
                  <LatencyMonitorPanel nodeId={detailNodeId} />
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
                      legendText="Buffer Size (samples)"
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
                        legendText="Clock role"
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
                      helperText={`${Math.min(100, Math.round((pw.totalLatencyMs / 20) * 100))}% of 20 ms threshold`}
                      max={100}
                      value={Math.min(100, Math.round((pw.totalLatencyMs / 20) * 100))}
                      status={pw.isHighLatency ? 'error' : 'active'}
                    />
                  </Tile>
                </div>
              </Column>
            </Row>
          </Grid>
        </section>
      </Layer>
    </div>
  )
}

export default AudioEnginePage
