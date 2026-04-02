import type { ChainPlugin, PluginLoaderState, SnapshotPlugin } from '../../map2/types'

export const SNAPSHOT_SYSTEM_BLOCK_ROLE_NOISE_GATE = 'noise_gate'
export const SNAPSHOT_SYSTEM_BLOCK_BADGE_LABEL = 'SYS'
export const SNAPSHOT_SYSTEM_NOISE_GATE_URI = 'map2://juce/dynamics/gate'

type SystemBlockPlugin =
  | Pick<ChainPlugin, 'uri' | 'position' | 'loader_state'>
  | Pick<SnapshotPlugin, 'uri' | 'position' | 'loader_state'>

export function isSystemBlockLoaderState(
  loaderState: PluginLoaderState | null | undefined,
): boolean {
  return Boolean(
    loaderState
    && loaderState.system_block_locked
    && loaderState.system_block_role === SNAPSHOT_SYSTEM_BLOCK_ROLE_NOISE_GATE,
  )
}

export function isSystemNoiseGatePlugin(
  plugin: SystemBlockPlugin | null | undefined,
): boolean {
  return Boolean(
    plugin
    && plugin.uri === SNAPSHOT_SYSTEM_NOISE_GATE_URI
    && isSystemBlockLoaderState(plugin.loader_state),
  )
}

export function getSystemBlockBadgeLabel(
  plugin: SystemBlockPlugin | null | undefined,
): string | null {
  if (!plugin || !isSystemBlockLoaderState(plugin.loader_state)) {
    return null
  }
  return plugin.loader_state?.system_block_label || SNAPSHOT_SYSTEM_BLOCK_BADGE_LABEL
}
