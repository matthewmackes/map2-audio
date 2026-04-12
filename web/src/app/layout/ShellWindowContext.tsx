import { createContext, useContext } from 'react'
import type { ComponentType } from 'react'

export interface ShellWindowContextValue {
  /** Display title for the current workspace/page */
  title: string
  /** Icon component for the current workspace/page */
  titleIcon: ComponentType<{ width?: number; height?: number; className?: string }>
  /** Breadcrumb-style route hint (e.g. "midi-hub / connections") */
  routeHint: string
  /** CSS color string for the workspace accent */
  accentColor: string
  /** Close handler — navigates back to home */
  onClose: () => void
}

const ShellWindowContext = createContext<ShellWindowContextValue | null>(null)

export const ShellWindowProvider = ShellWindowContext.Provider

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
