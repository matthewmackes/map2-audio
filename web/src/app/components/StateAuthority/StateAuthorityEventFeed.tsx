import { useMemo } from 'react'
import { InlineNotification, Tag, Tile } from '@carbon/react'
import { usePlatformEvents } from '../../hooks/usePlatformEvents'
import type { PlatformEvent, PlatformEventSeverity } from '../../../map2/platformEvent'
import './StateAuthorityEventFeed.css'

// Live feed of State Authority PlatformEvents — reconciliation ticks +
// activation outcomes — scoped to the two kind families that map directly
// to the rollout: `state_authority.*` and `snapshot.activation.*`. Complements
// the numeric counters on the Reconciliation tab with a chronological
// stream so operators can see exactly what just happened.

const STATE_AUTHORITY_KIND_PREFIXES = ['state_authority.', 'snapshot.activation.']

export interface StateAuthorityEventFeedProps {
  /** Maximum events to render (most recent first). Default 25. */
  limit?: number
  /** Inject events directly — used by tests/Storybook to skip the store. */
  events?: PlatformEvent[]
}

type CarbonTagType =
  | 'blue' | 'cyan' | 'gray' | 'green' | 'magenta' | 'purple' | 'red'
  | 'teal' | 'outline' | 'cool-gray' | 'warm-gray' | 'high-contrast'

function severityTagType(severity: PlatformEventSeverity): CarbonTagType {
  switch (severity) {
    case 'critical':
      return 'red'
    case 'error':
      return 'red'
    case 'warning':
      return 'warm-gray'
    case 'info':
      return 'blue'
    default:
      return 'cool-gray'
  }
}

function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso)
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return iso
  }
}

function extractContextSummary(event: PlatformEvent): string {
  const ctx = event.context || {}
  const parts: string[] = []
  if (typeof ctx.snapshot_id === 'number') {
    parts.push(`snapshot=${ctx.snapshot_id}`)
  }
  if (typeof ctx.node_id === 'string' && ctx.node_id) {
    parts.push(`node=${ctx.node_id}`)
  }
  if (typeof ctx.layer === 'string') {
    parts.push(`layer=${ctx.layer}`)
  }
  if (typeof ctx.failed_phase === 'string') {
    parts.push(`phase=${ctx.failed_phase}`)
  }
  const report = ctx.report as Record<string, unknown> | undefined
  if (report && typeof report === 'object') {
    if (typeof report.parameter_drift_count === 'number' && report.parameter_drift_count > 0) {
      parts.push(`drift=${report.parameter_drift_count}`)
    }
    if (typeof report.correction_count === 'number' && report.correction_count > 0) {
      parts.push(`corrected=${report.correction_count}`)
    }
  }
  return parts.join(' · ')
}

export function StateAuthorityEventFeed({ limit = 25, events: injected }: StateAuthorityEventFeedProps) {
  const hookResult = usePlatformEvents({ kindPrefixes: STATE_AUTHORITY_KIND_PREFIXES })
  const source = injected ?? hookResult.events
  const connected = injected !== undefined ? true : hookResult.connected
  const capped = useMemo(() => source.slice(0, limit), [source, limit])

  if (source.length === 0) {
    return (
      <div className="state-authority-event-feed">
        <div className="state-authority-event-feed__header">
          <p className="state-authority-event-feed__kicker">Live event feed</p>
          <Tag size="sm" type={connected ? 'green' : 'warm-gray'}>
            {connected ? 'connected' : 'disconnected'}
          </Tag>
        </div>
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          title="No State Authority events yet"
          subtitle={
            connected
              ? 'Events will appear as the reconciliation scheduler ticks or when operators activate snapshots.'
              : 'The PlatformEventBus is disabled on this node. Set PLATFORM_EVENT_BUS_ENABLED=true to stream events.'
          }
        />
      </div>
    )
  }

  return (
    <div className="state-authority-event-feed" role="region" aria-label="State Authority events">
      <div className="state-authority-event-feed__header">
        <p className="state-authority-event-feed__kicker">
          Live event feed — {capped.length} of {source.length}
        </p>
        <Tag size="sm" type={connected ? 'green' : 'warm-gray'}>
          {connected ? 'connected' : 'disconnected'}
        </Tag>
      </div>
      <ol className="state-authority-event-feed__list" aria-live="polite">
        {capped.map((event) => {
          const summary = extractContextSummary(event)
          return (
            <li key={event.event_id} className="state-authority-event-feed__item">
              <Tile className="state-authority-event-feed__tile">
                <div className="state-authority-event-feed__row">
                  <Tag size="sm" type={severityTagType(event.severity)}>
                    {event.severity}
                  </Tag>
                  <code className="state-authority-event-feed__kind">{event.kind}</code>
                  <span className="state-authority-event-feed__timestamp">
                    {formatTimestamp(event.occurred_at)}
                  </span>
                </div>
                <div className="state-authority-event-feed__message">{event.message}</div>
                {summary ? (
                  <div className="state-authority-event-feed__summary">{summary}</div>
                ) : null}
              </Tile>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export default StateAuthorityEventFeed
