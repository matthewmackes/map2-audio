// RoutingPanel — semantic alias for ControlPanel used when the panel
// contains audio routing / signal-flow controls. Adds a routing-specific
// CSS class so future B5–B11 work can target routing surfaces specifically
// (e.g., for the unified signal-flow primitive in T2477) without
// duplicating the panel logic itself.

import type { ReactNode } from 'react'

import { ControlPanel } from './ControlPanel'

interface RoutingPanelProps {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  flush?: boolean
  id?: string
}

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function RoutingPanel({ className, ...rest }: RoutingPanelProps) {
  return <ControlPanel {...rest} className={joinClasses('map2-routing-panel', className)} />
}

export default RoutingPanel
