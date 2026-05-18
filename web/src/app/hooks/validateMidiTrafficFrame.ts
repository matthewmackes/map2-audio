// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Runtime structural validator for the midi:traffic WebSocket frame.
// Mirrors the validateMeterWsFrame.ts pattern (run-14b cycle 3) +
// validateSonoBusEventsFrame.ts (this run) for the third platform
// WS surface. Dev builds warn on backend drift via a deduped
// console.warn; production builds no-op.

import {
  isMidiTrafficFrame,
  type MidiTrafficFrame,
} from '../types/midiTrafficWsFrame.generated'

const _seenWarnings = new Set<string>()

function warnOnce(key: string, message: string): void {
  if (_seenWarnings.has(key)) return
  _seenWarnings.add(key)

  console.warn(`[midi-traffic-ws] ${message}`)
}

/** Test-only: clear the dedup set. */
export function __resetWarnedForTests(): void {
  _seenWarnings.clear()
}

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

interface ValidationResult<T> {
  ok: boolean
  frame?: T
  error?: string
}

export function checkMidiTrafficFrame(
  frame: unknown,
): ValidationResult<MidiTrafficFrame> {
  if (!isMidiTrafficFrame(frame)) {
    return { ok: false, error: 'frame is not a MidiTrafficFrame envelope' }
  }
  const data = frame.data as unknown as Record<string, unknown>
  if (typeof data.timestamp_ns !== 'number') {
    return { ok: false, error: 'data.timestamp_ns must be a number' }
  }
  if (typeof data.source_port !== 'string') {
    return { ok: false, error: 'data.source_port must be a string' }
  }
  if (typeof data.destination_port !== 'string') {
    return { ok: false, error: 'data.destination_port must be a string' }
  }
  if (data.direction !== 'inbound' && data.direction !== 'outbound') {
    return {
      ok: false,
      error: `data.direction must be 'inbound' or 'outbound'; got ${String(data.direction)}`,
    }
  }
  if (data.route_id !== null && typeof data.route_id !== 'string') {
    return { ok: false, error: 'data.route_id must be string|null' }
  }
  if (typeof data.raw_hex !== 'string') {
    return { ok: false, error: 'data.raw_hex must be a hex string' }
  }
  const decoded = data.decoded as Record<string, unknown> | null | undefined
  if (typeof decoded !== 'object' || decoded === null) {
    return { ok: false, error: 'data.decoded must be a DecodedMidiMessage object' }
  }
  if (typeof decoded.message_type !== 'string') {
    return { ok: false, error: 'data.decoded.message_type must be a string' }
  }
  if (
    typeof decoded.channel !== 'number' ||
    decoded.channel < 0 ||
    decoded.channel > 15
  ) {
    return { ok: false, error: 'data.decoded.channel must be 0-15' }
  }
  if (typeof decoded.data1 !== 'number') {
    return { ok: false, error: 'data.decoded.data1 must be a number' }
  }
  if (typeof decoded.data2 !== 'number') {
    return { ok: false, error: 'data.decoded.data2 must be a number' }
  }
  return { ok: true, frame }
}

// ---------------------------------------------------------------------------
// Dev-build wrapper
// ---------------------------------------------------------------------------

function isDevBuild(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const env = (Function(
      'return typeof import.meta !== "undefined" ? import.meta.env : undefined',
    )() as Record<string, unknown> | undefined)
    return env?.DEV === true
  } catch {
    return false
  }
}

export function devValidateMidiTrafficFrame(frame: unknown): void {
  if (!isDevBuild()) return
  const result = checkMidiTrafficFrame(frame)
  if (!result.ok) {
    const key = `midi-traffic:${result.error}`
    warnOnce(
      key,
      `midi:traffic frame validation failed — ${result.error}`,
    )
  }
}
