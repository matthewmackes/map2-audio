import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  InlineLoading,
  InlineNotification,
  Layer,
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
  Activity,
  CheckmarkFilled,
  Chip,
  ErrorFilled,
  Link,
  Microphone,
  Network_3 as NetworkThree,
  Settings,
  VolumeMute,
  VolumeUp,
  WarningAlt,
  WarningFilled,
  type CarbonIconType,
} from '@carbon/icons-react'
import { usePipeWire } from '../hooks/usePipeWire'
import { useCluster } from '../contexts/useCluster'
import type { PipeWireMetrics } from '../../map2/types'
import { EmptyState } from '../components/shared/EmptyState'
import { LoadingState } from '../components/shared/LoadingState'
import './PipeWirePage.css'

type PipeWireHealthStatus = 'ok' | 'warning' | 'error' | 'offline'

type ClusterPipeWireResponse = {
  nodes?: Record<string, PipeWireMetrics>
}

type ClusterPipeWireRow = {
  nodeId: string
  hostname: string
  role: string
  isOnline: boolean
  latencyMs: number | null
  metrics: PipeWireMetrics | null
  status: PipeWireHealthStatus
}

function getPipeWireStatus(metrics?: PipeWireMetrics | null): PipeWireHealthStatus {
  if (!metrics?.daemon?.running) return 'offline'
  if (metrics.alerts.some((alert) => alert.severity === 'error')) return 'error'
  if (metrics.alerts.some((alert) => alert.severity === 'warning') || metrics.xruns > 0) return 'warning'
  return 'ok'
}

function aggregatePipeWireStatus(rows: ClusterPipeWireRow[]): PipeWireHealthStatus {
  if (!rows.length) return 'offline'
  if (rows.some((row) => row.status === 'error')) return 'error'
  if (rows.some((row) => row.status === 'offline' || row.status === 'warning')) return 'warning'
  return 'ok'
}

function formatRateKhz(rate: number): string {
  return `${(rate / 1000).toFixed(rate % 1000 === 0 ? 0 : 1)} kHz`
}

function formatMutationError(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const body = 'body' in error ? (error as { body?: unknown }).body : undefined
  if (body && typeof body === 'object' && 'detail' in body && typeof (body as { detail?: unknown }).detail === 'string') {
    return (body as { detail: string }).detail
  }
  if (typeof body === 'string' && body.trim()) return body
  if ('message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message
  }
  return 'Failed to update PipeWire runtime settings.'
}

function statusTagType(status: PipeWireHealthStatus): 'green' | 'warm-gray' | 'red' | 'gray' {
  switch (status) {
    case 'ok':
      return 'green'
    case 'error':
      return 'red'
    case 'warning':
      return 'warm-gray'
    default:
      return 'gray'
  }
}

function daemonStateTagType(running: boolean, isOnline: boolean): 'green' | 'warm-gray' | 'red' {
  if (!isOnline) {
    return 'red'
  }
  return running ? 'green' : 'warm-gray'
}

function linkStateTagType(state: string): 'green' | 'warm-gray' | 'red' | 'gray' {
  if (state === 'active' || state === 'running') return 'green'
  if (state === 'error') return 'red'
  if (state === 'paused') return 'warm-gray'
  return 'gray'
}

function StatusBadge({ status }: { status: PipeWireHealthStatus }) {
  const statusText = status === 'ok' ? 'Healthy' : status === 'warning' ? 'Warning' : status === 'error' ? 'Error' : 'Offline'
  const StatusIcon = status === 'ok' ? CheckmarkFilled : status === 'warning' ? WarningFilled : ErrorFilled

  return (
    <Tag type={statusTagType(status)}>
      <span className="pipewire-page__tag-with-icon">
        <StatusIcon size={14} aria-hidden="true" />
        {statusText}
      </span>
    </Tag>
  )
}

function MetricCard({
  label,
  value,
  unit,
  icon: Icon,
  tone = 'gray',
}: {
  label: string
  value: string | number
  unit?: string
  icon: CarbonIconType
  tone?: 'gray' | 'green' | 'red' | 'warm-gray'
}) {
  return (
    <Layer className="pipewire-page__metric-card">
      <div className="pipewire-page__metric-head">
        <span className="pipewire-page__metric-label">{label}</span>
        <Icon size={16} aria-hidden="true" className="pipewire-page__metric-icon" />
      </div>
      <div className="pipewire-page__metric-value">
        {value}
        {unit ? <span className="pipewire-page__metric-unit">{unit}</span> : null}
      </div>
      <Tag type={tone}>Live</Tag>
    </Layer>
  )
}

function TableEmptyState({ text }: { text: string }) {
  const description = text === 'No audio devices detected'
    ? 'PipeWire is running, but this node is not currently reporting any devices.'
    : text === 'No sink/source nodes'
      ? 'PipeWire has not exposed any sink or source nodes for this view yet.'
      : text === 'No active audio streams'
        ? 'No active clients are streaming audio through PipeWire right now.'
        : text === 'No port connections'
          ? 'PipeWire ports are present, but no links are currently active.'
          : text === 'No PipeWire topology data available for this node.'
            ? 'Select another node or wait for PipeWire topology data to arrive.'
            : text === 'No default sink'
              ? 'Select or create a default sink to route output audio here.'
              : text === 'No default source'
                ? 'Select or create a default source to route input audio here.'
                : text === 'PipeWire nodes are present but there are no active port links right now.'
                  ? 'Nodes are available, but no active port links are present in the current topology.'
                  : undefined
  return <EmptyState title={text} description={description} compact className="pipewire-page__empty" align="left" />
}

function DaemonSection({ pw }: { pw: ReturnType<typeof usePipeWire> }) {
  return (
    <div className="pipewire-page__metrics-grid">
      <MetricCard icon={NetworkThree} label="Version" value={pw.daemonVersion || '--'} tone="green" />
      <MetricCard icon={Activity} label="Latency" value={pw.totalLatencyMs.toFixed(1)} unit="ms" tone={pw.isHighLatency ? 'warm-gray' : 'green'} />
      <MetricCard icon={Chip} label="Quantum" value={pw.effectiveQuantum} unit="smp" />
      <MetricCard icon={Activity} label="Sample rate" value={(pw.effectiveRate / 1000).toFixed(1)} unit="kHz" />
      <MetricCard icon={VolumeUp} label="Devices" value={pw.devices.length} />
      <MetricCard icon={Link} label="Links" value={pw.links.length} />
      <MetricCard icon={Microphone} label="Streams" value={pw.streams.length} />
      <MetricCard icon={WarningAlt} label="XRuns" value={pw.xruns} tone={pw.hasXruns ? 'red' : 'green'} />
    </div>
  )
}

function DevicesTable({ pw }: { pw: ReturnType<typeof usePipeWire> }) {
  if (!pw.devices.length) return <TableEmptyState text="No audio devices detected" />

  return (
    <TableContainer className="pipewire-page__table-wrap">
      <Table size="sm" className="pipewire-page__table">
        <TableHead>
          <TableRow>
            <TableHeader>ID</TableHeader>
            <TableHeader>Device</TableHeader>
            <TableHeader>Driver</TableHeader>
            <TableHeader>Default</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {pw.devices.map((device) => (
            <TableRow key={device.id}>
              <TableCell className="pipewire-page__mono">{device.id}</TableCell>
              <TableCell>{device.name}</TableCell>
              <TableCell>{device.driver}</TableCell>
              <TableCell>{device.is_default ? 'Primary' : '--'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

function NodesTable({ pw }: { pw: ReturnType<typeof usePipeWire> }) {
  if (!pw.nodes.length) return <TableEmptyState text="No sink/source nodes" />

  return (
    <TableContainer className="pipewire-page__table-wrap">
      <Table size="sm" className="pipewire-page__table">
        <TableHead>
          <TableRow>
            <TableHeader>ID</TableHeader>
            <TableHeader>Name</TableHeader>
            <TableHeader>Type</TableHeader>
            <TableHeader>Volume</TableHeader>
            <TableHeader>Mute</TableHeader>
            <TableHeader>Default</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {pw.nodes.map((node) => {
            const isSink = node.media_class.includes('Sink')
            return (
              <TableRow key={node.id}>
                <TableCell className="pipewire-page__mono">{node.id}</TableCell>
                <TableCell>{node.name}</TableCell>
                <TableCell>
                  <span className="pipewire-page__cell-with-icon">
                    {isSink ? <VolumeUp size={14} aria-hidden="true" /> : <Microphone size={14} aria-hidden="true" />}
                    {isSink ? 'Sink' : 'Source'}
                  </span>
                </TableCell>
                <TableCell className="pipewire-page__mono">{(node.volume * 100).toFixed(0)}%</TableCell>
                <TableCell>
                  {node.muted ? (
                    <span className="pipewire-page__cell-with-icon pipewire-page__cell-muted">
                      <VolumeMute size={14} aria-hidden="true" />
                      Muted
                    </span>
                  ) : (
                    <span className="pipewire-page__cell-with-icon pipewire-page__cell-live">
                      <VolumeUp size={14} aria-hidden="true" />
                      Live
                    </span>
                  )}
                </TableCell>
                <TableCell>{node.is_default ? 'Primary' : '--'}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

function StreamsTable({ pw }: { pw: ReturnType<typeof usePipeWire> }) {
  if (!pw.streams.length) return <TableEmptyState text="No active audio streams" />

  return (
    <TableContainer className="pipewire-page__table-wrap">
      <Table size="sm" className="pipewire-page__table">
        <TableHead>
          <TableRow>
            <TableHeader>ID</TableHeader>
            <TableHeader>Client</TableHeader>
            <TableHeader>Media</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {pw.streams.map((stream) => (
            <TableRow key={stream.id}>
              <TableCell className="pipewire-page__mono">{stream.id}</TableCell>
              <TableCell>{stream.client_name}</TableCell>
              <TableCell>{stream.media_name}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

function LinksTable({ pw }: { pw: ReturnType<typeof usePipeWire> }) {
  if (!pw.links.length) return <TableEmptyState text="No port connections" />

  return (
    <TableContainer className="pipewire-page__table-wrap">
      <Table size="sm" className="pipewire-page__table">
        <TableHead>
          <TableRow>
            <TableHeader>ID</TableHeader>
            <TableHeader>Output</TableHeader>
            <TableHeader>Input</TableHeader>
            <TableHeader>State</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {pw.links.map((link) => (
            <TableRow key={link.id}>
              <TableCell className="pipewire-page__mono">{link.id}</TableCell>
              <TableCell className="pipewire-page__mono">{link.output_node}:{link.output_port}</TableCell>
              <TableCell className="pipewire-page__mono">{link.input_node}:{link.input_port}</TableCell>
              <TableCell>
                <Tag type={linkStateTagType(link.state || 'unknown')}>{link.state || 'unknown'}</Tag>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

function AlertsList({ pw }: { pw: ReturnType<typeof usePipeWire> }) {
  if (!pw.alerts.length) {
    return (
      <InlineNotification
        kind="success"
        lowContrast
        hideCloseButton
        title="No active alerts"
        subtitle="PipeWire reports healthy operation at this time."
      />
    )
  }

  return (
    <div className="pipewire-page__alerts-list">
      {pw.alerts.map((alert, index) => (
        <InlineNotification
          key={`${alert.type}-${index}`}
          kind={alert.severity === 'error' ? 'error' : alert.severity === 'warning' ? 'warning' : 'info'}
          lowContrast
          hideCloseButton
          title={alert.severity.toUpperCase()}
          subtitle={alert.message}
        />
      ))}
    </div>
  )
}

function TopologyGraph({ pw }: { pw: ReturnType<typeof usePipeWire> }) {
  const topology = useMemo(() => {
    const nodeNames = new Map<number, string>()
    pw.nodes.forEach((node) => {
      nodeNames.set(node.id, node.name)
    })

    return pw.links.map((link) => ({
      id: link.id,
      outputName: nodeNames.get(link.output_node) ?? `Node ${link.output_node}`,
      outputPort: link.output_port,
      inputName: nodeNames.get(link.input_node) ?? `Node ${link.input_node}`,
      inputPort: link.input_port,
      state: link.state || 'unknown',
    }))
  }, [pw.links, pw.nodes])

  if (!pw.nodes.length && !pw.links.length) {
    return <TableEmptyState text="No PipeWire topology data available for this node." />
  }

  return (
    <div className="pipewire-page__topology">
      <div className="pipewire-page__topology-nodes">
        {pw.nodes.map((node) => (
          <Layer key={node.id} className="pipewire-page__node-card">
            <div className="pipewire-page__node-name">{node.name}</div>
            <div className="pipewire-page__node-meta">{node.media_class || 'node'} · {node.id}</div>
          </Layer>
        ))}
      </div>

      {topology.length > 0 ? (
        <div className="pipewire-page__topology-links">
          {topology.map((link) => {
            const isHealthy = link.state === 'active' || link.state === 'running'
            return (
              <Layer key={link.id} className="pipewire-page__topology-link-row">
                <div className="pipewire-page__topology-endpoint">
                  <div className="pipewire-page__topology-name">{link.outputName}</div>
                  <div className="pipewire-page__topology-port">{link.outputPort}</div>
                </div>
                <div className="pipewire-page__topology-arrow">→</div>
                <div className="pipewire-page__topology-endpoint">
                  <div className="pipewire-page__topology-name">{link.inputName}</div>
                  <div className="pipewire-page__topology-port">{link.inputPort}</div>
                </div>
                <Tag type={isHealthy ? 'green' : link.state === 'error' ? 'red' : 'warm-gray'}>{link.state}</Tag>
              </Layer>
            )
          })}
        </div>
      ) : (
        <TableEmptyState text="PipeWire nodes are present but there are no active port links right now." />
      )}
    </div>
  )
}

function ClusterSummaryTable({
  rows,
  isLoading,
  error,
  onSelectNode,
}: {
  rows: ClusterPipeWireRow[]
  isLoading: boolean
  error: unknown
  onSelectNode: (nodeId: string) => void
}) {
  if (isLoading && rows.length === 0) {
    return <LoadingState description="Loading cluster PipeWire summary" />
  }

  if (error && rows.length === 0) {
    return (
      <InlineNotification
        kind="error"
        lowContrast
        hideCloseButton
        title="Cluster PipeWire summary is unavailable"
        subtitle={error instanceof Error ? error.message : 'Cluster PipeWire summary is unavailable.'}
      />
    )
  }

  return (
    <div className="pipewire-page__cluster-summary">
      <Layer className="pipewire-page__cluster-summary-copy">
        Comparing PipeWire daemon health, clock settings, device inventory, and XRun counts across the cluster. Select a node row for the full topology view.
      </Layer>

      <TableContainer className="pipewire-page__table-wrap">
        <Table size="sm" className="pipewire-page__table">
          <TableHead>
            <TableRow>
              <TableHeader>Node</TableHeader>
              <TableHeader>Daemon</TableHeader>
              <TableHeader>Quantum</TableHeader>
              <TableHeader>Rate</TableHeader>
              <TableHeader>Devices</TableHeader>
              <TableHeader>XRuns</TableHeader>
              <TableHeader>Peer latency</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => {
              const metrics = row.metrics
              const quantum = metrics ? metrics.settings.clock_force_quantum || metrics.settings.clock_quantum : null
              const rate = metrics ? metrics.settings.clock_force_rate || metrics.settings.clock_rate : null
              const daemonLabel = metrics?.daemon.running ? 'Running' : row.isOnline ? 'Stopped' : 'Offline'

              return (
                <TableRow
                  key={row.nodeId}
                  className="pipewire-page__cluster-row"
                  onClick={() => onSelectNode(row.nodeId)}
                  title={`Open ${row.hostname} PipeWire details`}
                >
                  <TableCell>
                    <div className="pipewire-page__row-primary">{row.hostname}</div>
                    <div className="pipewire-page__row-secondary">{row.nodeId} · {row.role}</div>
                  </TableCell>
                  <TableCell>
                    <Tag type={daemonStateTagType(Boolean(metrics?.daemon.running), row.isOnline)}>{daemonLabel}</Tag>
                  </TableCell>
                  <TableCell className="pipewire-page__mono">{quantum ?? '--'}</TableCell>
                  <TableCell>{rate == null ? '--' : formatRateKhz(rate)}</TableCell>
                  <TableCell className="pipewire-page__mono">{metrics?.devices.length ?? '--'}</TableCell>
                  <TableCell>
                    <span className={metrics && metrics.xruns > 0 ? 'pipewire-page__xrun-bad' : 'pipewire-page__xrun-good'}>
                      {metrics?.xruns ?? '--'}
                    </span>
                  </TableCell>
                  <TableCell>{row.latencyMs == null ? '--' : `${row.latencyMs.toFixed(1)} ms`}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  )
}

function QuantumControl({
  pw,
  controlsDisabled = false,
  disableReason,
}: {
  pw: ReturnType<typeof usePipeWire>
  controlsDisabled?: boolean
  disableReason?: string
}) {
  const currentForced = pw.settings.clock_force_quantum
  const currentQuantum = pw.settings.clock_quantum
  const currentForcedRate = pw.settings.clock_force_rate
  const rateValues = Array.from(new Set([0, ...pw.settings.clock_allowed_rates, 44100, 48000, 96000]))
    .filter((rate) => rate === 0 || rate > 0)
    .sort((left, right) => left - right)
  const quantumValues = [0, 32, 64, 128, 256, 512, 1024, 2048]
  const mutationError = formatMutationError(pw.quantumError ?? pw.rateError)

  const handleQuantum = async (quantum: number) => {
    try {
      await pw.setQuantum(quantum)
    } catch {
      // Surface via mutation error state
    }
  }

  const handleRate = async (rate: number) => {
    try {
      await pw.setRate(rate)
    } catch {
      // Surface via mutation error state
    }
  }

  return (
    <div className="pipewire-page__settings-stack">
      {disableReason ? (
        <InlineNotification kind="warning" lowContrast hideCloseButton title="Controls limited" subtitle={disableReason} />
      ) : null}

      {mutationError ? (
        <InlineNotification kind="error" lowContrast hideCloseButton title="Clock update failed" subtitle={mutationError} />
      ) : null}

      <Layer className="pipewire-page__clock-panel">
        <div className="pipewire-page__clock-panel-head">
          <span className="pipewire-page__clock-heading">Clock override controls</span>
          <span className="pipewire-page__clock-effective">
            Effective: {pw.effectiveQuantum} smp @ {formatRateKhz(pw.effectiveRate)}
          </span>
        </div>

        <div className="pipewire-page__clock-values">
          <div>
            <div className="pipewire-page__clock-label">Current quantum</div>
            <div className="pipewire-page__clock-value">{currentQuantum} samples</div>
          </div>
          <div>
            <div className="pipewire-page__clock-label">Forced quantum</div>
            <div className="pipewire-page__clock-value">{currentForced || 'auto'}</div>
          </div>
        </div>

        <div className="pipewire-page__clock-groups">
          <div>
            <div className="pipewire-page__clock-label">Quantum override</div>
            <div className="pipewire-page__clock-buttons">
              {quantumValues.map((quantum) => {
                const active = currentForced === quantum
                const label = quantum === 0 ? 'Auto' : `${quantum}`
                return (
                  <Button
                    key={quantum}
                    kind={active ? 'primary' : 'ghost'}
                    size="sm"
                    disabled={controlsDisabled || pw.isSettingQuantum}
                    onClick={() => {
                      void handleQuantum(quantum)
                    }}
                  >
                    {label}
                  </Button>
                )
              })}
            </div>
          </div>

          <div>
            <div className="pipewire-page__clock-label">Sample rate override</div>
            <div className="pipewire-page__clock-buttons">
              {rateValues.map((rate) => {
                const active = currentForcedRate === rate
                const label = rate === 0 ? 'Auto' : formatRateKhz(rate)
                return (
                  <Button
                    key={rate}
                    kind={active ? 'primary' : 'ghost'}
                    size="sm"
                    disabled={controlsDisabled || pw.isSettingRate}
                    onClick={() => {
                      void handleRate(rate)
                    }}
                  >
                    {label}
                  </Button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="pipewire-page__tier-note">
          <strong>Tier A note:</strong> runtime overrides are exposed per node, but the backend may reject them when the host is enforcing the locked performance profile.
          <br />• Remote controls are disabled when peer latency exceeds 50ms
          <br />• To make persistent changes: edit systemd service (`map2-backend.service`) and restart
          <br />
          <br />Graph latency: 64→{((64 / pw.effectiveRate) * 1000).toFixed(1)}ms, 128→{((128 / pw.effectiveRate) * 1000).toFixed(1)}ms,
          256→{((256 / pw.effectiveRate) * 1000).toFixed(1)}ms <span className="pipewire-page__tier-note-secondary">(×2 for round-trip)</span>
        </div>
      </Layer>
    </div>
  )
}

type Tab = 'overview' | 'devices' | 'nodes' | 'streams' | 'links' | 'settings'

export function PipeWirePage() {
  const { activeNodeId, nodes, localNodeId, setActiveNode } = useCluster()
  const [tab, setTab] = useState<Tab>('overview')
  const allNodesSelected = activeNodeId === 'all'
  const detailNodeId = allNodesSelected ? null : activeNodeId
  const selectedNode = nodes.find((node) => node.nodeId === activeNodeId)
  const remoteSelected = Boolean(activeNodeId && activeNodeId !== 'all' && activeNodeId !== localNodeId)
  const remoteHighLatency = remoteSelected && (selectedNode?.latencyMs ?? 0) > 50
  const pw = usePipeWire({ nodeId: detailNodeId, useWebSocket: !allNodesSelected })

  const clusterPipeWireQuery = useQuery<ClusterPipeWireResponse>({
    queryKey: ['cluster-pipewire-summary'],
    queryFn: async () => {
      const response = await fetch('/api/cluster/health/extended/pipewire')
      if (!response.ok) {
        throw new Error(`Failed to fetch cluster PipeWire summary: ${response.status}`)
      }
      return response.json() as Promise<ClusterPipeWireResponse>
    },
    enabled: allNodesSelected,
    staleTime: 2000,
    refetchInterval: allNodesSelected ? 5000 : false,
  })

  const clusterRows = useMemo<ClusterPipeWireRow[]>(() => {
    const infoByNode = new Map(nodes.map((node) => [node.nodeId, node]))
    const metricsByNode = clusterPipeWireQuery.data?.nodes ?? {}
    const knownNodeIds = new Set<string>([
      ...nodes.map((node) => node.nodeId),
      ...Object.keys(metricsByNode),
    ])

    return Array.from(knownNodeIds)
      .sort((left, right) => {
        if (left === localNodeId) return -1
        if (right === localNodeId) return 1
        return left.localeCompare(right)
      })
      .map((nodeId) => {
        const info = infoByNode.get(nodeId)
        const metrics = metricsByNode[nodeId] ?? null
        return {
          nodeId,
          hostname: info?.hostname ?? metrics?.daemon.hostname ?? nodeId,
          role: info?.role ?? (nodeId === localNodeId ? 'LOCAL' : 'AUDIO-NODE'),
          isOnline: info?.isOnline ?? Boolean(metrics?.daemon.running),
          latencyMs: info?.latencyMs ?? null,
          metrics,
          status: getPipeWireStatus(metrics),
        }
      })
  }, [clusterPipeWireQuery.data?.nodes, localNodeId, nodes])

  const headerStatus = allNodesSelected ? aggregatePipeWireStatus(clusterRows) : pw.overallStatus
  const lastUpdateLabel = useMemo(() => {
    if (!allNodesSelected) {
      return pw.metrics.timestamp ? new Date(pw.metrics.timestamp).toLocaleTimeString() : '--'
    }

    const timestamps = clusterRows
      .map((row) => row.metrics?.timestamp)
      .filter((value): value is string => Boolean(value))
      .map((value) => Date.parse(value))
      .filter((value) => Number.isFinite(value))

    if (timestamps.length > 0) {
      return new Date(Math.max(...timestamps)).toLocaleTimeString()
    }
    return clusterPipeWireQuery.dataUpdatedAt ? new Date(clusterPipeWireQuery.dataUpdatedAt).toLocaleTimeString() : '--'
  }, [allNodesSelected, clusterPipeWireQuery.dataUpdatedAt, clusterRows, pw.metrics.timestamp])

  const tabs: { id: Tab; label: string; icon: CarbonIconType }[] = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'devices', label: 'Devices', icon: VolumeUp },
    { id: 'nodes', label: 'Nodes', icon: NetworkThree },
    { id: 'streams', label: 'Streams', icon: Microphone },
    { id: 'links', label: 'Links', icon: Link },
    { id: 'settings', label: 'Settings', icon: Settings },
  ]

  return (
    <div className="pipewire-page">
      <header className="pipewire-page__header">
        <div className="pipewire-page__header-main">
          <NetworkThree size={32} aria-hidden="true" className="pipewire-page__header-icon" />
          <div>
            <h1 className="pipewire-page__title">
              {allNodesSelected
                ? 'PipeWire Audio Server · All Nodes'
                : remoteSelected
                  ? `PipeWire Audio Server · ${selectedNode?.hostname ?? activeNodeId}`
                  : 'PipeWire Audio Server'}
            </h1>
            <p className="pipewire-page__subtitle">
              {allNodesSelected
                ? 'Cluster-wide daemon, device, and clock summary'
                : 'Audio graph topology, latency control, and real-time monitoring'}
            </p>
          </div>
        </div>
        <StatusBadge status={headerStatus} />
      </header>

      {allNodesSelected || remoteSelected ? (
        <Layer className="pipewire-page__scope-bar">
          <span>
            {allNodesSelected
              ? 'Viewing: Cluster summary for all nodes'
              : `Viewing: ${selectedNode?.hostname ?? activeNodeId} (${activeNodeId})`}
          </span>
          {!allNodesSelected ? (
            <span className="pipewire-page__scope-secondary">
              {selectedNode?.latencyMs == null ? 'Peer latency unavailable' : `Peer latency ${selectedNode.latencyMs.toFixed(1)} ms`}
            </span>
          ) : null}
        </Layer>
      ) : null}

      {remoteHighLatency ? (
        <InlineNotification
          kind="warning"
          lowContrast
          hideCloseButton
          title="Remote safety limit"
          subtitle="Runtime clock controls are disabled for this remote node because cluster latency is above 50ms. Select the node locally to apply clock changes safely."
        />
      ) : null}

      {!allNodesSelected ? (
        <nav className="pipewire-page__tabbar" aria-label="PipeWire sections">
          {tabs.map((tabItem) => {
            const Icon = tabItem.icon
            const active = tab === tabItem.id
            return (
              <Button
                key={tabItem.id}
                kind={active ? 'primary' : 'ghost'}
                size="sm"
                renderIcon={Icon}
                onClick={() => setTab(tabItem.id)}
              >
                {tabItem.label}
              </Button>
            )
          })}
        </nav>
      ) : null}

      <div className="pipewire-page__content">
        {allNodesSelected ? (
          <ClusterSummaryTable
            rows={clusterRows}
            isLoading={clusterPipeWireQuery.isLoading}
            error={clusterPipeWireQuery.error}
            onSelectNode={setActiveNode}
          />
        ) : tab === 'overview' ? (
          <div className="pipewire-page__stack-lg">
            <DaemonSection pw={pw} />
            <Section title="Alerts" icon={WarningAlt}>
              <AlertsList pw={pw} />
            </Section>
            <Section title="Default sink" icon={VolumeUp}>
              {pw.defaultSink ? (
                <p className="pipewire-page__copy">
                  <strong>{pw.defaultSink.name}</strong> — Vol: {(pw.defaultSink.volume * 100).toFixed(0)}%
                  {pw.defaultSink.muted ? <span className="pipewire-page__muted-mark">(MUTED)</span> : null}
                </p>
              ) : (
                <TableEmptyState text="No default sink" />
              )}
            </Section>
            <Section title="Default source" icon={Microphone}>
              {pw.defaultSource ? (
                <p className="pipewire-page__copy">
                  <strong>{pw.defaultSource.name}</strong> — Vol: {(pw.defaultSource.volume * 100).toFixed(0)}%
                  {pw.defaultSource.muted ? <span className="pipewire-page__muted-mark">(MUTED)</span> : null}
                </p>
              ) : (
                <TableEmptyState text="No default source" />
              )}
            </Section>
          </div>
        ) : null}

        {!allNodesSelected && tab === 'devices' ? (
          <Section title="Audio devices" icon={VolumeUp}>
            <DevicesTable pw={pw} />
          </Section>
        ) : null}

        {!allNodesSelected && tab === 'nodes' ? (
          <Section title="Sink & source nodes" icon={NetworkThree}>
            <NodesTable pw={pw} />
          </Section>
        ) : null}

        {!allNodesSelected && tab === 'streams' ? (
          <Section title="Active streams" icon={Microphone}>
            <StreamsTable pw={pw} />
          </Section>
        ) : null}

        {!allNodesSelected && tab === 'links' ? (
          <div className="pipewire-page__stack-md">
            <Section title="Topology graph" icon={Link}>
              <TopologyGraph pw={pw} />
            </Section>
            <Section title="Port connections" icon={Link}>
              <LinksTable pw={pw} />
            </Section>
          </div>
        ) : null}

        {!allNodesSelected && tab === 'settings' ? (
          <div className="pipewire-page__stack-md">
            <Section title="Buffer size (quantum)" icon={Settings}>
              <QuantumControl
                pw={pw}
                controlsDisabled={remoteHighLatency}
                disableReason={remoteHighLatency ? 'Clock overrides are disabled for high-latency remote nodes (>50ms peer latency).' : undefined}
              />
            </Section>
            <Section title="Clock settings" icon={Activity}>
              <div className="pipewire-page__settings-grid">
                <SettingItem label="clock.rate" value={`${pw.settings.clock_rate} Hz`} />
                <SettingItem label="clock.force-rate" value={pw.settings.clock_force_rate ? `${pw.settings.clock_force_rate} Hz` : 'auto'} />
                <SettingItem label="clock.quantum" value={`${pw.settings.clock_quantum}`} />
                <SettingItem label="clock.force-quantum" value={pw.settings.clock_force_quantum ? `${pw.settings.clock_force_quantum}` : 'auto'} />
                <SettingItem label="clock.min-quantum" value={`${pw.settings.clock_min_quantum}`} />
                <SettingItem label="clock.max-quantum" value={`${pw.settings.clock_max_quantum}`} />
                <SettingItem label="clock.allowed-rates" value={pw.settings.clock_allowed_rates.join(', ')} />
              </div>
            </Section>
            <Section title="Latency breakdown" icon={Activity}>
              <div className="pipewire-page__latency-grid">
                <MetricCard icon={Activity} label="Graph" value={pw.graphLatencyMs.toFixed(1)} unit="ms" />
                <MetricCard icon={Activity} label="Driver" value={pw.driverLatencyMs.toFixed(1)} unit="ms" />
                <MetricCard icon={Activity} label="Total" value={pw.totalLatencyMs.toFixed(1)} unit="ms" tone={pw.isHighLatency ? 'warm-gray' : 'green'} />
              </div>
            </Section>
          </div>
        ) : null}
      </div>

      <footer className="pipewire-page__footer">
        <span>{allNodesSelected ? '● Cluster aggregate' : pw.isConnected ? '● Connected via WebSocket' : '○ Polling mode'}</span>
        <span>Last update: {lastUpdateLabel}</span>
      </footer>
    </div>
  )
}

function Section({ title, icon: Icon, children }: { title: string; icon: CarbonIconType; children: ReactNode }) {
  return (
    <Layer className="pipewire-page__section">
      <h3 className="pipewire-page__section-title">
        <Icon size={18} aria-hidden="true" className="pipewire-page__section-icon" /> {title}
      </h3>
      {children}
    </Layer>
  )
}

function SettingItem({ label, value }: { label: string; value: string }) {
  return (
    <Layer className="pipewire-page__setting-item">
      <div className="pipewire-page__setting-label">{label}</div>
      <div className="pipewire-page__setting-value">{value}</div>
    </Layer>
  )
}
