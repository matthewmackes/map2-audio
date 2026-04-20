import { InlineNotification } from '@carbon/react'

import { filterPlatformEventDecisions, usePlatformEventDecisions } from '../../hooks/usePlatformEventDecisions'

export function DeviceBannerPresenter() {
  const { decisions } = usePlatformEventDecisions()
  const banner = filterPlatformEventDecisions(decisions, 'device_banner')[0]

  if (!banner) {
    return null
  }

  return (
    <div style={{ display: 'none' }} aria-hidden="true" data-testid="platform-event-device-banner">
      <InlineNotification
        kind="warning"
        title={banner.title}
        subtitle={banner.message}
        hideCloseButton
        lowContrast
      />
    </div>
  )
}
