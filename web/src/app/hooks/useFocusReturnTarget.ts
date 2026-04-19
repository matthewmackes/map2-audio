import { useCallback, useRef } from 'react'
import type { MutableRefObject } from 'react'

export type FocusReturnTargetHandle<T extends HTMLElement = HTMLElement> = {
  targetRef: MutableRefObject<T | null>
  capture: (element?: T | null) => void
  restore: () => void
}

export function useFocusReturnTarget<T extends HTMLElement = HTMLElement>(): FocusReturnTargetHandle<T> {
  const targetRef = useRef<T | null>(null)

  const capture = useCallback((element?: T | null) => {
    if (element) {
      targetRef.current = element
      return
    }

    if (typeof document === 'undefined') {
      return
    }

    const activeElement = document.activeElement
    if (activeElement instanceof HTMLElement) {
      targetRef.current = activeElement as T
    }
  }, [])

  const restore = useCallback(() => {
    const target = targetRef.current
    if (!target) {
      return
    }

    try {
      target.focus({ preventScroll: true })
    } catch {
      target.focus()
    }
  }, [])

  return {
    targetRef,
    capture,
    restore,
  }
}

export default useFocusReturnTarget
