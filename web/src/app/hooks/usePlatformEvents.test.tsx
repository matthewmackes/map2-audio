import '@testing-library/jest-dom'
import React from 'react'
import { renderHook } from '@testing-library/react'

import { usePlatformEvents } from './usePlatformEvents'
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
    kind: 'workflow.progress',
    severity: 'info',
    source_node: 'node-a',
    source_service: 'workflow',
    occurred_at: '2026-04-19T13:00:00Z',
    monotonic_ns: null,
    title: 'Workflow update',
    message: 'In progress',
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
    ...overrides,
  }
}

describe('usePlatformEvents', () => {
  beforeEach(() => {
    resetStore()
  })

  afterAll(() => {
    resetStore()
  })

  it('filters visible events by prefix and severity', () => {
    usePlatformEventStore.getState().upsertEvents([
      makeEvent({ event_id: 'workflow-1', kind: 'workflow.progress' }),
      makeEvent({ event_id: 'system-1', kind: 'system.cpu.critical', severity: 'critical', priority: 0.9 }),
    ])

    const { result } = renderHook(() => usePlatformEvents({
      kindPrefixes: ['system.'],
      severities: ['critical'],
      minPriority: 0.5,
    }))

    expect(result.current.events.map((event) => event.event_id)).toEqual(['system-1'])
    expect(result.current.allEvents).toHaveLength(2)
  })
})
