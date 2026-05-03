type BuildAvbRoutingWorkspaceHrefArgs = {
  tesiraDeviceId?: string | null
  entityId?: string | null
  nodeId?: string | null
}

function normalizeValue(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export const AVB_ROUTING_WORKSPACE_PATH = '/avb/routing'

export function buildAvbRoutingWorkspaceHref({
  tesiraDeviceId,
  entityId,
  nodeId,
}: BuildAvbRoutingWorkspaceHrefArgs = {}): string {
  const searchParams = new URLSearchParams()
  const normalizedTesiraDeviceId = normalizeValue(tesiraDeviceId)
  const normalizedEntityId = normalizeValue(entityId)
  const normalizedNodeId = normalizeValue(nodeId)

  if (normalizedTesiraDeviceId) {
    searchParams.set('focusTesiraDevice', normalizedTesiraDeviceId)
  }

  if (normalizedEntityId) {
    searchParams.set('focusEntity', normalizedEntityId)
  }

  if (normalizedNodeId) {
    searchParams.set('focusNodeId', normalizedNodeId)
  }

  const search = searchParams.toString()
  return search ? `${AVB_ROUTING_WORKSPACE_PATH}?${search}` : AVB_ROUTING_WORKSPACE_PATH
}

export default buildAvbRoutingWorkspaceHref
