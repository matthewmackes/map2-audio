import { useContext, useEffect } from 'react'

import { ShellWindowMutatorContext, type ShellWindowPatch } from './ShellWindowMutatorContext'

export type { ShellWindowPatch }

export function useSetShellWindow(patch: ShellWindowPatch, deps: ReadonlyArray<unknown>): void {
  const mutator = useContext(ShellWindowMutatorContext)
  useEffect(() => {
    if (!mutator) {
      return undefined
    }
    mutator.set(patch)
    return () => {
      mutator.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mutator, ...deps])
}
