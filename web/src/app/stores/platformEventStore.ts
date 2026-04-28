import { create } from 'zustand'

import type { PlatformEvent, PlatformEventSeverity } from '../../map2/platformEvent'

export const PLATFORM_EVENT_STORE_MAX_EVENTS = 1000

export interface PlatformEventFilterOptions {
  kinds?: string[]
  kindPrefixes?: string[]
  severities?: PlatformEventSeverity[]
  minPriority?: number
  nodes?: string[]
}

export interface PlatformEventStoreState {
  sessionId: string | null
  replayCursor: string | null
  connected: boolean
  replayComplete: boolean
  events: PlatformEvent[]
  dismissedEventIds: string[]
  setSessionId: (sessionId: string) => void
  setConnected: (connected: boolean) => void
  setReplayComplete: (complete: boolean) => void
  setReplayCursor: (cursor: string | null) => void
  upsertEvents: (events: PlatformEvent[]) => void
  dismissEvent: (eventId: string) => void
  reset: () => void
}

const INITIAL_PLATFORM_EVENT_STATE: Omit<
  PlatformEventStoreState,
  'setSessionId' | 'setConnected' | 'setReplayComplete' | 'setReplayCursor' | 'upsertEvents' | 'dismissEvent' | 'reset'
> = {
  sessionId: null,
  replayCursor: null,
  connected: false,
  replayComplete: false,
  events: [],
  dismissedEventIds: [],
}

function sortEvents(events: PlatformEvent[]): PlatformEvent[] {
  return [...events].sort((left, right) => {
    const occurredCompare = right.occurred_at.localeCompare(left.occurred_at)
    if (occurredCompare !== 0) {
      return occurredCompare
    }
    return right.event_id.localeCompare(left.event_id)
  })
}

function eventsAreEqual(left: PlatformEvent[], right: PlatformEvent[]): boolean {
  if (left === right) {
    return true
  }
  if (left.length !== right.length) {
    return false
  }
  for (let index = 0; index < left.length; index += 1) {
    const leftEvent = left[index]
    const rightEvent = right[index]
    if (leftEvent === rightEvent) {
      continue
    }
    if (JSON.stringify(leftEvent) !== JSON.stringify(rightEvent)) {
      return false
    }
  }
  return true
}

export function platformEventMatchesFilters(event: PlatformEvent, options: PlatformEventFilterOptions = {}): boolean {
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

export function selectVisiblePlatformEvents(
  state: Pick<PlatformEventStoreState, 'events' | 'dismissedEventIds'>,
  options: PlatformEventFilterOptions = {},
): PlatformEvent[] {
  const dismissed = new Set(state.dismissedEventIds)
  return state.events.filter((event) => !dismissed.has(event.event_id) && platformEventMatchesFilters(event, options))
}

export const usePlatformEventStore = create<PlatformEventStoreState>((set) => ({
  ...INITIAL_PLATFORM_EVENT_STATE,
  setSessionId: (sessionId) => set((state) => (
    state.sessionId === sessionId ? state : { sessionId }
  )),
  setConnected: (connected) => set((state) => (
    state.connected === connected ? state : { connected }
  )),
  setReplayComplete: (replayComplete) => set((state) => (
    state.replayComplete === replayComplete ? state : { replayComplete }
  )),
  setReplayCursor: (replayCursor) => set((state) => (
    state.replayCursor === replayCursor ? state : { replayCursor }
  )),
  upsertEvents: (events) => set((state) => {
    if (events.length === 0) {
      return state
    }

    const byId = new Map(state.events.map((event) => [event.event_id, event]))
    for (const event of events) {
      byId.set(event.event_id, event)
    }

    const nextEvents = sortEvents([...byId.values()]).slice(0, PLATFORM_EVENT_STORE_MAX_EVENTS)
    const nextCursor = nextEvents[0]?.event_id ?? state.replayCursor

    if (nextCursor === state.replayCursor && eventsAreEqual(nextEvents, state.events)) {
      return state
    }

    return {
      events: nextEvents,
      replayCursor: nextCursor,
    }
  }),
  dismissEvent: (eventId) => set((state) => (
    state.dismissedEventIds.includes(eventId)
      ? state
      : { dismissedEventIds: [...state.dismissedEventIds, eventId] }
  )),
  reset: () => set(INITIAL_PLATFORM_EVENT_STATE),
}))

export const PLATFORM_EVENT_STORE_TEST_ONLY = {
  INITIAL_PLATFORM_EVENT_STATE,
  PLATFORM_EVENT_STORE_MAX_EVENTS,
}
