import { useCallback, useMemo } from 'react'

import { getPlatformEventTransport } from '../services/platformEventTransport'
import {
  type PlatformEventFilterOptions,
  selectVisiblePlatformEvents,
  usePlatformEventStore,
} from '../stores/platformEventStore'

export type UsePlatformEventsOptions = PlatformEventFilterOptions

export function usePlatformEvents(options: UsePlatformEventsOptions = {}) {
  const allEvents = usePlatformEventStore((state) => state.events)
  const dismissedEventIds = usePlatformEventStore((state) => state.dismissedEventIds)
  const connected = usePlatformEventStore((state) => state.connected)
  const replayComplete = usePlatformEventStore((state) => state.replayComplete)
  const dismissEvent = usePlatformEventStore((state) => state.dismissEvent)
  const visibleEvents = useMemo(() => {
    return selectVisiblePlatformEvents({ events: allEvents, dismissedEventIds }, options)
  }, [allEvents, dismissedEventIds, options])

  const ack = useCallback((eventId: string) => {
    dismissEvent(eventId)
    getPlatformEventTransport().ack(eventId)
  }, [dismissEvent])

  return {
    events: visibleEvents,
    allEvents,
    connected,
    replayComplete,
    ack,
  }
}
