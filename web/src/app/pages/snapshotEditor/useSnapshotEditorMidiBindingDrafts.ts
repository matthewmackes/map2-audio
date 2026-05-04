import { useEffect, useMemo } from 'react'
import type { ChainPlugin } from '../../../map2/types'
import type { FootswitchLabelDrafts, Updater } from '../../stores/snapshotEditorStore'
import type {
  SnapshotAbSwitchMidiBinding,
  SnapshotAbSwitchMidiMessageType,
} from '../../utils/snapshotAbSwitchMidi'
import type { SnapshotBlockFocusRange } from '../../utils/snapshotBlockFocus'
import type { SnapshotFootswitchLabelMap } from '../../utils/snapshotFootswitchLabels'

interface UseSnapshotEditorMidiBindingDraftsArgs {
  activeSnapshotId: number | null | undefined
  snapshotEditingLocked: boolean
  currentChainPlugins: ChainPlugin[] | undefined

  snapshotAbSwitchMidiBinding: SnapshotAbSwitchMidiBinding | null
  snapshotBlockFocusRange: SnapshotBlockFocusRange | null
  snapshotFootswitchLabelMap: SnapshotFootswitchLabelMap

  abSwitchMidiMessageTypeDraft: SnapshotAbSwitchMidiMessageType
  abSwitchMidiChannelDraft: string
  abSwitchMidiNumberDraft: number
  blockFocusMidiChannelDraft: string
  blockFocusStartNoteDraft: number
  footswitchLabelDrafts: FootswitchLabelDrafts

  setAbSwitchMidiMessageTypeDraft: (value: Updater<SnapshotAbSwitchMidiMessageType>) => void
  setAbSwitchMidiChannelDraft: (value: Updater<string>) => void
  setAbSwitchMidiNumberDraft: (value: Updater<number>) => void
  setBlockFocusMidiChannelDraft: (value: Updater<string>) => void
  setBlockFocusStartNoteDraft: (value: Updater<number>) => void
  setFootswitchLabelDrafts: (value: Updater<FootswitchLabelDrafts>) => void
}

export interface UseSnapshotEditorMidiBindingDraftsResult {
  blockFocusPlugins: ChainPlugin[]
  maxBlockFocusStartNote: number
  blockFocusStartNote: number
  blockFocusStartNoteOverflow: boolean
  blockFocusSaveDisabled: boolean
  abSwitchMidiSaveDisabled: boolean
  footswitchLabelsSaveDisabled: boolean
}

export function useSnapshotEditorMidiBindingDrafts(
  args: UseSnapshotEditorMidiBindingDraftsArgs,
): UseSnapshotEditorMidiBindingDraftsResult {
  const {
    activeSnapshotId,
    snapshotEditingLocked,
    currentChainPlugins,
    snapshotAbSwitchMidiBinding,
    snapshotBlockFocusRange,
    snapshotFootswitchLabelMap,
    abSwitchMidiMessageTypeDraft,
    abSwitchMidiChannelDraft,
    abSwitchMidiNumberDraft,
    blockFocusMidiChannelDraft,
    blockFocusStartNoteDraft,
    footswitchLabelDrafts,
    setAbSwitchMidiMessageTypeDraft,
    setAbSwitchMidiChannelDraft,
    setAbSwitchMidiNumberDraft,
    setBlockFocusMidiChannelDraft,
    setBlockFocusStartNoteDraft,
    setFootswitchLabelDrafts,
  } = args

  const blockFocusPlugins = currentChainPlugins ?? []
  const maxBlockFocusStartNote = Math.max(0, 127 - Math.max(0, blockFocusPlugins.length - 1))
  const blockFocusStartNote = Math.max(0, Math.min(127, Math.trunc(blockFocusStartNoteDraft)))
  const blockFocusStartNoteOverflow = blockFocusPlugins.length > 0 && blockFocusStartNote > maxBlockFocusStartNote

  const hasActiveSnapshot = activeSnapshotId != null

  const blockFocusSaveDisabled = (
    snapshotEditingLocked
    || !hasActiveSnapshot
    || blockFocusPlugins.length === 0
    || blockFocusStartNoteOverflow
  )

  const abSwitchMidiSaveDisabled = (
    snapshotEditingLocked
    || !hasActiveSnapshot
    || (
      snapshotAbSwitchMidiBinding?.messageType === abSwitchMidiMessageTypeDraft
      && (snapshotAbSwitchMidiBinding?.midiChannel ?? null) === (abSwitchMidiChannelDraft === 'omni' ? null : Number.parseInt(abSwitchMidiChannelDraft, 10))
      && (snapshotAbSwitchMidiBinding?.number ?? null) === abSwitchMidiNumberDraft
    )
  )

  const footswitchLabelsSaveDisabled = useMemo(
    () => (
      snapshotEditingLocked
      || !hasActiveSnapshot
      || JSON.stringify(footswitchLabelDrafts) === JSON.stringify(snapshotFootswitchLabelMap)
    ),
    [snapshotEditingLocked, hasActiveSnapshot, footswitchLabelDrafts, snapshotFootswitchLabelMap],
  )

  useEffect(() => {
    setAbSwitchMidiMessageTypeDraft(snapshotAbSwitchMidiBinding?.messageType ?? 'cc_toggle')
    setAbSwitchMidiChannelDraft(snapshotAbSwitchMidiBinding?.midiChannel == null ? 'omni' : String(snapshotAbSwitchMidiBinding.midiChannel))
    setAbSwitchMidiNumberDraft(snapshotAbSwitchMidiBinding?.number ?? 80)
  }, [activeSnapshotId, snapshotAbSwitchMidiBinding])

  useEffect(() => {
    setBlockFocusMidiChannelDraft(snapshotBlockFocusRange?.midiChannel == null ? 'omni' : String(snapshotBlockFocusRange.midiChannel))
    setBlockFocusStartNoteDraft(snapshotBlockFocusRange?.startNote ?? 60)
  }, [snapshotBlockFocusRange?.midiChannel, snapshotBlockFocusRange?.startNote, activeSnapshotId])

  useEffect(() => {
    setFootswitchLabelDrafts(snapshotFootswitchLabelMap)
  }, [activeSnapshotId, snapshotFootswitchLabelMap])

  return {
    blockFocusPlugins,
    maxBlockFocusStartNote,
    blockFocusStartNote,
    blockFocusStartNoteOverflow,
    blockFocusSaveDisabled,
    abSwitchMidiSaveDisabled,
    footswitchLabelsSaveDisabled,
  }
}
