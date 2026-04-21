import { Tag } from '@carbon/react'

export function EventFeedTab() {
  return (
    <div className="api-webhooks-page__tab-placeholder" role="region" aria-label="Event Feed">
      <h3>
        Event Feed <Tag type="cool-gray">Scaffold</Tag>
      </h3>
      <p>
        The live PlatformEvent feed, filter toolbar, and outbound webhook targets will mount here in T2418-B / T2418-C.
        This placeholder keeps the Carbon tab shell self-contained so the panel is navigable while the feed ships.
      </p>
    </div>
  )
}

export default EventFeedTab
