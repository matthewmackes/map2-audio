/**
 * T2485-3 — generic flow-canvas shell.
 *
 * The full MPX1SignalPathCanvas (562 LoC) and IntelFXSignalPathCanvas
 * (339 LoC) are deeply device-specific (block topology, DSP semantics,
 * routing rules, patch-cord geometry are all per-device). Forcing them
 * into a single generic component would either lose device-specific
 * behavior or balloon into a configuration nightmare.
 *
 * What IS shareable across all flow canvases:
 *   - the outer layout frame (toolbar slot / sidebar slot / canvas
 *     viewport)
 *   - the undo/redo plumbing (see useFlowUndoRedo, also in this dir)
 *   - error-boundary scoping
 *   - keyboard shortcut conventions (z/y, +/-, esc)
 *
 * This shell captures those. The device-specific SVG body is passed as
 * the `canvas` render slot; each device retains its own toolbar/sidebar
 * components and drops them into the matching slots.
 *
 * This is intentionally NOT a drop-in replacement for the existing
 * device-specific canvas components — those stay in place. New device
 * shells consume this shell directly; iters 4 and 5 swap MPX1 and
 * IntelFX over.
 */

import { useEffect, type ReactNode } from 'react'
import './DeviceFlowCanvasShell.css'

export interface DeviceFlowCanvasShellKeyboardShortcuts {
  /** undo: defaults to [Ctrl/Cmd + Z]. Pass null to disable. */
  undo?: { combo: 'mod+z'; handler: () => void } | null
  /** redo: defaults to [Ctrl/Cmd + Shift + Z] OR [Ctrl/Cmd + Y]. */
  redo?: { combo: 'mod+shift+z'; handler: () => void } | null
}

export interface DeviceFlowCanvasShellProps {
  /** Per-device toolbar buttons (zoom, A/B compare, tap-tempo, undo/redo, etc.). */
  toolbar?: ReactNode
  /** Per-device sidebar (block detail editor, parameter list, etc.). */
  sidebar?: ReactNode
  /** Sidebar position. Default: right. */
  sidebarSide?: 'left' | 'right'
  /** The actual flow canvas SVG body — fully owned by the device. */
  canvas: ReactNode
  /** Keyboard shortcuts dispatched while the shell has window focus. */
  shortcuts?: DeviceFlowCanvasShellKeyboardShortcuts
  /** Stable identifier for diagnostics + e2e selectors. */
  profileKey: string
}

/**
 * Determines whether a KeyboardEvent target is a form field where we
 * should NOT intercept undo/redo (otherwise typing into a number input
 * would trigger an undo).
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}

export function DeviceFlowCanvasShell({
  toolbar,
  sidebar,
  sidebarSide = 'right',
  canvas,
  shortcuts,
  profileKey,
}: DeviceFlowCanvasShellProps) {
  useEffect(() => {
    if (!shortcuts) return
    const onKey = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return

      const mod = event.metaKey || event.ctrlKey
      if (!mod) return

      const lower = event.key.toLowerCase()
      if (lower === 'z' && !event.shiftKey && shortcuts.undo) {
        event.preventDefault()
        shortcuts.undo.handler()
        return
      }
      if ((lower === 'z' && event.shiftKey) || lower === 'y') {
        if (shortcuts.redo) {
          event.preventDefault()
          shortcuts.redo.handler()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcuts])

  return (
    <div
      className="device-flow-canvas-shell"
      data-profile-key={profileKey}
      data-sidebar-side={sidebarSide}
    >
      {toolbar ? <div className="device-flow-canvas-shell__toolbar">{toolbar}</div> : null}
      <div className="device-flow-canvas-shell__body">
        {sidebar && sidebarSide === 'left' ? (
          <aside className="device-flow-canvas-shell__sidebar device-flow-canvas-shell__sidebar--left">
            {sidebar}
          </aside>
        ) : null}
        <main className="device-flow-canvas-shell__canvas">{canvas}</main>
        {sidebar && sidebarSide === 'right' ? (
          <aside className="device-flow-canvas-shell__sidebar device-flow-canvas-shell__sidebar--right">
            {sidebar}
          </aside>
        ) : null}
      </div>
    </div>
  )
}
