import { useCallback, useMemo } from 'react'

import type { PlatformEvent, PlatformEventSeverity } from '../../map2/platformEvent'
import { getPlatformEventTransport } from '../services/platformEventTransport'
import { usePlatformEventStore } from '../stores/platformEventStore'

export interface UsePlatformEventsOptions {
  kinds?: string[]
  kindPrefixes?: string[]
  severities?: PlatformEventSeverity[]
  minPriority?: number
  nodes?: string[]
}

function eventMatchesFilters(event: PlatformEvent, options: UsePlatformEventsOptions): boolean {
  if (options.kinds && options.kinds.length > 0 && !options.kinds.includes(event.kind)) {
    return false
  }
  if (options.kindPrefixes && options.kindPrefixes.length > 0 && !options.kindPrefixes.some((prefix) => event.kind.startsWith(prefix))) {
    return false
  }
  if (options.severities && options.severities.length > 0 && !options.severities.includes(event.severity)) {
    return false
  }
  if (options.minPriority != null && event.priority < options.minPriority) {
    return false
  }
  if (options.nodes && options.nodes.length > 0 && !options.nodes.includes(event.source_node)) {
    return false
  }
  return true
}

export function usePlatformEvents(options: UsePlatformEventsOptions = {}) {
  const allEvents = usePlatformEventStore((state) => state.events)
  const dismissedEventIds = usePlatformEventStore((state) => state.dismissedEventIds)
  const connected = usePlatformEventStore((state) => state.connected)
  const replayComplete = usePlatformEventStore((state) => state.replayComplete)
  const dismissEvent = usePlatformEventStore((state) => state.dismissEvent)
  const visibleEvents = useMemo(() => {
    const dismissed = new Set(dismissedEventIds)
    return allEvents.filter((event) => !dismissed.has(event.event_id) && eventMatchesFilters(event, options))
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

