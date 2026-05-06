/**
 * T2473 cycle 20 — paired test for useSnapshotEditorMidiBindingDrafts.
 *
 * Pure derivation hook with three sync effects (resetting drafts when
 * the active snapshot or its bound state changes). Tests cover the
 * derived save-disabled logic + the start-note clamp/overflow + the
 * draft-reset effects.
 */
import { renderHook } from '@testing-library/react'

import { useSnapshotEditorMidiBindingDrafts } from './useSnapshotEditorMidiBindingDrafts'

function makeArgs(over: Partial<Parameters<typeof useSnapshotEditorMidiBindingDrafts>[0]> = {}) {
  const setAbSwitchMidiMessageTypeDraft = jest.fn()
  const setAbSwitchMidiChannelDraft     = jest.fn()
  const setAbSwitchMidiNumberDraft      = jest.fn()
  const setBlockFocusMidiChannelDraft   = jest.fn()
  const setBlockFocusStartNoteDraft     = jest.fn()
  const setFootswitchLabelDrafts        = jest.fn()
  const args = {
    activeSnapshotId: 42,
    snapshotEditingLocked: false,
    currentChainPlugins: [],
    snapshotAbSwitchMidiBinding: null,
    snapshotBlockFocusRange: null,
    snapshotFootswitchLabelMap: {},
    abSwitchMidiMessageTypeDraft: 'cc_toggle' as const,
    abSwitchMidiChannelDraft: 'omni',
    abSwitchMidiNumberDraft: 80,
    blockFocusMidiChannelDraft: 'omni',
    blockFocusStartNoteDraft: 60,
    footswitchLabelDrafts: {},
    setAbSwitchMidiMessageTypeDraft,
    setAbSwitchMidiChannelDraft,
    setAbSwitchMidiNumberDraft,
    setBlockFocusMidiChannelDraft,
    setBlockFocusStartNoteDraft,
    setFootswitchLabelDrafts,
    ...over,
  } as unknown as Parameters<typeof useSnapshotEditorMidiBindingDrafts>[0]
  return {
    args,
    setters: {
      setAbSwitchMidiMessageTypeDraft,
      setAbSwitchMidiChannelDraft,
      setAbSwitchMidiNumberDraft,
      setBlockFocusMidiChannelDraft,
      setBlockFocusStartNoteDraft,
      setFootswitchLabelDrafts,
    },
  }
}

describe('useSnapshotEditorMidiBindingDrafts', () => {
  describe('blockFocus derivation', () => {
    it('blockFocusPlugins falls back to [] when undefined', () => {
      const { args } = makeArgs({ currentChainPlugins: undefined })
      const { result } = renderHook(() => useSnapshotEditorMidiBindingDrafts(args))
      expect(result.current.blockFocusPlugins).toEqual([])
    })

    it('blockFocusStartNote clamps draft to [0, 127] and truncates fractions', () => {
      const a = makeArgs({ blockFocusStartNoteDraft: -5 })
      expect(renderHook(() => useSnapshotEditorMidiBindingDrafts(a.args)).result.current.blockFocusStartNote).toBe(0)
      const b = makeArgs({ blockFocusStartNoteDraft: 200 })
      expect(renderHook(() => useSnapshotEditorMidiBindingDrafts(b.args)).result.current.blockFocusStartNote).toBe(127)
      const c = makeArgs({ blockFocusStartNoteDraft: 60.9 })
      expect(renderHook(() => useSnapshotEditorMidiBindingDrafts(c.args)).result.current.blockFocusStartNote).toBe(60)
    })

    it('maxBlockFocusStartNote = 127 - (pluginCount - 1) when plugins present', () => {
      const plugins = Array(5).fill({ uri: 'x' }) as unknown as Parameters<typeof useSnapshotEditorMidiBindingDrafts>[0]['currentChainPlugins']
      const { args } = makeArgs({ currentChainPlugins: plugins })
      const { result } = renderHook(() => useSnapshotEditorMidiBindingDrafts(args))
      expect(result.current.maxBlockFocusStartNote).toBe(127 - 4)
    })

    it('blockFocusStartNoteOverflow flags note > maxBlockFocusStartNote when plugins present', () => {
      const plugins = Array(5).fill({ uri: 'x' }) as unknown as Parameters<typeof useSnapshotEditorMidiBindingDrafts>[0]['currentChainPlugins']
      const { args } = makeArgs({ currentChainPlugins: plugins, blockFocusStartNoteDraft: 125 })
      const { result } = renderHook(() => useSnapshotEditorMidiBindingDrafts(args))
      expect(result.current.maxBlockFocusStartNote).toBe(123)
      expect(result.current.blockFocusStartNoteOverflow).toBe(true)
    })

    it('blockFocusStartNoteOverflow false when there are no plugins', () => {
      const { args } = makeArgs({ currentChainPlugins: [], blockFocusStartNoteDraft: 200 })
      const { result } = renderHook(() => useSnapshotEditorMidiBindingDrafts(args))
      expect(result.current.blockFocusStartNoteOverflow).toBe(false)
    })
  })

  describe('save-disabled flags', () => {
    it('blockFocusSaveDisabled = true when no active snapshot', () => {
      const { args } = makeArgs({ activeSnapshotId: null })
      const { result } = renderHook(() => useSnapshotEditorMidiBindingDrafts(args))
      expect(result.current.blockFocusSaveDisabled).toBe(true)
    })

    it('blockFocusSaveDisabled = true when editing is locked', () => {
      const plugins = Array(2).fill({ uri: 'x' }) as unknown as Parameters<typeof useSnapshotEditorMidiBindingDrafts>[0]['currentChainPlugins']
      const { args } = makeArgs({ snapshotEditingLocked: true, currentChainPlugins: plugins })
      const { result } = renderHook(() => useSnapshotEditorMidiBindingDrafts(args))
      expect(result.current.blockFocusSaveDisabled).toBe(true)
    })

    it('blockFocusSaveDisabled = true when no plugins', () => {
      const { args } = makeArgs({ currentChainPlugins: [] })
      const { result } = renderHook(() => useSnapshotEditorMidiBindingDrafts(args))
      expect(result.current.blockFocusSaveDisabled).toBe(true)
    })

    it('blockFocusSaveDisabled = false when active snapshot, plugins present, no lock, no overflow', () => {
      const plugins = Array(2).fill({ uri: 'x' }) as unknown as Parameters<typeof useSnapshotEditorMidiBindingDrafts>[0]['currentChainPlugins']
      const { args } = makeArgs({ currentChainPlugins: plugins, blockFocusStartNoteDraft: 60 })
      const { result } = renderHook(() => useSnapshotEditorMidiBindingDrafts(args))
      expect(result.current.blockFocusSaveDisabled).toBe(false)
    })

    it('abSwitchMidiSaveDisabled = true when draft matches existing binding', () => {
      const { args } = makeArgs({
        snapshotAbSwitchMidiBinding: {
          messageType: 'cc_toggle',
          midiChannel: null,  // omni
          number: 80,
        } as never,
        abSwitchMidiMessageTypeDraft: 'cc_toggle',
        abSwitchMidiChannelDraft: 'omni',
        abSwitchMidiNumberDraft: 80,
      })
      const { result } = renderHook(() => useSnapshotEditorMidiBindingDrafts(args))
      expect(result.current.abSwitchMidiSaveDisabled).toBe(true)
    })

    it('abSwitchMidiSaveDisabled = false when number draft differs', () => {
      const { args } = makeArgs({
        snapshotAbSwitchMidiBinding: {
          messageType: 'cc_toggle',
          midiChannel: null,
          number: 80,
        } as never,
        abSwitchMidiNumberDraft: 81,
      })
      const { result } = renderHook(() => useSnapshotEditorMidiBindingDrafts(args))
      expect(result.current.abSwitchMidiSaveDisabled).toBe(false)
    })

    it('footswitchLabelsSaveDisabled = true when drafts match map', () => {
      const labels = { fs1: 'A', fs2: 'B' }
      const { args } = makeArgs({
        snapshotFootswitchLabelMap: labels as never,
        footswitchLabelDrafts: labels as never,
      })
      const { result } = renderHook(() => useSnapshotEditorMidiBindingDrafts(args))
      expect(result.current.footswitchLabelsSaveDisabled).toBe(true)
    })

    it('footswitchLabelsSaveDisabled = false when drafts diverge', () => {
      const { args } = makeArgs({
        snapshotFootswitchLabelMap: { fs1: 'A' } as never,
        footswitchLabelDrafts: { fs1: 'B' } as never,
      })
      const { result } = renderHook(() => useSnapshotEditorMidiBindingDrafts(args))
      expect(result.current.footswitchLabelsSaveDisabled).toBe(false)
    })
  })

  describe('draft-reset effects on mount', () => {
    it('resets ab-switch + block-focus + footswitch drafts from the bound state', () => {
      const labels = { fs1: 'X' }
      const { args, setters } = makeArgs({
        snapshotAbSwitchMidiBinding: {
          messageType: 'note_toggle',
          midiChannel: 9,
          number: 64,
        } as never,
        snapshotBlockFocusRange: { midiChannel: 5, startNote: 36 } as never,
        snapshotFootswitchLabelMap: labels as never,
      })
      renderHook(() => useSnapshotEditorMidiBindingDrafts(args))
      expect(setters.setAbSwitchMidiMessageTypeDraft).toHaveBeenCalledWith('note_toggle')
      expect(setters.setAbSwitchMidiChannelDraft).toHaveBeenCalledWith('9')
      expect(setters.setAbSwitchMidiNumberDraft).toHaveBeenCalledWith(64)
      expect(setters.setBlockFocusMidiChannelDraft).toHaveBeenCalledWith('5')
      expect(setters.setBlockFocusStartNoteDraft).toHaveBeenCalledWith(36)
      expect(setters.setFootswitchLabelDrafts).toHaveBeenCalledWith(labels)
    })

    it('uses defaults when bound state is null/undefined', () => {
      const { args, setters } = makeArgs()
      renderHook(() => useSnapshotEditorMidiBindingDrafts(args))
      expect(setters.setAbSwitchMidiMessageTypeDraft).toHaveBeenCalledWith('cc_toggle')
      expect(setters.setAbSwitchMidiChannelDraft).toHaveBeenCalledWith('omni')
      expect(setters.setAbSwitchMidiNumberDraft).toHaveBeenCalledWith(80)
      expect(setters.setBlockFocusMidiChannelDraft).toHaveBeenCalledWith('omni')
      expect(setters.setBlockFocusStartNoteDraft).toHaveBeenCalledWith(60)
    })
  })
})
