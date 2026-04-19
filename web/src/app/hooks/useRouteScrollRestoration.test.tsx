import '@testing-library/jest-dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'

import { useRouteScrollRestoration } from './useRouteScrollRestoration'

const REQUEST_ANIMATION_FRAME = window.requestAnimationFrame
const CANCEL_ANIMATION_FRAME = window.cancelAnimationFrame

function ScrollRestorationHarness({ storageKey }: { storageKey: string }) {
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  useRouteScrollRestoration({
    storageKey,
    elementRef: scrollerRef,
  })

  return (
    <div
      ref={scrollerRef}
      data-testid="scroller"
      style={{ overflow: 'auto', maxHeight: 120 }}
    >
      <div style={{ height: 800 }} />
    </div>
  )
}

describe('useRouteScrollRestoration', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    window.localStorage.clear()
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 1)) as typeof window.requestAnimationFrame
    window.cancelAnimationFrame = ((handle: number) => window.clearTimeout(handle)) as typeof window.cancelAnimationFrame
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
    window.requestAnimationFrame = REQUEST_ANIMATION_FRAME
    window.cancelAnimationFrame = CANCEL_ANIMATION_FRAME
  })

  it('restores and persists scroll position for an element container', () => {
    window.localStorage.setItem('map2.test.scroll', '92')
    render(<ScrollRestorationHarness storageKey="map2.test.scroll" />)

    const scroller = screen.getByTestId('scroller') as HTMLDivElement

    act(() => {
      jest.runAllTimers()
    })

    expect(scroller.scrollTop).toBe(92)

    act(() => {
      scroller.scrollTop = 184
      fireEvent.scroll(scroller)
      jest.runAllTimers()
    })

    expect(window.localStorage.getItem('map2.test.scroll')).toBe('184')
  })
})
