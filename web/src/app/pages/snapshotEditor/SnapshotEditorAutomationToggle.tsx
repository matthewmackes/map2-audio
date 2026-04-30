// SnapshotEditor automation floating toggle (T2473 part 14).
// Pure presentational sibling extracted from the page monolith.
// The Automation button floats above the workspace, gated by
// snapshotEntryRequired. Style + title flow in as props since
// they depend on the parent's automation state machine.

import type { CSSProperties } from 'react'

import { Button } from '@carbon/react'

export interface SnapshotEditorAutomationToggleProps {
  expanded: boolean
  onToggle: () => void
  disabled: boolean
  style: CSSProperties
  title: string
}

export function SnapshotEditorAutomationToggle({
  expanded,
  onToggle,
  disabled,
  style,
  title,
}: SnapshotEditorAutomationToggleProps) {
  return (
    <Button
      size="sm"
      kind="secondary"
      className={`juce-grid-page__automation-floating-toggle ${expanded ? 'is-expanded' : ''}`}
      style={style}
      onClick={onToggle}
      disabled={disabled}
      aria-controls="juce-grid-automation-panel"
      aria-expanded={expanded}
      aria-label={expanded ? 'Hide automation toolbar' : 'Show automation toolbar'}
      title={title}
    >
      Automation
    </Button>
  )
}
