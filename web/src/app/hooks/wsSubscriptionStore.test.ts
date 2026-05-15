// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// wsSubscriptionStore tests. Covers single-connection dedup, frame
// fan-out, state-change callbacks, last-listener teardown, and
// listener-error isolation.

import {
  subscribe,
  __resetForTests,
  __urlCountForTests,
  __listenerCountForTests,
  __simulateVisibilityForTests,
} from './wsSubscriptionStore'

interface FakeSocket {
  url: string
  readyState: number
  onopen: ((event?: Event) => void) | null
  onmessage: ((event: { data: string }) => void) | null
  onerror: ((event?: Event) => void) | null
  onclose: ((event?: CloseEvent) => void) | null
  close: jest.Mock
}

let openedSockets: FakeSocket[] = []

class MockWebSocket implements FakeSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  url: string
  readyState = MockWebSocket.CONNECTING
  onopen: ((event?: Event) => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: ((event?: Event) => void) | null = null
  onclose: ((event?: CloseEvent) => void) | null = null
  close = jest.fn(() => {
    this.readyState = MockWebSocket.CLOSED
  })

  constructor(url: string) {
    this.url = url
    openedSockets.push(this as FakeSocket)
  }
}

const originalWebSocket = global.WebSocket

beforeAll(() => {
  // jsdom doesn't ship a real WebSocket; install the mock.
  ;(global as unknown as { WebSocket: typeof MockWebSocket }).WebSocket =
    MockWebSocket
})

afterAll(() => {
  ;(global as unknown as { WebSocket: typeof WebSocket }).WebSocket = originalWebSocket
})

beforeEach(() => {
  __resetForTests()
  openedSockets = []
})

describe('wsSubscriptionStore', () => {
  it('opens a socket on the first subscribe', () => {
    const frames: unknown[] = []
    subscribe('ws://test/feed', { onFrame: (f) => frames.push(f) })
    expect(openedSockets.length).toBe(1)
    expect(openedSockets[0].url).toBe('ws://test/feed')
    expect(__urlCountForTests()).toBe(1)
    expect(__listenerCountForTests('ws://test/feed')).toBe(1)
  })

  it('shares a single socket across multiple subscribers on the same URL', () => {
    const aFrames: unknown[] = []
    const bFrames: unknown[] = []
    subscribe('ws://test/feed', { onFrame: (f) => aFrames.push(f) })
    subscribe('ws://test/feed', { onFrame: (f) => bFrames.push(f) })
    expect(openedSockets.length).toBe(1)
    expect(__listenerCountForTests('ws://test/feed')).toBe(2)
  })

  it('opens distinct sockets for distinct URLs', () => {
    subscribe('ws://test/a', { onFrame: () => undefined })
    subscribe('ws://test/b', { onFrame: () => undefined })
    expect(openedSockets.length).toBe(2)
    expect(__urlCountForTests()).toBe(2)
  })

  it('fans out frames to every listener', () => {
    const aFrames: unknown[] = []
    const bFrames: unknown[] = []
    subscribe('ws://test/feed', { onFrame: (f) => aFrames.push(f) })
    subscribe('ws://test/feed', { onFrame: (f) => bFrames.push(f) })
    openedSockets[0].onopen?.()
    openedSockets[0].onmessage?.({ data: JSON.stringify({ hello: 'world' }) })
    expect(aFrames).toEqual([{ hello: 'world' }])
    expect(bFrames).toEqual([{ hello: 'world' }])
  })

  it('routes state changes to every subscriber', () => {
    const states: string[] = []
    subscribe('ws://test/feed', {
      onFrame: () => undefined,
      onStateChange: (s) => states.push(`a:${s}`),
    })
    subscribe('ws://test/feed', {
      onFrame: () => undefined,
      onStateChange: (s) => states.push(`b:${s}`),
    })
    openedSockets[0].onopen?.()
    expect(states).toContain('a:open')
    expect(states).toContain('b:open')
  })

  it('routes parse errors via onError without crashing siblings', () => {
    const errors: string[] = []
    const frames: unknown[] = []
    subscribe('ws://test/feed', {
      onFrame: () => undefined,
      onError: (m) => errors.push(`a:${m}`),
    })
    subscribe('ws://test/feed', {
      onFrame: (f) => frames.push(f),
      onError: (m) => errors.push(`b:${m}`),
    })
    openedSockets[0].onopen?.()
    openedSockets[0].onmessage?.({ data: 'not-json' })
    expect(errors.some((e) => e.startsWith('a:'))).toBe(true)
    expect(errors.some((e) => e.startsWith('b:'))).toBe(true)
    // Subsequent valid frame still fans out.
    openedSockets[0].onmessage?.({ data: JSON.stringify({ ok: true }) })
    expect(frames).toEqual([{ ok: true }])
  })

  it('a thrown onFrame in one listener does not block other listeners', () => {
    const okFrames: unknown[] = []
    const errors: string[] = []
    subscribe('ws://test/feed', {
      onFrame: () => {
        throw new Error('boom')
      },
      onError: (m) => errors.push(`bad:${m}`),
    })
    subscribe('ws://test/feed', {
      onFrame: (f) => okFrames.push(f),
    })
    openedSockets[0].onopen?.()
    openedSockets[0].onmessage?.({ data: JSON.stringify({ keep: 'going' }) })
    expect(okFrames).toEqual([{ keep: 'going' }])
    // Thrown listener routes through onError.
    expect(errors.length).toBeGreaterThan(0)
  })

  it('keeps the socket open until the last listener unsubscribes', () => {
    const subA = subscribe('ws://test/feed', { onFrame: () => undefined })
    const subB = subscribe('ws://test/feed', { onFrame: () => undefined })
    subA.unsubscribe()
    expect(openedSockets[0].close).not.toHaveBeenCalled()
    expect(__urlCountForTests()).toBe(1)
    subB.unsubscribe()
    expect(openedSockets[0].close).toHaveBeenCalled()
    expect(__urlCountForTests()).toBe(0)
  })

  it('exposes state() and lastError() snapshots', () => {
    const sub = subscribe('ws://test/feed', { onFrame: () => undefined })
    expect(sub.state()).toBe('connecting')
    openedSockets[0].onopen?.()
    expect(sub.state()).toBe('open')
    openedSockets[0].onerror?.()
    expect(sub.lastError()).toBe('websocket error')
    sub.unsubscribe()
    expect(sub.state()).toBe('closed')
  })

  it('emits an initial state callback on subscribe', () => {
    const states: string[] = []
    subscribe('ws://test/feed', {
      onFrame: () => undefined,
      onStateChange: (s) => states.push(s),
    })
    // First emission is the 'closed' default that gets immediately
    // promoted to 'connecting' as connect() runs synchronously.
    expect(states.length).toBeGreaterThanOrEqual(1)
    expect(states[states.length - 1]).toBe('connecting')
  })
})

// ---------------------------------------------------------------------------
// Run-13i pick #2 — visibilitychange back-pressure
// ---------------------------------------------------------------------------

describe('wsSubscriptionStore visibility back-pressure', () => {
  beforeEach(() => {
    openedSockets = []
    __resetForTests()
  })

  test('hiding the document tears down active sockets', () => {
    subscribe('ws://test/visibility', { onFrame: () => undefined })
    expect(openedSockets.length).toBe(1)
    const sock = openedSockets[0]

    __simulateVisibilityForTests(true)

    expect(sock.close).toHaveBeenCalledTimes(1)
  })

  test('returning to visible re-opens a fresh socket', () => {
    subscribe('ws://test/visibility', { onFrame: () => undefined })
    expect(openedSockets.length).toBe(1)

    __simulateVisibilityForTests(true)
    expect(openedSockets.length).toBe(1)  // no new socket while hidden

    __simulateVisibilityForTests(false)
    expect(openedSockets.length).toBe(2)  // reopened on visible
  })

  test('subscribing while hidden does NOT open a socket', () => {
    // Force hidden before any subscribe.
    __simulateVisibilityForTests(true)
    const sub = subscribe('ws://test/hidden-subscribe', {
      onFrame: () => undefined,
    })

    expect(openedSockets.length).toBe(0)
    expect(sub.state()).toBe('closed')

    // Becoming visible should reconnect.
    __simulateVisibilityForTests(false)
    expect(openedSockets.length).toBe(1)
  })

  test('emit transitions to closed state when document is hidden', () => {
    const states: string[] = []
    subscribe('ws://test/visibility-state', {
      onFrame: () => undefined,
      onStateChange: (s) => states.push(s),
    })
    // Drain any startup states (we asserted those in the main suite).
    states.length = 0

    __simulateVisibilityForTests(true)
    expect(states.at(-1)).toBe('closed')

    __simulateVisibilityForTests(false)
    expect(states.at(-1)).toBe('connecting')
  })

  test('hiding without active listeners does NOT crash', () => {
    // Ensure no listeners + simulate hidden.
    __resetForTests()
    expect(__urlCountForTests()).toBe(0)
    expect(() => __simulateVisibilityForTests(true)).not.toThrow()
    expect(() => __simulateVisibilityForTests(false)).not.toThrow()
  })

  test('unsubscribing while hidden cleans up the entry', () => {
    const sub = subscribe('ws://test/cleanup', { onFrame: () => undefined })
    __simulateVisibilityForTests(true)
    sub.unsubscribe()
    expect(__urlCountForTests()).toBe(0)
    // Becoming visible should not resurrect anything.
    __simulateVisibilityForTests(false)
    expect(openedSockets.length).toBe(1) // only the original
  })

  test('repeated hide events are idempotent', () => {
    subscribe('ws://test/idempotent', { onFrame: () => undefined })
    const sock = openedSockets[0]
    __simulateVisibilityForTests(true)
    expect(sock.close).toHaveBeenCalledTimes(1)
    __simulateVisibilityForTests(true)  // no-op
    expect(sock.close).toHaveBeenCalledTimes(1)
  })

  test('repeated visible events are idempotent', () => {
    subscribe('ws://test/idempotent-visible', { onFrame: () => undefined })
    __simulateVisibilityForTests(true)
    __simulateVisibilityForTests(false)
    const countAfterFirstShow = openedSockets.length
    __simulateVisibilityForTests(false)  // no-op
    expect(openedSockets.length).toBe(countAfterFirstShow)
  })

  test('hide+show resets exponential backoff so reconnect is immediate', () => {
    // First subscribe + simulate two error reconnects to grow the backoff.
    subscribe('ws://test/backoff-reset', { onFrame: () => undefined })
    const initialSock = openedSockets[0]
    // Trigger a fake disconnect to grow the backoff.
    initialSock.onclose?.({} as CloseEvent)

    __simulateVisibilityForTests(true)
    __simulateVisibilityForTests(false)
    // On show, a new connect runs synchronously (no backoff wait) — the
    // socket count must have grown by 1 immediately.
    expect(openedSockets.length).toBeGreaterThanOrEqual(2)
  })
})
