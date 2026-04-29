// SnapshotEditorPageContent helpers — pure data manipulation
// extracted from the page monolith (T2467). These functions have
// no React or hook dependencies; they can be unit-tested in
// isolation and re-imported by sibling modules during the rest of
// the T2467-T2473 decomposition epic.

import type {
  ChainSnapshot,
  SnapshotDetail,
  SnapshotDraftData,
} from '../../../map2/types'

// Minimal shape consumed by `describeFlowUpdate`. The full
// `FlowSlot` type lives in the monolith for now and will be moved
// to a sibling types module in T2468; redefining the slim shape
// here keeps T2467 self-contained without forcing a circular
// dependency.
export interface FlowSlotUpdateShape {
  label?: string
  chainId?: number | null
  solo?: boolean
  muted?: boolean
  dryWetMix?: number
}

export function cloneSnapshotDraftData(data: SnapshotDraftData): SnapshotDraftData {
  return JSON.parse(JSON.stringify(data)) as SnapshotDraftData
}

export function fingerprintSnapshotDraftData(data: SnapshotDraftData): string {
  return JSON.stringify(data)
}

export function snapshotDraftsEqual(
  left: SnapshotDraftData,
  right: SnapshotDraftData,
): boolean {
  return fingerprintSnapshotDraftData(left) === fingerprintSnapshotDraftData(right)
}

export function resequenceChainSnapshotPlugins(chain: ChainSnapshot): ChainSnapshot {
  return {
    ...chain,
    plugins: chain.plugins.map((plugin, index) => ({
      ...plugin,
      position: index,
    })),
  }
}

export function updateDraftChain(
  draft: SnapshotDraftData,
  chainId: number,
  updater: (chain: ChainSnapshot) => ChainSnapshot,
): SnapshotDraftData {
  const chainKey = String(chainId)
  const chain = draft.chains[chainKey]
  if (!chain) {
    return draft
  }
  draft.chains[chainKey] = updater(chain)
  return draft
}

export function describeLoaderStateDraftChange(pluginUri: string): string {
  if (pluginUri === 'map2://juce/nam' || pluginUri === 'urn:map2:nam-player') {
    return 'Assign NAM model'
  }
  if (pluginUri === 'map2://juce/convolution/cabinet' || pluginUri === 'urn:map2:ir-cabinet') {
    return 'Assign cabinet IR'
  }
  if (pluginUri === 'map2://juce/convolution/reverb' || pluginUri === 'urn:map2:ir-reverb') {
    return 'Assign reverb IR'
  }
  return 'Update loader state'
}

export function mergePreviewIntoSnapshotDetail(
  previewDetail: SnapshotDetail,
  snapshot: SnapshotDetail | null,
): SnapshotDetail {
  if (!snapshot) {
    return previewDetail
  }

  return {
    ...snapshot,
    ...previewDetail,
    id: snapshot.id,
    name: snapshot.name,
    description: snapshot.description,
    tags: snapshot.tags,
    program_number: snapshot.program_number,
    tempo_bpm: snapshot.tempo_bpm,
    live_tempo_bpm: snapshot.live_tempo_bpm,
    active_tempo_bpm: snapshot.active_tempo_bpm,
    tempo_source: snapshot.tempo_source,
    tempo_updated_at: snapshot.tempo_updated_at,
    output_level_reference_dbfs: snapshot.output_level_reference_dbfs,
    output_level_warning_threshold_db: snapshot.output_level_warning_threshold_db,
    input_device: snapshot.input_device,
    output_device: snapshot.output_device,
    io_bindings: snapshot.io_bindings,
    controls: snapshot.controls,
    midi_map: snapshot.midi_map,
    is_active: snapshot.is_active,
    is_favorite: snapshot.is_favorite,
    is_locked: snapshot.is_locked,
    display_order: snapshot.display_order,
    community_uuid: snapshot.community_uuid,
    community_shared: snapshot.community_shared,
    community_author: snapshot.community_author,
    community_download_count: snapshot.community_download_count,
    community_rating: snapshot.community_rating,
    community_rating_count: snapshot.community_rating_count,
    activated_at: snapshot.activated_at,
    created_at: snapshot.created_at,
    updated_at: snapshot.updated_at,
    deployments: snapshot.deployments,
  }
}

// Returns true when the given DOM EventTarget is a text-entry
// surface (input / textarea / select / contenteditable). Used to
// guard global keyboard shortcuts so typing into the page's
// scattered TextInput / TextArea fields doesn't trigger them.
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  const tagName = target.tagName
  return (
    target.isContentEditable ||
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT'
  )
}

export interface ActivationProgressMetrics {
  currentPhase: string | null
  status: string | null
  note: string | null
  completedPhases: string[]
}

// Reads a single activation-progress payload out of a runtime
// metrics envelope. Returns null when the payload is missing or
// malformed; sanitizes string fields (uppercase phase names,
// lowercase status, trimmed note).
export function extractActivationProgressMetrics(
  event: { runtime_metrics?: Record<string, unknown> } | null | undefined,
): ActivationProgressMetrics | null {
  const runtimeMetrics = event?.runtime_metrics
  if (!runtimeMetrics || typeof runtimeMetrics !== 'object') {
    return null
  }

  const activationProgress = runtimeMetrics.activation_progress
  if (
    !activationProgress ||
    typeof activationProgress !== 'object' ||
    Array.isArray(activationProgress)
  ) {
    return null
  }

  const payload = activationProgress as Record<string, unknown>
  const completedPhases = Array.isArray(payload.completed_phases)
    ? payload.completed_phases
        .map((entry) => (typeof entry === 'string' ? entry.toUpperCase() : null))
        .filter((entry): entry is string => entry !== null)
    : []

  return {
    currentPhase:
      typeof payload.current_phase === 'string' ? payload.current_phase.toUpperCase() : null,
    status: typeof payload.status === 'string' ? payload.status.toLowerCase() : null,
    note:
      typeof payload.note === 'string' && payload.note.trim().length > 0
        ? payload.note.trim()
        : null,
    completedPhases,
  }
}

export function describeFlowUpdate(updates: FlowSlotUpdateShape): string {
  if (typeof updates.label === 'string') {
    return 'Rename channel'
  }
  if (typeof updates.chainId !== 'undefined') {
    return 'Reassign channel'
  }
  if (typeof updates.solo === 'boolean') {
    return updates.solo ? 'Enable channel solo' : 'Disable channel solo'
  }
  if (typeof updates.muted === 'boolean') {
    return updates.muted ? 'Mute channel' : 'Unmute channel'
  }
  if (typeof updates.dryWetMix === 'number') {
    return 'Adjust channel mix'
  }
  return 'Edit channel'
}
