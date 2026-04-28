// ControlPanel — Carbon Layer wrapper for grouped operator controls.
// A "panel" in MAP2 vocabulary is a bordered, surface-elevated rectangle
// that groups related controls (parameters, routing options, device
// settings). It is the primary unit of visual grouping inside a workspace.
//
// Composes a Carbon Layer + an optional SectionHeader. Children render
// in the panel body. Use ModuleCard for a denser variant with a single
// title row, no description, no actions.

import type { ReactNode } from 'react'
import { Layer } from '@carbon/react'

import { SectionHeader } from './SectionHeader'
import './ControlPanel.css'

interface ControlPanelProps {
  /** Optional panel header title. When omitted, the panel renders without a header. */
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  /** When true, removes default body padding for callers that want to manage their own. */
  flush?: boolean
  /** Optional anchor id for scroll targeting (per Page Design Standards in CLAUDE.md). */
  id?: string
}

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function ControlPanel({
  title,
  description,
  actions,
  children,
  className,
  flush = false,
  id,
}: ControlPanelProps) {
  return (
    <Layer className={joinClasses('map2-control-panel', flush && 'map2-control-panel--flush', className)} id={id}>
      {title ? <SectionHeader title={title} description={description} actions={actions} /> : null}
      <div className="map2-control-panel__body">{children}</div>
    </Layer>
  )
}

export default ControlPanel
