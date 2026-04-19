import { useCallback, useContext, useEffect } from 'react'
import type { Location, Transition, History } from 'history'
import { UNSAFE_NavigationContext, useBeforeUnload, useLocation } from 'react-router-dom'

type GuardedTransition = Transition & {
  retry(): void
}

type NavigationGuardOptions = {
  when: boolean
  message: string
  allowNavigation?: (nextLocation: Location) => boolean
}

function useHistoryNavigationBlock(
  blocker: (transition: GuardedTransition) => void,
  when: boolean,
) {
  const { navigator } = useContext(UNSAFE_NavigationContext)
  const location = useLocation()

  useEffect(() => {
    if (!when) {
      return
    }

    const history = navigator as Partial<History>
    if (typeof history.block !== 'function') {
      return
    }

    const unblock = history.block((transition) => {
      blocker({
        ...transition,
        retry() {
          unblock()
          transition.retry()
        },
      })
    })

    return unblock
  }, [
    blocker,
    location.hash,
    location.key,
    location.pathname,
    location.search,
    navigator,
    when,
  ])
}

export function isSnapshotFlowRoute(pathname: string, snapshotId: number | null | undefined): boolean {
  if (pathname === '/snapshot-editor' || pathname === '/grid' || pathname === '/juce-grid' || pathname === '/grid-3d') {
    return true
  }

  if (!snapshotId || !Number.isFinite(snapshotId)) {
    return false
  }

  return pathname === `/snapshots/${snapshotId}/publish`
}

export function usePendingLiveChangesNavigationGuard({
  when,
  message,
  allowNavigation,
}: NavigationGuardOptions) {
  const handleBlockedNavigation = useCallback((transition: GuardedTransition) => {
    if (allowNavigation?.(transition.location)) {
      transition.retry()
      return
    }

    if (window.confirm(message)) {
      transition.retry()
    }
  }, [allowNavigation, message])

  useHistoryNavigationBlock(handleBlockedNavigation, when)

  useBeforeUnload(useCallback((event) => {
    if (!when) {
      return
    }

    event.preventDefault()
    event.returnValue = message
  }, [message, when]))
}
