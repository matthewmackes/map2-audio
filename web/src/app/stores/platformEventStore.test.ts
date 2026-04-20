import {
  PLATFORM_EVENT_STORE_TEST_ONLY,
  selectVisiblePlatformEvents,
  usePlatformEventStore,
} from './platformEventStore'
import type { PlatformEvent } from '../../map2/platformEvent'

function resetStore() {
  usePlatformEventStore.setState({
    ...usePlatformEventStore.getState(),
    ...PLATFORM_EVENT_STORE_TEST_ONLY.INITIAL_PLATFORM_EVENT_STATE,
  })
}

function makeEvent(eventId: string, occurredAt: string): PlatformEvent {
  return {
    event_id: eventId,
    kind: 'workflow.progress',
    severity: 'info',
    source_node: 'node-a',
    source_service: 'workflow',
    occurred_at: occurredAt,
    monotonic_ns: null,
    title: 'Workflow update',
    message: eventId,
    context: {},
    correlation_id: null,
    dedupe_key: null,
    ttl_seconds: 300,
    expires_at: null,
    priority: 0.2,
    icon: null,
    color: null,
    sound: null,
    sticky: false,
    resource: null,
    broadcast: true,
    target_nodes: [],
    target_surfaces: ['web'],
    workflow: null,
    supersedes: null,
    ack_required: false,
  }
}

describe('platformEventStore', () => {
  beforeEach(() => {
    resetStore()
  })

  afterAll(() => {
    resetStore()
  })

  it('dedupes events by event id and advances the replay cursor', () => {
    const first = makeEvent('event-1', '2026-04-19T13:00:00Z')
    const updated = makeEvent('event-1', '2026-04-19T13:01:00Z')

    usePlatformEventStore.getState().upsertEvents([first])
    usePlatformEventStore.getState().upsertEvents([updated])

    const state = usePlatformEventStore.getState()
    expect(state.events).toHaveLength(1)
    expect(state.events[0]?.occurred_at).toBe('2026-04-19T13:01:00Z')
    expect(state.replayCursor).toBe('event-1')
  })

  it('keeps the newest event first', () => {
    usePlatformEventStore.getState().upsertEvents([
      makeEvent('event-older', '2026-04-19T13:00:00Z'),
      makeEvent('event-newer', '2026-04-19T13:05:00Z'),
    ])

    expect(usePlatformEventStore.getState().events.map((event) => event.event_id)).toEqual([
      'event-newer',
      'event-older',
    ])
  })

  it('selects visible events through dismissal and filter options', () => {
    const workflow = makeEvent('workflow-1', '2026-04-19T13:00:00Z')
    const system = {
      ...makeEvent('system-1', '2026-04-19T13:05:00Z'),
      kind: 'system.cpu.high',
      severity: 'warning',
      priority: 0.7,
    } as PlatformEvent

    usePlatformEventStore.getState().upsertEvents([workflow, system])
    usePlatformEventStore.getState().dismissEvent('workflow-1')

    expect(selectVisiblePlatformEvents(usePlatformEventStore.getState(), {
      kindPrefixes: ['system.'],
      severities: ['warning'],
      minPriority: 0.5,
      nodes: ['node-a'],
    }).map((event) => event.event_id)).toEqual(['system-1'])
  })

  it('bounds retained event history to the store cap', () => {
    const events = Array.from({ length: PLATFORM_EVENT_STORE_TEST_ONLY.PLATFORM_EVENT_STORE_MAX_EVENTS + 5 }, (_, index) => (
      makeEvent(
        `event-${index}`,
        new Date(Date.UTC(2026, 3, 19, 13, 0, index)).toISOString(),
      )
    ))

    usePlatformEventStore.getState().upsertEvents(events)

    const state = usePlatformEventStore.getState()
    expect(state.events).toHaveLength(PLATFORM_EVENT_STORE_TEST_ONLY.PLATFORM_EVENT_STORE_MAX_EVENTS)
    expect(state.events[0]?.event_id).toBe(`event-${events.length - 1}`)
    expect(state.events[state.events.length - 1]?.event_id).toBe('event-5')
  })
})
