import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

type ClusterContextValue = {
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

type PeersResponse = {
  local_node_id: string
  peers: Array<{
    node_id: string
    node_mode: string
    host: string
    api_url: string
    last_seen: string
    latency_ms?: number | null
  }>
}

const ClusterContext = createContext<ClusterContextValue | null>(null)

const ACTIVE_NODE_KEY = 'map2_active_node'

function buildNodes(data: PeersResponse | undefined): { nodes: NodeInfo[]; localNodeId: string } {
  if (!data) return { nodes: [], localNodeId: 'local' }

  const localNodeId = data.local_node_id || 'local'
  const now = Date.now()
  const nodes: NodeInfo[] = [
    {
      nodeId: localNodeId,
      hostname: window.location.hostname || 'local',
      role: 'LOCAL',
      isLocal: true,
      isOnline: true,
      latencyMs: 0,
      lastSeen: new Date(now).toISOString(),
    },
  ]

  for (const peer of data.peers ?? []) {
    const lastSeen = peer.last_seen ? Date.parse(peer.last_seen) : NaN
    const isOnline = Number.isFinite(lastSeen) ? (now - lastSeen) < 90_000 : true
    nodes.push({
      nodeId: peer.node_id,
      hostname: peer.host || peer.node_id,
      role: peer.node_mode || 'AUDIO-NODE',
      isLocal: peer.node_id === localNodeId,
      isOnline,
      latencyMs: typeof peer.latency_ms === 'number' ? peer.latency_ms : null,
      lastSeen: peer.last_seen ?? null,
    })
  }

  return { nodes, localNodeId }
}

export function ClusterProvider({ children }: { children: React.ReactNode }) {
  const initialActive = useMemo(() => {
    const stored = window.localStorage.getItem(ACTIVE_NODE_KEY)
    return stored && stored !== 'null' ? stored : null
  }, [])
  const [activeNodeId, setActiveNodeId] = useState<string | null>(initialActive)

  const peersQuery = useQuery<PeersResponse>({
    queryKey: ['cluster', 'peers'],
    queryFn: async () => {
      const resp = await fetch('/api/peers')
      if (!resp.ok) {
        throw new Error(`Failed to fetch peers: ${resp.status}`)
      }
      return resp.json() as Promise<PeersResponse>
    },
    staleTime: 5000,
    refetchInterval: 10000,
  })

  const { nodes, localNodeId } = useMemo(() => buildNodes(peersQuery.data), [peersQuery.data])
  const isClusterMode = nodes.length > 1

  useEffect(() => {
    window.localStorage.setItem(ACTIVE_NODE_KEY, activeNodeId ?? 'null')
  }, [activeNodeId])

  useEffect(() => {
    if (!peersQuery.data) {
      return
    }
    if (!isClusterMode && activeNodeId && activeNodeId !== localNodeId) {
      setActiveNodeId(null)
    }
  }, [activeNodeId, isClusterMode, localNodeId, peersQuery.data])

  const value = useMemo<ClusterContextValue>(() => {
    const prefixFor = (nodeId?: string | null) => {
      const target = nodeId ?? activeNodeId
      if (!target || target === localNodeId) return ''
      return `?node_id=${encodeURIComponent(target)}`
    }

    return {
      activeNodeId,
      nodes,
      localNodeId,
      isClusterMode,
      setActiveNode: setActiveNodeId,
      getNodeApiPrefix: prefixFor,
      getNodeWsPrefix: prefixFor, // placeholder for future WS federation
    }
  }, [activeNodeId, isClusterMode, localNodeId, nodes])

  return <ClusterContext.Provider value={value}>{children}</ClusterContext.Provider>
}

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

export default ClusterContext
