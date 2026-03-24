export function normalizePatchbayTopologyNodeIds(rawNodes: unknown, fallbackPortIds: string[]): string[] {
  const topologyNodes = Array.isArray(rawNodes)
    ? rawNodes.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : []

  return topologyNodes.length > 0 ? topologyNodes : fallbackPortIds
}
