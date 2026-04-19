import { useEffect, useMemo, useState } from 'react'

import { getPeerTopology } from './api'

interface PeerNode {
  id: string
  hostname: string
  ip: string
  role: string
  health: 'online' | 'degraded' | 'offline'
  latencyMs: number | null
  uptime: string
}

function toHealth(latency: number | null | undefined): 'online' | 'degraded' | 'offline' {
  if (latency == null) {
    return 'offline'
  }
  if (latency > 180) {
    return 'degraded'
  }
  return 'online'
}

function healthTone(health: 'online' | 'degraded' | 'offline') {
  if (health === 'online') {
    return { dot: '#22c55e', text: '#86efac' }
  }
  if (health === 'degraded') {
    return { dot: '#f59e0b', text: '#fdba74' }
  }
  return { dot: '#ef4444', text: '#fecaca' }
}

export function ClusterTopologyPanel({
  selectedNode,
  onSelectNode,
  collapsed,
  onToggleCollapsed,
}: {
  selectedNode: string
  onSelectNode: (nodeId: string) => void
  collapsed: boolean
  onToggleCollapsed: () => void
}) {
  const [nodes, setNodes] = useState<PeerNode[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const payload = await getPeerTopology()
        if (!mounted) {
          return
        }

        const discovered = payload.peers.map((peer) => ({
          id: peer.node_id,
          hostname: peer.node_id,
          ip: peer.host,
          role: peer.node_mode,
          health: toHealth(peer.latency_ms),
          latencyMs: peer.latency_ms ?? null,
          uptime: peer.last_seen,
        }))

        setNodes([
          {
            id: payload.local_node_id,
            hostname: payload.local_node_id,
            ip: '127.0.0.1',
            role: 'LOCAL',
            health: 'online',
            latencyMs: 0,
            uptime: new Date().toISOString(),
          },
          ...discovered,
        ])
      } catch (loadError) {
        if (!mounted) {
          return
        }
        setError(loadError instanceof Error ? loadError.message : 'Failed to load cluster topology')
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void load()
    const timer = window.setInterval(() => {
      void load()
    }, 15_000)

    return () => {
      mounted = false
      window.clearInterval(timer)
    }
  }, [])

  const connectedCount = useMemo(() => nodes.filter((node) => node.health === 'online').length, [nodes])

  return (
    <aside className={`api-observatory-topology${collapsed ? ' is-collapsed' : ''}`}>
      <button
        type="button"
        className="api-observatory-topology__toggle"
        onClick={onToggleCollapsed}
      >
        {collapsed ? 'Show Topology' : 'Hide Topology'}
      </button>

      {!collapsed && (
        <>
          <header className="api-observatory-topology__header">
            <h3>Cluster Topology</h3>
            <p>{connectedCount}/{nodes.length} nodes online</p>
          </header>

          <div className="api-observatory-topology__actions">
            <button type="button" onClick={() => onSelectNode('local-node')}>Local</button>
            <button type="button" onClick={() => onSelectNode('all')}>Broadcast</button>
          </div>

          {loading && <p className="api-observatory-topology__state">Refreshing cluster topology…</p>}
          {error && <p className="api-observatory-topology__error">{error}</p>}

          <div className="api-observatory-topology__nodes">
            {nodes.map((node) => {
              const tone = healthTone(node.health)
              return (
                <button
                  key={node.id}
                  type="button"
                  className={`api-observatory-topology__node${selectedNode === node.id ? ' is-selected' : ''}`}
                  onClick={() => onSelectNode(node.id)}
                >
                  <div className="api-observatory-topology__node-head">
                    <span style={{ background: tone.dot }} className="api-observatory-topology__status-dot" />
                    <strong>{node.hostname}</strong>
                  </div>
                  <div className="api-observatory-topology__node-meta" style={{ color: tone.text }}>
                    {node.role} · {node.ip}
                  </div>
                  <div className="api-observatory-topology__node-meta">
                    latency {node.latencyMs == null ? 'n/a' : `${Math.round(node.latencyMs)}ms`}
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}
    </aside>
  )
}

export default ClusterTopologyPanel
