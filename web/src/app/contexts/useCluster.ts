import { useContext } from 'react'
import { ClusterContext, type ClusterContextValue } from './ClusterContextStore'

export function useCluster(): ClusterContextValue {
  const ctx = useContext(ClusterContext)
  if (!ctx) {
    throw new Error('useCluster must be used within a ClusterProvider')
  }
  return ctx
}

export function useNodeApiParams() {
  const { activeNodeId, getNodeApiPrefix } = useCluster()
  const queryParam = getNodeApiPrefix()
  return { nodeId: activeNodeId, queryParam }
}
