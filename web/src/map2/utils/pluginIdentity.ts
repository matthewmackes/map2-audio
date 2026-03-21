import type { ChainPlugin, PluginOrderRef } from '../types'

type PluginIdentityLike = Pick<ChainPlugin, 'uri' | 'position' | 'instance_id'> | PluginOrderRef

function isFiniteNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function hasInstanceId(plugin: PluginIdentityLike): plugin is Pick<ChainPlugin, 'uri' | 'position' | 'instance_id'> {
  return 'instance_id' in plugin
}

export function buildPluginOrderRef(plugin: PluginIdentityLike): PluginOrderRef {
  return {
    uri: plugin.uri,
    position: plugin.position,
  }
}

export function getPluginIdentityKey(plugin: PluginIdentityLike): string {
  if (hasInstanceId(plugin) && isFiniteNonNegativeInteger(plugin.instance_id) && plugin.instance_id > 0) {
    return `instance:${plugin.instance_id}`
  }
  return `position:${plugin.uri}:${plugin.position}`
}

export function getPluginIdentityKeyFromParts(
  uri: string,
  position?: number | null,
  instanceId?: number | null,
): string {
  if (isFiniteNonNegativeInteger(instanceId) && instanceId > 0) {
    return `instance:${instanceId}`
  }
  if (isFiniteNonNegativeInteger(position)) {
    return `position:${uri}:${position}`
  }
  return `uri:${uri}`
}

export function samePluginIdentity(
  left: PluginIdentityLike | null | undefined,
  right: PluginIdentityLike | null | undefined,
): boolean {
  if (!left || !right) {
    return false
  }
  return left.uri === right.uri && left.position === right.position
}
