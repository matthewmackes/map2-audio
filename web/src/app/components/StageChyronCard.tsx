import { useState, useMemo } from 'react'
import type { ReactNode } from 'react'
import { Camera, Copy, Renew, Store } from '@carbon/icons-react'
import type { SnapshotRuntimeLiveState } from '../../map2/types'
import { StagePedalSignalChain, DEFAULT_PEDAL_CHAIN, deriveChainFromPlugins, getPedalKindIcon, PEDAL_SPECS } from './StagePedalChain'

export type ChyronLiveState = 'live' | 'standby' | 'offline'

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

const LIVE_MAP: Record<ChyronLiveState, { cls: string; label: string; sub: string; kicker: string }> = {
  live:    { cls: 'stage-chyron__bug--live',    label: 'LIVE',    sub: 'ON AIR',       kicker: 'NOW BROADCASTING' },
  standby: { cls: 'stage-chyron__bug--standby', label: 'STANDBY', sub: 'AWAITING CUE', kicker: 'STAGED · CUED' },
  offline: { cls: 'stage-chyron__bug--offline', label: 'OFFLINE', sub: 'NO SIGNAL',    kicker: 'IDLE' },
}

function shorten(value: string | null | undefined, max = 7): string {
  if (!value) return ''
  const trimmed = value.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max)}`
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

  const pathsCount = useMemo(() => {
    const paths = state?.live_snapshot_payload?.paths
    return Array.isArray(paths) ? paths.length : 0
  }, [state])

  const pedalChain = useMemo(() => {
    const paths = state?.live_snapshot_payload?.paths
    if (!Array.isArray(paths) || paths.length === 0) return DEFAULT_PEDAL_CHAIN
    const plugins = paths.flatMap(p => p.plugins ?? [])
    return deriveChainFromPlugins(plugins)
  }, [state])

  const statusGlyphs = useMemo(() =>
    pedalChain.slice(0, 5).map(stage => ({
      SvgIcon: getPedalKindIcon(stage.kind),
      title: PEDAL_SPECS[stage.kind]?.name ?? stage.kind,
      on: stage.on,
    }))
  , [pedalChain])

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
    <section className="stage-chyron" aria-label="Live snapshot chyron">
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
          {pathsCount > 0 ? (
            <>
              <span className="stage-chyron__dl-pipe" />
              <span className="stage-chyron__dl-item">
                <span className="stage-chyron__dl-value">{pathsCount} PATH{pathsCount === 1 ? '' : 'S'}</span>
              </span>
            </>
          ) : null}
        </span>
        <span className="stage-chyron__actions">
          {routeAction}
        </span>
      </div>

      <div className="stage-chyron__body">
        <div className={`stage-chyron__bug ${liveMap.cls}`}>
          <div className="stage-chyron__state">
            <span
              className={`stage-chyron__bug-dot${liveState === 'live' && !reducedMotion ? ' stage-chyron__bug-dot--pulse' : ''}`}
              aria-hidden="true"
            />
            {liveMap.label}
          </div>
          <div className="stage-chyron__state-sub">{liveMap.sub}</div>
        </div>

        <div className="stage-chyron__headline">
          <div className="stage-chyron__kicker">
            <span>{liveMap.kicker}</span>
            <span className="stage-chyron__kicker-divider" aria-hidden="true" />
            {programNumber != null ? (
              <span className="stage-chyron__program">#{String(programNumber).padStart(2, '0')}</span>
            ) : null}
          </div>
          <div className="stage-chyron__rig" title={snapshotName}>
            {snapshotName}
          </div>

          <StagePedalSignalChain chain={pedalChain} pedalWidth={42} reducedMotion={reducedMotion} />

          <div className="stage-chyron__subrig">
            <div className="stage-chyron__status-icons">
              {statusGlyphs.map((g, i) => (
                <span
                  key={i}
                  className={`stage-chyron__status-ico${g.on ? ' stage-chyron__status-ico--on' : ''}`}
                  title={g.title}
                  aria-label={g.title}
                >
                  <g.SvgIcon width={12} height={12} aria-hidden="true" />
                </span>
              ))}
            </div>
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
      </div>
    </section>
  )
}
