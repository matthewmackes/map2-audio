import { useMemo } from 'react'

import { filterPlatformEventDecisions, usePlatformEventDecisions } from '../../hooks/usePlatformEventDecisions'

export function LCDFeedPresenter() {
  const { decisions } = usePlatformEventDecisions()
  const lcdCount = useMemo(
    () => filterPlatformEventDecisions(decisions, 'lcd_feed').length,
    [decisions],
  )

  return <div hidden data-testid="platform-event-lcd-feed-count">{lcdCount}</div>
}
