/**
 * Cycle 31 — useLocalStorage SSR guard pin (audit Fit-10).
 *
 * The audit found that `useLocalStorage`'s `useState` initializer
 * called `window.localStorage.getItem(key)` unconditionally; in SSR
 * contexts (no `window` defined) this would throw and crash the
 * initial render. Cycle 31 added the guard:
 *   `if (typeof window === 'undefined') return defaultValue`
 * This test pins both the read-path guard and the write-path guard.
 */

import { renderHook, act } from '@testing-library/react'

import { useLocalStorage } from './useLocalStorage'

describe('useLocalStorage SSR + happy-path behavior', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.clear()
    }
  })

  it('returns defaultValue when localStorage has no entry', () => {
    const { result } = renderHook(() =>
      useLocalStorage('cycle31:missing', { count: 5 }),
    )
    expect(result.current[0]).toEqual({ count: 5 })
  })

  it('reads back a previously-written value', () => {
    const { result, rerender } = renderHook(() =>
      useLocalStorage('cycle31:roundtrip', 0),
    )
    act(() => {
      result.current[1](42)
    })
    rerender()
    expect(result.current[0]).toBe(42)
    expect(window.localStorage.getItem('cycle31:roundtrip')).toBe('42')
  })

  it('functional updater receives the previous value', () => {
    const { result } = renderHook(() => useLocalStorage('cycle31:fn', 10))
    act(() => {
      result.current[1]((prev) => prev + 5)
    })
    expect(result.current[0]).toBe(15)
  })

  it('honors a custom serializer / deserializer', () => {
    const serialize = (v: { x: number }) => `X=${v.x}`
    const deserialize = (s: string) => ({ x: Number.parseInt(s.slice(2), 10) })
    const { result, rerender } = renderHook(() =>
      useLocalStorage('cycle31:custom', { x: 1 }, { serialize, deserialize }),
    )
    act(() => {
      result.current[1]({ x: 7 })
    })
    rerender()
    expect(window.localStorage.getItem('cycle31:custom')).toBe('X=7')
    expect(result.current[0]).toEqual({ x: 7 })
  })

  it('SSR guard: read path returns defaultValue when window is undefined', () => {
    const originalWindow = globalThis.window
    // @ts-expect-error — simulate SSR
    delete globalThis.window
    try {
      const { result } = renderHook(() =>
        useLocalStorage('cycle31:ssr-read', 'fallback'),
      )
      expect(result.current[0]).toBe('fallback')
    } finally {
      globalThis.window = originalWindow
    }
  })

  it('SSR guard: write path is a no-op when window is undefined', () => {
    // Mount in client context first (so the hook initializes with
    // its default), then simulate window going away (e.g., a
    // teardown race) and confirm the setter doesn't throw.
    const { result } = renderHook(() =>
      useLocalStorage('cycle31:ssr-write', 0),
    )
    const originalWindow = globalThis.window
    // @ts-expect-error — simulate SSR
    delete globalThis.window
    try {
      expect(() => {
        act(() => {
          result.current[1](99)
        })
      }).not.toThrow()
    } finally {
      globalThis.window = originalWindow
    }
  })

  it('source carries the cycle-31 SSR-guard markers', () => {
    // Greppable pin — if a future commit removes the guard, this
    // test fails and forces a deliberate decision.
    const { readFileSync } = require('fs')
    const { join } = require('path')
    const text = readFileSync(
      join(__dirname, 'useLocalStorage.ts'),
      'utf-8',
    )
    expect(text).toMatch(/typeof window === 'undefined'/)
    expect(text).toMatch(/Fit-10/)
  })
})
