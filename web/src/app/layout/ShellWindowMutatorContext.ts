import { createContext } from 'react'
import type { ReactNode } from 'react'

import type { ShellActionSlot, ShellWindowContextValue } from './ShellWindowContext'
import type { ShellBreadcrumbItem } from '../routing/shellRouteMeta'

export type ShellWindowPatch = Partial<{
  title: string
  subtitle: string
  kicker: string
  crumbs: ShellBreadcrumbItem[]
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
