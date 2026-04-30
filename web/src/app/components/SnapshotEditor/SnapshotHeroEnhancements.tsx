import {
  Checkmark,
  Close,
  Copy,
  Locked,
  Unlocked,
  Warning,
  WarningAltFilled,
} from '@carbon/icons-react'
import { Button, Tag } from '@carbon/react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import type { SnapshotDetail, SnapshotPublishReadiness, SnapshotPublishStatus } from '../../../map2/types'

const HERO_METADATA_LIMIT = 12

interface MetadataRow {
  id: string
  label: string
  value: ReactNode
  copyValue?: string
  monospace?: boolean
}

function formatRevisionLabel(revisionId: number | null | undefined, revisionHash?: string | null): { display: string; copy?: string } | null {
  if (revisionHash) {
    const shortHead = revisionHash.slice(0, 8)
    const shortTail = revisionHash.slice(-4)
    if (revisionHash.length > 16) {
      return { display: `Revision ${shortHead}…${shortTail}`, copy: revisionHash }
    }
    return { display: `Revision ${revisionHash}`, copy: revisionHash }
  }
  if (revisionId != null) {
    return { display: `Revision #${revisionId}` }
  }
  return null
}

function formatRoutingValue(snapshot: SnapshotDetail | null | undefined): string | null {
  if (!snapshot?.routing) return null
  const tokens: string[] = []
  if (snapshot.routing.mode) tokens.push(snapshot.routing.mode)
  if (snapshot.routing.active_channel_key) tokens.push(`Active ${snapshot.routing.active_channel_key}`)
  if (typeof snapshot.routing.morph_position === 'number' && snapshot.routing.morph_position >= 0) {
    const blendPct = Math.round(snapshot.routing.morph_position * 100)
    if (Number.isFinite(blendPct)) tokens.push(`${blendPct}% blend`)
  }
  return tokens.length > 0 ? tokens.join(' · ') : null
}

function formatTimestamp(value: string | null | undefined): string | null {
  if (!value) return null
  const ts = new Date(value).getTime()
  if (!Number.isFinite(ts)) return null
  const dt = new Date(ts)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
}

function formatRelative(value: string | null | undefined): string | null {
  if (!value) return null
  const ts = new Date(value).getTime()
  if (!Number.isFinite(ts)) return null
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (seconds < 30) return 'just now'
  if (seconds < 90) return 'a minute ago'
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} hr ago`
  return `${Math.round(seconds / 86_400)} d ago`
}

export function buildHeroMetadataRows(
  snapshot: SnapshotDetail | null | undefined,
  readiness: SnapshotPublishReadiness | null | undefined,
): MetadataRow[] {
  if (!snapshot) return []
  const rows: MetadataRow[] = []

  const draftRevision = formatRevisionLabel(readiness?.draft_revision_id ?? null, snapshot.snapshot_revision)
  if (draftRevision) {
    rows.push({ id: 'save', label: 'SAVE', value: draftRevision.display, copyValue: draftRevision.copy, monospace: true })
  }

  const liveRevision = formatRevisionLabel(readiness?.confirmed_revision_id ?? null)
  if (liveRevision) {
    rows.push({ id: 'live-rev', label: 'LIVE REV', value: `Confirmed ${liveRevision.display.replace(/^Revision\s*/, '')}`, monospace: true })
  }

  if (snapshot.live_state?.node_id) {
    rows.push({ id: 'host', label: 'HOST', value: snapshot.live_state.node_id, monospace: true })
  }

  const ioParts: string[] = []
  if (snapshot.input_device) ioParts.push(`IN ${snapshot.input_device}`)
  if (snapshot.output_device) ioParts.push(`OUT ${snapshot.output_device}`)
  if (ioParts.length > 0) {
    rows.push({ id: 'sound', label: 'SOUND', value: ioParts.join(' · ') })
  }

  const routingValue = formatRoutingValue(snapshot)
  if (routingValue) {
    rows.push({ id: 'routing', label: 'ROUTING', value: routingValue })
  }

  if (typeof snapshot.chain_count === 'number' && snapshot.chain_count > 0) {
    const channelCount = snapshot.channels?.length ?? 0
    const chainLabel = `${snapshot.chain_count} ${snapshot.chain_count === 1 ? 'chain' : 'chains'}`
    const channelLabel = channelCount > 0 ? ` · ${channelCount} ${channelCount === 1 ? 'channel' : 'channels'}` : ''
    rows.push({ id: 'chains', label: 'CHAINS', value: `${chainLabel}${channelLabel}` })
  }

  if (snapshot.program_number != null) {
    rows.push({ id: 'program', label: 'PROGRAM', value: `PC ${snapshot.program_number}`, monospace: true })
  }

  if (typeof snapshot.tempo_bpm === 'number' && snapshot.tempo_bpm > 0) {
    const sourceSuffix = snapshot.tempo_source ? ` · ${snapshot.tempo_source}` : ''
    rows.push({ id: 'tempo', label: 'TEMPO', value: `${snapshot.tempo_bpm.toFixed(1)} BPM${sourceSuffix}` })
  }

  if (snapshot.tags && snapshot.tags.length > 0) {
    rows.push({ id: 'tags', label: 'TAGS', value: snapshot.tags.join(' · ') })
  }

  const created = formatTimestamp(snapshot.created_at)
  if (created) {
    rows.push({ id: 'created', label: 'CREATED', value: created })
  }

  const updatedRel = formatRelative(snapshot.updated_at)
  if (updatedRel) {
    rows.push({ id: 'updated', label: 'UPDATED', value: updatedRel })
  }

  if (readiness?.status === 'live_confirmed' && snapshot.live_state?.activated_at) {
    const ts = new Date(snapshot.live_state.activated_at)
    if (Number.isFinite(ts.getTime())) {
      const time = `${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}:${String(ts.getSeconds()).padStart(2, '0')}`
      rows.push({ id: 'activated', label: 'ACTIVATED', value: `since ${time}`, monospace: true })
    }
  }

  return rows.slice(0, HERO_METADATA_LIMIT)
}

interface SnapshotHeroMetadataClusterProps {
  rows: MetadataRow[]
  onCopyValue?: (value: string) => void
}

export function SnapshotHeroMetadataCluster({ rows, onCopyValue }: SnapshotHeroMetadataClusterProps) {
  if (rows.length === 0) return null
  return (
    <dl className="juce-grid-page__snapshot-hero-meta" aria-label="Snapshot metadata">
      {rows.map((row) => (
        <div key={row.id} className="juce-grid-page__snapshot-hero-meta-row" data-row-id={row.id}>
          <dt className="juce-grid-page__snapshot-hero-meta-label">{row.label}</dt>
          <dd className={`juce-grid-page__snapshot-hero-meta-value${row.monospace ? ' is-mono' : ''}`}>
            <span className="juce-grid-page__snapshot-hero-meta-value-text" title={typeof row.value === 'string' ? row.value : undefined}>
              {row.value}
            </span>
            {row.copyValue && onCopyValue ? (
              <button
                type="button"
                className="juce-grid-page__snapshot-hero-meta-copy"
                onClick={() => onCopyValue(row.copyValue as string)}
                aria-label={`Copy ${row.label.toLowerCase()} value`}
                title={`Copy full ${row.label.toLowerCase()} value`}
              >
                <Copy size={14} aria-hidden="true" />
              </button>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  )
}

interface SnapshotHeroLockButtonProps {
  isLocked: boolean
  onToggle: () => void
  pending?: boolean
  disabled?: boolean
}

export function SnapshotHeroLockButton({ isLocked, onToggle, pending = false, disabled = false }: SnapshotHeroLockButtonProps) {
  const [confirmingUnlock, setConfirmingUnlock] = useState(false)
  const confirmTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current != null) {
        window.clearTimeout(confirmTimerRef.current)
      }
    }
  }, [])

  const armConfirmTimer = () => {
    if (confirmTimerRef.current != null) {
      window.clearTimeout(confirmTimerRef.current)
    }
    confirmTimerRef.current = window.setTimeout(() => {
      setConfirmingUnlock(false)
    }, 3_000)
  }

  const handleClick = () => {
    if (pending || disabled) return
    if (isLocked) {
      if (confirmingUnlock) return
      setConfirmingUnlock(true)
      armConfirmTimer()
      return
    }
    onToggle()
  }

  const handleConfirmUnlock = () => {
    if (confirmTimerRef.current != null) window.clearTimeout(confirmTimerRef.current)
    setConfirmingUnlock(false)
    onToggle()
  }

  const handleCancelUnlock = () => {
    if (confirmTimerRef.current != null) window.clearTimeout(confirmTimerRef.current)
    setConfirmingUnlock(false)
  }

  if (confirmingUnlock) {
    return (
      <div className="juce-grid-page__snapshot-hero-lock-confirm" role="group" aria-label="Confirm unlock snapshot">
        <span className="juce-grid-page__snapshot-hero-lock-confirm-label">Unlock?</span>
        <Button
          size="sm"
          kind="primary"
          renderIcon={Checkmark}
          hasIconOnly
          iconDescription="Confirm unlock"
          tooltipPosition="bottom"
          onClick={handleConfirmUnlock}
          disabled={pending}
        />
        <Button
          size="sm"
          kind="ghost"
          renderIcon={Close}
          hasIconOnly
          iconDescription="Cancel unlock"
          tooltipPosition="bottom"
          onClick={handleCancelUnlock}
          disabled={pending}
        />
      </div>
    )
  }

  const Icon = isLocked ? Locked : Unlocked
  const label = isLocked ? 'Unlock snapshot' : 'Lock snapshot — prevents edits'
  return (
    <div className={`juce-grid-page__snapshot-hero-lock${isLocked ? ' is-locked' : ''}`}>
      {isLocked ? <span className="juce-grid-page__snapshot-hero-lock-badge">LOCKED</span> : null}
      <Button
        size="sm"
        kind={isLocked ? 'tertiary' : 'ghost'}
        renderIcon={Icon}
        hasIconOnly
        iconDescription={label}
        tooltipPosition="bottom"
        onClick={handleClick}
        disabled={pending || disabled}
      />
    </div>
  )
}

interface PublishStatusPresentation {
  label: string
  tone: 'ready' | 'blocked' | 'waiting' | 'live' | 'diverged'
  pulse: boolean
}

const PUBLISH_STATUS_PRESENTATION: Record<SnapshotPublishStatus, PublishStatusPresentation> = {
  ready: { label: 'Ready', tone: 'ready', pulse: false },
  blocked: { label: 'Blocked', tone: 'blocked', pulse: false },
  waiting_for_confirmation: { label: 'Waiting for confirmation', tone: 'waiting', pulse: true },
  live_confirmed: { label: 'Live · Confirmed', tone: 'live', pulse: false },
  diverged: { label: 'Diverged', tone: 'diverged', pulse: false },
}

interface SnapshotHeroStateRowProps {
  status: SnapshotPublishStatus | null
  readiness: SnapshotPublishReadiness | null | undefined
  snapshot: SnapshotDetail | null | undefined
  isLocked: boolean
  onConfirm?: () => void
  onReject?: () => void
  onReconcile?: () => void
  onOverwriteLive?: () => void
  onViewErrors?: () => void
  busy?: boolean
}

function buildContextLine(
  status: SnapshotPublishStatus | null,
  readiness: SnapshotPublishReadiness | null | undefined,
  snapshot: SnapshotDetail | null | undefined,
): string | null {
  if (!status) return null
  switch (status) {
    case 'ready':
      return 'All chains loaded. No pending changes.'
    case 'blocked': {
      const count = readiness?.blockers.length ?? 0
      if (count <= 0) return 'Resolve blockers before activating.'
      return `${count} ${count === 1 ? 'block' : 'blocks'} failed to load. Resolve before activating.`
    }
    case 'waiting_for_confirmation':
      return 'Pending operator confirmation'
    case 'live_confirmed': {
      const node = snapshot?.live_state?.node_id
      const activatedAt = snapshot?.live_state?.activated_at
      if (node && activatedAt) {
        const ts = new Date(activatedAt)
        if (Number.isFinite(ts.getTime())) {
          const time = `${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}:${String(ts.getSeconds()).padStart(2, '0')}`
          return `Active on ${node} · since ${time}`
        }
      }
      if (node) return `Active on ${node}`
      return 'Active'
    }
    case 'diverged':
      return 'Saved revision differs from live state. Reconcile or overwrite.'
    default:
      return null
  }
}

export function SnapshotHeroStateRow({
  status,
  readiness,
  snapshot,
  isLocked,
  onConfirm,
  onReject,
  onReconcile,
  onOverwriteLive,
  onViewErrors,
  busy = false,
}: SnapshotHeroStateRowProps) {
  if (!status) return null
  const presentation = PUBLISH_STATUS_PRESENTATION[status]
  const contextLine = buildContextLine(status, readiness, snapshot)

  const actions: ReactNode[] = []
  if (!isLocked) {
    if (status === 'waiting_for_confirmation') {
      if (onConfirm) {
        actions.push(
          <Button key="confirm" size="sm" kind="primary" onClick={onConfirm} disabled={busy}>
            Confirm
          </Button>,
        )
      }
      if (onReject) {
        actions.push(
          <Button key="reject" size="sm" kind="ghost" onClick={onReject} disabled={busy}>
            Reject
          </Button>,
        )
      }
    } else if (status === 'diverged') {
      if (onReconcile) {
        actions.push(
          <Button key="reconcile" size="sm" kind="primary" onClick={onReconcile} disabled={busy}>
            Reconcile…
          </Button>,
        )
      }
      if (onOverwriteLive) {
        actions.push(
          <Button key="overwrite" size="sm" kind="ghost" renderIcon={WarningAltFilled} onClick={onOverwriteLive} disabled={busy}>
            Overwrite live
          </Button>,
        )
      }
    } else if (status === 'blocked') {
      if (onViewErrors) {
        actions.push(
          <Button key="view-errors" size="sm" kind="ghost" renderIcon={Warning} onClick={onViewErrors} disabled={busy}>
            View errors
          </Button>,
        )
      }
    }
  }

  return (
    <div
      className={`juce-grid-page__snapshot-hero-state-row is-${presentation.tone}${presentation.pulse ? ' is-pulse' : ''}`}
      role="status"
      aria-label={`Snapshot publish status: ${presentation.label}`}
    >
      <div className="juce-grid-page__snapshot-hero-state-pill-wrap">
        <Tag
          type={
            presentation.tone === 'live'
              ? 'green'
              : presentation.tone === 'waiting'
                ? 'warm-gray'
                : presentation.tone === 'blocked'
                  ? 'red'
                  : presentation.tone === 'diverged'
                    ? 'magenta'
                    : 'cool-gray'
          }
          className={`juce-grid-page__snapshot-hero-state-pill is-${presentation.tone}${presentation.pulse ? ' is-pulse' : ''}`}
          title={`audio_state: ${status}`}
        >
          <span className="juce-grid-page__snapshot-hero-state-dot" aria-hidden="true" />
          {presentation.label}
        </Tag>
      </div>
      {contextLine ? (
        <p className="juce-grid-page__snapshot-hero-state-context">{contextLine}</p>
      ) : (
        <span aria-hidden="true" className="juce-grid-page__snapshot-hero-state-context-spacer" />
      )}
      {actions.length > 0 ? (
        <div className="juce-grid-page__snapshot-hero-state-actions">{actions}</div>
      ) : null}
    </div>
  )
}
