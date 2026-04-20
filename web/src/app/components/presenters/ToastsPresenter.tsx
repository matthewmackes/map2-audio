import { useEffect, useRef } from 'react'

import { useNotifications } from '../Toasts'
import { filterPlatformEventDecisions, usePlatformEventDecisions } from '../../hooks/usePlatformEventDecisions'

export function ToastsPresenter() {
  const { decisions } = usePlatformEventDecisions()
  const { pushNotification, dismissNotification } = useNotifications()
  const activeToastIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const nextToastIds = new Set<string>()

    for (const decision of filterPlatformEventDecisions(decisions, 'toast')) {
      nextToastIds.add(decision.eventId)
      pushNotification(decision.message, decision.tone, {
        id: decision.eventId,
        title: decision.title,
        persistent: decision.persistent,
        stage: decision.stage,
      })
    }

    for (const toastId of activeToastIdsRef.current) {
      if (!nextToastIds.has(toastId)) {
        dismissNotification(toastId)
      }
    }

    activeToastIdsRef.current = nextToastIds
  }, [decisions, dismissNotification, pushNotification])

  return null
}
