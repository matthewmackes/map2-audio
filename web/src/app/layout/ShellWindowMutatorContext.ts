import { createContext } from 'react'
import type { ReactNode } from 'react'

import type { ShellActionSlot, ShellWindowContextValue } from './ShellWindowContext'

export type ShellWindowPatch = Partial<{
  title: string
  subtitle: string
  kicker: string
  crumbs: string[]
  actions: ShellActionSlot[]
  lead: ReactNode
  accentColor: string
}>

export interface ShellWindowMutator {
  set: (patch: ShellWindowPatch) => void
  clear: () => void
}

export const ShellWindowMutatorContext = createContext<ShellWindowMutator | null>(null)

export const ShellWindowMutatorProvider = ShellWindowMutatorContext.Provider

export type { ShellWindowContextValue }
