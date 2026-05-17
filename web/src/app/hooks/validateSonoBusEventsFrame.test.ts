// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform

import {
  __resetWarnedForTests,
  checkSonoBusDaemonEventFrame,
  checkSonoBusHeartbeatFrame,
  checkSonoBusStateFrame,
  classifySonoBusEnvelope,
} from './validateSonoBusEventsFrame'
import {
  SONOBUS_DAEMON_EVENT_FRAME_TYPE,
  SONOBUS_EVENTS_SCHEMA_VERSION,
  SONOBUS_HEARTBEAT_FRAME_TYPE,
  SONOBUS_STATE_FRAME_TYPE,
} from '../types/sonobusEventsWsFrame.generated'

beforeEach(() => {
  __resetWarnedForTests()
})

function validSnapshotBody() {
  return {
    authority_ok: true,
    error: null,
    binding_count: 0,
    enabled_binding_count: 0,
    timestamp: '2026-05-17T00:00:00+00:00',
    daemon_running: false,
    daemon_endpoint: null,
    daemon_status: 'stopped',
    daemon_capabilities: null,
  }
}

describe('checkSonoBusStateFrame', () => {
  test('accepts a valid state frame', () => {
    expect(
      checkSonoBusStateFrame({
        type: SONOBUS_STATE_FRAME_TYPE,
        schema_version: SONOBUS_EVENTS_SCHEMA_VERSION,
        data: validSnapshotBody(),
      }).ok,
    ).toBe(true)
  })

  test('rejects wrong topic', () => {
    expect(
      checkSonoBusStateFrame({
        type: SONOBUS_HEARTBEAT_FRAME_TYPE,
        schema_version: SONOBUS_EVENTS_SCHEMA_VERSION,
        data: validSnapshotBody(),
      }).ok,
    ).toBe(false)
  })

  test('rejects missing authority_ok', () => {
    const body = validSnapshotBody() as Record<string, unknown>
    delete body.authority_ok
    const r = checkSonoBusStateFrame({
      type: SONOBUS_STATE_FRAME_TYPE,
      schema_version: SONOBUS_EVENTS_SCHEMA_VERSION,
      data: body,
    })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('authority_ok')
  })

  test('rejects missing timestamp', () => {
    const body = validSnapshotBody() as Record<string, unknown>
    delete body.timestamp
    const r = checkSonoBusStateFrame({
      type: SONOBUS_STATE_FRAME_TYPE,
      schema_version: SONOBUS_EVENTS_SCHEMA_VERSION,
      data: body,
    })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('timestamp')
  })
})

describe('checkSonoBusHeartbeatFrame', () => {
  test('accepts a valid heartbeat frame (shares body schema with state)', () => {
    expect(
      checkSonoBusHeartbeatFrame({
        type: SONOBUS_HEARTBEAT_FRAME_TYPE,
        schema_version: SONOBUS_EVENTS_SCHEMA_VERSION,
        data: validSnapshotBody(),
      }).ok,
    ).toBe(true)
  })
})

describe('checkSonoBusDaemonEventFrame', () => {
  test('accepts a valid daemon-event frame', () => {
    expect(
      checkSonoBusDaemonEventFrame({
        type: SONOBUS_DAEMON_EVENT_FRAME_TYPE,
        schema_version: SONOBUS_EVENTS_SCHEMA_VERSION,
        data: {
          type: 'peer_up',
          event: true,
          payload: { stream_id: 'stream-A', stub: true },
        },
      }).ok,
    ).toBe(true)
  })

  test('rejects missing inner type', () => {
    const r = checkSonoBusDaemonEventFrame({
      type: SONOBUS_DAEMON_EVENT_FRAME_TYPE,
      schema_version: SONOBUS_EVENTS_SCHEMA_VERSION,
      data: { event: true, payload: {} },
    })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('type')
  })

  test('rejects event !== true', () => {
    const r = checkSonoBusDaemonEventFrame({
      type: SONOBUS_DAEMON_EVENT_FRAME_TYPE,
      schema_version: SONOBUS_EVENTS_SCHEMA_VERSION,
      data: { type: 'peer_up', event: false, payload: {} },
    })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('event')
  })

  test('rejects non-object payload', () => {
    const r = checkSonoBusDaemonEventFrame({
      type: SONOBUS_DAEMON_EVENT_FRAME_TYPE,
      schema_version: SONOBUS_EVENTS_SCHEMA_VERSION,
      data: { type: 'peer_up', event: true, payload: 'string-not-object' },
    })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('payload')
  })
})

describe('classifySonoBusEnvelope', () => {
  test('returns the topic for each canonical frame', () => {
    expect(
      classifySonoBusEnvelope({
        type: SONOBUS_STATE_FRAME_TYPE,
        schema_version: SONOBUS_EVENTS_SCHEMA_VERSION,
        data: validSnapshotBody(),
      }),
    ).toBe(SONOBUS_STATE_FRAME_TYPE)
    expect(
      classifySonoBusEnvelope({
        type: SONOBUS_HEARTBEAT_FRAME_TYPE,
        schema_version: SONOBUS_EVENTS_SCHEMA_VERSION,
        data: validSnapshotBody(),
      }),
    ).toBe(SONOBUS_HEARTBEAT_FRAME_TYPE)
    expect(
      classifySonoBusEnvelope({
        type: SONOBUS_DAEMON_EVENT_FRAME_TYPE,
        schema_version: SONOBUS_EVENTS_SCHEMA_VERSION,
        data: { type: 'peer_up', event: true, payload: {} },
      }),
    ).toBe(SONOBUS_DAEMON_EVENT_FRAME_TYPE)
  })

  test('returns null for unknown envelope', () => {
    expect(classifySonoBusEnvelope({ type: 'something-else', data: {} })).toBe(null)
    expect(classifySonoBusEnvelope(null)).toBe(null)
    expect(classifySonoBusEnvelope({ no_type: true })).toBe(null)
  })
})
