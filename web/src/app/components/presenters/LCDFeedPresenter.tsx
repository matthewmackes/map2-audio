import { useMemo } from 'react'

import { usePlatformEvents } from '../../hooks/usePlatformEvents'
import { routePlatformEvent } from '../../services/platformEventRouter'

export function LCDFeedPresenter() {
  const { events } = usePlatformEvents()
  const lcdCount = useMemo(
    () => events.flatMap((event) => routePlatformEvent(event)).filter((decision) => decision.target === 'lcd_feed').length,
    [events],
  )

  return <div hidden data-testid="platform-event-lcd-feed-count">{lcdCount}</div>
}

