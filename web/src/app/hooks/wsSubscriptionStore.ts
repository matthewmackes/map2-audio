// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// wsSubscriptionStore — shared WebSocket subscription registry.
//
// Run-13g cycle 1 of the run-13f handoff. Hooks that consume a
// WebSocket can subscribe through this module instead of opening
// their own socket. The store opens one socket per URL, multiplexes
// incoming frames to every registered listener, and tears the
// connection down once the last listener unsubscribes.
//
// Reconnect policy mirrors useDevicesPeakMetersStream: 250 ms initial
// delay, exponential backoff to a 5 s ceiling. Each listener gets the
// same `state`, `lastError`, and frame stream — no special-casing
// required on the consumer side.
//
// The store is intentionally backend-agnostic. Anything that emits
// JSON frames over a WebSocket can plug in.

export type WsSubscriberState = 'connecting' | 'open' | 'closed'

export interface WsSubscriberCallbacks {
  /** Fires once per parsed JSON frame. Errors thrown inside the
   * handler are caught and routed to onError so a single rogue
   * listener can't crash the bus. */
  onFrame: (frame: unknown) => void
  /** Fires when the socket transitions between states. */
  onStateChange?: (state: WsSubscriberState) => void
  /** Fires when the socket reports an error or a frame fails to
   * parse. The string is the human-readable message. */
  onError?: (message: string) => void
}

interface SubscriptionEntry {
  url: string
  listeners: Set<WsSubscriberCallbacks>
  socket: WebSocket | null
  state: WsSubscriberState
  lastError: string | null
  reconnectTimer: ReturnType<typeof setTimeout> | null
  reconnectDelayMs: number
  cancelled: boolean
}

const RECONNECT_MIN_MS = 250
const RECONNECT_MAX_MS = 5_000

const entriesByUrl = new Map<string, SubscriptionEntry>()

// ---------------------------------------------------------------------------
// Document-visibility back-pressure (run-13i pick #2 of the run-13i handoff;
// extracted to a shared hook in run-14c cycle 3)
//
// When the document becomes hidden (the operator switches to a different
// browser tab, minimizes the window, locks the screen), the store closes
// every open socket and clears any pending reconnect timer. Listeners
// remain registered — the store keeps the entry alive so a re-subscribe
// during the hidden state still hooks into the same shared connection
// path. On `visibilitychange` → visible, every entry with at least one
// listener reconnects (reset backoff).
//
// The visibility tracking is now owned by
// `useDocumentVisibility.subscribeDocumentVisibility()`, a shared
// non-React subscription. This module subscribes once at first
// connect-attempt; the unsubscribe handle is held forever (the
// listener load is constant once installed).
// ---------------------------------------------------------------------------

import {
  __resetDocumentVisibilityForTests as __resetVisHelperForTests,
  __setDocumentVisibilityForTests as __setVisHelperForTests,
  subscribeDocumentVisibility,
} from './useDocumentVisibility'

let _visibilitySubscriptionInstalled = false
let _isDocumentHidden = false

function onVisibilityChange(nowHidden: boolean): void {
  if (nowHidden === _isDocumentHidden) return
  _isDocumentHidden = nowHidden
  if (nowHidden) {
    // Tear down every open socket. Listeners stay registered.
    for (const entry of entriesByUrl.values()) {
      if (entry.listeners.size > 0) {
        teardown(entry, { reset: true })
      }
    }
  } else {
    // Reopen every entry that still has at least one listener.
    for (const entry of entriesByUrl.values()) {
      if (entry.listeners.size > 0 && !entry.socket) {
        entry.cancelled = false
        entry.reconnectDelayMs = RECONNECT_MIN_MS
        connect(entry)
      }
    }
  }
}

function ensureVisibilityListener(): void {
  if (_visibilitySubscriptionInstalled) return
  _visibilitySubscriptionInstalled = true
  // subscribeDocumentVisibility fires once on subscribe so we get the
  // initial state without an extra read.
  subscribeDocumentVisibility(onVisibilityChange)
}

function emitState(entry: SubscriptionEntry, next: WsSubscriberState): void {
  if (entry.state === next) return
  entry.state = next
  for (const listener of entry.listeners) {
    try {
      listener.onStateChange?.(next)
    } catch {
      // Swallow listener errors so a single rogue subscriber can't
      // tear down the shared connection.
    }
  }
}

function emitError(entry: SubscriptionEntry, message: string): void {
  entry.lastError = message
  for (const listener of entry.listeners) {
    try {
      listener.onError?.(message)
    } catch {
      /* see emitState */
    }
  }
}

function emitFrame(entry: SubscriptionEntry, frame: unknown): void {
  entry.lastError = null
  for (const listener of entry.listeners) {
    try {
      listener.onFrame(frame)
    } catch (err) {
      emitError(entry, (err as Error)?.message ?? 'listener threw')
    }
  }
}

function teardown(entry: SubscriptionEntry, opts: { reset?: boolean } = {}): void {
  if (entry.reconnectTimer) {
    clearTimeout(entry.reconnectTimer)
    entry.reconnectTimer = null
  }
  const ws = entry.socket
  entry.socket = null
  if (ws) {
    try {
      // Clear handlers so a late onclose from the closing socket
      // doesn't trigger another reconnect.
      ws.onopen = null
      ws.onmessage = null
      ws.onerror = null
      ws.onclose = null
      ws.close()
    } catch {
      /* best-effort */
    }
  }
  if (opts.reset) {
    entry.reconnectDelayMs = RECONNECT_MIN_MS
  }
  emitState(entry, 'closed')
}

function scheduleReconnect(entry: SubscriptionEntry): void {
  if (entry.cancelled) return
  if (entry.reconnectTimer) return
  const delay = entry.reconnectDelayMs
  entry.reconnectDelayMs = Math.min(RECONNECT_MAX_MS, delay * 2)
  entry.reconnectTimer = setTimeout(() => {
    entry.reconnectTimer = null
    connect(entry)
  }, delay)
}

function connect(entry: SubscriptionEntry): void {
  if (entry.cancelled) return
  if (entry.socket) return
  // Visibility back-pressure: do NOT open while the document is hidden.
  // The visibilitychange listener will reopen on the visible transition.
  if (_isDocumentHidden) {
    emitState(entry, 'closed')
    return
  }
  emitState(entry, 'connecting')
  try {
    const ws = new WebSocket(entry.url)
    entry.socket = ws
    ws.onopen = () => {
      entry.reconnectDelayMs = RECONNECT_MIN_MS
      emitState(entry, 'open')
    }
    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as unknown
        emitFrame(entry, parsed)
      } catch (err) {
        emitError(entry, (err as Error)?.message ?? 'frame parse failed')
      }
    }
    ws.onerror = () => {
      emitError(entry, 'websocket error')
    }
    ws.onclose = () => {
      // Don't call emitState('closed') here because teardown may
      // already have flipped it; trigger reconnect logic instead.
      entry.socket = null
      emitState(entry, 'closed')
      if (entry.listeners.size > 0 && !entry.cancelled) {
        scheduleReconnect(entry)
      }
    }
  } catch (err) {
    emitError(entry, (err as Error)?.message ?? 'websocket construct failed')
    if (entry.listeners.size > 0) scheduleReconnect(entry)
  }
}

export interface Subscription {
  /** Drops this listener. When the last listener for a URL leaves,
   * the underlying socket is torn down and removed from the store. */
  unsubscribe(): void
  /** Live snapshot of the shared connection's state. Cheap getter. */
  state(): WsSubscriberState
  /** Last error message or null. */
  lastError(): string | null
}

export function subscribe(
  url: string,
  callbacks: WsSubscriberCallbacks,
): Subscription {
  // First subscribe call installs the visibilitychange listener (idempotent).
  ensureVisibilityListener()
  let entry = entriesByUrl.get(url)
  if (!entry) {
    entry = {
      url,
      listeners: new Set(),
      socket: null,
      state: 'closed',
      lastError: null,
      reconnectTimer: null,
      reconnectDelayMs: RECONNECT_MIN_MS,
      cancelled: false,
    }
    entriesByUrl.set(url, entry)
  }
  entry.cancelled = false
  entry.listeners.add(callbacks)
  // Fire initial state callback so the subscriber sees the current
  // connection status without waiting for the next transition.
  try {
    callbacks.onStateChange?.(entry.state)
  } catch {
    /* see emitState */
  }
  if (!entry.socket && entry.state !== 'connecting') {
    connect(entry)
  }
  return {
    unsubscribe(): void {
      const e = entriesByUrl.get(url)
      if (!e) return
      e.listeners.delete(callbacks)
      if (e.listeners.size === 0) {
        e.cancelled = true
        teardown(e, { reset: true })
        entriesByUrl.delete(url)
      }
    },
    state(): WsSubscriberState {
      const e = entriesByUrl.get(url)
      return e?.state ?? 'closed'
    },
    lastError(): string | null {
      const e = entriesByUrl.get(url)
      return e?.lastError ?? null
    },
  }
}

/** Test-only: reset the entire store. Closes every entry, drops all
 * listeners, and also resets the shared useDocumentVisibility helper
 * so a fresh test doesn't inherit a previous test's hidden state.
 * Production code should never call this. */
export function __resetForTests(): void {
  for (const entry of entriesByUrl.values()) {
    entry.cancelled = true
    teardown(entry, { reset: true })
  }
  entriesByUrl.clear()
  _isDocumentHidden = false
  _visibilitySubscriptionInstalled = false
  // Reset the shared visibility helper too so the next subscribe()
  // doesn't pick up a previous test's hidden flag via the helper's
  // initial-state fire-on-subscribe semantics.
  __resetVisHelperForTests()
}

/** Test-only: simulate a visibilitychange event. Forwards to the
 * extracted hook's helper so both modules see the transition. */
export function __simulateVisibilityForTests(hidden: boolean): void {
  // The hook's helper fires every registered listener (including the
  // wsSubscriptionStore's `onVisibilityChange` if it's subscribed).
  // If the store hasn't subscribed yet (no prior `subscribe()` call),
  // we still update the local cached flag so `connect()`'s
  // `if (_isDocumentHidden)` guard reads the right value.
  __setVisHelperForTests(hidden)
  _isDocumentHidden = hidden
  // If the subscription hasn't been installed, the hook's listener
  // fanout didn't reach us — apply the same teardown/reopen logic
  // manually so tests work even on the first transition.
  if (!_visibilitySubscriptionInstalled) {
    if (hidden) {
      for (const entry of entriesByUrl.values()) {
        if (entry.listeners.size > 0) teardown(entry, { reset: true })
      }
    } else {
      for (const entry of entriesByUrl.values()) {
        if (entry.listeners.size > 0 && !entry.socket) {
          entry.cancelled = false
          entry.reconnectDelayMs = RECONNECT_MIN_MS
          connect(entry)
        }
      }
    }
  }
}

/** Test-only: introspect store size. */
export function __urlCountForTests(): number {
  return entriesByUrl.size
}

/** Test-only: introspect listener count for a URL. */
export function __listenerCountForTests(url: string): number {
  return entriesByUrl.get(url)?.listeners.size ?? 0
}
