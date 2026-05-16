// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Run-14c cycle 3 — useDocumentVisibility tests.

import {
  __listenerCountForTests,
  __resetDocumentVisibilityForTests,
  __setDocumentVisibilityForTests,
  subscribeDocumentVisibility,
} from './useDocumentVisibility'

beforeEach(() => {
  __resetDocumentVisibilityForTests()
})

afterAll(() => {
  __resetDocumentVisibilityForTests()
})

// ---------------------------------------------------------------------------
// subscribeDocumentVisibility (non-React surface)
// ---------------------------------------------------------------------------

describe('subscribeDocumentVisibility', () => {
  test('fires the listener once on subscribe with the current state', () => {
    const calls: boolean[] = []
    subscribeDocumentVisibility((hidden) => calls.push(hidden))
    expect(calls).toEqual([false])
  })

  test('listener fires on every transition', () => {
    const calls: boolean[] = []
    subscribeDocumentVisibility((hidden) => calls.push(hidden))
    calls.length = 0  // ignore the initial fire

    __setDocumentVisibilityForTests(true)
    __setDocumentVisibilityForTests(false)
    __setDocumentVisibilityForTests(true)

    expect(calls).toEqual([true, false, true])
  })

  test('listener does NOT fire on repeated set with the same value', () => {
    const calls: boolean[] = []
    subscribeDocumentVisibility((hidden) => calls.push(hidden))
    calls.length = 0

    __setDocumentVisibilityForTests(true)
    __setDocumentVisibilityForTests(true)  // no-op
    __setDocumentVisibilityForTests(false)
    __setDocumentVisibilityForTests(false)  // no-op

    expect(calls).toEqual([true, false])
  })

  test('unsubscribe stops further callbacks', () => {
    const calls: boolean[] = []
    const unsubscribe = subscribeDocumentVisibility((hidden) =>
      calls.push(hidden),
    )
    calls.length = 0

    unsubscribe()
    __setDocumentVisibilityForTests(true)
    expect(calls).toEqual([])
  })

  test('multiple subscribers each receive every transition', () => {
    const aCalls: boolean[] = []
    const bCalls: boolean[] = []
    subscribeDocumentVisibility((h) => aCalls.push(h))
    subscribeDocumentVisibility((h) => bCalls.push(h))
    aCalls.length = 0
    bCalls.length = 0

    __setDocumentVisibilityForTests(true)
    expect(aCalls).toEqual([true])
    expect(bCalls).toEqual([true])
  })

  test('a rogue listener that throws does not stop the others', () => {
    const goodCalls: boolean[] = []
    subscribeDocumentVisibility(() => {
      throw new Error('bad listener')
    })
    subscribeDocumentVisibility((h) => goodCalls.push(h))
    goodCalls.length = 0

    __setDocumentVisibilityForTests(true)
    expect(goodCalls).toEqual([true])
  })

  test('listener count reflects active subscribers', () => {
    expect(__listenerCountForTests()).toBe(0)
    const u1 = subscribeDocumentVisibility(() => undefined)
    const u2 = subscribeDocumentVisibility(() => undefined)
    expect(__listenerCountForTests()).toBe(2)
    u1()
    expect(__listenerCountForTests()).toBe(1)
    u2()
    expect(__listenerCountForTests()).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// __setDocumentVisibilityForTests works without any subscribers
// ---------------------------------------------------------------------------

describe('__setDocumentVisibilityForTests', () => {
  test('does not throw when no listeners are registered', () => {
    expect(() => __setDocumentVisibilityForTests(true)).not.toThrow()
    expect(() => __setDocumentVisibilityForTests(false)).not.toThrow()
  })

  test('subsequent subscribe sees the current state via the initial fire', () => {
    __setDocumentVisibilityForTests(true)
    const calls: boolean[] = []
    subscribeDocumentVisibility((h) => calls.push(h))
    expect(calls).toEqual([true])
  })
})
