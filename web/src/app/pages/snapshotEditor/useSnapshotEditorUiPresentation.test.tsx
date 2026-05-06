/**
 * T2473 cycle 7 follow-up — paired test for the slice 17 UI-presentation
 * hook. Pure derivation; no QueryClient needed.
 */
import { renderHook } from '@testing-library/react'

import { useSnapshotEditorUiPresentation } from './useSnapshotEditorUiPresentation'

const baseArgs = {
  showVersionHistoryModal: false,
  automationTimelineExpanded: false,
  effectModalOpen: false,
  selectedPlugin: null,
  showPluginBrowser: false,
  automationPanelHeight: 240,
  snapshotEntryRequired: false,
  automationRecording: false,
  automationPlaying: false,
  automationLanesLength: 0,
  armedAutomationLane: null,
}

describe('useSnapshotEditorUiPresentation', () => {
  describe('snapshotInspectorWorkspaceActionId cascade', () => {
    it('falls back to "signal-grid" when no modals are open', () => {
      const { result } = renderHook(() => useSnapshotEditorUiPresentation(baseArgs))
      expect(result.current.snapshotInspectorWorkspaceActionId).toBe('signal-grid')
    })

    it('returns "version-history" when showVersionHistoryModal is true', () => {
      const { result } = renderHook(() =>
        useSnapshotEditorUiPresentation({ ...baseArgs, showVersionHistoryModal: true }),
      )
      expect(result.current.snapshotInspectorWorkspaceActionId).toBe('version-history')
    })

    it('returns "automation" when automationTimelineExpanded (but no version-history)', () => {
      const { result } = renderHook(() =>
        useSnapshotEditorUiPresentation({
          ...baseArgs,
          automationTimelineExpanded: true,
        }),
      )
      expect(result.current.snapshotInspectorWorkspaceActionId).toBe('automation')
    })

    it('returns "parameters" when effectModal+selectedPlugin and no higher-priority modal', () => {
      const { result } = renderHook(() =>
        useSnapshotEditorUiPresentation({
          ...baseArgs,
          effectModalOpen: true,
          selectedPlugin: { uri: 'a' },
        }),
      )
      expect(result.current.snapshotInspectorWorkspaceActionId).toBe('parameters')
    })

    it('returns "directory" when showPluginBrowser', () => {
      const { result } = renderHook(() =>
        useSnapshotEditorUiPresentation({ ...baseArgs, showPluginBrowser: true }),
      )
      expect(result.current.snapshotInspectorWorkspaceActionId).toBe('directory')
    })

    it('priority: version-history beats every other open modal', () => {
      const { result } = renderHook(() =>
        useSnapshotEditorUiPresentation({
          ...baseArgs,
          showVersionHistoryModal: true,
          automationTimelineExpanded: true,
          effectModalOpen: true,
          selectedPlugin: { uri: 'a' },
          showPluginBrowser: true,
        }),
      )
      expect(result.current.snapshotInspectorWorkspaceActionId).toBe('version-history')
    })
  })

  describe('automationToggleBottomOffset', () => {
    it('returns 12 when the panel is collapsed', () => {
      const { result } = renderHook(() => useSnapshotEditorUiPresentation(baseArgs))
      expect(result.current.automationToggleBottomOffset).toBe(12)
    })

    it('returns 12 + panelHeight + 12 when expanded', () => {
      const { result } = renderHook(() =>
        useSnapshotEditorUiPresentation({
          ...baseArgs,
          automationTimelineExpanded: true,
          automationPanelHeight: 240,
        }),
      )
      expect(result.current.automationToggleBottomOffset).toBe(12 + 240 + 12)
    })
  })

  describe('automationFloatingToggleStyle', () => {
    it('uses the safe-area-inset bottom calc with the offset', () => {
      const { result } = renderHook(() => useSnapshotEditorUiPresentation(baseArgs))
      expect(result.current.automationFloatingToggleStyle).toEqual({
        bottom: 'calc(12px + env(safe-area-inset-bottom))',
      })
    })

    it('reflects expanded panel offset in the calc', () => {
      const { result } = renderHook(() =>
        useSnapshotEditorUiPresentation({
          ...baseArgs,
          automationTimelineExpanded: true,
          automationPanelHeight: 200,
        }),
      )
      expect(result.current.automationFloatingToggleStyle).toEqual({
        bottom: 'calc(224px + env(safe-area-inset-bottom))',
      })
    })
  })

  describe('automationFloatingToggleTitle', () => {
    it('returns the entry-required prompt when no snapshot loaded', () => {
      const { result } = renderHook(() =>
        useSnapshotEditorUiPresentation({ ...baseArgs, snapshotEntryRequired: true }),
      )
      expect(result.current.automationFloatingToggleTitle).toBe(
        'Load or create a snapshot to edit automation.',
      )
    })

    it('cascades Recording > Playing > Ready > Idle', () => {
      const r1 = renderHook(() =>
        useSnapshotEditorUiPresentation({
          ...baseArgs,
          automationRecording: true,
          automationLanesLength: 4,
        }),
      )
      expect(r1.result.current.automationFloatingToggleTitle).toBe('Recording • 4 lanes')

      const r2 = renderHook(() =>
        useSnapshotEditorUiPresentation({
          ...baseArgs,
          automationPlaying: true,
          automationLanesLength: 2,
        }),
      )
      expect(r2.result.current.automationFloatingToggleTitle).toBe('Playing • 2 lanes')

      const r3 = renderHook(() =>
        useSnapshotEditorUiPresentation({
          ...baseArgs,
          automationLanesLength: 1,
        }),
      )
      expect(r3.result.current.automationFloatingToggleTitle).toBe('Ready • 1 lanes')

      const r4 = renderHook(() => useSnapshotEditorUiPresentation(baseArgs))
      expect(r4.result.current.automationFloatingToggleTitle).toBe('Idle • 0 lanes')
    })

    it('appends armed-lane suffix when a lane is armed', () => {
      const { result } = renderHook(() =>
        useSnapshotEditorUiPresentation({
          ...baseArgs,
          automationRecording: true,
          automationLanesLength: 3,
          armedAutomationLane: { parameterName: 'Lead Volume' },
        }),
      )
      expect(result.current.automationFloatingToggleTitle).toBe(
        'Recording • 3 lanes • Armed Lead Volume',
      )
    })
  })
})
