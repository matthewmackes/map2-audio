// SnapshotEditorPageContent type declarations + tightly-coupled
// constants extracted from the page monolith (T2468). Sibling
// modules (T2469-T2473) re-import shared shapes from here so the
// monolith stops being the canonical home for editor-local types.

import type { MIDIMappingV2 } from '../../../map2/types'

export interface FlowLevelControlProps {
  flowId: string
  flowLabel: string
  value: number
  onChange: (value: number) => void
  disabled?: boolean
}

export interface RoutingInspectorContent {
  heading: string
  summary: string
  tags: string[]
  rows: Array<{ label: string; value: string }>
}

export type LivePathArrowTone = 'active' | 'dim' | 'sidechain'
export type LivePathGroupKind =
  | 'series'
  | 'parallel'
  | 'ab'
  | 'morph'
  | 'sidechain'
  | 'inactive'

export interface FlowSlot {
  id: string
  chainId: number | null
  label: string
  color: string
  muted: boolean
  solo: boolean
  dryWetMix: number
}

export type RoutingMode =
  | 'parallel_blend'
  | 'ab_switch'
  | 'series'
  | 'parameter_morph'
  | 'sidechain'

export interface RoutingConfig {
  mode: RoutingMode
  activeSlotId: string | null
  blendPositions: Record<string, number>
  morphProgress: number
  morphSourceSlotId: string | null
  morphTargetSlotId: string | null
  seriesOrder: string[]
}

export type CompactTabId = 'grid' | 'editor' | 'routing' | 'presets'

export type JuceGridMidiScope = 'all' | 'active-chain' | 'selected-plugin'
export type ReorderDirection = 'left' | 'right'

export type MidiRangeDraft = {
  min: string
  max: string
  sourceMin: string
  sourceMax: string
}

export type ReorderPreviewState = {
  pluginUri: string
  pluginPosition: number
  targetUri: string
  targetPosition: number
  direction: ReorderDirection
} | null

export interface PendingTabletDeletePluginState {
  uri: string
  position: number
  name: string
}

// ============================================================================
// Tightly-coupled constants
// ============================================================================

export const MIN_FLOWS = 2
export const MAX_FLOWS = 6
export const DEFAULT_FLOW_COUNT = 3

export const COMPACT_TAB_ORDER: Array<{ id: CompactTabId; label: string }> = [
  { id: 'grid', label: 'Grid' },
  { id: 'editor', label: 'Editor' },
  { id: 'routing', label: 'Routing' },
  { id: 'presets', label: 'Presets' },
]

export const ROUTING_MODE_OPTIONS: Array<{
  id: RoutingMode
  label: string
  summary: string
}> = [
  { id: 'series', label: 'Series', summary: 'Sequentially process each flow before output.' },
  { id: 'parallel_blend', label: 'Parallel', summary: 'Run flows side-by-side and blend them together.' },
  { id: 'ab_switch', label: 'A/B', summary: 'Only one focus flow is active at a time.' },
  { id: 'parameter_morph', label: 'Morph', summary: 'Crossfade parameter states between two flows.' },
  { id: 'sidechain', label: 'Sidechain', summary: 'Drive one flow with another as control input.' },
]

export const MIDI_CURVE_LABELS: Record<MIDIMappingV2['curve_type'], string> = {
  linear: 'Linear',
  logarithmic: 'Log',
  exponential: 'Exp',
  s_curve: 'S-Curve',
}

export const KEYBOARD_SHORTCUT_SECTIONS: Array<{
  title: string
  rows: Array<{ keys: string[]; description: string }>
}> = [
  {
    title: 'Navigation',
    rows: [
      { keys: ['1-6'], description: 'Select flow slot' },
      { keys: ['Left', 'Right'], description: 'Navigate selected blocks' },
      { keys: ['Esc'], description: 'Close modal or clear selection' },
    ],
  },
  {
    title: 'Plugin actions',
    rows: [
      { keys: ['A'], description: 'Open block browser' },
      { keys: ['B'], description: 'Toggle bypass' },
      { keys: ['Delete'], description: 'Remove selected block' },
      { keys: ['I'], description: 'Open block details' },
      { keys: ['F'], description: 'Toggle favorite' },
    ],
  },
  {
    title: 'Chain actions',
    rows: [
      { keys: ['S'], description: 'Save preset' },
      { keys: ['Ctrl', 'Z'], description: 'Undo' },
      { keys: ['Ctrl', 'Y'], description: 'Redo' },
    ],
  },
  {
    title: 'General',
    rows: [
      { keys: ['?'], description: 'Toggle keyboard help' },
    ],
  },
]

export const JUCE_GRID_SELECTED_PLUGIN_KEY = 'map2_juce_grid_selected_plugin_uri'
export const JUCE_GRID_EFFECT_MODAL_OPEN_KEY = 'map2_juce_grid_effect_modal_open'
export const JUCE_GRID_SCROLL_TOP_KEY = 'map2_juce_grid_scroll_top'
