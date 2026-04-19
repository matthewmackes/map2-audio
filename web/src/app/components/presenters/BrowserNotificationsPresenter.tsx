import { useEffect, useRef } from 'react'

import { usePlatformEvents } from '../../hooks/usePlatformEvents'
import { routePlatformEvent } from '../../services/platformEventRouter'

export function BrowserNotificationsPresenter() {
  const { events } = usePlatformEvents()
  const presentedIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
      return
    }

    for (const decision of events.flatMap((event) => routePlatformEvent(event))) {
      if (decision.target !== 'browser_notification' || presentedIdsRef.current.has(decision.eventId)) {
        continue
      }
      presentedIdsRef.current.add(decision.eventId)
      new Notification(decision.title, {
        body: decision.message,
        tag: decision.eventId,
        requireInteraction: decision.requireInteraction,
      })
    }
  }, [events])

  return null
}

