import { createContext } from 'react'
import type { ComponentType, ReactNode } from 'react'
import type { ShellBreadcrumbItem } from '../routing/shellRouteMeta'

export type ShellActionStatus = 'ok' | 'warn' | 'error' | 'info'

export interface ShellActionSlot {
  id: string
  label: string
  icon?: ComponentType<{ size?: number; className?: string }>
  onClick?: () => void
  active?: boolean
  status?: ShellActionStatus
  disabled?: boolean
  title?: string
}

export interface ShellWindowContextValue {
  title: string
  subtitle?: string
  kicker?: string
  crumbs?: ShellBreadcrumbItem[]
  titleIcon: ComponentType<{ width?: number; height?: number; className?: string; size?: number }>
  routeHint: string
  accentColor: string
  actions?: ShellActionSlot[]
  lead?: ReactNode
  onClose: () => void
}

export const ShellWindowContext = createContext<ShellWindowContextValue | null>(null)

export const ShellWindowProvider = ShellWindowContext.Provider
