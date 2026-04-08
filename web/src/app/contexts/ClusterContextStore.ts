import { createContext } from 'react'

export type ClusterContextValue = {
  activeNodeId: string | null
  nodes: NodeInfo[]
  localNodeId: string
  isClusterMode: boolean
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
