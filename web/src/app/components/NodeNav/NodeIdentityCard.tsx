/* NodeIdentityCard — V4-A3 Numbered Ladder layout (replaces the prior D3 hero band).
   Sits at the top of the global navigation rail. Click anywhere opens the node selector.

   Layout (top → bottom):
     1. Eyebrow strip:   ● CURRENT NODE IN VIEW — STATUS
     2. Header row:      HOST (left) · ROLE (right)
     3. Pressure block:  LAT PRESS label + status tag · 10-step numbered ladder · score X/10 + axis
     4. XRUNS callout:   bold count with dropout(s) tag
     5. Footer chips:    CPU · MEM · LAT

   Color rules — every accent flows through theme tokens:
     - Status accent: --support-success | --support-warning | --support-danger | --text-tertiary
     - Pressure tone is driven by NodeSummary.latency_pressure_status (backend authority).
       Ladder fill *count* tracks the numeric score; ladder *color* tracks the status tone.
     - Offline / waiting hides the ladder + xruns blocks and shows a placeholder strip;
       footer chips render em-dashes. */

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

type PressureTone = 'stable' | 'watch' | 'critical' | 'offline' | 'waiting'

export const NodeIdentityCard = forwardRef<HTMLButtonElement, NodeIdentityCardProps>(
  function NodeIdentityCard({ node, isOpen, onToggle, loadingLabel }, ref) {
    if (!node) {
      return (
        <button
          ref={ref}
          type="button"
          className="node-id-card"
          data-status="offline"
          data-pressure-tone="waiting"
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
          <div className="node-id-card__head">
            <span className="node-id-card__host">
              <Map2BrandMark decorative className="node-id-card__head-mark" />
              <span>—</span>
            </span>
            <span className="node-id-card__role">—</span>
            <span className="node-id-card__caret" aria-hidden>▾</span>
          </div>
          <div className="node-id-card__placeholder">{loadingLabel ?? 'NODE OFFLINE'}</div>
          <div className="node-id-card__secondary">
            <FooterChip label="CPU" v="—" tone="muted" />
            <FooterChip label="MEM" v="—" tone="muted" />
            <FooterChip label="LAT" v="—" tone="muted" />
          </div>
        </button>
      )
    }

    const status = node.status
    const displayName = formatNodeDisplayName(node)
    const roleLabel = getNodeRoleLabel(node.role).toUpperCase()

    const pressure = formatLatencyPressure(node)
    const showLive = status !== 'offline' && pressure.tone !== 'offline' && pressure.tone !== 'waiting'

    return (
      <button
        ref={ref}
        type="button"
        className="node-id-card"
        data-status={status}
        data-pressure-tone={pressure.tone}
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

        {/* Header row: HOST · ROLE */}
        <div className="node-id-card__head">
          <span className="node-id-card__host">
            <Map2BrandMark decorative className="node-id-card__head-mark" />
            <span>{displayName}</span>
          </span>
          <span className="node-id-card__role">{roleLabel}</span>
          <span className="node-id-card__caret" aria-hidden>▾</span>
        </div>

        {showLive ? (
          <>
            {/* Pressure block */}
            <div className="node-id-card__press">
              <div className="node-id-card__press-top">
                <span className="node-id-card__press-label">LAT PRESS</span>
                <span className="node-id-card__press-tag">{pressure.statusLabel}</span>
              </div>
              <SegmentLadder score={pressure.score ?? 0} tone={pressure.tone} />
              <div className="node-id-card__press-bottom">
                <span className="node-id-card__press-num">
                  {formatScoreNum(pressure.score)}
                  <span className="node-id-card__press-denom">/10</span>
                </span>
                <span className="node-id-card__press-axis">1 worst → 10 best</span>
              </div>
            </div>

            {/* XRUNS callout */}
            <div className="node-id-card__xrun" data-clean={node.xrun_count === 0}>
              <span className="node-id-card__xrun-label">XRUNS</span>
              <span className="node-id-card__xrun-num">{formatXruns(node.xrun_count)}</span>
              <span className="node-id-card__xrun-tag">{xrunTag(node.xrun_count)}</span>
            </div>
          </>
        ) : (
          <div className="node-id-card__placeholder">
            {pressure.tone === 'offline' ? 'NODE OFFLINE' : 'WAITING FOR DATA'}
          </div>
        )}

        {/* Footer chips */}
        <div className="node-id-card__secondary">
          <FooterChip
            label="CPU"
            v={showLive ? formatPercent(node.cpu_percent) : '—'}
            tone={showLive ? resourceTone(node.cpu_percent) : 'muted'}
          />
          <FooterChip
            label="MEM"
            v={showLive ? formatPercent(node.memory_percent) : '—'}
            tone={showLive ? resourceTone(node.memory_percent) : 'muted'}
          />
          <FooterChip
            label="LAT"
            v={showLive ? formatLatencyMs(node.audio_latency_ms) : '—'}
            tone={showLive ? latencyTone(node.audio_latency_ms) : 'muted'}
          />
        </div>
      </button>
    )
  },
)

/* ─── helpers ───────────────────────────────────────────────────────────── */

type ChipTone = 'normal' | 'warning' | 'danger' | 'muted'

interface FooterChipProps {
  label: string
  v: string
  tone: ChipTone
}

function FooterChip({ label, v, tone }: FooterChipProps) {
  return (
    <div className="node-id-card__chip" data-tone={tone}>
      <span className="node-id-card__chip-label">{label}</span>
      <span className="node-id-card__chip-value">{v}</span>
    </div>
  )
}

interface SegmentLadderProps {
  score: number
  tone: PressureTone
}

function SegmentLadder({ score, tone }: SegmentLadderProps) {
  const filled = clampScore(score)
  return (
    <div className="node-id-card__ladder" role="presentation">
      {Array.from({ length: 10 }).map((_, i) => {
        const stepNum = i + 1
        const isFilled = stepNum <= filled
        return (
          <span
            key={stepNum}
            className="node-id-card__ladder-step"
            data-filled={isFilled ? 'true' : 'false'}
            data-tone={tone}
          >
            <span className="node-id-card__ladder-num">{stepNum}</span>
          </span>
        )
      })}
    </div>
  )
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 10) return 10
  return Math.round(value)
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 100) return 100
  return value
}

function resourceTone(value: number): ChipTone {
  if (!Number.isFinite(value) || value <= 0) return 'muted'
  if (value >= 85) return 'danger'
  if (value >= 70) return 'warning'
  return 'normal'
}

function latencyTone(latency: number | null | undefined): ChipTone {
  if (typeof latency !== 'number' || !Number.isFinite(latency) || latency <= 0) return 'muted'
  if (latency >= 10) return 'danger'
  if (latency >= 5) return 'warning'
  return 'normal'
}

function formatPercent(value: number): string {
  const pct = clampPercent(value)
  return `${Math.round(pct)}%`
}

function formatXruns(count: number | null | undefined): string {
  if (typeof count !== 'number' || !Number.isFinite(count)) return '—'
  return String(Math.max(0, Math.trunc(count)))
}

function xrunTag(count: number | null | undefined): string {
  if (typeof count !== 'number' || !Number.isFinite(count)) return ''
  if (count === 0) return 'NO DROPOUTS'
  if (count === 1) return 'DROPOUT'
  return 'DROPOUTS'
}

function formatLatencyMs(latency: number | null | undefined): string {
  if (typeof latency !== 'number' || !Number.isFinite(latency) || latency <= 0) return '—'
  return `${latency.toFixed(2)}ms`
}

function formatScoreNum(score: number | null): string {
  if (score === null || !Number.isFinite(score)) return '—'
  return String(Math.max(0, Math.min(10, Math.round(score))))
}

interface PressureDisplay {
  score: number | null
  statusLabel: string
  tone: PressureTone
}

function formatLatencyPressure(node: NodeSummary): PressureDisplay {
  const status = node.latency_pressure_status ?? 'waiting'
  const rawScore = node.latency_pressure_score
  const score =
    typeof rawScore === 'number' && Number.isFinite(rawScore)
      ? Math.max(0, Math.min(10, rawScore))
      : null
  const tone: PressureTone =
    status === 'critical' || status === 'offline' || status === 'watch' || status === 'stable' || status === 'waiting'
      ? status
      : 'waiting'
  return {
    score,
    statusLabel: pressureStatusLabel(tone),
    tone,
  }
}

function pressureStatusLabel(tone: PressureTone): string {
  switch (tone) {
    case 'stable':   return 'STABLE'
    case 'watch':    return 'WATCH'
    case 'critical': return 'CRITICAL'
    case 'offline':  return 'OFFLINE'
    case 'waiting':  return 'WAITING'
  }
}

export default NodeIdentityCard
