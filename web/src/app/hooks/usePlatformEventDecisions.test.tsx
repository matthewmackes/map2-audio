import '@testing-library/jest-dom'
import { renderHook } from '@testing-library/react'

import { filterPlatformEventDecisions, usePlatformEventDecisions } from './usePlatformEventDecisions'
import { PLATFORM_EVENT_STORE_TEST_ONLY, usePlatformEventStore } from '../stores/platformEventStore'
import type { PlatformEvent } from '../../map2/platformEvent'

jest.mock('../services/platformEventTransport', () => ({
  getPlatformEventTransport: () => ({
    ack: jest.fn(),
  }),
}))

function resetStore() {
  usePlatformEventStore.setState({
    ...usePlatformEventStore.getState(),
    ...PLATFORM_EVENT_STORE_TEST_ONLY.INITIAL_PLATFORM_EVENT_STATE,
  })
}

function makeEvent(overrides: Partial<PlatformEvent> = {}): PlatformEvent {
  return {
    event_id: 'event-1',
    kind: 'system.cpu.critical',
    severity: 'critical',
    source_node: 'node-a',
    source_service: 'system',
    occurred_at: '2026-04-20T15:30:00Z',
    monotonic_ns: null,
    title: 'CPU critical',
    message: 'CPU load crossed the critical threshold',
    context: {},
    correlation_id: null,
    dedupe_key: null,
    ttl_seconds: 300,
    expires_at: null,
    priority: 0.9,
    icon: null,
    color: null,
    sound: null,
    sticky: false,
    resource: null,
    broadcast: true,
    target_nodes: [],
    target_surfaces: ['web', 'lcd'],
    workflow: null,
    supersedes: null,
    ack_required: false,
    ...overrides,
  }
}

describe('usePlatformEventDecisions', () => {
  beforeEach(() => {
    resetStore()
  })

  afterAll(() => {
    resetStore()
  })

  it('derives reusable router decisions from visible platform events', () => {
    usePlatformEventStore.getState().upsertEvents([
      makeEvent(),
    ])

    const { result } = renderHook(() => usePlatformEventDecisions())

    expect(result.current.events.map((event) => event.event_id)).toEqual(['event-1'])
    expect(filterPlatformEventDecisions(result.current.decisions, 'toast')).toHaveLength(1)
    expect(filterPlatformEventDecisions(result.current.decisions, 'stage_kyron')).toHaveLength(1)
    expect(filterPlatformEventDecisions(result.current.decisions, 'node_alert')).toHaveLength(1)
    expect(filterPlatformEventDecisions(result.current.decisions, 'browser_notification')).toHaveLength(1)
    expect(filterPlatformEventDecisions(result.current.decisions, 'audio_beep')).toHaveLength(1)
    expect(filterPlatformEventDecisions(result.current.decisions, 'lcd_feed')).toHaveLength(1)
  })

  it('uses the shared PlatformEvent visibility filters before routing', () => {
    usePlatformEventStore.getState().upsertEvents([
      makeEvent({ event_id: 'visible-system' }),
      makeEvent({
        event_id: 'hidden-workflow',
        kind: 'workflow.progress',
        severity: 'info',
        target_surfaces: ['web'],
      }),
    ])
    usePlatformEventStore.getState().dismissEvent('visible-system')

    const { result } = renderHook(() => usePlatformEventDecisions({
      kindPrefixes: ['system.'],
      severities: ['critical'],
      minPriority: 0.5,
    }))

    expect(result.current.events).toHaveLength(0)
    expect(result.current.decisions).toHaveLength(0)
    expect(result.current.allEvents.map((event) => event.event_id)).toEqual([
      'visible-system',
      'hidden-workflow',
    ])
  })
})
