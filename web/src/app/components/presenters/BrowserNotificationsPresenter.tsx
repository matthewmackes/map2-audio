import { useEffect, useRef } from 'react'

import { filterPlatformEventDecisions, usePlatformEventDecisions } from '../../hooks/usePlatformEventDecisions'

export function BrowserNotificationsPresenter() {
  const { decisions } = usePlatformEventDecisions()
  const presentedIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
      return
    }

    for (const decision of filterPlatformEventDecisions(decisions, 'browser_notification')) {
      if (presentedIdsRef.current.has(decision.eventId)) {
        continue
      }
      presentedIdsRef.current.add(decision.eventId)
      new Notification(decision.title, {
        body: decision.message,
        tag: decision.eventId,
        requireInteraction: decision.requireInteraction,
      })
    }
  }, [decisions])

  return null
}
