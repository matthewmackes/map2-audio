import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSpecialSettings } from '../hooks/useSpecialSettings'
import { useRealtimeCadence } from '../hooks/useRealtimeCadence'
import { ClusterContext, type ClusterContextValue, type NodeInfo } from './ClusterContextStore'

type PeersResponse = {
  local_node_id: string
  peers: Array<{
    node_id: string
    node_mode: string
    hostname?: string
    host: string
    api_url: string
    last_seen: string
    latency_ms?: number | null
    is_online?: boolean
  }>
}

const ACTIVE_NODE_KEY = 'map2_active_node'

function normalizeStoredNodeId(nodeId: string | null | undefined): string | null {
  if (typeof nodeId !== 'string') return null

  const normalized = nodeId.trim()
  if (!normalized || normalized.toLowerCase() === 'null' || normalized.toLowerCase() === 'local') {
    return null
  }

  return normalized
}

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
    const isOnline = typeof peer.is_online === 'boolean'
      ? peer.is_online
      : Number.isFinite(lastSeen)
        ? (now - lastSeen) < 90_000
        : true
    nodes.push({
      nodeId: peer.node_id,
      hostname: peer.hostname || peer.host || peer.node_id,
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
    return normalizeStoredNodeId(window.localStorage.getItem(ACTIVE_NODE_KEY))
  }, [])
  const [activeNodeId, setActiveNodeId] = useState<string | null>(initialActive)
  const [preferencesReady, setPreferencesReady] = useState(false)
  const userSelectionRef = useRef(false)
  const {
    settings: specialSettings,
    isLoading: specialSettingsLoading,
    updateSettings: updateSpecialSettings,
  } = useSpecialSettings()

  const peersRefetchInterval = useRealtimeCadence({
    visibleMs: 10_000,
    hiddenMs: 60_000,
  })

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
    refetchInterval: peersRefetchInterval,
  })

  const { nodes, localNodeId } = useMemo(() => buildNodes(peersQuery.data), [peersQuery.data])
  const isClusterMode = nodes.length > 1

  useEffect(() => {
    window.localStorage.setItem(ACTIVE_NODE_KEY, activeNodeId ?? 'null')
  }, [activeNodeId])

  useEffect(() => {
    if (specialSettingsLoading || preferencesReady) {
      return
    }

    if (userSelectionRef.current) {
      setPreferencesReady(true)
      return
    }

    const persistedNodeId = normalizeStoredNodeId(specialSettings?.lastActiveNode)
    setActiveNodeId(persistedNodeId ?? initialActive)
    setPreferencesReady(true)
  }, [initialActive, preferencesReady, specialSettings?.lastActiveNode, specialSettingsLoading])

  useEffect(() => {
    if (!peersQuery.data) {
      return
    }

    if (activeNodeId === 'all' && !isClusterMode) {
      setActiveNodeId(null)
      return
    }

    if (activeNodeId === 'all') {
      return
    }

    if (!activeNodeId || activeNodeId === localNodeId) {
      return
    }

    if (!isClusterMode || !nodes.some((node) => node.nodeId === activeNodeId)) {
      setActiveNodeId(null)
    }
  }, [activeNodeId, isClusterMode, localNodeId, nodes, peersQuery.data])

  useEffect(() => {
    if (!preferencesReady || specialSettingsLoading || !specialSettings) {
      return
    }

    const persistedNodeId = normalizeStoredNodeId(specialSettings.lastActiveNode)
    if (persistedNodeId === activeNodeId) {
      return
    }

    void updateSpecialSettings({ lastActiveNode: activeNodeId }).catch((error) => {
      console.error('Failed to persist active cluster node to special settings:', error)
    })
  }, [activeNodeId, preferencesReady, specialSettings, specialSettingsLoading, updateSpecialSettings])

  const handleSetActiveNode = useCallback((nodeId: string | null) => {
    userSelectionRef.current = true
    const normalizedNodeId = normalizeStoredNodeId(nodeId)
    window.localStorage.setItem(ACTIVE_NODE_KEY, normalizedNodeId ?? 'null')
    setActiveNodeId(normalizedNodeId)
  }, [])

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
      setActiveNode: handleSetActiveNode,
      getNodeApiPrefix: prefixFor,
      getNodeWsPrefix: prefixFor, // placeholder for future WS federation
    }
  }, [activeNodeId, handleSetActiveNode, isClusterMode, localNodeId, nodes])

  return <ClusterContext.Provider value={value}>{children}</ClusterContext.Provider>
}

export type { ClusterContextValue, NodeInfo } from './ClusterContextStore'
