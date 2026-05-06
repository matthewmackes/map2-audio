// Snapshot editor "UI presentation" derivation hook
// (T2473 JSX partition — small UI-state derivations grouped).
//
// Consolidates four small but operator-visible UI-presentation memos:
//   - snapshotInspectorWorkspaceActionId — picks the active workspace
//     action ('version-history' | 'automation' | 'parameters' |
//     'directory' | 'signal-grid') based on which modal is open. Drives
//     SnapshotEditorSnapshotStatusPanel's nav highlight.
//   - automationToggleBottomOffset — pixel offset for the floating
//     automation toggle, accounting for the expanded panel.
//   - automationFloatingToggleStyle — CSS-in-JS style with safe-area-
//     inset bottom calc.
//   - automationFloatingToggleTitle — operator-readable status string
//     ("Recording • 3 lanes • Armed Foo Volume", etc.) shown as the
//     floating toggle's tooltip.
//
// Behavioral parity verbatim: same priority order in the action-id
// cascade, same offset math (12px base + automation panel height + 12
// px gap when expanded), same status cascade (recording > playing >
// ready > idle), same armed-lane suffix.

import type { CSSProperties } from 'react'
import { useMemo } from 'react'

import type { SnapshotEditorWorkspaceActionId } from '../../components/SnapshotEditor/SnapshotEditorSnapshotStatusPanel'

interface ArmedAutomationLane {
  parameterName: string
}

export interface UseSnapshotEditorUiPresentationArgs {
  // Workspace action-id inputs.
  showVersionHistoryModal: boolean
  automationTimelineExpanded: boolean
  effectModalOpen: boolean
  selectedPlugin: unknown | null
  showPluginBrowser: boolean
  // Automation toggle inputs.
  automationPanelHeight: number
  // Title inputs.
  snapshotEntryRequired: boolean
  automationRecording: boolean
  automationPlaying: boolean
  automationLanesLength: number
  armedAutomationLane: ArmedAutomationLane | null | undefined
}

export interface UseSnapshotEditorUiPresentationResult {
  snapshotInspectorWorkspaceActionId: SnapshotEditorWorkspaceActionId
  automationToggleBottomOffset: number
  automationFloatingToggleStyle: CSSProperties
  automationFloatingToggleTitle: string
}

export function useSnapshotEditorUiPresentation({
  showVersionHistoryModal,
  automationTimelineExpanded,
  effectModalOpen,
  selectedPlugin,
  showPluginBrowser,
  automationPanelHeight,
  snapshotEntryRequired,
  automationRecording,
  automationPlaying,
  automationLanesLength,
  armedAutomationLane,
}: UseSnapshotEditorUiPresentationArgs): UseSnapshotEditorUiPresentationResult {
  const snapshotInspectorWorkspaceActionId =
    useMemo<SnapshotEditorWorkspaceActionId>(() => {
      if (showVersionHistoryModal) {
        return 'version-history'
      }
      if (automationTimelineExpanded) {
        return 'automation'
      }
      if (effectModalOpen && selectedPlugin) {
        return 'parameters'
      }
      if (showPluginBrowser) {
        return 'directory'
      }
      return 'signal-grid'
    }, [
      automationTimelineExpanded,
      effectModalOpen,
      selectedPlugin,
      showPluginBrowser,
      showVersionHistoryModal,
    ])

  const automationToggleBottomOffset = useMemo(
    () => 12 + (automationTimelineExpanded ? automationPanelHeight + 12 : 0),
    [automationPanelHeight, automationTimelineExpanded],
  )

  const automationFloatingToggleStyle = useMemo<CSSProperties>(
    () => ({
      bottom: `calc(${automationToggleBottomOffset}px + env(safe-area-inset-bottom))`,
    }),
    [automationToggleBottomOffset],
  )

  const automationFloatingToggleTitle = useMemo(() => {
    if (snapshotEntryRequired) {
      return 'Load or create a snapshot to edit automation.'
    }
    const statusLabel = automationRecording
      ? 'Recording'
      : automationPlaying
        ? 'Playing'
        : automationLanesLength > 0
          ? 'Ready'
          : 'Idle'
    const armedLabel = armedAutomationLane
      ? ` • Armed ${armedAutomationLane.parameterName}`
      : ''
    return `${statusLabel} • ${automationLanesLength} lanes${armedLabel}`
  }, [
    armedAutomationLane,
    automationLanesLength,
    automationPlaying,
    automationRecording,
    snapshotEntryRequired,
  ])

  return {
    snapshotInspectorWorkspaceActionId,
    automationToggleBottomOffset,
    automationFloatingToggleStyle,
    automationFloatingToggleTitle,
  }
}
