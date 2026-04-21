import { useState, useMemo } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Camera, Copy, Renew, Store } from '@carbon/icons-react'
import type { SnapshotRuntimeLiveState } from '../../map2/types'
import { StagePedalSignalChain, DEFAULT_PEDAL_CHAIN, deriveChainFromPlugins } from './StagePedalChain'

export type ChyronLiveState = 'live' | 'standby' | 'offline' | 'rec' | 'armed'

export interface ChyronFallback {
  title: string
  sourceLabel?: string
}

interface StageChyronCardProps {
  state: SnapshotRuntimeLiveState | null
  fallback: ChyronFallback
  liveState: ChyronLiveState
  reducedMotion: boolean
  routeAction?: ReactNode
}

const LIVE_MAP: Record<ChyronLiveState, { strapClass: string; label: string; kicker: string }> = {
  live:    { strapClass: 'stage-chyron__strap--live',    label: 'LIVE',    kicker: 'NOW BROADCASTING' },
  standby: { strapClass: 'stage-chyron__strap--standby', label: 'STANDBY', kicker: 'STAGED · CUED' },
  offline: { strapClass: 'stage-chyron__strap--offline', label: 'OFFLINE', kicker: 'IDLE' },
  rec:     { strapClass: 'stage-chyron__strap--rec',     label: 'REC',     kicker: 'CAPTURE ACTIVE' },
  armed:   { strapClass: 'stage-chyron__strap--armed',   label: 'ARMED',   kicker: 'ARMED · WAITING' },
}

function shorten(value: string | null | undefined, max = 7): string {
  if (!value) return ''
  const trimmed = value.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max)}`
}

interface ChainRow {
  label: string
  chain: ReturnType<typeof deriveChainFromPlugins>
}

export function StageChyronCard({
  state,
  fallback,
  liveState,
  reducedMotion,
  routeAction,
}: StageChyronCardProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle')

  const snapshotName = state?.snapshot_name || fallback.title || 'No snapshot'
  const revision = String(
    state?.live_snapshot_payload?.snapshot_revision ??
    state?.snapshot_revision ??
    '',
  ).trim()
  const nodeId = String(state?.node_id || fallback.sourceLabel || '').trim()
  const programNumber = state?.live_snapshot_payload?.program_number ?? null

  const liveMap = LIVE_MAP[liveState]

  // Build one chain row per audio path
  const chainRows = useMemo((): ChainRow[] => {
    const paths = state?.live_snapshot_payload?.paths
    if (!Array.isArray(paths) || paths.length === 0) {
      return [{ label: 'CH 1', chain: DEFAULT_PEDAL_CHAIN }]
    }
    return paths.map((p, i) => ({
      label: `CH ${i + 1}`,
      chain: deriveChainFromPlugins(p.plugins ?? []),
    }))
  }, [state])

  const handleCopyIds = () => {
    const ids = [
      revision ? `revision=${revision}` : '',
      nodeId ? `node=${nodeId}` : '',
    ].filter(Boolean).join(' ')
    if (ids && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(ids)
    }
    setCopyStatus('copied')
    window.setTimeout(() => setCopyStatus('idle'), 1500)
  }

  return (
    <section className={`stage-chyron stage-chyron--${liveState}`} aria-label="Live snapshot chyron">
      {/* Left strap — LIVE state indicator */}
      <div className="stage-chyron__strap" aria-hidden="true">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={liveMap.label}
            className="stage-chyron__strap-text"
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reducedMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            {liveMap.label}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* Top bar */}
      <div className="stage-chyron__top">
        <span className="stage-chyron__brand">MAP2</span>
        <span className="stage-chyron__label">
          <Camera size={12} aria-hidden="true" /> Snapshot
        </span>
        <span className="stage-chyron__dateline">
          {revision ? (
            <span className="stage-chyron__dl-item">
              <Renew size={12} aria-hidden="true" />
              <span className="stage-chyron__dl-value">{shorten(revision)}</span>
            </span>
          ) : null}
          {revision && nodeId ? <span className="stage-chyron__dl-pipe" /> : null}
          {nodeId ? (
            <span className="stage-chyron__dl-item">
              <Store size={12} aria-hidden="true" />
              <span className="stage-chyron__dl-value">{shorten(nodeId, 10)}</span>
            </span>
          ) : null}
          {chainRows.length > 0 ? (
            <>
              <span className="stage-chyron__dl-pipe" />
              <span className="stage-chyron__dl-item">
                <span className="stage-chyron__dl-value">{chainRows.length} PATH{chainRows.length === 1 ? '' : 'S'}</span>
              </span>
            </>
          ) : null}
        </span>
        <span className="stage-chyron__actions">
          {routeAction}
        </span>
      </div>

      {/* Body */}
      <div className="stage-chyron__body">
        {/* Headline */}
        <div className="stage-chyron__headline">
          <div className="stage-chyron__kicker">
            <span>{liveMap.kicker}</span>
            <span className="stage-chyron__kicker-divider" aria-hidden="true" />
            {programNumber != null ? (
              <span className="stage-chyron__program">#{String(programNumber).padStart(2, '0')}</span>
            ) : null}
          </div>
          <div className="stage-chyron__rig-wrap">
            {/* Slice G — 60 BPM green heartbeat pulse-dot next to snapshot name (visible only when LIVE) */}
            {liveState === 'live' ? (
              <span className="stage-chyron__rig-pulse" aria-hidden="true" />
            ) : null}
            {/* Legacy bug-dot: preserved for accessibility tests; pulse class suppressed under reduced motion */}
            <span
              className={`stage-chyron__bug-dot${liveState === 'live' && !reducedMotion ? ' stage-chyron__bug-dot--pulse' : ''}`}
              aria-hidden="true"
            />
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={snapshotName}
                className="stage-chyron__rig"
                title={snapshotName}
                initial={reducedMotion ? false : { y: 20, opacity: 0, filter: 'blur(8px)' }}
                animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
                exit={reducedMotion ? undefined : { y: -16, opacity: 0, filter: 'blur(8px)' }}
                transition={{ duration: 1.4, ease: [0.2, 0.8, 0.2, 1] }}
              >
                {snapshotName}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Per-channel signal chain rows */}
        <div className="stage-chyron__chains">
          {chainRows.map((row, i) => (
            <div key={`${row.label}-${i}`} className="stage-chyron__chain-row">
              <span className="stage-chyron__chain-label">{row.label}</span>
              <div className="stage-chyron__chain-tiles">
                <StagePedalSignalChain
                  chain={row.chain}
                  pedalWidth={36}
                  reducedMotion={reducedMotion}
                  mode="blueprint"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Subrig — copy button */}
        <div className="stage-chyron__subrig">
          <button
            type="button"
            className="stage-chyron__copy"
            onClick={handleCopyIds}
            aria-label="Copy snapshot identity"
            title="Copy snapshot identity"
          >
            <Copy size={12} aria-hidden="true" />
            <span>{copyStatus === 'copied' ? 'Copied' : 'Copy IDs'}</span>
          </button>
        </div>
      </div>
    </section>
  )
}
