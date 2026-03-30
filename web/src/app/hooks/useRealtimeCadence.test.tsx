import React from 'react'
import { act, renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { usePageVisible } from './usePageVisible'
import { useRealtimeCadence } from './useRealtimeCadence'
import { useRouteActive } from './useRouteActive'

let hiddenState = false

function setDocumentHidden(nextHidden: boolean) {
  hiddenState = nextHidden
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hiddenState,
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

function makeWrapper(initialEntry: string) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>
  }
}

function useCadenceProbe(pattern: string) {
  const routeActive = useRouteActive(pattern)
  const visible = usePageVisible()
  const interval = useRealtimeCadence({
    routeActive,
    visibleMs: 1_000,
    hiddenMs: 5_000,
    inactiveMs: false,
  })

  return {
    routeActive,
    visible,
    interval,
  }
}

describe('realtime responsiveness hooks', () => {
  beforeEach(() => {
    setDocumentHidden(false)
  })

  it('returns the active visible cadence when the route is active', () => {
    const { result } = renderHook(() => useCadenceProbe('/snapshot-editor'), {
      wrapper: makeWrapper('/snapshot-editor'),
    })

    expect(result.current.routeActive).toBe(true)
    expect(result.current.visible).toBe(true)
    expect(result.current.interval).toBe(1_000)
  })

  it('switches to the hidden cadence when document visibility changes', () => {
    const { result } = renderHook(() => useCadenceProbe('/snapshot-editor'), {
      wrapper: makeWrapper('/snapshot-editor'),
    })

    act(() => {
      setDocumentHidden(true)
    })

    expect(result.current.visible).toBe(false)
    expect(result.current.interval).toBe(5_000)
  })

  it('disables realtime cadence when the route is inactive', () => {
    const { result } = renderHook(() => useCadenceProbe('/snapshot-editor'), {
      wrapper: makeWrapper('/labs'),
    })

    expect(result.current.routeActive).toBe(false)
    expect(result.current.interval).toBe(false)
  })
})
