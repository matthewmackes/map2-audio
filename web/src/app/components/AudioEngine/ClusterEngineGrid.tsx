import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity as Pulse, Activity as Cpu, Flash as Lightning } from '@carbon/icons-react'
import { useCluster } from '../../contexts/useCluster'
import { EmptyState } from '../shared/EmptyState'
import { LoadingState } from '../shared/LoadingState'

type ClusterAudioResponse = {
  nodes: Record<string, {
    status?: {
      running?: boolean
      cpu_load?: number
      total_xruns?: number
      xrun_rate_per_minute?: number
      thread_state?: string
      signal_state?: string
      buffer_health_pct?: number
      latency_ms?: number
      sample_rate?: number
      buffer_size?: number
    }
    health?: {
      alerts?: Array<{ severity?: string; message?: string }>
    }
  }>
}

const C = {
  bg: '#0f1520',
  panel: '#141c2b',
  border: '#1e2a3d',
  text: '#e2e8f0',
  muted: '#64748b',
  green: '#22c55e',
  amber: '#f59e0b',
  red: '#ef4444',
  blue: '#3b82f6',
}

function getHealthTone(status: ClusterAudioResponse['nodes'][string]['status']) {
  const running = status?.running !== false
  const cpu = Number(status?.cpu_load ?? 0)
  const xrunRate = Number(status?.xrun_rate_per_minute ?? 0)
  const threadState = String(status?.thread_state ?? '').toLowerCase()

  if (!running || threadState.includes('stall') || xrunRate > 5) {
    return { label: 'Critical', color: C.red }
  }
  if (xrunRate > 1 || cpu > 80) {
    return { label: 'Warning', color: C.amber }
  }
  return { label: 'Healthy', color: C.green }
}

export function ClusterEngineGrid() {
  const { nodes, setActiveNode } = useCluster()
  const audioQuery = useQuery<ClusterAudioResponse>({
    queryKey: ['cluster-engine-grid', 'audio'],
    queryFn: async () => {
      const response = await fetch('/api/cluster/health/extended/audio')
      if (!response.ok) {
        throw new Error(`Failed to fetch cluster audio health: ${response.status}`)
      }
      return response.json() as Promise<ClusterAudioResponse>
    },
    staleTime: 2000,
    refetchInterval: 5000,
  })

  const cards = useMemo(() => {
    const lookup = new Map(nodes.map((node) => [node.nodeId, node]))
    return Object.entries(audioQuery.data?.nodes ?? {}).map(([nodeId, payload]) => {
      const info = lookup.get(nodeId)
      const status = payload.status ?? {}
      const tone = getHealthTone(status)
      return {
        nodeId,
        hostname: info?.hostname ?? nodeId,
        role: info?.role ?? 'AUDIO-NODE',
        latencyMs: info?.latencyMs ?? null,
        tone,
        status,
        alertCount: payload.health?.alerts?.length ?? 0,
      }
    })
  }, [audioQuery.data, nodes])

  if (audioQuery.isLoading && cards.length === 0) {
    return <LoadingState description="Loading cluster engine state" />
  }

  if (audioQuery.isError) {
    return (
      <div style={{
        border: `1px solid ${C.red}35`,
        background: `${C.red}10`,
        color: C.red,
        padding: 14,
        fontSize: 13,
      }}>
        {audioQuery.error instanceof Error ? audioQuery.error.message : 'Cluster audio health unavailable'}
      </div>
    )
  }

  if (cards.length === 0) {
    return (
      <EmptyState
        title="No cluster engine telemetry available"
        description="Connect an audio node or wait for engine health telemetry to publish."
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ color: C.text, fontSize: 14, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>
          Cluster Engine Overview
        </div>
        <div style={{ color: C.muted, fontSize: 12 }}>
          Select a node for detailed metering and routing panels
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        {cards.map((card) => {
          const cpu = Math.max(0, Math.min(100, Number(card.status.cpu_load ?? 0)))
          const bufferHealth = Number(card.status.buffer_health_pct ?? 0)
          return (
            <button
              key={card.nodeId}
              onClick={() => setActiveNode(card.nodeId)}
              style={{
                background: C.panel,
                border: `1px solid ${card.tone.color}33`,
                padding: 16,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                <div>
                  <div style={{ color: C.text, fontSize: 16, fontWeight: 700 }}>{card.hostname}</div>
                  <div style={{ color: C.muted, fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                    {card.nodeId} · {card.role}
                  </div>
                </div>
                <div style={{
                  color: card.tone.color,
                  border: `1px solid ${card.tone.color}35`,
                  background: `${card.tone.color}12`,
                  padding: '4px 8px',
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}>
                  {card.tone.label}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                <div style={{ background: C.bg, border: `1px solid ${C.border}`, padding: 10 }}>
                  <div style={{ color: C.muted, fontSize: 10, textTransform: 'uppercase', marginBottom: 4 }}>Engine</div>
                  <div style={{ color: card.status.running === false ? C.red : C.green, fontSize: 13, fontWeight: 700 }}>
                    {card.status.running === false ? 'Stopped' : 'Running'}
                  </div>
                  <div style={{ color: C.muted, fontSize: 11 }}>
                    {card.status.sample_rate ?? '—'} Hz / {card.status.buffer_size ?? '—'} smp
                  </div>
                </div>
                <div style={{ background: C.bg, border: `1px solid ${C.border}`, padding: 10 }}>
                  <div style={{ color: C.muted, fontSize: 10, textTransform: 'uppercase', marginBottom: 4 }}>Latency</div>
                  <div style={{ color: C.text, fontSize: 13, fontWeight: 700 }}>
                    {Number(card.status.latency_ms ?? 0).toFixed(2)} ms
                  </div>
                  <div style={{ color: C.muted, fontSize: 11 }}>
                    peer {card.latencyMs == null ? '—' : `${card.latencyMs.toFixed(1)} ms`}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.muted }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Cpu size={12} /> CPU
                  </span>
                  <span style={{ color: cpu > 80 ? C.amber : C.text, fontFamily: 'var(--font-mono)' }}>{cpu.toFixed(1)}%</span>
                </div>
                <div style={{ height: 8, background: C.bg, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${cpu}%`,
                      height: '100%',
                      background: cpu > 80 ? C.amber : C.blue,
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                <div style={{ background: C.bg, border: `1px solid ${C.border}`, padding: 10 }}>
                  <div style={{ color: C.muted, fontSize: 10, textTransform: 'uppercase', marginBottom: 4 }}>XRuns</div>
                  <div style={{ color: Number(card.status.total_xruns ?? 0) > 0 ? C.red : C.green, fontSize: 14, fontWeight: 700 }}>
                    {card.status.total_xruns ?? 0}
                  </div>
                  <div style={{ color: C.muted, fontSize: 11 }}>
                    {(card.status.xrun_rate_per_minute ?? 0).toFixed(2)}/min
                  </div>
                </div>
                <div style={{ background: C.bg, border: `1px solid ${C.border}`, padding: 10 }}>
                  <div style={{ color: C.muted, fontSize: 10, textTransform: 'uppercase', marginBottom: 4 }}>Signal</div>
                  <div style={{ color: card.status.signal_state === 'present' ? C.green : C.amber, fontSize: 13, fontWeight: 700 }}>
                    {card.status.signal_state ?? 'unknown'}
                  </div>
                  <div style={{ color: C.muted, fontSize: 11 }}>
                    thread {card.status.thread_state ?? '—'}
                  </div>
                </div>
                <div style={{ background: C.bg, border: `1px solid ${C.border}`, padding: 10 }}>
                  <div style={{ color: C.muted, fontSize: 10, textTransform: 'uppercase', marginBottom: 4 }}>Buffer</div>
                  <div style={{ color: bufferHealth < 90 ? C.amber : C.green, fontSize: 14, fontWeight: 700 }}>
                    {bufferHealth.toFixed(0)}%
                  </div>
                  <div style={{ color: card.alertCount > 0 ? C.amber : C.muted, fontSize: 11 }}>
                    {card.alertCount} alert{card.alertCount === 1 ? '' : 's'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: C.muted, fontSize: 11 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Pulse size={12} /> Click for detailed node view
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: card.tone.color }}>
                  <Lightning size={12} />
                  {card.tone.label}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {cards.length === 0 && (
        <div style={{ color: C.muted, fontSize: 13 }}>
          No cluster nodes are currently reporting audio engine status.
        </div>
      )}
    </div>
  )
}

export default ClusterEngineGrid
