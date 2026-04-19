import { InlineNotification } from '@carbon/react'

import { usePlatformEvents } from '../../hooks/usePlatformEvents'
import { routePlatformEvent } from '../../services/platformEventRouter'

export function DeviceBannerPresenter() {
  const { events } = usePlatformEvents()
  const banner = events
    .flatMap((event) => routePlatformEvent(event))
    .find((decision) => decision.target === 'device_banner')

  if (!banner || banner.target !== 'device_banner') {
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

