/* NodeIdentityCard — global-nav node card (D3 hero-band design).
   Replaces the old "MAP2-TESTBED / OK" button at the top of the global tree nav.
   - Click anywhere opens the node selector popover (existing behavior, unchanged).
   - Hero band: MAP2-Node hero icon, vertical rotated node ID, role chip, status frame.
   - KV plate: HOST · ROLE · LATENCY · XRUNS · LATENCY PRESSURE.
   - CPU/MEM overlay: mini bars; thresholds @ 70% (yellow) / 85% (red).
   - Resources hidden when status is offline (no live data to show).
   - Never synthesizes — all values come straight from NodeSummary. */

import { forwardRef } from 'react'

import type { NodeSummary } from '../../types/node'
import { formatNodeDisplayName, getNodeRoleLabel, getNodeStatusLabel } from '../../utils/nodeDisplay'
import { Map2BrandMark } from '../branding/map2Branding'
import './NodeIdentityCard.css'

interface NodeIdentityCardProps {
  node: NodeSummary | null
  isOpen: boolean
  onToggle: () => void
  loadingLabel?: string
}

export const NodeIdentityCard = forwardRef<HTMLButtonElement, NodeIdentityCardProps>(
  function NodeIdentityCard({ node, isOpen, onToggle, loadingLabel }, ref) {
    if (!node) {
      return (
        <button
          ref={ref}
          type="button"
          className="node-id-card"
          data-status="offline"
          data-resources-overlay="false"
          aria-expanded={isOpen}
          aria-label="Node discovery unavailable"
          onClick={onToggle}
        >
          <div className="node-id-card__eyebrow">
            <span className="node-id-card__eyebrow-left">
              <span className="node-id-card__dot" />
              <span>Current Node in View</span>
            </span>
            <span className="node-id-card__eyebrow-status">{loadingLabel ?? 'UNAVAILABLE'}</span>
          </div>
          <div className="node-id-card__hero">
            <div className="node-id-card__hero-mark">
              <Map2BrandMark decorative />
            </div>
            <span className="node-id-card__caret" aria-hidden>▾</span>
          </div>
        </button>
      )
    }

    const status = node.status
    const showResources = status !== 'offline'
    const displayName = formatNodeDisplayName(node)

    const xrunDisplay = formatXruns(node.xrun_count)
    const latencyDisplay = formatLatencyMs(node.audio_latency_ms)
    const pressure = formatLatencyPressure(node)

    return (
      <button
        ref={ref}
        type="button"
        className="node-id-card"
        data-status={status}
        data-resources-overlay={showResources ? 'true' : 'false'}
        aria-expanded={isOpen}
        aria-label={`Node ${displayName}, status ${getNodeStatusLabel(status)}. Click to switch nodes.`}
        onClick={onToggle}
      >
        {/* Eyebrow */}
        <div className="node-id-card__eyebrow">
          <span className="node-id-card__eyebrow-left">
            <span className="node-id-card__dot" />
            <span>Current Node in View</span>
          </span>
          <span className="node-id-card__eyebrow-status">{status.toUpperCase()}</span>
        </div>

        {/* Hero band */}
        <div className="node-id-card__hero">
          {/* Role chip */}
          <span className="node-id-card__role-chip">{getNodeRoleLabel(node.role).toUpperCase()}</span>

          {/* Caret */}
          <span className="node-id-card__caret" aria-hidden>▾</span>

          {/* Hero mark */}
          <div className="node-id-card__hero-mark">
            <Map2BrandMark decorative />
          </div>

          {/* Vertical node ID */}
          <div className="node-id-card__vertical-id">
            <span className="node-id-card__vertical-id-text">{displayName}</span>
          </div>

          {/* Bottom info: CPU/MEM overlay + KV plate */}
          <div className="node-id-card__info">
            {showResources && (
              <div className="node-id-card__overlay">
                <ResMini label="CPU" value={node.cpu_percent} status={status} />
                <ResMini label="MEM" value={node.memory_percent} status={status} />
              </div>
            )}
            <div className="node-id-card__plate">
              <KV k="HOST"     v={node.hostname} />
              <KV k="ROLE"     v={getNodeRoleLabel(node.role).toUpperCase()} />
              <KV k="LATENCY"  v={latencyDisplay} />
              <KV k="XRUNS"    v={xrunDisplay} />
              <KV
                k="LAT PRESS"
                v={pressure.label}
                valueClass={`node-id-card__kv-value--score-${pressure.tone}`}
                statusSuffix={pressure.statusLabel}
              />
            </div>
          </div>
        </div>
      </button>
    )
  },
)

/* ─── helpers ───────────────────────────────────────────────────────────── */

interface KVProps {
  k: string
  v: string
  valueClass?: string
  statusSuffix?: string
}

function KV({ k, v, valueClass, statusSuffix }: KVProps) {
  return (
    <div className="node-id-card__kv">
      <span className="node-id-card__kv-key">{k}</span>
      <span className={joinClasses('node-id-card__kv-value', valueClass)}>
        {v}
        {statusSuffix ? <span className="node-id-card__kv-status">· {statusSuffix}</span> : null}
      </span>
    </div>
  )
}

function ResMini({ label, value, status }: { label: string; value: number; status: NodeSummary['status'] }) {
  const fill = resourceColor(value, status)
  const pct = clampPercent(value)
  return (
    <div className="node-id-card__res-mini" style={{ color: `${fill}66` }}>
      <div className="node-id-card__res-mini-row">
        <span className="node-id-card__res-mini-label">{label}</span>
        <span className="node-id-card__res-mini-value">
          {Math.round(pct)}
          <span className="node-id-card__res-mini-value-pct">%</span>
        </span>
      </div>
      <div className="node-id-card__res-mini-bar">
        <div
          className="node-id-card__res-mini-bar-fill"
          style={{ width: `${pct}%`, background: fill }}
        />
      </div>
    </div>
  )
}

function resourceColor(value: number, status: NodeSummary['status']): string {
  if (value >= 85) return 'var(--support-danger)'
  if (value >= 70) return 'var(--support-warning)'
  switch (status) {
    case 'ok':       return 'var(--support-success)'
    case 'warn':     return 'var(--support-warning)'
    case 'critical': return 'var(--support-danger)'
    default:         return 'var(--text-tertiary)'
  }
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 100) return 100
  return value
}

function formatXruns(count: number | null | undefined): string {
  if (typeof count !== 'number' || !Number.isFinite(count)) return '—'
  return String(Math.max(0, Math.trunc(count)))
}

function formatLatencyMs(latency: number | null | undefined): string {
  if (typeof latency !== 'number' || !Number.isFinite(latency) || latency <= 0) return '—'
  return `${latency.toFixed(2)} ms`
}

interface PressureDisplay {
  label: string
  statusLabel: string
  tone: 'stable' | 'watch' | 'critical' | 'offline' | 'waiting'
}

function formatLatencyPressure(node: NodeSummary): PressureDisplay {
  const status = node.latency_pressure_status ?? 'waiting'
  const score = node.latency_pressure_score ?? null
  const tone: PressureDisplay['tone'] =
    status === 'critical' || status === 'offline' || status === 'watch' || status === 'stable' || status === 'waiting'
      ? status
      : 'waiting'
  const label =
    typeof score === 'number' && Number.isFinite(score)
      ? `${String(Math.max(0, Math.min(10, Math.round(score)))).padStart(2, '0')}/10`
      : '--/10'
  return {
    label,
    statusLabel: pressureStatusLabel(tone),
    tone,
  }
}

function pressureStatusLabel(tone: PressureDisplay['tone']): string {
  switch (tone) {
    case 'stable':   return 'STABLE'
    case 'watch':    return 'WATCH'
    case 'critical': return 'CRITICAL'
    case 'offline':  return 'OFFLINE'
    case 'waiting':  return 'WAITING'
  }
}

function joinClasses(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export default NodeIdentityCard
