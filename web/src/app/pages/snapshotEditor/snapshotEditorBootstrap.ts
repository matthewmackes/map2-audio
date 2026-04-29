// SnapshotEditor module-init bootstrap helpers (T2467 follow-up).
// All zero-React, no-hook helpers consumed by the module-load
// store hydration sequence. Lives in its own file so the
// monolith can shrink and the bootstrap surface becomes
// independently testable.

import type { SnapshotDraftData } from '../../../map2/types'
import {
  FLOW_CARD_SLOT_COLORS,
} from '../../components/SnapshotEditor/snapshotEditorFlowCard'
import {
  createDefaultJuceGridFlowSlots,
  createDefaultJuceGridRouting,
  normalizeJuceGridStateSources,
} from '../../components/SnapshotEditor/snapshotEditorFlowState'
import { resolveSnapshotCreateDraft } from '../../components/SnapshotEditor/snapshotEditorEntryDraft'
import {
  DEFAULT_FLOW_COUNT,
  MAX_FLOWS,
  type FlowSlot,
  type RoutingConfig,
} from './snapshotEditorPageTypes'

// Re-exported here so call sites that previously read SLOT_COLORS
// from the monolith can import it from this module.
export const SLOT_COLORS = FLOW_CARD_SLOT_COLORS

export const FLOW_SLOT_NORMALIZATION_OPTIONS = {
  palette: SLOT_COLORS,
  defaultCount: DEFAULT_FLOW_COUNT,
  maxFlows: MAX_FLOWS,
}

export function createDefaultFlows(count: number = DEFAULT_FLOW_COUNT): FlowSlot[] {
  return createDefaultJuceGridFlowSlots(SLOT_COLORS, count)
}

export function createDefaultRouting(): RoutingConfig {
  return createDefaultJuceGridRouting()
}

export function createBlankSnapshotEditorDraft(): SnapshotDraftData {
  return resolveSnapshotCreateDraft(
    {
      flowSlots: [],
      routing: createDefaultRouting(),
      activeFlowIndex: 0,
      chains: {},
    },
    true,
    FLOW_SLOT_NORMALIZATION_OPTIONS,
  )
}

// Reads the first parseable JSON entry from any of the given
// localStorage keys (used to migrate operators forward from the
// pre-v2 storage keys without losing their saved state).
export function parseStoredGridJson(...keys: string[]): unknown {
  for (const key of keys) {
    const storedValue = localStorage.getItem(key)
    if (!storedValue) {
      continue
    }
    try {
      return JSON.parse(storedValue)
    } catch {
      /* unparseable storage value — try the next key */
    }
  }
  return null
}

export function normalizeRuntimeGridState(
  flowSlotSource: unknown,
  routingSource: unknown,
  activeIndexSource: unknown,
): { flowSlots: FlowSlot[]; routing: RoutingConfig; activeFlowIndex: number } {
  return normalizeJuceGridStateSources(
    flowSlotSource,
    routingSource,
    activeIndexSource,
    FLOW_SLOT_NORMALIZATION_OPTIONS,
  )
}

export function loadInitialJuceGridState(): {
  flowSlots: FlowSlot[]
  routing: RoutingConfig
  activeFlowIndex: number
} {
  return normalizeRuntimeGridState(
    parseStoredGridJson('map2_juce_grid_flows_v2', 'map2_grid_flows_v2'),
    parseStoredGridJson('map2_juce_grid_routing_v2', 'map2_grid_routing_v2'),
    localStorage.getItem('map2_juce_grid_active_v2') ??
      localStorage.getItem('map2_grid_active_v2'),
  )
}
