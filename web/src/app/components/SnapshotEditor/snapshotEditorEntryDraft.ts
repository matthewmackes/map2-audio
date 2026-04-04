import type { SnapshotDraftData } from '../../../map2/types'
import {
  createDefaultJuceGridFlowSlots,
  createDefaultJuceGridRouting,
  normalizeJuceGridStateSources,
  type JuceGridFlowNormalizationOptions,
} from './snapshotEditorFlowState'

export function createBlankSnapshotEditorDraft(
  options: JuceGridFlowNormalizationOptions,
): SnapshotDraftData {
  const normalized = normalizeJuceGridStateSources(
    createDefaultJuceGridFlowSlots(options.palette, options.defaultCount),
    createDefaultJuceGridRouting(),
    0,
    options,
  )

  return {
    flowSlots: normalized.flowSlots.map((slot) => ({ ...slot })),
    routing: {
      ...normalized.routing,
      blendPositions: { ...normalized.routing.blendPositions },
      seriesOrder: [...normalized.routing.seriesOrder],
    },
    activeFlowIndex: normalized.activeFlowIndex,
    chains: {},
  }
}

export function resolveSnapshotCreateDraft(
  currentDraft: SnapshotDraftData,
  snapshotEntryRequired: boolean,
  options: JuceGridFlowNormalizationOptions,
): SnapshotDraftData {
  return snapshotEntryRequired
    ? createBlankSnapshotEditorDraft(options)
    : currentDraft
}

export function createBlankSnapshotEditorAddEffectDraft(
  chainName: string,
  options: JuceGridFlowNormalizationOptions,
): SnapshotDraftData {
  const draft = createBlankSnapshotEditorDraft(options)
  const entryFlow = draft.flowSlots[draft.activeFlowIndex] ?? draft.flowSlots[0]
  if (!entryFlow) {
    return draft
  }

  const entryChainId = 1
  entryFlow.chainId = entryChainId
  draft.routing.activeSlotId = entryFlow.id
  draft.chains[String(entryChainId)] = {
    name: chainName,
    plugins: [],
  }

  return draft
}
