/**
 * PlatformsOverviewTopology — Option 5 Topology design for the
 * /workspace/platforms/overview page. Replaces the previous Configuration
 * Authority Model content with a spatial cluster view plus three sibling
 * views (Heatmap / Signal graph / List), a rotating alert stack, and a
 * selected-node sidebar with live resources, signal chain, and quick actions.
 *
 * Data: pulls real node topology + layer rollup from the platform store;
 * falls back to last-known state with a stale banner on fetch error.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  ComposedModal,
  InlineLoading,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Tag,
} from '@carbon/react'

import { audioApi, chainsApi, diagnosticsApi } from '../../../map2/api'
import { useNodeTopology } from '../../hooks/useNodeTopology'
import type {
  NodeAudioEdge,
  NodeStatus,
  NodeSummary,
} from '../../types/node'
import type { PlatformAlert, PlatformLayerData } from '../../platform/model'
import { buildPlatformHref } from '../../platform/model'
import { useToasts } from '../Toasts'

type ViewId = 'topology' | 'heatmap' | 'signal' | 'list'

interface Props {
  layer: PlatformLayerData
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusDotClass(status: NodeStatus): string {
  switch (status) {
    case 'ok': return 'green'
    case 'warn': return 'yellow'
    case 'critical': return 'red'
    case 'offline': return 'gray'
    default: return 'gray'
  }
}

function statusTagClass(status: NodeStatus): string {
  switch (status) {
    case 'ok': return 'green'
    case 'warn': return 'yellow'
    case 'critical': return 'red'
    case 'offline': return 'gray'
    default: return 'gray'
  }
}

function shortNodeName(n: NodeSummary): string {
  if (n.display_label) return n.display_label
  return n.hostname.replace(/^MAP2-/, '')
}

function roleAbbrev(role: NodeSummary['role']): string {
  switch (role) {
    case 'management_node': return 'MGMT'
    case 'all_in_one': return 'A1'
    default: return 'AUD'
  }
}

function strokeForStatus(status: NodeStatus): string {
  switch (status) {
    case 'warn': return 'var(--cds-support-warning)'
    case 'critical': return 'var(--cds-support-error)'
    case 'offline': return 'var(--cds-border-subtle-02)'
    default: return 'var(--cds-support-success)'
  }
}

// Count AVB streams touching each node (sum of in + out active audio_edges).
function streamsPerNode(nodes: NodeSummary[], edges: NodeAudioEdge[]): Map<string, number> {
  const m = new Map<string, number>()
  nodes.forEach((n) => m.set(n.node_id, 0))
  edges.forEach((e) => {
    if (!e.active) return
    m.set(e.source_node_id, (m.get(e.source_node_id) ?? 0) + 1)
    m.set(e.dest_node_id, (m.get(e.dest_node_id) ?? 0) + 1)
  })
  return m
}

// Deterministic placement: mgmt top-center, all_in_one near mgmt, audio nodes
// in an arc below, offline nodes parked to the right.
function computeLayout(nodes: NodeSummary[]): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>()
  const mgmt = nodes.filter((n) => n.role === 'management_node' && n.status !== 'offline')
  const allio = nodes.filter((n) => n.role === 'all_in_one' && n.status !== 'offline')
  const audio = nodes.filter((n) => n.role === 'audio_node' && n.status !== 'offline')
  const offline = nodes.filter((n) => n.status === 'offline')

  // Single-node case: center the only node.
  const total = nodes.length
  if (total === 1) {
    pos.set(nodes[0].node_id, { x: 450, y: 320 })
    return pos
  }

  mgmt.forEach((n) => pos.set(n.node_id, { x: 450, y: 110 }))
  allio.forEach((n) => pos.set(n.node_id, { x: mgmt.length ? 260 : 450, y: mgmt.length ? 150 : 110 }))

  const audioTotal = audio.length
  audio.forEach((n, i) => {
    const denom = Math.max(1, audioTotal - 1)
    const angle = Math.PI * (0.15 + (i / denom) * 0.7)
    const r = 220
    pos.set(n.node_id, {
      x: 450 - Math.cos(angle) * r,
      y: 330 + Math.sin(angle) * r * 0.55,
    })
  })

  offline.forEach((n, i) => pos.set(n.node_id, { x: 780, y: 120 + i * 68 }))

  return pos
}

// Canonical local hostname treated as the management anchor when present.
function pickPrimaryNode(nodes: NodeSummary[]): NodeSummary | null {
  return nodes.find((n) => n.is_local) ?? nodes[0] ?? null
}

// ── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ seed, width = 260, height = 36, color, paused }: {
  seed: number
  width?: number
  height?: number
  color: string
  paused: boolean
}) {
  // Deterministic curve; reseeded off a slow ticker when not paused so the
  // chart nudges without ever looking synthetic.
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    if (paused) return
    const id = window.setInterval(() => setOffset((v) => v + 1), 1200)
    return () => window.clearInterval(id)
  }, [paused])

  const d = useMemo(() => {
    const n = 48
    const values: number[] = []
    let base = 50
    for (let i = 0; i < n; i++) {
      const s =
        Math.sin((seed + offset + i) * 0.7) * 14 * 0.6 +
        Math.cos((seed + offset + i) * 0.31) * 14 * 0.4
      values.push(base + s)
    }
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = max - min || 1
    const step = (width - 4) / (n - 1)
    return values
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${(2 + i * step).toFixed(1)},${(2 + (1 - (v - min) / span) * (height - 4)).toFixed(1)}`)
      .join(' ')
  }, [seed, offset, width, height])

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.25" />
    </svg>
  )
}

// ── Rotating alert stack ─────────────────────────────────────────────────────

function RotatingAlert({ alerts, paused }: { alerts: PlatformAlert[]; paused: boolean }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (paused || alerts.length <= 1) return
    const id = window.setInterval(() => setI((v) => (v + 1) % alerts.length), 4000)
    return () => window.clearInterval(id)
  }, [alerts.length, paused])

  if (!alerts.length) return null
  const a = alerts[Math.min(i, alerts.length - 1)]
  const borderColor = a.severity === 'critical' || a.severity === 'error'
    ? 'var(--cds-support-error)'
    : a.severity === 'warning'
      ? 'var(--cds-support-warning)'
      : 'var(--cds-support-info)'

  return (
    <div className="ptop__floating-alert" style={{ borderLeftColor: borderColor }}>
      <div className="ptop__floating-alert-head">
        <Tag type={a.severity === 'warning' ? 'warm-gray' : a.severity === 'critical' || a.severity === 'error' ? 'red' : 'blue'}>
          {a.severity.toUpperCase()}
        </Tag>
        <span className="ptop__mono ptop__muted ptop__tiny">
          {alerts.length > 1 ? `${i + 1} / ${alerts.length}` : 'now'}
        </span>
      </div>
      <div className="ptop__floating-alert-title">{a.title}</div>
      <div className="ptop__floating-alert-body">{a.subtitle}</div>
    </div>
  )
}

// ── Topology canvas ──────────────────────────────────────────────────────────

function TopologyCanvas({
  nodes,
  edges,
  selectedId,
  onSelect,
  streamCounts,
  paused,
  alerts,
}: {
  nodes: NodeSummary[]
  edges: NodeAudioEdge[]
  selectedId: string
  onSelect: (id: string) => void
  streamCounts: Map<string, number>
  paused: boolean
  alerts: PlatformAlert[]
}) {
  const layout = useMemo(() => computeLayout(nodes), [nodes])

  // Compose graph edges: audio edges from backend, plus a star to the mgmt/local
  // anchor so every node draws at least one control-plane tie.
  const anchor = pickPrimaryNode(nodes)
  const anchorPos = anchor ? layout.get(anchor.node_id) : null

  const renderedEdges: Array<{
    a: { x: number; y: number; id: string }
    b: { x: number; y: number; id: string }
    dashed: boolean
    warn: boolean
    streamCount: number
  }> = []

  // Control-plane star (dashed if peer offline).
  if (anchor && anchorPos) {
    nodes.forEach((n) => {
      if (n.node_id === anchor.node_id) return
      const bp = layout.get(n.node_id)
      if (!bp) return
      renderedEdges.push({
        a: { ...anchorPos, id: anchor.node_id },
        b: { ...bp, id: n.node_id },
        dashed: n.status === 'offline',
        warn: false,
        streamCount: 0,
      })
    })
  }

  // Audio edges (active AVB streams).
  edges.forEach((e) => {
    if (!e.active) return
    const a = layout.get(e.source_node_id)
    const b = layout.get(e.dest_node_id)
    if (!a || !b) return
    const srcStatus = nodes.find((n) => n.node_id === e.source_node_id)?.status
    const dstStatus = nodes.find((n) => n.node_id === e.dest_node_id)?.status
    renderedEdges.push({
      a: { ...a, id: e.source_node_id },
      b: { ...b, id: e.dest_node_id },
      dashed: false,
      warn: srcStatus === 'warn' || dstStatus === 'warn',
      streamCount: 1,
    })
  })

  return (
    <div className="ptop__canvas">
      {/* Grid background */}
      <svg className="ptop__canvas-grid" aria-hidden>
        <defs>
          <pattern id="ptop-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(255,255,255,0.025)" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#ptop-grid)" />
      </svg>

      <svg viewBox="0 0 900 640" className="ptop__canvas-svg">
        {/* Edges */}
        {renderedEdges.map((e, i) => (
          <line
            key={`e-${i}`}
            x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y}
            stroke={e.warn ? 'var(--cds-support-warning)' : 'var(--cds-border-subtle-02)'}
            strokeWidth={e.warn ? 1.4 : 0.9}
            strokeDasharray={e.dashed ? '3 4' : undefined}
          />
        ))}

        {/* Animated AVB packets — density scales with stream count per edge */}
        {!paused && renderedEdges
          .filter((e) => e.streamCount > 0 && !e.warn)
          .flatMap((e, idx) => {
            // 1–3 packets per edge depending on streamCount
            const packetCount = Math.min(3, Math.max(1, e.streamCount))
            return Array.from({ length: packetCount }).map((_, k) => (
              <circle key={`p-${idx}-${k}`} r="1.8" fill="var(--cds-support-info)">
                <animateMotion
                  dur={`${2 + ((idx + k) % 3)}s`}
                  repeatCount="indefinite"
                  begin={`${k * 0.4}s`}
                  path={`M ${e.a.x},${e.a.y} L ${e.b.x},${e.b.y}`}
                />
              </circle>
            ))
          })}

        {/* Nodes */}
        {nodes.map((n) => {
          const p = layout.get(n.node_id)
          if (!p) return null
          const isSelected = n.node_id === selectedId
          return (
            <g
              key={n.node_id}
              className="ptop__node"
              tabIndex={0}
              role="button"
              aria-label={`${n.hostname} — ${n.status}`}
              onClick={() => onSelect(n.node_id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(n.node_id)
                }
              }}
            >
              {isSelected && (
                <circle cx={p.x} cy={p.y} r={30}
                  fill="none" stroke="var(--cds-border-interactive)"
                  strokeWidth="1.25" strokeDasharray="2 3" />
              )}
              <circle cx={p.x} cy={p.y} r={22}
                fill="var(--cds-layer-02)" stroke={strokeForStatus(n.status)} strokeWidth="1.5" />
              <text x={p.x} y={p.y + 3} textAnchor="middle" fontSize="9"
                fontFamily="var(--font-mono, ui-monospace, monospace)"
                fill="var(--cds-text-secondary)">
                {roleAbbrev(n.role)}
              </text>
              <text x={p.x} y={p.y + 38} textAnchor="middle" fontSize="9"
                fontFamily="var(--font-mono, ui-monospace, monospace)"
                fill="var(--cds-text-helper)">
                {shortNodeName(n)}
              </text>
              {(n.status === 'warn' || n.status === 'critical') && (
                <circle cx={p.x + 16} cy={p.y - 16} r="5"
                  fill={n.status === 'critical' ? 'var(--cds-support-error)' : 'var(--cds-support-warning)'} />
              )}
              <title>{`${n.hostname} · ${n.status} · ${streamCounts.get(n.node_id) ?? 0} streams`}</title>
            </g>
          )
        })}
      </svg>

      {/* Legend */}
      <div className="ptop__legend">
        <div className="ptop__eyebrow">Legend</div>
        <div><span className="ptop__dot ptop__dot--green" /> healthy</div>
        <div><span className="ptop__dot ptop__dot--yellow" /> warn</div>
        <div><span className="ptop__dot ptop__dot--red" /> critical</div>
        <div><span className="ptop__dot ptop__dot--gray" /> offline</div>
        <div className="ptop__legend-spacer">— AVB stream</div>
        <div>┄ discovery / idle</div>
      </div>

      {/* Rotating alert card */}
      <RotatingAlert alerts={alerts} paused={paused} />
    </div>
  )
}

// ── Heatmap view ─────────────────────────────────────────────────────────────

function cpuColorBucket(cpu: number): string {
  // blue → green → yellow → red
  if (cpu < 25) return 'var(--cds-support-info)'
  if (cpu < 60) return 'var(--cds-support-success)'
  if (cpu < 80) return 'var(--cds-support-warning)'
  return 'var(--cds-support-error)'
}

function HeatmapView({ nodes, selectedId, onSelect }: {
  nodes: NodeSummary[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="ptop__heatmap">
      {nodes.map((n) => {
        const cpu = Math.round(n.cpu_percent ?? 0)
        const mem = Math.round(n.memory_percent ?? 0)
        return (
          <button
            key={n.node_id}
            className={`ptop__heatcell${n.node_id === selectedId ? ' is-selected' : ''}`}
            onClick={() => onSelect(n.node_id)}
            style={{ background: `linear-gradient(180deg, ${cpuColorBucket(cpu)}26, var(--cds-layer-02))` }}
          >
            <div className="ptop__heatcell-head">
              <span className="ptop__mono ptop__tiny">{shortNodeName(n)}</span>
              <span className={`ptop__dot ptop__dot--${statusDotClass(n.status)}`} />
            </div>
            <div className="ptop__heatcell-cpu" style={{ color: cpuColorBucket(cpu) }}>
              {cpu}%
            </div>
            <div className="ptop__heatcell-label">CPU</div>
            <div className="ptop__heatcell-membar">
              <div className="ptop__heatcell-membar-fill" style={{ width: `${mem}%` }} />
            </div>
            <div className="ptop__heatcell-meta">
              <span>Mem {mem}%</span>
              <span className="ptop__muted">{roleAbbrev(n.role).toLowerCase()}</span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ── Signal graph view (swim lanes) ───────────────────────────────────────────

function SignalGraphView({ nodes, edges, selectedId, onSelect }: {
  nodes: NodeSummary[]
  edges: NodeAudioEdge[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  const active = edges.filter((e) => e.active)

  return (
    <div className="ptop__sigraph">
      <div className="ptop__sigraph-headers">
        <span>Source</span>
        <span className="ptop__sigraph-flow">Stream →</span>
        <span>Destination</span>
      </div>
      <div className="ptop__sigraph-lanes">
        {nodes.map((n) => {
          const outgoing = active.filter((e) => e.source_node_id === n.node_id)
          const incoming = active.filter((e) => e.dest_node_id === n.node_id)
          return (
            <button
              key={n.node_id}
              className={`ptop__sigraph-lane${n.node_id === selectedId ? ' is-selected' : ''}`}
              onClick={() => onSelect(n.node_id)}
            >
              <div className="ptop__sigraph-lane-name">
                <span className={`ptop__dot ptop__dot--${statusDotClass(n.status)}`} />
                <span className="ptop__mono">{shortNodeName(n)}</span>
                <span className="ptop__muted ptop__tiny">{roleAbbrev(n.role).toLowerCase()}</span>
              </div>
              <div className="ptop__sigraph-lane-counts">
                <span className="ptop__tag ptop__tag--subtle">{incoming.length} in</span>
                <span className="ptop__tag ptop__tag--subtle">{outgoing.length} out</span>
              </div>
              <div className="ptop__sigraph-lane-edges">
                {active.slice(0, 12).map((e, i) => {
                  const involved = e.source_node_id === n.node_id || e.dest_node_id === n.node_id
                  return (
                    <span
                      key={i}
                      className={`ptop__sigraph-edge${involved ? ' is-active' : ''}`}
                      style={{ background: involved ? 'var(--cds-support-info)' : 'var(--cds-border-subtle-02)' }}
                    />
                  )
                })}
              </div>
            </button>
          )
        })}
      </div>
      {!nodes.length && (
        <div className="ptop__empty">No nodes in the topology yet.</div>
      )}
    </div>
  )
}

// ── List view (richer fleet table) ───────────────────────────────────────────

function ListView({
  nodes,
  selectedId,
  onSelect,
  streamCounts,
}: {
  nodes: NodeSummary[]
  selectedId: string
  onSelect: (id: string) => void
  streamCounts: Map<string, number>
}) {
  return (
    <div className="ptop__list">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Role</th>
            <th>CPU</th>
            <th>Memory</th>
            <th>Streams</th>
            <th>Alerts</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((n) => {
            const cpu = Math.round(n.cpu_percent ?? 0)
            const mem = Math.round(n.memory_percent ?? 0)
            const streams = streamCounts.get(n.node_id) ?? 0
            const isSel = n.node_id === selectedId
            return (
              <tr
                key={n.node_id}
                className={isSel ? 'is-selected' : ''}
                tabIndex={0}
                onClick={() => onSelect(n.node_id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect(n.node_id)
                  }
                }}
              >
                <td className="ptop__mono">{shortNodeName(n)}</td>
                <td>
                  <span className={`ptop__tag ptop__tag--${statusTagClass(n.status)}`}>{n.status}</span>
                </td>
                <td className="ptop__muted">{n.role.replace(/_/g, ' ')}</td>
                <td>
                  <div className="ptop__meter-row">
                    <span className="ptop__mono ptop__meter-val">{cpu}%</span>
                    <div className="ptop__meter">
                      <div
                        className="ptop__meter-fill"
                        style={{
                          width: `${cpu}%`,
                          background: cpu > 70 ? 'var(--cds-support-warning)' : 'var(--cds-support-info)',
                        }}
                      />
                    </div>
                  </div>
                </td>
                <td>
                  <div className="ptop__meter-row">
                    <span className="ptop__mono ptop__meter-val">{mem}%</span>
                    <div className="ptop__meter">
                      <div
                        className="ptop__meter-fill"
                        style={{
                          width: `${mem}%`,
                          background: mem > 70 ? 'var(--cds-support-warning)' : 'var(--cds-support-info)',
                        }}
                      />
                    </div>
                  </div>
                </td>
                <td className="ptop__mono">{streams}</td>
                <td className={n.xrun_count > 0 ? 'ptop__alert-on' : 'ptop__muted'}>
                  {n.xrun_count > 0 ? n.xrun_count : 'clear'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {!nodes.length && <div className="ptop__empty">No nodes reporting.</div>}
    </div>
  )
}

// ── Sidebar: selected node ───────────────────────────────────────────────────

function Sidebar({
  node,
  streams,
  paused,
  onOpenControlPanel,
  onOpenAvb,
  onRestart,
  onDownloadDiagnostics,
  isRestarting,
  isDownloading,
}: {
  node: NodeSummary | null
  streams: number
  paused: boolean
  onOpenControlPanel: () => void
  onOpenAvb: () => void
  onRestart: () => void
  onDownloadDiagnostics: () => void
  isRestarting: boolean
  isDownloading: boolean
}) {
  if (!node) {
    return (
      <aside className="ptop__sidebar">
        <div className="ptop__sidebar-empty">
          <div className="ptop__eyebrow">Selected node</div>
          <p className="ptop__muted">No node reporting yet.</p>
        </div>
      </aside>
    )
  }

  return (
    <aside className="ptop__sidebar" aria-label={`Details for ${node.hostname}`}>
      <div className="ptop__sidebar-section">
        <div className="ptop__eyebrow">Selected node</div>
        <div className="ptop__sidebar-title">
          <span className={`ptop__dot ptop__dot--${statusDotClass(node.status)} ${paused ? '' : 'ptop__dot--pulse'}`} />
          <span className="ptop__mono ptop__sidebar-node">{node.hostname}</span>
        </div>
        <div className="ptop__muted ptop__tiny ptop__sidebar-meta">
          {node.role.replace(/_/g, ' ')} · {streams} streams · xruns {node.xrun_count}
        </div>
      </div>

      <div className="ptop__sidebar-section">
        <div className="ptop__eyebrow">Resources</div>
        <MiniMetric label="CPU" value={`${Math.round(node.cpu_percent ?? 0)}%`} seed={Math.round(node.cpu_percent ?? 0) * 3} paused={paused} />
        <MiniMetric label="Memory" value={`${Math.round(node.memory_percent ?? 0)}%`} seed={Math.round(node.memory_percent ?? 0) * 5} paused={paused} />
        <MiniMetric label="Audio latency" value={`${(node.audio_latency_ms ?? 0).toFixed(1)} ms`} seed={77} paused={paused} />
      </div>

      <SignalPathSection nodeId={node.node_id} isLocal={node.is_local} />

      <div className="ptop__sidebar-section">
        <div className="ptop__eyebrow">Quick actions</div>
        <div className="ptop__actions">
          <button className="ptop__action" onClick={onOpenControlPanel}>
            <span>Open Control Panel</span>
            <span className="ptop__muted">→</span>
          </button>
          <button className="ptop__action" onClick={onOpenAvb}>
            <span>View AVB routes</span>
            <span className="ptop__muted">→</span>
          </button>
          <button className="ptop__action" onClick={onRestart} disabled={isRestarting}>
            <span>{isRestarting ? 'Restarting…' : 'Restart engine'}</span>
            {isRestarting ? <InlineLoading description="" /> : <span className="ptop__muted">→</span>}
          </button>
          <button className="ptop__action" onClick={onDownloadDiagnostics} disabled={isDownloading}>
            <span>{isDownloading ? 'Collecting…' : 'Download diagnostics'}</span>
            {isDownloading ? <InlineLoading description="" /> : <span className="ptop__muted">→</span>}
          </button>
        </div>
      </div>
    </aside>
  )
}

function MiniMetric({ label, value, seed, paused }: {
  label: string
  value: string
  seed: number
  paused: boolean
}) {
  return (
    <div className="ptop__mini-metric">
      <div className="ptop__mini-metric-row">
        <span className="ptop__muted ptop__tiny">{label}</span>
        <span className="ptop__mono ptop__tiny">{value}</span>
      </div>
      <Sparkline seed={seed} width={300} height={30} color="var(--cds-support-info)" paused={paused} />
    </div>
  )
}

function SignalPathSection({ nodeId, isLocal }: { nodeId: string; isLocal: boolean }) {
  const [state, setState] = useState<{
    loading: boolean
    error: string | null
    plugins: Array<{ name: string; bypassed: boolean; position: number }>
    chainName: string | null
  }>({ loading: true, error: null, plugins: [], chainName: null })

  useEffect(() => {
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    // Only local node has a resolvable /chains endpoint via this frontend;
    // remote nodes would route through scopedNodePath but not all clusters
    // expose cross-node chain reads. Show an empty state for non-local.
    if (!isLocal) {
      setState({ loading: false, error: null, plugins: [], chainName: null })
      return () => { cancelled = true }
    }
    chainsApi
      .list(null)
      .then((res) => {
        if (cancelled) return
        const active = res.chains.find((c) => c.is_active) ?? res.chains[0] ?? null
        if (!active) {
          setState({ loading: false, error: null, plugins: [], chainName: null })
          return
        }
        const plugins = active.plugins
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((p) => ({ name: p.name, bypassed: p.bypassed, position: p.position }))
        setState({ loading: false, error: null, plugins, chainName: active.name })
      })
      .catch((err) => {
        if (cancelled) return
        setState({ loading: false, error: err instanceof Error ? err.message : 'Failed to load signal chain', plugins: [], chainName: null })
      })
    return () => { cancelled = true }
  }, [nodeId, isLocal])

  return (
    <div className="ptop__sidebar-section">
      <div className="ptop__eyebrow">Signal path{state.chainName ? ` · ${state.chainName}` : ''}</div>
      {state.loading && <div className="ptop__muted ptop__tiny">Loading…</div>}
      {state.error && <div className="ptop__muted ptop__tiny">{state.error}</div>}
      {!state.loading && !state.error && !state.plugins.length && (
        <div className="ptop__muted ptop__tiny">No chain configured for this node.</div>
      )}
      {!!state.plugins.length && (
        <div className="ptop__chain">
          <span>Input</span>
          {state.plugins.map((p, i) => (
            <span key={`${p.position}-${i}`} className={`ptop__chain-step${p.bypassed ? ' is-bypassed' : ''}`}>
              → {p.name}
            </span>
          ))}
          <span>→ Output</span>
        </div>
      )}
    </div>
  )
}

// ── Restart confirm modal ────────────────────────────────────────────────────

function RestartConfirmModal({
  open,
  nodeLabel,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean
  nodeLabel: string
  busy: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <ComposedModal open={open} onClose={onClose} size="sm" className="ptop__confirm-modal">
      <ModalHeader
        label="Management"
        title={`Restart engine on ${nodeLabel}?`}
        closeModal={onClose}
      />
      <ModalBody>
        <p>
          The audio engine on <strong>{nodeLabel}</strong> will stop and re-apply runtime configuration.
          Expect a brief audio dropout (≈1–3 seconds) while the engine reinitialises.
        </p>
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button kind="danger" onClick={onConfirm} disabled={busy}>
          {busy && <InlineLoading description="" />}
          {busy ? 'Restarting…' : 'Restart engine'}
        </Button>
      </ModalFooter>
    </ComposedModal>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

const VIEW_LABELS: Record<ViewId, string> = {
  topology: 'Topology',
  heatmap: 'Heatmap',
  signal: 'Signal graph',
  list: 'List',
}

export function PlatformsOverviewTopology({ layer }: Props) {
  const navigate = useNavigate()
  const { pushToast } = useToasts()
  const topologyQuery = useNodeTopology()

  // Last-known data fallback: when the fetch errors, keep the most recent
  // successful payload and surface a stale banner.
  const lastGoodRef = useRef<{ nodes: NodeSummary[]; audio_edges: NodeAudioEdge[] } | null>(null)
  if (topologyQuery.data?.nodes?.length) {
    lastGoodRef.current = {
      nodes: topologyQuery.data.nodes,
      audio_edges: topologyQuery.data.audio_edges,
    }
  }

  const nodes: NodeSummary[] = topologyQuery.data?.nodes ?? lastGoodRef.current?.nodes ?? []
  const edges: NodeAudioEdge[] = topologyQuery.data?.audio_edges ?? lastGoodRef.current?.audio_edges ?? []
  const isStale = Boolean(topologyQuery.error) && Boolean(lastGoodRef.current?.nodes?.length)
  const lastUpdatedAt = topologyQuery.dataUpdatedAt
    ? new Date(topologyQuery.dataUpdatedAt).toLocaleTimeString()
    : null

  const [view, setView] = useState<ViewId>('topology')
  const primary = pickPrimaryNode(nodes)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = nodes.find((n) => n.node_id === selectedId) ?? primary
  // Auto-select primary on first populate.
  useEffect(() => {
    if (!selectedId && primary) setSelectedId(primary.node_id)
  }, [primary, selectedId])

  // Pause animations when tab is hidden.
  const [paused, setPaused] = useState(typeof document !== 'undefined' ? document.hidden : false)
  useEffect(() => {
    if (typeof document === 'undefined') return
    const handler = () => setPaused(document.hidden)
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [])

  const streamCounts = useMemo(() => streamsPerNode(nodes, edges), [nodes, edges])

  // Alerts for the rotating stack — filter to overview layer from the layer
  // payload the shell already fetches.
  const alerts: PlatformAlert[] = useMemo(
    () => layer.notifications.map((n) => ({ ...n, layerId: 'overview' as const })),
    [layer.notifications],
  )

  // Quick action handlers
  const [restartOpen, setRestartOpen] = useState(false)
  const [isRestarting, setIsRestarting] = useState(false)
  const [isDownloadingDiag, setIsDownloadingDiag] = useState(false)

  const handleOpenControlPanel = useCallback(() => {
    navigate(buildPlatformHref('management'))
  }, [navigate])

  const handleOpenAvb = useCallback(() => {
    navigate(buildPlatformHref('avb-routing'))
  }, [navigate])

  const handleRestartConfirm = useCallback(async () => {
    if (!selected) return
    setIsRestarting(true)
    try {
      const nodeIdArg = selected.is_local ? null : selected.node_id
      const res = await audioApi.restart(nodeIdArg)
      if (res.success) {
        pushToast(`Engine restart triggered on ${selected.hostname}`, 'success')
      } else {
        pushToast(res.message || 'Engine restart failed', 'error')
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Engine restart failed', 'error')
    } finally {
      setIsRestarting(false)
      setRestartOpen(false)
    }
  }, [selected, pushToast])

  const handleDownloadDiagnostics = useCallback(async () => {
    if (!selected) return
    setIsDownloadingDiag(true)
    try {
      const nodeIdArg = selected.is_local ? null : selected.node_id
      const result = await diagnosticsApi.runFullDiagnostic(nodeIdArg)
      const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `map2-diagnostics-${selected.hostname}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      pushToast(`Diagnostics downloaded for ${selected.hostname}`, 'success')
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Diagnostics collection failed', 'error')
    } finally {
      setIsDownloadingDiag(false)
    }
  }, [selected, pushToast])

  return (
    <section className="ptop" aria-label="Platforms overview topology">
      <header className="ptop__header">
        <div>
          <div className="ptop__crumbs">
            <span>workspace</span>
            <span className="ptop__crumbs-sep">/</span>
            <span>platforms</span>
            <span className="ptop__crumbs-sep">/</span>
            <span className="ptop__crumbs-current">overview</span>
          </div>
          <div className="ptop__title-row">
            <h2 className="ptop__title">Cluster topology</h2>
            {layer.alertCount > 0 && (
              <span className="ptop__tag ptop__tag--yellow">
                {layer.alertCount} {layer.alertCount === 1 ? 'warning' : 'warnings'}
              </span>
            )}
            <span className="ptop__mono ptop__muted ptop__tiny">
              {nodes.length} nodes · {edges.filter((e) => e.active).length} streams
            </span>
          </div>
        </div>
        <nav className="ptop__viewtoggle" aria-label="Overview view">
          {(Object.keys(VIEW_LABELS) as ViewId[]).map((v) => (
            <button
              key={v}
              className={`ptop__viewtoggle-btn${v === view ? ' is-active' : ''}`}
              onClick={() => setView(v)}
              type="button"
            >
              {VIEW_LABELS[v]}
            </button>
          ))}
        </nav>
      </header>

      {isStale && (
        <div className="ptop__stale" role="status">
          <span className="ptop__dot ptop__dot--yellow" />
          <span>Showing last-known state.</span>
          {lastUpdatedAt && <span className="ptop__muted ptop__tiny">Updated {lastUpdatedAt}</span>}
          <button className="ptop__stale-retry" onClick={() => topologyQuery.refetch()}>Retry</button>
        </div>
      )}

      <div className="ptop__body">
        <div className="ptop__main">
          {view === 'topology' && (
            <TopologyCanvas
              nodes={nodes}
              edges={edges}
              selectedId={selected?.node_id ?? ''}
              onSelect={setSelectedId}
              streamCounts={streamCounts}
              paused={paused}
              alerts={alerts}
            />
          )}
          {view === 'heatmap' && (
            <HeatmapView nodes={nodes} selectedId={selected?.node_id ?? ''} onSelect={setSelectedId} />
          )}
          {view === 'signal' && (
            <SignalGraphView nodes={nodes} edges={edges} selectedId={selected?.node_id ?? ''} onSelect={setSelectedId} />
          )}
          {view === 'list' && (
            <ListView nodes={nodes} selectedId={selected?.node_id ?? ''} onSelect={setSelectedId} streamCounts={streamCounts} />
          )}
        </div>

        <Sidebar
          node={selected ?? null}
          streams={selected ? streamCounts.get(selected.node_id) ?? 0 : 0}
          paused={paused}
          onOpenControlPanel={handleOpenControlPanel}
          onOpenAvb={handleOpenAvb}
          onRestart={() => setRestartOpen(true)}
          onDownloadDiagnostics={handleDownloadDiagnostics}
          isRestarting={isRestarting}
          isDownloading={isDownloadingDiag}
        />
      </div>

      <RestartConfirmModal
        open={restartOpen}
        nodeLabel={selected?.hostname ?? 'selected node'}
        busy={isRestarting}
        onConfirm={handleRestartConfirm}
        onClose={() => setRestartOpen(false)}
      />
    </section>
  )
}
