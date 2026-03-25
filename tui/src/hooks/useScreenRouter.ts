import { useMemo, useState } from 'react'
import { screenRegistryById } from '../navigation/screenRegistry'
import type { ScreenEntry, ScreenId } from '../navigation/types'

export interface ScreenRouterState {
  current: ScreenEntry
  stack: ScreenEntry[]
  canGoBack: boolean
  push: (id: ScreenId) => void
  replace: (id: ScreenId) => void
  pop: () => void
}

export function useScreenRouter(initialScreen: ScreenId = 'home'): ScreenRouterState {
  const [stack, setStack] = useState<ScreenEntry[]>([{ id: initialScreen }])

  const current = stack[stack.length - 1]

  return useMemo(
    () => ({
      current,
      stack,
      canGoBack: stack.length > 1,
      push: (id: ScreenId) => {
        if (!screenRegistryById[id]) {
          return
        }
        setStack((previous) => [...previous, { id }])
      },
      replace: (id: ScreenId) => {
        if (!screenRegistryById[id]) {
          return
        }
        setStack((previous) => [...previous.slice(0, -1), { id }])
      },
      pop: () => {
        setStack((previous) => (previous.length > 1 ? previous.slice(0, -1) : previous))
      },
    }),
    [current, stack],
  )
}
