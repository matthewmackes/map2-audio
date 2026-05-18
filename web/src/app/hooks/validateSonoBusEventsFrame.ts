// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Runtime structural validators for the sonobus:* WebSocket frames.
// Mirrors the validateMeterWsFrame.ts pattern (run-14b cycle 3) for the
// three sonobus topics: state, heartbeat, daemon-event. Dev builds
// warn on backend drift via a deduped console.warn; production builds
// no-op via the Function-evaled isDevBuild() accessor.

import {
  classifySonoBusFrame,
  isSonoBusDaemonEventFrame,
  isSonoBusHeartbeatFrame,
  isSonoBusStateFrame,
  type SonoBusDaemonEventFrame,
  type SonoBusHeartbeatFrame,
  type SonoBusStateFrame,
  type SonoBusEventsFrameType,
} from '../types/sonobusEventsWsFrame.generated'

const _seenWarnings = new Set<string>()

function warnOnce(key: string, message: string): void {
  if (_seenWarnings.has(key)) return
  _seenWarnings.add(key)

  console.warn(`[sonobus-events-ws] ${message}`)
}

/** Test-only: clear the dedup set. */
export function __resetWarnedForTests(): void {
  _seenWarnings.clear()
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

interface ValidationResult<T> {
  ok: boolean
  frame?: T
  error?: string
}

function _checkSnapshotBody(
  data: unknown,
  frameLabel: string,
): { ok: boolean; error?: string } {
  if (typeof data !== 'object' || data === null) {
    return { ok: false, error: `${frameLabel}.data must be an object` }
  }
  const d = data as Record<string, unknown>
  if (typeof d.authority_ok !== 'boolean') {
    return { ok: false, error: `${frameLabel}.data.authority_ok must be a boolean` }
  }
  if (typeof d.timestamp !== 'string') {
    return { ok: false, error: `${frameLabel}.data.timestamp must be an ISO-8601 string` }
  }
  if (
    'binding_count' in d &&
    d.binding_count !== undefined &&
    typeof d.binding_count !== 'number'
  ) {
    return { ok: false, error: `${frameLabel}.data.binding_count must be a number when present` }
  }
  if (
    'daemon_status' in d &&
    d.daemon_status !== undefined &&
    typeof d.daemon_status !== 'string'
  ) {
    return { ok: false, error: `${frameLabel}.data.daemon_status must be a string when present` }
  }
  return { ok: true }
}

export function checkSonoBusStateFrame(
  frame: unknown,
): ValidationResult<SonoBusStateFrame> {
  if (!isSonoBusStateFrame(frame)) {
    return { ok: false, error: 'frame is not a SonoBusStateFrame envelope' }
  }
  const bodyCheck = _checkSnapshotBody(frame.data, 'sonobus:state')
  if (!bodyCheck.ok) return { ok: false, error: bodyCheck.error }
  return { ok: true, frame }
}

export function checkSonoBusHeartbeatFrame(
  frame: unknown,
): ValidationResult<SonoBusHeartbeatFrame> {
  if (!isSonoBusHeartbeatFrame(frame)) {
    return { ok: false, error: 'frame is not a SonoBusHeartbeatFrame envelope' }
  }
  const bodyCheck = _checkSnapshotBody(frame.data, 'sonobus:heartbeat')
  if (!bodyCheck.ok) return { ok: false, error: bodyCheck.error }
  return { ok: true, frame }
}

export function checkSonoBusDaemonEventFrame(
  frame: unknown,
): ValidationResult<SonoBusDaemonEventFrame> {
  if (!isSonoBusDaemonEventFrame(frame)) {
    return { ok: false, error: 'frame is not a SonoBusDaemonEventFrame envelope' }
  }
  const data = frame.data as unknown as Record<string, unknown>
  if (typeof data.type !== 'string' || !data.type) {
    return {
      ok: false,
      error: 'sonobus:daemon.data.type must be a non-empty string',
    }
  }
  if (data.event !== true) {
    return {
      ok: false,
      error: 'sonobus:daemon.data.event must be true',
    }
  }
  if (typeof data.payload !== 'object' || data.payload === null) {
    return {
      ok: false,
      error: 'sonobus:daemon.data.payload must be an object',
    }
  }
  return { ok: true, frame }
}

/** Classify the frame topic. Returns null if the frame doesn't match
 *  any canonical sonobus envelope (informational only — the dev
 *  validator warns on this). */
export function classifySonoBusEnvelope(frame: unknown): SonoBusEventsFrameType | null {
  return classifySonoBusFrame(frame)
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

export function devValidateSonoBusFrame(frame: unknown): void {
  if (!isDevBuild()) return
  const topic = classifySonoBusEnvelope(frame)
  let result: ValidationResult<unknown> = { ok: false, error: 'unknown envelope' }
  if (topic === 'sonobus:state') {
    result = checkSonoBusStateFrame(frame)
  } else if (topic === 'sonobus:heartbeat') {
    result = checkSonoBusHeartbeatFrame(frame)
  } else if (topic === 'sonobus:daemon') {
    result = checkSonoBusDaemonEventFrame(frame)
  } else {
    // Not one of the canonical three. Warn once with the unknown type.
    const rawType =
      typeof frame === 'object' && frame !== null
        ? String((frame as Record<string, unknown>).type ?? '<missing>')
        : '<non-object>'
    warnOnce(
      `unknown:${rawType}`,
      `sonobus events WS frame is not a canonical envelope (type=${rawType})`,
    )
    return
  }
  if (!result.ok) {
    const key = `${topic}:${result.error}`
    warnOnce(
      key,
      `${topic} frame validation failed — ${result.error}`,
    )
  }
}
