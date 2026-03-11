import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Broadcast, SpeakerHigh, SpeakerX, Warning, CheckCircle, XCircle, Pulse, Cpu, Link, Microphone, GearSix, type Icon } from '@phosphor-icons/react'
import { usePipeWire } from '../hooks/usePipeWire'
import { useCluster } from '../contexts/ClusterContext'
import type { PipeWireMetrics } from '../../map2/types'

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

// ============================================================================
// Helper Components
// ============================================================================

function StatusBadge({ status }: { status: PipeWireHealthStatus }) {
  const config = {
    ok:      { icon: CheckCircle,    color: '#22c55e', bg: '#052e16', label: 'Healthy' },
    warning: { icon: Warning,        color: '#f59e0b', bg: '#451a03', label: 'Warning' },
    error:   { icon: XCircle,        color: '#ef4444', bg: '#450a0a', label: 'Error' },
    offline: { icon: XCircle,        color: '#6b7280', bg: '#1f2937', label: 'Offline' },
  }
  const { icon: Icon, color, bg, label } = config[status]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 9999, backgroundColor: bg, color, fontSize: 13, fontWeight: 600 }}>
      <Icon size={14} /> {label}
    </span>
  )
}

function MetricCard({ label, value, unit, icon: Icon, color = '#94a3b8' }: {
  label: string; value: string | number; unit?: string; icon: Icon; color?: string
}) {
  return (
    <div style={{ background: '#1e293b', borderRadius: 12, padding: '20px 24px', minWidth: 160 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
        <Icon size={14} weight="duotone" /> {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color, fontFamily: 'JetBrains Mono, monospace' }}>
        {value}{unit && <span style={{ fontSize: 14, color: '#64748b', marginLeft: 4 }}>{unit}</span>}
      </div>
    </div>
  )
}

// ============================================================================
// Sub-sections
// ============================================================================

function DaemonSection({ pw }: { pw: ReturnType<typeof usePipeWire> }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
      <MetricCard icon={Broadcast}    label="Version"     value={pw.daemonVersion || '—'} color="#60a5fa" />
      <MetricCard icon={Pulse} label="Latency"     value={pw.totalLatencyMs.toFixed(1)} unit="ms" color={pw.isHighLatency ? '#f59e0b' : '#22c55e'} />
      <MetricCard icon={Cpu}      label="Quantum"     value={pw.effectiveQuantum} unit="smp" color="#60a5fa" />
      <MetricCard icon={Pulse} label="Sample Rate" value={(pw.effectiveRate / 1000).toFixed(1)} unit="kHz" color="#60a5fa" />
      <MetricCard icon={SpeakerHigh}  label="Devices"     value={pw.devices.length} color="#60a5fa" />
      <MetricCard icon={Link}    label="Links"       value={pw.links.length} color="#60a5fa" />
      <MetricCard icon={Pulse} label="Streams"     value={pw.streams.length} color="#60a5fa" />
      <MetricCard icon={Warning} label="XRuns"  value={pw.xruns} color={pw.hasXruns ? '#ef4444' : '#22c55e'} />
    </div>
  )
}

function DevicesTable({ pw }: { pw: ReturnType<typeof usePipeWire> }) {
  if (!pw.devices.length) return <p style={{ color: '#64748b' }}>No audio devices detected</p>
  return (
    <div className="pipewire-table-wrap">
      <table className="pipewire-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #334155', color: '#64748b', textAlign: 'left' }}>
            <th style={{ padding: '8px 12px' }}>ID</th>
            <th style={{ padding: '8px 12px' }}>Device</th>
            <th style={{ padding: '8px 12px' }}>Driver</th>
            <th style={{ padding: '8px 12px' }}>Default</th>
          </tr>
        </thead>
        <tbody>
          {pw.devices.map(d => (
            <tr key={d.id} style={{ borderBottom: '1px solid #1e293b' }}>
              <td style={{ padding: '8px 12px', color: '#94a3b8', fontFamily: 'monospace' }}>{d.id}</td>
              <td style={{ padding: '8px 12px', color: '#e2e8f0' }}>{d.name}</td>
              <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{d.driver}</td>
              <td style={{ padding: '8px 12px' }}>{d.is_default ? '★' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function NodesTable({ pw }: { pw: ReturnType<typeof usePipeWire> }) {
  if (!pw.nodes.length) return <p style={{ color: '#64748b' }}>No sink/source nodes</p>
  return (
    <div className="pipewire-table-wrap">
      <table className="pipewire-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #334155', color: '#64748b', textAlign: 'left' }}>
            <th style={{ padding: '8px 12px' }}>ID</th>
            <th style={{ padding: '8px 12px' }}>Name</th>
            <th style={{ padding: '8px 12px' }}>Type</th>
            <th style={{ padding: '8px 12px' }}>Volume</th>
            <th style={{ padding: '8px 12px' }}>Mute</th>
            <th style={{ padding: '8px 12px' }}>Default</th>
          </tr>
        </thead>
        <tbody>
          {pw.nodes.map(n => (
            <tr key={n.id} style={{ borderBottom: '1px solid #1e293b' }}>
              <td style={{ padding: '8px 12px', color: '#94a3b8', fontFamily: 'monospace' }}>{n.id}</td>
              <td style={{ padding: '8px 12px', color: '#e2e8f0' }}>{n.name}</td>
              <td style={{ padding: '8px 12px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: n.media_class.includes('Sink') ? '#60a5fa' : '#a78bfa' }}>
                  {n.media_class.includes('Sink') ? <SpeakerHigh size={14} weight="duotone"/> : <Microphone size={14} weight="duotone"/>}
                  {n.media_class.includes('Sink') ? 'Sink' : 'Source'}
                </span>
              </td>
              <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>
                <span style={{ color: n.volume > 1.0 ? '#f59e0b' : '#e2e8f0' }}>
                  {(n.volume * 100).toFixed(0)}%
                </span>
              </td>
              <td style={{ padding: '8px 12px' }}>
                {n.muted
                  ? <SpeakerX size={16} weight="duotone" color="#ef4444" />
                  : <SpeakerHigh size={16} weight="duotone" color="#22c55e" />}
              </td>
              <td style={{ padding: '8px 12px' }}>{n.is_default ? '★' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StreamsTable({ pw }: { pw: ReturnType<typeof usePipeWire> }) {
  if (!pw.streams.length) return <p style={{ color: '#64748b' }}>No active audio streams</p>
  return (
    <div className="pipewire-table-wrap">
      <table className="pipewire-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #334155', color: '#64748b', textAlign: 'left' }}>
            <th style={{ padding: '8px 12px' }}>ID</th>
            <th style={{ padding: '8px 12px' }}>Client</th>
            <th style={{ padding: '8px 12px' }}>Media</th>
          </tr>
        </thead>
        <tbody>
          {pw.streams.map(s => (
            <tr key={s.id} style={{ borderBottom: '1px solid #1e293b' }}>
              <td style={{ padding: '8px 12px', color: '#94a3b8', fontFamily: 'monospace' }}>{s.id}</td>
              <td style={{ padding: '8px 12px', color: '#e2e8f0' }}>{s.client_name}</td>
              <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{s.media_name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LinksTable({ pw }: { pw: ReturnType<typeof usePipeWire> }) {
  if (!pw.links.length) return <p style={{ color: '#64748b' }}>No port connections</p>
  return (
    <div className="pipewire-table-wrap">
      <table className="pipewire-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #334155', color: '#64748b', textAlign: 'left' }}>
            <th style={{ padding: '8px 12px' }}>ID</th>
            <th style={{ padding: '8px 12px' }}>Output</th>
            <th style={{ padding: '8px 12px' }}></th>
            <th style={{ padding: '8px 12px' }}>Input</th>
            <th style={{ padding: '8px 12px' }}>State</th>
          </tr>
        </thead>
        <tbody>
          {pw.links.map(l => (
            <tr key={l.id} style={{ borderBottom: '1px solid #1e293b' }}>
              <td style={{ padding: '8px 12px', color: '#94a3b8', fontFamily: 'monospace' }}>{l.id}</td>
              <td style={{ padding: '8px 12px', color: '#e2e8f0', fontFamily: 'monospace' }}>{l.output_node}:{l.output_port}</td>
              <td style={{ padding: '8px 12px', color: '#60a5fa' }}>→</td>
              <td style={{ padding: '8px 12px', color: '#e2e8f0', fontFamily: 'monospace' }}>{l.input_node}:{l.input_port}</td>
              <td style={{ padding: '8px 12px' }}>
                <span style={{
                  color: l.state === 'active' || l.state === 'running' ? '#22c55e'
                    : l.state === 'error' ? '#ef4444'
                      : l.state === 'paused' ? '#f59e0b'
                        : '#94a3b8',
                  fontWeight: 600,
                  fontSize: 12
                }}>
                  {l.state || 'unknown'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AlertsList({ pw }: { pw: ReturnType<typeof usePipeWire> }) {
  if (!pw.alerts.length) return <p style={{ color: '#22c55e', fontSize: 14 }}>✓ No active alerts</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {pw.alerts.map((a, i) => {
        const color = a.severity === 'error' ? '#ef4444' : a.severity === 'warning' ? '#f59e0b' : '#60a5fa'
        const bg = a.severity === 'error' ? '#450a0a' : a.severity === 'warning' ? '#451a03' : '#172554'
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, backgroundColor: bg, color, fontSize: 13 }}>
            <Warning size={16} weight="duotone" />
            <span>{a.message}</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.7, textTransform: 'uppercase' }}>{a.severity}</span>
          </div>
        )
      })}
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
    return <p style={{ color: '#64748b', fontSize: 14 }}>No PipeWire topology data available for this node.</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {pw.nodes.map((node) => (
          <div
            key={node.id}
            style={{
              minWidth: 180,
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid #334155',
              background: '#1e293b',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>{node.name}</div>
            <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'JetBrains Mono, monospace' }}>
              {node.media_class || 'node'} · {node.id}
            </div>
          </div>
        ))}
      </div>

      {topology.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {topology.map((link) => {
            const isHealthy = link.state === 'active' || link.state === 'running'
            return (
              <div
                key={link.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr) auto',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1px solid #334155',
                  background: '#0f172a',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: '#f8fafc', fontSize: 13, fontWeight: 600 }}>{link.outputName}</div>
                  <div style={{ color: '#64748b', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>{link.outputPort}</div>
                </div>
                <div style={{ color: '#60a5fa', fontSize: 18, fontWeight: 700 }}>→</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: '#f8fafc', fontSize: 13, fontWeight: 600 }}>{link.inputName}</div>
                  <div style={{ color: '#64748b', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>{link.inputPort}</div>
                </div>
                <div
                  style={{
                    color: isHealthy ? '#22c55e' : link.state === 'error' ? '#ef4444' : '#f59e0b',
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 0.6,
                  }}
                >
                  {link.state}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p style={{ color: '#64748b', fontSize: 14 }}>PipeWire nodes are present but there are no active port links right now.</p>
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
    return <p style={{ color: '#94a3b8', fontSize: 14 }}>Loading cluster PipeWire summary…</p>
  }

  if (error && rows.length === 0) {
    return (
      <div style={{ padding: 16, borderRadius: 10, border: '1px solid #7f1d1d', background: '#450a0a', color: '#fecaca', fontSize: 14 }}>
        {error instanceof Error ? error.message : 'Cluster PipeWire summary is unavailable.'}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div
        style={{
          padding: '14px 16px',
          borderRadius: 10,
          border: '1px solid #334155',
          background: '#0f172a',
          color: '#94a3b8',
          fontSize: 13,
        }}
      >
        Comparing PipeWire daemon health, clock settings, device inventory, and XRun counts across the cluster. Select a node row for the full topology view.
      </div>

      <div className="pipewire-table-wrap">
        <table className="pipewire-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #334155', color: '#64748b', textAlign: 'left' }}>
              <th style={{ padding: '8px 12px' }}>Node</th>
              <th style={{ padding: '8px 12px' }}>Daemon</th>
              <th style={{ padding: '8px 12px' }}>Quantum</th>
              <th style={{ padding: '8px 12px' }}>Rate</th>
              <th style={{ padding: '8px 12px' }}>Devices</th>
              <th style={{ padding: '8px 12px' }}>XRuns</th>
              <th style={{ padding: '8px 12px' }}>Peer Latency</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const metrics = row.metrics
              const quantum = metrics ? metrics.settings.clock_force_quantum || metrics.settings.clock_quantum : null
              const rate = metrics ? metrics.settings.clock_force_rate || metrics.settings.clock_rate : null
              const daemonLabel = metrics?.daemon.running ? 'Running' : row.isOnline ? 'Stopped' : 'Offline'
              const statusColor = row.status === 'ok' ? '#22c55e' : row.status === 'warning' ? '#f59e0b' : row.status === 'error' ? '#ef4444' : '#94a3b8'

              return (
                <tr
                  key={row.nodeId}
                  onClick={() => onSelectNode(row.nodeId)}
                  style={{ borderBottom: '1px solid #1e293b', cursor: 'pointer' }}
                  title={`Open ${row.hostname} PipeWire details`}
                >
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ color: '#e2e8f0', fontWeight: 700 }}>{row.hostname}</div>
                    <div style={{ color: '#64748b', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>
                      {row.nodeId} · {row.role}
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', color: statusColor, fontWeight: 700 }}>{daemonLabel}</td>
                  <td style={{ padding: '10px 12px', color: '#e2e8f0', fontFamily: 'JetBrains Mono, monospace' }}>{quantum ?? '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#e2e8f0' }}>{rate == null ? '—' : formatRateKhz(rate)}</td>
                  <td style={{ padding: '10px 12px', color: '#e2e8f0', fontFamily: 'JetBrains Mono, monospace' }}>{metrics?.devices.length ?? '—'}</td>
                  <td style={{ padding: '10px 12px', color: metrics && metrics.xruns > 0 ? '#ef4444' : '#e2e8f0', fontFamily: 'JetBrains Mono, monospace' }}>
                    {metrics?.xruns ?? '—'}
                  </td>
                  <td style={{ padding: '10px 12px', color: '#94a3b8' }}>
                    {row.latencyMs == null ? '—' : `${row.latencyMs.toFixed(1)} ms`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {disableReason && (
        <div style={{ padding: '12px 14px', borderRadius: 8, backgroundColor: '#451a03', color: '#fcd34d', fontSize: 13, border: '1px solid #92400e' }}>
          {disableReason}
        </div>
      )}

      {mutationError && (
        <div style={{ padding: '12px 14px', borderRadius: 8, backgroundColor: '#172554', color: '#bfdbfe', fontSize: 13, border: '1px solid #1d4ed8' }}>
          {mutationError}
        </div>
      )}

      <div style={{ 
        padding: '16px 20px', 
        borderRadius: 8, 
        backgroundColor: '#1e293b',
        border: '2px solid #475569' 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, color: '#94a3b8', fontWeight: 600 }}>Clock Override Controls</span>
          <span style={{ fontSize: 12, color: '#64748b', fontFamily: 'JetBrains Mono, monospace' }}>
            Effective: {pw.effectiveQuantum} smp @ {formatRateKhz(pw.effectiveRate)}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Current Quantum</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#60a5fa', fontFamily: 'monospace' }}>
              {currentQuantum} samples
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Forced Quantum</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: currentForced === 64 ? '#22c55e' : '#f59e0b', fontFamily: 'monospace' }}>
              {currentForced || 'auto'}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Quantum override</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {quantumValues.map((quantum) => {
                const active = currentForced === quantum
                const label = quantum === 0 ? 'Auto' : `${quantum}`
                return (
                  <button
                    key={quantum}
                    onClick={() => handleQuantum(quantum)}
                    disabled={controlsDisabled || pw.isSettingQuantum}
                    style={{
                      padding: '7px 12px',
                      borderRadius: 8,
                      border: `1px solid ${active ? '#60a5fa' : '#334155'}`,
                      backgroundColor: active ? '#172554' : '#0f172a',
                      color: active ? '#bfdbfe' : '#e2e8f0',
                      cursor: controlsDisabled || pw.isSettingQuantum ? 'not-allowed' : 'pointer',
                      opacity: controlsDisabled ? 0.55 : 1,
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Sample rate override</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {rateValues.map((rate) => {
                const active = currentForcedRate === rate
                const label = rate === 0 ? 'Auto' : formatRateKhz(rate)
                return (
                  <button
                    key={rate}
                    onClick={() => handleRate(rate)}
                    disabled={controlsDisabled || pw.isSettingRate}
                    style={{
                      padding: '7px 12px',
                      borderRadius: 8,
                      border: `1px solid ${active ? '#60a5fa' : '#334155'}`,
                      backgroundColor: active ? '#172554' : '#0f172a',
                      color: active ? '#bfdbfe' : '#e2e8f0',
                      cursor: controlsDisabled || pw.isSettingRate ? 'not-allowed' : 'pointer',
                      opacity: controlsDisabled ? 0.55 : 1,
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        <div style={{ 
          marginTop: 16, 
          padding: 12, 
          backgroundColor: '#0f172a', 
          borderRadius: 6,
          fontSize: 12,
          color: '#94a3b8',
          lineHeight: 1.6
        }}>
          <strong style={{ color: '#e2e8f0' }}>Tier A note:</strong> runtime overrides are exposed per node, but the backend may reject them when the host is enforcing the locked performance profile.<br/>
          • Remote controls are disabled when peer latency exceeds 50ms<br/>
          • To make persistent changes: edit systemd service (<code style={{ color: '#60a5fa' }}>map2-backend.service</code>) and restart<br/>
          <br/>
          Graph latency: 64→{((64 / pw.effectiveRate) * 1000).toFixed(1)}ms, 
          128→{((128 / pw.effectiveRate) * 1000).toFixed(1)}ms, 
          256→{((256 / pw.effectiveRate) * 1000).toFixed(1)}ms
          <span style={{ marginLeft: 8, opacity: 0.7 }}>(×2 for round-trip)</span>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Main Page
// ============================================================================

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
      return pw.metrics.timestamp ? new Date(pw.metrics.timestamp).toLocaleTimeString() : '—'
    }

    const timestamps = clusterRows
      .map((row) => row.metrics?.timestamp)
      .filter((value): value is string => Boolean(value))
      .map((value) => Date.parse(value))
      .filter((value) => Number.isFinite(value))

    if (timestamps.length > 0) {
      return new Date(Math.max(...timestamps)).toLocaleTimeString()
    }
    return clusterPipeWireQuery.dataUpdatedAt ? new Date(clusterPipeWireQuery.dataUpdatedAt).toLocaleTimeString() : '—'
  }, [allNodesSelected, clusterPipeWireQuery.dataUpdatedAt, clusterRows, pw.metrics.timestamp])

  const tabs: { id: Tab; label: string; icon: Icon }[] = [
    { id: 'overview', label: 'Overview',  icon: Pulse },
    { id: 'devices',  label: 'Devices',   icon: SpeakerHigh },
    { id: 'nodes',    label: 'Nodes',     icon: SpeakerHigh },
    { id: 'streams',  label: 'Streams',   icon: Microphone },
    { id: 'links',    label: 'Links',     icon: Link },
    { id: 'settings', label: 'Settings',  icon: GearSix },
  ]

  return (
    <div className="pipewire-page" style={{ padding: 32, maxWidth: 1200, margin: '0 auto', color: '#e2e8f0' }}>
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
        <Broadcast size={36} weight="duotone" color="#60a5fa" />
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: '#f8fafc' }}>
            {allNodesSelected
              ? 'PipeWire Audio Server · All Nodes'
              : remoteSelected
                ? `PipeWire Audio Server · ${selectedNode?.hostname ?? activeNodeId}`
                : 'PipeWire Audio Server'}
          </h1>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 14 }}>
            {allNodesSelected
              ? 'Cluster-wide daemon, device, and clock summary'
              : 'Audio graph topology, latency control, and real-time monitoring'}
          </p>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <StatusBadge status={headerStatus} />
        </div>
      </header>

      {(allNodesSelected || remoteSelected) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 18,
            padding: '12px 14px',
            borderRadius: 10,
            border: '1px solid #334155',
            background: '#0f172a',
            color: '#e2e8f0',
            fontSize: 13,
            flexWrap: 'wrap',
          }}
        >
          <span>
            {allNodesSelected
              ? 'Viewing: Cluster summary for all nodes'
              : `Viewing: ${selectedNode?.hostname ?? activeNodeId} (${activeNodeId})`}
          </span>
          {!allNodesSelected && (
            <span style={{ color: '#94a3b8' }}>
              {selectedNode?.latencyMs == null ? 'Peer latency unavailable' : `Peer latency ${selectedNode.latencyMs.toFixed(1)} ms`}
            </span>
          )}
        </div>
      )}

      {remoteHighLatency && (
        <div
          style={{
            marginBottom: 18,
            padding: '12px 14px',
            borderRadius: 10,
            border: '1px solid #92400e',
            background: '#451a03',
            color: '#fcd34d',
            fontSize: 13,
          }}
        >
          Runtime clock controls are disabled for this remote node because cluster latency is above 50ms. Select the node locally to apply clock changes safely.
        </div>
      )}

      {!allNodesSelected && (
        <nav className="pipewire-tabbar" style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid #334155', paddingBottom: 0 }}>
          {tabs.map(t => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '10px 18px', border: 'none', cursor: 'pointer',
                  fontSize: 14, fontWeight: active ? 600 : 400,
                  color: active ? '#60a5fa' : '#94a3b8',
                  backgroundColor: 'transparent',
                  borderBottom: active ? '2px solid #60a5fa' : '2px solid transparent',
                  marginBottom: -1,
                }}
              >
                <Icon size={16} /> {t.label}
              </button>
            )
          })}
        </nav>
      )}

      {/* Content */}
      <div>
        {allNodesSelected ? (
          <ClusterSummaryTable
            rows={clusterRows}
            isLoading={clusterPipeWireQuery.isLoading}
            error={clusterPipeWireQuery.error}
            onSelectNode={setActiveNode}
          />
        ) : tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            <DaemonSection pw={pw} />
            <Section title="Alerts" icon={Warning}>
              <AlertsList pw={pw} />
            </Section>
            <Section title="Default Sink" icon={SpeakerHigh}>
              {pw.defaultSink
                ? <p style={{ color: '#e2e8f0', fontSize: 14 }}>
                    <strong>{pw.defaultSink.name}</strong> — Vol: {(pw.defaultSink.volume * 100).toFixed(0)}%
                    {pw.defaultSink.muted && <span style={{ color: '#ef4444', marginLeft: 8 }}>(MUTED)</span>}
                  </p>
                : <p style={{ color: '#64748b' }}>No default sink</p>}
            </Section>
            <Section title="Default Source" icon={Microphone}>
              {pw.defaultSource
                ? <p style={{ color: '#e2e8f0', fontSize: 14 }}>
                    <strong>{pw.defaultSource.name}</strong> — Vol: {(pw.defaultSource.volume * 100).toFixed(0)}%
                    {pw.defaultSource.muted && <span style={{ color: '#ef4444', marginLeft: 8 }}>(MUTED)</span>}
                  </p>
                : <p style={{ color: '#64748b' }}>No default source</p>}
            </Section>
          </div>
        )}

        {!allNodesSelected && tab === 'devices' && (
          <Section title="Audio Devices" icon={SpeakerHigh}>
            <DevicesTable pw={pw} />
          </Section>
        )}

        {!allNodesSelected && tab === 'nodes' && (
          <Section title="Sink & Source Nodes" icon={SpeakerHigh}>
            <NodesTable pw={pw} />
          </Section>
        )}

        {!allNodesSelected && tab === 'streams' && (
          <Section title="Active Streams" icon={Microphone}>
            <StreamsTable pw={pw} />
          </Section>
        )}

        {!allNodesSelected && tab === 'links' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <Section title="Topology Graph" icon={Link}>
              <TopologyGraph pw={pw} />
            </Section>
            <Section title="Port Connections" icon={Link}>
              <LinksTable pw={pw} />
            </Section>
          </div>
        )}

        {!allNodesSelected && tab === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <Section title="Buffer Size (Quantum)" icon={GearSix}>
              <QuantumControl
                pw={pw}
                controlsDisabled={remoteHighLatency}
                disableReason={remoteHighLatency ? 'Clock overrides are disabled for high-latency remote nodes (>50ms peer latency).' : undefined}
              />
            </Section>
            <Section title="Clock Settings" icon={Pulse}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                <SettingItem label="clock.rate" value={`${pw.settings.clock_rate} Hz`} />
                <SettingItem label="clock.force-rate" value={pw.settings.clock_force_rate ? `${pw.settings.clock_force_rate} Hz` : 'auto'} />
                <SettingItem label="clock.quantum" value={`${pw.settings.clock_quantum}`} />
                <SettingItem label="clock.force-quantum" value={pw.settings.clock_force_quantum ? `${pw.settings.clock_force_quantum}` : 'auto'} />
                <SettingItem label="clock.min-quantum" value={`${pw.settings.clock_min_quantum}`} />
                <SettingItem label="clock.max-quantum" value={`${pw.settings.clock_max_quantum}`} />
                <SettingItem label="clock.allowed-rates" value={pw.settings.clock_allowed_rates.join(', ')} />
              </div>
            </Section>
            <Section title="Latency Breakdown" icon={Pulse}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                <MetricCard icon={Pulse} label="Graph" value={pw.graphLatencyMs.toFixed(1)} unit="ms" color="#60a5fa" />
                <MetricCard icon={Pulse} label="Driver" value={pw.driverLatencyMs.toFixed(1)} unit="ms" color="#60a5fa" />
                <MetricCard icon={Pulse} label="Total" value={pw.totalLatencyMs.toFixed(1)} unit="ms" color={pw.isHighLatency ? '#f59e0b' : '#22c55e'} />
              </div>
            </Section>
          </div>
        )}
      </div>

      {/* Footer: connection status */}
      <div style={{ marginTop: 40, padding: '12px 0', borderTop: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b' }}>
        <span>{allNodesSelected ? '● Cluster aggregate' : pw.isConnected ? '● Connected via WebSocket' : '○ Polling mode'}</span>
        <span>Last update: {lastUpdateLabel}</span>
      </div>
    </div>
  )
}

// ============================================================================
// Utility components
// ============================================================================

function Section({ title, icon: Icon, children }: { title: string; icon: Icon; children: React.ReactNode }) {
  return (
    <div style={{ background: '#0f172a', borderRadius: 12, padding: 24, border: '1px solid #1e293b' }}>
      <h3 style={{ margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 600, color: '#f8fafc' }}>
        <Icon size={18} color="#60a5fa" /> {title}
      </h3>
      {children}
    </div>
  )
}

function SettingItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#1e293b', borderRadius: 8, padding: '12px 16px' }}>
      <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0', fontFamily: 'JetBrains Mono, monospace' }}>{value}</div>
    </div>
  )
}
