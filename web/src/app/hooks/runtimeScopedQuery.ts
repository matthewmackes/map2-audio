import { withNodeQuery } from '../utils/clusterTransport'

export interface RuntimeQueryOptions {
  instanceId?: number | null
  pluginPosition?: number | null
  nodeId?: string | null
}

function hasScopedInstanceId(instanceId?: number | null): instanceId is number {
  return typeof instanceId === 'number' && Number.isFinite(instanceId) && instanceId > 0
}

function hasScopedPosition(pluginPosition?: number | null): pluginPosition is number {
  return typeof pluginPosition === 'number' && Number.isFinite(pluginPosition) && pluginPosition >= 0
}

export function withRuntimeQuery(path: string, options: RuntimeQueryOptions): string {
  const params = new URLSearchParams()

  if (hasScopedInstanceId(options.instanceId)) {
    params.set('instance_id', String(Math.trunc(options.instanceId)))
  }
  if (hasScopedPosition(options.pluginPosition)) {
    params.set('plugin_position', String(Math.trunc(options.pluginPosition)))
  }

  const scopedPath = params.size > 0 ? `${path}?${params.toString()}` : path
  return withNodeQuery(scopedPath, options.nodeId)
}
