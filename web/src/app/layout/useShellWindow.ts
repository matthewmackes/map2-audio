import { useContext } from 'react'

import { ShellWindowContext, type ShellWindowContextValue } from './ShellWindowContext'

export function useShellWindow(): ShellWindowContextValue {
  const ctx = useContext(ShellWindowContext)
  if (!ctx) {
    throw new Error('useShellWindow must be used within a ShellWindowProvider')
  }
  return ctx
}

export function useShellWindowOptional(): ShellWindowContextValue | null {
  return useContext(ShellWindowContext)
}
