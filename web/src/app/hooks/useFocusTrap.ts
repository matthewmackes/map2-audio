import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

type UseFocusTrapOptions = {
  enabled: boolean
  containerRef: RefObject<HTMLElement | null>
  onEscape?: () => void
  restoreFocusRef?: RefObject<HTMLElement | null>
}

export function useFocusTrap({
  enabled,
  containerRef,
  onEscape,
  restoreFocusRef,
}: UseFocusTrapOptions) {
  const previouslyEnabledRef = useRef(enabled)

  useEffect(() => {
    if (!enabled) {
      if (previouslyEnabledRef.current) {
        restoreFocusRef?.current?.focus()
      }
      previouslyEnabledRef.current = enabled
      return undefined
    }

    const scope = containerRef.current
    if (!scope) {
      previouslyEnabledRef.current = enabled
      return undefined
    }

    scope.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onEscape?.()
        return
      }

      if (event.key !== 'Tab') {
        return
      }

      const focusable = Array.from(
        scope.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => !element.hasAttribute('disabled') && element.tabIndex !== -1)

      if (focusable.length === 0) {
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    previouslyEnabledRef.current = enabled

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [containerRef, enabled, onEscape, restoreFocusRef])
}
