// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Run-14b cycle 3 — runtime structural validation for device-peak-meters
// WS frames. Wraps the type guards from `meterWsFrame.generated.ts` with
// a deeper structural check so dev builds catch backend drift in the
// browser console before the next CI run.
//
// Production builds: validation is a no-op. The `import.meta.env.DEV`
// gate is the only path that hits the structural check; in production
// the WS hook just trusts the frame shape (the canonical Pydantic
// source on the backend has already validated it before sending).

import {
  isClusterRegistryFrame,
  isRegistryFrame,
  type ClusterMeterRegistryFrame,
  type DeviceMeterRegistryFrame,
} from '../types/meterWsFrame.generated'

// Logged once per (frame-shape, error-message) pair so a misbehaving
// backend doesn't spam the console.
const _seenWarnings = new Set<string>()

function warnOnce(key: string, message: string): void {
  if (_seenWarnings.has(key)) return
  _seenWarnings.add(key)

  console.warn(`[meter-ws] ${message}`)
}

/** Test-only: clear the dedup set so a unit test can assert the warn
 * fires once per fresh observation. */
export function __resetWarnedForTests(): void {
  _seenWarnings.clear()
}

// ---------------------------------------------------------------------------
// Validators (used by the WS hooks; safe to call in any build)
// ---------------------------------------------------------------------------

interface ValidationResult<T> {
  ok: boolean
  frame?: T
  error?: string
}

/** Structural check on a registry frame. Cheap (no parse, no schema
 * library) — just walks the shape against the canonical model. */
export function checkRegistryFrame(
  frame: unknown,
): ValidationResult<DeviceMeterRegistryFrame> {
  if (!isRegistryFrame(frame)) {
    return { ok: false, error: 'frame is not a DeviceMeterRegistryFrame envelope' }
  }
  const { devices } = frame.data
  if (!Array.isArray(devices)) {
    return { ok: false, error: 'frame.data.devices must be an array' }
  }
  for (let i = 0; i < devices.length; i++) {
    const d = devices[i] as unknown as Record<string, unknown>
    if (typeof d?.device_id !== 'string') {
      return { ok: false, error: `frame.data.devices[${i}].device_id must be a string` }
    }
    if (typeof d?.input_channels !== 'number') {
      return { ok: false, error: `frame.data.devices[${i}].input_channels must be a number` }
    }
    if (typeof d?.output_channels !== 'number') {
      return { ok: false, error: `frame.data.devices[${i}].output_channels must be a number` }
    }
    if (typeof d?.has_engine_source !== 'boolean') {
      return { ok: false, error: `frame.data.devices[${i}].has_engine_source must be a boolean` }
    }
    // snapshot is Optional<MeterSnapshotPayload>
    if (d.snapshot !== null && d.snapshot !== undefined) {
      const s = d.snapshot as Record<string, unknown>
      if (!Array.isArray(s.input_peak_db)) {
        return { ok: false, error: `frame.data.devices[${i}].snapshot.input_peak_db must be an array` }
      }
      if (!Array.isArray(s.output_peak_db)) {
        return { ok: false, error: `frame.data.devices[${i}].snapshot.output_peak_db must be an array` }
      }
      if (
        s.source !== 'engine' &&
        s.source !== 'placeholder' &&
        s.source !== 'engine_unavailable'
      ) {
        return {
          ok: false,
          error: `frame.data.devices[${i}].snapshot.source must be one of engine|placeholder|engine_unavailable; got ${String(s.source)}`,
        }
      }
    }
  }
  return { ok: true, frame }
}

/** Structural check on a cluster registry frame. */
export function checkClusterRegistryFrame(
  frame: unknown,
): ValidationResult<ClusterMeterRegistryFrame> {
  if (!isClusterRegistryFrame(frame)) {
    return { ok: false, error: 'frame is not a ClusterMeterRegistryFrame envelope' }
  }
  const { local, peers, errors } = frame.data
  if (!local || !Array.isArray(local.devices)) {
    return { ok: false, error: 'frame.data.local.devices must be an array' }
  }
  if (!Array.isArray(peers)) {
    return { ok: false, error: 'frame.data.peers must be an array' }
  }
  for (let i = 0; i < peers.length; i++) {
    const p = peers[i] as unknown as Record<string, unknown>
    if (typeof p?.node_id !== 'string') {
      return { ok: false, error: `frame.data.peers[${i}].node_id must be a string` }
    }
    if (typeof p?.health !== 'string') {
      return { ok: false, error: `frame.data.peers[${i}].health must be a string` }
    }
    if (!Array.isArray(p?.devices)) {
      return { ok: false, error: `frame.data.peers[${i}].devices must be an array` }
    }
  }
  if (typeof errors !== 'object' || errors === null || Array.isArray(errors)) {
    return { ok: false, error: 'frame.data.errors must be a Record<string, string>' }
  }
  return { ok: true, frame }
}

// ---------------------------------------------------------------------------
// Dev-build wrapper — the WS hooks call this in onFrame
// ---------------------------------------------------------------------------

/** True when we're running in a dev build. Vite stamps `import.meta.env.DEV`
 * at build time and tree-shakes the dead branch in production. We read
 * it through `Function('return import.meta.env')` so the syntax doesn't
 * tree the file in CommonJS test runners (Jest's babel transform parses
 * `import.meta` literally and throws SyntaxError in non-ESM mode).
 *
 * In production (Vite ESM build) the Function() call resolves to
 * import.meta.env exactly the same way as direct access; Vite's tree
 * shaking still works because the `DEV` flag is true/false at build time.
 * In Jest (CJS) the Function call throws and we fall back to false. */
function isDevBuild(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-explicit-any
    const env = (Function('return typeof import.meta !== "undefined" ? import.meta.env : undefined')() as Record<string, unknown> | undefined)
    return env?.DEV === true
  } catch {
    return false
  }
}

/** Dev-build: warn once on validation failure. Production: no-op
 * (returns immediately).
 *
 * The hook still passes the frame onward unchanged — validation is
 * informational, not enforcement, so a malformed frame doesn't break
 * the live page (the hook's existing `f?.data?.devices` guard already
 * tolerates missing fields gracefully). */
export function devValidateRegistryFrame(frame: unknown): void {
  if (!isDevBuild()) return
  const result = checkRegistryFrame(frame)
  if (!result.ok) {
    const key = `registry:${result.error}`
    warnOnce(
      key,
      `device_peak_meters:registry frame validation failed — ${result.error}`,
    )
  }
}

export function devValidateClusterRegistryFrame(frame: unknown): void {
  if (!isDevBuild()) return
  const result = checkClusterRegistryFrame(frame)
  if (!result.ok) {
    const key = `cluster:${result.error}`
    warnOnce(
      key,
      `device_peak_meters:cluster_registry frame validation failed — ${result.error}`,
    )
  }
}
