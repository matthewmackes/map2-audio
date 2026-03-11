export function withNodeQuery(path: string, nodeId?: string | null): string {
  if (!nodeId || nodeId === 'all') return path
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}node_id=${encodeURIComponent(nodeId)}`
}

export function withNodeTopic(topic: string, nodeId?: string | null): string {
  if (!nodeId || nodeId === 'all') return topic
  return `node:${nodeId}/${topic}`
}

export function clusterScopeKey(nodeId?: string | null): string {
  if (!nodeId || nodeId === 'all') return 'local'
  return nodeId
}
