// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// useDocumentVisibility — observe the document's visibilityState across
// mount/unmount, with a shared listener so multiple consumers don't each
// install their own.
//
// Run-14c cycle 3 of the run-14b handoff. Extracts the visibility-
// awareness baked into wsSubscriptionStore.ts so the same back-pressure
// behavior can be reused by other long-running subscriptions (SSE
// clients, polling timers, off-screen canvas redraws).
//
// Two surfaces:
//   - `useDocumentVisibility()`  — React hook; returns `{ hidden }` +
//     auto-subscribes on mount, unsubscribes on unmount
//   - `subscribeDocumentVisibility(listener)` — non-React subscription
//     for modules outside the React tree (e.g. wsSubscriptionStore)
//
// The shared listener is installed lazily on first subscriber + torn
// down when the last subscriber unsubscribes, so the hook has zero
// cost when no component is mounted.

import { useEffect, useState } from 'react'

// ---------------------------------------------------------------------------
// Shared listener — installed once across the module
// ---------------------------------------------------------------------------

type VisibilityListener = (hidden: boolean) => void

const _listeners = new Set<VisibilityListener>()
let _installed = false
let _isHidden = false

/** True if we're running in a JS environment where `document` exists.
 *  False in node / SSR / Jest-without-jsdom. */
function _hasDocument(): boolean {
  return typeof document !== 'undefined'
}

function _readHidden(): boolean {
  if (!_hasDocument()) return false
  return document.visibilityState === 'hidden'
}

function _onVisibilityChange(): void {
  const nowHidden = _readHidden()
  if (nowHidden === _isHidden) return
  _isHidden = nowHidden
  for (const listener of _listeners) {
    try {
      listener(nowHidden)
    } catch {
      // Don't let one rogue listener stop the others.
    }
  }
}

function _install(): void {
  if (_installed) return
  if (!_hasDocument()) return
  document.addEventListener('visibilitychange', _onVisibilityChange)
  _installed = true
  // Only sample the real state if a test hasn't already pinned it.
  if (!_isHidden) _isHidden = _readHidden()
}

function _uninstall(): void {
  if (!_installed) return
  if (!_hasDocument()) return
  document.removeEventListener('visibilitychange', _onVisibilityChange)
  _installed = false
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/** Non-React subscription. Returns an unsubscribe function. Modules
 *  like `wsSubscriptionStore` use this; React components use the hook. */
export function subscribeDocumentVisibility(
  listener: VisibilityListener,
): () => void {
  _listeners.add(listener)
  _install()
  // Fire once so the caller knows the current state without waiting
  // for the next visibilitychange event.
  try {
    listener(_isHidden)
  } catch {
    /* see _onVisibilityChange */
  }
  return () => {
    _listeners.delete(listener)
    if (_listeners.size === 0) _uninstall()
  }
}

/** React hook. Returns the current visibility state + re-renders on
 *  every transition. */
export function useDocumentVisibility(): { hidden: boolean } {
  const [hidden, setHidden] = useState<boolean>(_isHidden)
  useEffect(() => {
    return subscribeDocumentVisibility((next) => setHidden(next))
  }, [])
  return { hidden }
}

// ---------------------------------------------------------------------------
// Test helpers (matches the pattern in wsSubscriptionStore.ts)
// ---------------------------------------------------------------------------

/** Force the visibility flag without touching `document.visibilityState`
 *  (which JSDOM doesn't expose as writable). All registered listeners
 *  fire on the transition. */
export function __setDocumentVisibilityForTests(hidden: boolean): void {
  if (hidden === _isHidden) return
  _isHidden = hidden
  for (const listener of _listeners) {
    try {
      listener(hidden)
    } catch {
      /* see _onVisibilityChange */
    }
  }
}

/** Clear all state. Production code should never call this. */
export function __resetDocumentVisibilityForTests(): void {
  _listeners.clear()
  _uninstall()
  _isHidden = false
}

/** Test introspection: number of registered listeners. */
export function __listenerCountForTests(): number {
  return _listeners.size
}
