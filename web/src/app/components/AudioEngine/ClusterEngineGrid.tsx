import './ClusterEngineGrid.css'

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

type ClusterTone = 'healthy' | 'warning' | 'critical'
type MeterTone = 'info' | 'warning'

function getHealthTone(status: ClusterAudioResponse['nodes'][string]['status']) {
  const running = status?.running !== false
  const cpu = Number(status?.cpu_load ?? 0)
  const xrunRate = Number(status?.xrun_rate_per_minute ?? 0)
  const threadState = String(status?.thread_state ?? '').toLowerCase()

  if (!running || threadState.includes('stall') || xrunRate > 5) {
    return { label: 'Critical', tone: 'critical' as ClusterTone }
  }
  if (xrunRate > 1 || cpu > 80) {
    return { label: 'Warning', tone: 'warning' as ClusterTone }
  }
  return { label: 'Healthy', tone: 'healthy' as ClusterTone }
}

function runtimeTone(running: boolean | undefined): ClusterTone {
  return running === false ? 'critical' : 'healthy'
}

function signalTone(signalState: string | undefined): ClusterTone {
  return signalState === 'present' ? 'healthy' : 'warning'
}

function bufferTone(bufferHealth: number): ClusterTone {
  return bufferHealth < 90 ? 'warning' : 'healthy'
}

function cpuMeterTone(cpu: number): MeterTone {
  return cpu > 80 ? 'warning' : 'info'
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
      <div className="cluster-engine-grid__notice cluster-engine-grid__notice--error">
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
    <div className="cluster-engine-grid">
      <div className="cluster-engine-grid__header">
        <div className="cluster-engine-grid__title">
          Cluster Engine Overview
        </div>
        <div className="cluster-engine-grid__subtitle">
          Select a node for detailed metering and routing panels
        </div>
      </div>

      <div className="cluster-engine-grid__cards">
        {cards.map((card) => {
          const cpu = Math.max(0, Math.min(100, Number(card.status.cpu_load ?? 0)))
          const bufferHealth = Number(card.status.buffer_health_pct ?? 0)
          const engineStateTone = runtimeTone(card.status.running)
          const signalStateTone = signalTone(card.status.signal_state)
          const bufferStateTone = bufferTone(bufferHealth)
          return (
            <button
              key={card.nodeId}
              type="button"
              onClick={() => setActiveNode(card.nodeId)}
              className="cluster-engine-grid__card"
              data-tone={card.tone.tone}
            >
              <div className="cluster-engine-grid__card-header">
                <div>
                  <div className="cluster-engine-grid__card-title">{card.hostname}</div>
                  <div className="cluster-engine-grid__card-meta">
                    {card.nodeId} · {card.role}
                  </div>
                </div>
                <div className="cluster-engine-grid__tone-badge">
                  {card.tone.label}
                </div>
              </div>

              <div className="cluster-engine-grid__pair-grid">
                <div className="cluster-engine-grid__stat-card">
                  <div className="cluster-engine-grid__eyebrow">Engine</div>
                  <div className="cluster-engine-grid__status" data-tone={engineStateTone}>
                    {card.status.running === false ? 'Stopped' : 'Running'}
                  </div>
                  <div className="cluster-engine-grid__stat-copy">
                    {card.status.sample_rate ?? '—'} Hz / {card.status.buffer_size ?? '—'} smp
                  </div>
                </div>
                <div className="cluster-engine-grid__stat-card">
                  <div className="cluster-engine-grid__eyebrow">Latency</div>
                  <div className="cluster-engine-grid__stat-value">
                    {Number(card.status.latency_ms ?? 0).toFixed(2)} ms
                  </div>
                  <div className="cluster-engine-grid__stat-copy">
                    peer {card.latencyMs == null ? '—' : `${card.latencyMs.toFixed(1)} ms`}
                  </div>
                </div>
              </div>

              <div className="cluster-engine-grid__meter">
                <div className="cluster-engine-grid__meter-header">
                  <span className="cluster-engine-grid__meter-label">
                    <Cpu size={12} /> CPU
                  </span>
                  <span className="cluster-engine-grid__meter-value" data-tone={cpuMeterTone(cpu)}>
                    {cpu.toFixed(1)}%
                  </span>
                </div>
                <div className="cluster-engine-grid__meter-track">
                  <div
                    className="cluster-engine-grid__meter-fill"
                    data-fill-tone={cpuMeterTone(cpu)}
                    style={{ width: `${cpu}%` }}
                  />
                </div>
              </div>

              <div className="cluster-engine-grid__triple-grid">
                <div className="cluster-engine-grid__stat-card">
                  <div className="cluster-engine-grid__eyebrow">Xruns</div>
                  <div className="cluster-engine-grid__status" data-tone={Number(card.status.total_xruns ?? 0) > 0 ? 'critical' : 'healthy'}>
                    {card.status.total_xruns ?? 0}
                  </div>
                  <div className="cluster-engine-grid__stat-copy">
                    {(card.status.xrun_rate_per_minute ?? 0).toFixed(2)}/min
                  </div>
                </div>
                <div className="cluster-engine-grid__stat-card">
                  <div className="cluster-engine-grid__eyebrow">Signal</div>
                  <div className="cluster-engine-grid__status" data-tone={signalStateTone}>
                    {card.status.signal_state ?? 'unknown'}
                  </div>
                  <div className="cluster-engine-grid__stat-copy">
                    thread {card.status.thread_state ?? '—'}
                  </div>
                </div>
                <div className="cluster-engine-grid__stat-card">
                  <div className="cluster-engine-grid__eyebrow">Buffer</div>
                  <div className="cluster-engine-grid__status" data-tone={bufferStateTone}>
                    {bufferHealth.toFixed(0)}%
                  </div>
                  <div className="cluster-engine-grid__stat-copy" data-tone={card.alertCount > 0 ? 'warning' : undefined}>
                    {card.alertCount} alert{card.alertCount === 1 ? '' : 's'}
                  </div>
                </div>
              </div>

              <div className="cluster-engine-grid__footer">
                <span className="cluster-engine-grid__footer-copy">
                  <Pulse size={12} /> Click for detailed node view
                </span>
                <span className="cluster-engine-grid__footer-copy" data-tone={card.tone.tone}>
                  <Lightning size={12} />
                  {card.tone.label}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {cards.length === 0 && (
        <div className="cluster-engine-grid__empty-copy">
          No cluster nodes are currently reporting audio engine status.
        </div>
      )}
    </div>
  )
}

export default ClusterEngineGrid
