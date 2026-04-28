import { NODE_PAGE_KEYS } from './nodeDisplay'

type SetViewedNode = (pageKey: string, nodeId: string) => void

export const VIEWED_HOST_QUERY_PARAM = 'viewedHost'

export function applyViewedNodeScopeToAllPages(setViewedNode: SetViewedNode, nodeId: string) {
  const normalizedNodeId = nodeId.trim()
  if (!normalizedNodeId) {
    return
  }

  const pageKeys = Array.from(new Set(Object.values(NODE_PAGE_KEYS)))
  for (const pageKey of pageKeys) {
    setViewedNode(pageKey, normalizedNodeId)
  }
}

export function readViewedHostFromSearch(search: string): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const value = params.get(VIEWED_HOST_QUERY_PARAM)?.trim()
  return value || null
}

export function writeViewedHostToSearch(search: string, nodeId: string): string {
  const normalizedNodeId = nodeId.trim()
  if (!normalizedNodeId) {
    return search
  }

  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  params.set(VIEWED_HOST_QUERY_PARAM, normalizedNodeId)
  const encoded = params.toString()
  return encoded ? `?${encoded}` : ''
}
