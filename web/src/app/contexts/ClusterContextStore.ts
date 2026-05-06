import { createContext } from 'react'

export type ClusterContextValue = {
  activeNodeId: string | null
  nodes: NodeInfo[]
  localNodeId: string
  isClusterMode: boolean
  /**
   * `true` while the initial `/api/peers` query is in flight and the
   * cluster topology is unknown. Shells that gate rendering on a
   * known node set should branch on this flag instead of treating
   * `nodes.length === 0` as "no peers" — at first paint, it really
   * means "haven't asked the backend yet". (Audit Arch-15, cycle 47.)
   */
  isLoading: boolean
  setActiveNode: (nodeId: string | null) => void
  getNodeApiPrefix: (nodeId?: string | null) => string
  getNodeWsPrefix: (nodeId?: string | null) => string
}

export type NodeInfo = {
  nodeId: string
  hostname: string
  role: string
  isLocal: boolean
  isOnline: boolean
  latencyMs: number | null
  lastSeen: string | null
}

export const ClusterContext = createContext<ClusterContextValue | null>(null)
