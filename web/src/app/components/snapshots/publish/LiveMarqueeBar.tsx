import type { PublishStageMachine } from './usePublishStageMachine'
import './publishPerformance.css'

export interface LiveMarqueeBarProps {
  snapshotName: string
  hostId: string | null
  machine: PublishStageMachine
  lastPublishAgo: string | null
  revisionLabel: string | null
}

export function LiveMarqueeBar({
  snapshotName,
  hostId,
  machine,
  lastPublishAgo,
  revisionLabel,
}: LiveMarqueeBarProps) {
  const { overallStatus, overallLabel } = machine
  const dotClass = `publish-marquee__dot publish-marquee__dot--${overallStatus}`
  const barClass = `publish-marquee publish-marquee--${overallStatus}`

  const detail = overallStatus === 'live'
    ? hostId
      ? `${snapshotName} on ${hostId}`
      : snapshotName
    : overallStatus === 'publishing'
      ? `Taking ${snapshotName} live…`
      : overallStatus === 'armed'
        ? `${snapshotName} · ready to go live`
        : `${snapshotName} · ${revisionLabel ?? 'draft'}`

  return (
    <div className={barClass} role="status" aria-live="polite">
      <span className={dotClass} aria-hidden="true" />
      <span className="publish-marquee__label">{overallLabel}</span>
      <span className="publish-marquee__detail">{detail}</span>
      {lastPublishAgo ? (
        <span className="publish-marquee__meta">· {lastPublishAgo}</span>
      ) : null}
    </div>
  )
}
