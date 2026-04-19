import { useEffect, useRef } from 'react'

import { useNotifications } from '../Toasts'
import { usePlatformEvents } from '../../hooks/usePlatformEvents'
import { routePlatformEvent } from '../../services/platformEventRouter'

export function ToastsPresenter() {
  const { events } = usePlatformEvents()
  const { pushNotification, dismissNotification } = useNotifications()
  const activeToastIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const nextToastIds = new Set<string>()

    for (const event of events) {
      for (const decision of routePlatformEvent(event)) {
        if (decision.target !== 'toast') {
          continue
        }
        nextToastIds.add(decision.eventId)
        pushNotification(decision.message, decision.tone, {
          id: decision.eventId,
          title: decision.title,
          persistent: decision.persistent,
          stage: decision.stage,
        })
      }
    }

    for (const toastId of activeToastIdsRef.current) {
      if (!nextToastIds.has(toastId)) {
        dismissNotification(toastId)
      }
    }

    activeToastIdsRef.current = nextToastIds
  }, [dismissNotification, events, pushNotification])

  return null
}

