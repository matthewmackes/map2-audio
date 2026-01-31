/**
 * Horizontal Signal Chain Component Types
 *
 * Audio effect icons from PiPedal project
 * https://github.com/rerdavies/pipedal
 * MIT License - Robin E. R. Davies
 */

import type { ChainPlugin, Plugin } from '../../../map2/types'

/** Sidechain source options for a plugin */
export interface SidechainSource {
  /** Unique identifier for the source */
  id: string
  /** Display name */
  name: string
  /** Chain label (A, B, C, etc.) */
  chainLabel?: string
  /** Type of source */
  type: 'chain' | 'plugin' | 'external'
}

export interface HorizontalSignalChainProps {
  /** Array of plugins in the chain */
  plugins: ChainPlugin[]
  /** Plugin metadata lookup */
  pluginMeta: Record<string, Plugin>
  /** Currently selected plugin URI */
  selectedPluginUri: string | null
  /** Callback when a plugin is selected */
  onPluginSelect: (uri: string) => void
  /** Callback when plugins are reordered */
  onPluginReorder: (pluginUris: string[]) => void
  /** Callback to toggle plugin bypass state */
  onToggleBypass: (uri: string, bypassed: boolean) => void
  /** Callback to delete a plugin */
  onDeletePlugin?: (uri: string) => void
  /** Callback when sidechain config is requested for a plugin */
  onSidechainConfig?: (uri: string) => void
  /** Available sidechain sources */
  sidechainSources?: SidechainSource[]
  /** Chain label for this signal chain (A, B, C, etc.) */
  chainLabel?: string
  /** Whether the chain is active (processing audio) */
  isActive?: boolean
}

export interface HorizontalPluginNodeProps {
  /** The plugin instance data */
  plugin: ChainPlugin
  /** Plugin metadata (name, category, parameters, etc.) */
  meta?: Plugin
  /** Whether this plugin is currently selected */
  isSelected: boolean
  /** Callback when plugin is clicked */
  onSelect: () => void
  /** Callback to toggle bypass */
  onToggleBypass: () => void
  /** Callback to delete plugin */
  onDelete?: () => void
  /** Callback when sidechain button is clicked */
  onSidechainClick?: () => void
  /** Drag event handlers */
  onDragStart?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  onDragEnd?: (e: React.DragEvent) => void
}

export interface HorizontalConnectorProps {
  /** Whether signal is flowing through this connector */
  isActive?: boolean
}

export interface PluginTooltipProps {
  /** The plugin instance data */
  plugin: ChainPlugin
  /** Plugin metadata */
  meta?: Plugin
  /** Whether the tooltip is visible */
  isOpen: boolean
  /** Anchor element for positioning */
  anchorRef: React.RefObject<HTMLElement>
}

/** Icon name type for effect categories */
export type FxIconName =
  | 'fx_amplifier'
  | 'fx_analyzer'
  | 'fx_chorus'
  | 'fx_compressor'
  | 'fx_constant'
  | 'fx_converter'
  | 'fx_delay'
  | 'fx_dial'
  | 'fx_distortion'
  | 'fx_empty'
  | 'fx_eq'
  | 'fx_error'
  | 'fx_filter'
  | 'fx_filter_hp'
  | 'fx_flanger'
  | 'fx_flanger2'
  | 'fx_function'
  | 'fx_gate'
  | 'fx_generator'
  | 'fx_instrument'
  | 'fx_limiter'
  | 'fx_lr'
  | 'fx_mixer'
  | 'fx_modulator'
  | 'fx_nam'
  | 'fx_oscillator'
  | 'fx_parametric_eq'
  | 'fx_phaser'
  | 'fx_pitch'
  | 'fx_plugin'
  | 'fx_reverb'
  | 'fx_simulator'
  | 'fx_spatial'
  | 'fx_spectral'
  | 'fx_split_a'
  | 'fx_split_b'
  | 'fx_terminal'
  | 'fx_utility'
