// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform

import {
  __resetWarnedForTests,
  checkMidiTrafficFrame,
} from './validateMidiTrafficFrame'
import {
  MIDI_TRAFFIC_FRAME_TYPE,
} from '../types/midiTrafficWsFrame.generated'

beforeEach(() => {
  __resetWarnedForTests()
})

function validInboundFrame() {
  return {
    type: MIDI_TRAFFIC_FRAME_TYPE,
    data: {
      timestamp_ns: 1715731200000000000,
      source_port: 'USB-Commander',
      destination_port: '',
      direction: 'inbound',
      route_id: null,
      raw_hex: 'b007ff',
      decoded: {
        message_type: 'cc',
        channel: 0,
        data1: 7,
        data2: 255,
      },
    },
  }
}

describe('checkMidiTrafficFrame happy paths', () => {
  test('accepts a valid inbound frame', () => {
    expect(checkMidiTrafficFrame(validInboundFrame()).ok).toBe(true)
  })

  test('accepts a valid outbound frame with route_id', () => {
    const frame = validInboundFrame()
    frame.data.direction = 'outbound'
    frame.data.destination_port = 'to-Engine-Bridge'
    ;(frame.data as Record<string, unknown>).route_id = 'route-42'
    expect(checkMidiTrafficFrame(frame).ok).toBe(true)
  })

  test('accepts schema_version omitted (legacy emitters)', () => {
    const frame = validInboundFrame()
    expect((frame as Record<string, unknown>).schema_version).toBeUndefined()
    expect(checkMidiTrafficFrame(frame).ok).toBe(true)
  })
})

describe('checkMidiTrafficFrame rejections', () => {
  test('null', () => {
    const r = checkMidiTrafficFrame(null)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('envelope')
  })

  test('wrong type', () => {
    expect(
      checkMidiTrafficFrame({ type: 'midi:routes', data: {} }).ok,
    ).toBe(false)
  })

  test('missing direction', () => {
    const frame = validInboundFrame()
    delete (frame.data as Record<string, unknown>).direction
    const r = checkMidiTrafficFrame(frame)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('direction')
  })

  test('invalid direction', () => {
    const frame = validInboundFrame()
    ;(frame.data as Record<string, unknown>).direction = 'sideways'
    const r = checkMidiTrafficFrame(frame)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('direction')
  })

  test('channel out of range', () => {
    const frame = validInboundFrame()
    frame.data.decoded.channel = 99
    const r = checkMidiTrafficFrame(frame)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('channel')
  })

  test('route_id wrong type', () => {
    const frame = validInboundFrame()
    ;(frame.data as Record<string, unknown>).route_id = 42
    const r = checkMidiTrafficFrame(frame)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('route_id')
  })

  test('missing decoded', () => {
    const frame = validInboundFrame()
    delete (frame.data as Record<string, unknown>).decoded
    const r = checkMidiTrafficFrame(frame)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('decoded')
  })

  test('decoded.message_type missing', () => {
    const frame = validInboundFrame()
    delete (frame.data.decoded as Record<string, unknown>).message_type
    const r = checkMidiTrafficFrame(frame)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('message_type')
  })
})
