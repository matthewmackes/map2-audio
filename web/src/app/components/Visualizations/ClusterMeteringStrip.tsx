import React from 'react'
import { useCluster, type NodeInfo } from '../../contexts/ClusterContext'
import { useVuMeters } from '../../hooks/useVuMeters'
import { useCPUMetrics } from '../../hooks/useCPUMetrics'

function dbToPercent(db: number, min = -60, max = 6): number {
  const clamped = Math.max(min, Math.min(max, db))
  return ((clamped - min) / (max - min)) * 100
}

function dbToMarkerTop(db: number, height: number, min = -60, max = 6): number {
  return height - (dbToPercent(db, min, max) / 100) * height
}

function getMeterGradient(db: number): string {
  if (db > -6) return 'linear-gradient(to top, #22c55e 0%, #eab308 68%, #ef4444 100%)'
  if (db > -12) return 'linear-gradient(to top, #22c55e 0%, #22c55e 72%, #eab308 100%)'
  return 'linear-gradient(to top, #22c55e 0%, #22c55e 100%)'
}

function CompactMeterBar({ value, peak }: { value: number; peak: number }) {
  const height = 92
  return (
    <div
      style={{
        width: 10,
        height,
        background: '#0f172a',
        borderRadius: 999,
        position: 'relative',
        overflow: 'hidden',
        border: '1px solid rgba(148, 163, 184, 0.12)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          insetInline: 0,
          bottom: 0,
          height: `${dbToPercent(value)}%`,
          background: getMeterGradient(value),
          transition: 'height 0.05s ease-out',
        }}
      />
      <div
        style={{
          position: 'absolute',
          insetInline: 0,
          top: dbToMarkerTop(peak, height),
          height: 2,
          background: peak > -6 ? '#ef4444' : '#f8fafc',
          boxShadow: peak > -6 ? '0 0 4px rgba(239, 68, 68, 0.75)' : 'none',
        }}
      />
    </div>
  )
}

function NodeMeterColumn({
  node,
  onSelect,
}: {
  node: NodeInfo
  onSelect: (nodeId: string) => void
}) {
  const targetNodeId = node.isLocal ? null : node.nodeId
  const { levels, peakHold, isRunning } = useVuMeters({ nodeId: targetNodeId })
  const { metrics } = useCPUMetrics({ nodeId: targetNodeId, useWebSocket: false, pollingInterval: 2000 })
  const outputPeak = Math.max(levels.outputLeft, levels.outputRight)
  const peakColor = outputPeak > -6 ? '#ef4444' : outputPeak > -12 ? '#eab308' : '#22c55e'
  const cpuColor = metrics.totalCpuPercent >= 85 ? '#ef4444' : metrics.totalCpuPercent >= 60 ? '#eab308' : '#22c55e'

  return (
    <button
      type="button"
      onClick={() => onSelect(node.nodeId)}
      style={{
        minWidth: 132,
        padding: '14px 12px',
        borderRadius: 14,
        border: `1px solid ${node.isOnline ? 'rgba(59, 130, 246, 0.2)' : 'rgba(148, 163, 184, 0.18)'}`,
        background: node.isOnline ? 'rgba(15, 20, 35, 0.78)' : 'rgba(30, 41, 59, 0.45)',
        color: '#e5e7eb',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        alignItems: 'center',
        backdropFilter: 'blur(8px)',
      }}
      title={`Open ${node.hostname} full metering`}
    >
      <div style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>{node.hostname}</span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: node.isOnline ? '#93c5fd' : '#94a3b8',
              border: `1px solid ${node.isOnline ? 'rgba(96, 165, 250, 0.3)' : 'rgba(148, 163, 184, 0.25)'}`,
              padding: '2px 6px',
              borderRadius: 999,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            {node.isLocal ? 'Local' : node.role}
          </span>
        </div>
        <div style={{ marginTop: 4, fontSize: 10, color: '#64748b', fontFamily: 'JetBrains Mono, monospace' }}>
          {node.nodeId}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
        <CompactMeterBar value={levels.outputLeft} peak={peakHold.outputLeft} />
        <CompactMeterBar value={levels.outputRight} peak={peakHold.outputRight} />
      </div>

      <div style={{ display: 'flex', gap: 12, fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8 }}>
        <span>L</span>
        <span>R</span>
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: peakColor, fontFamily: 'JetBrains Mono, monospace' }}>
        {isRunning ? `${outputPeak <= -60 ? '-∞' : outputPeak.toFixed(0)} dB` : 'idle'}
      </div>

      <div style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div
          style={{
            padding: '8px 6px',
            borderRadius: 10,
            background: 'rgba(15, 23, 42, 0.9)',
            border: '1px solid rgba(34, 197, 94, 0.12)',
          }}
        >
          <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8 }}>CPU</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: cpuColor, fontFamily: 'JetBrains Mono, monospace' }}>
            {metrics.totalCpuPercent.toFixed(0)}%
          </div>
        </div>
        <div
          style={{
            padding: '8px 6px',
            borderRadius: 10,
            background: 'rgba(15, 23, 42, 0.9)',
            border: `1px solid ${metrics.xrunCount > 0 ? 'rgba(239, 68, 68, 0.18)' : 'rgba(34, 197, 94, 0.12)'}`,
          }}
        >
          <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8 }}>XRun</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: metrics.xrunCount > 0 ? '#ef4444' : '#22c55e', fontFamily: 'JetBrains Mono, monospace' }}>
            {metrics.xrunCount}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 10, color: '#94a3b8' }}>
        {node.latencyMs == null ? 'Peer latency —' : `Peer ${node.latencyMs.toFixed(1)} ms`}
      </div>
    </button>
  )
}

export function ClusterMeteringStrip() {
  const { nodes, setActiveNode } = useCluster()

  if (nodes.length === 0) {
    return (
      <div style={{ color: '#94a3b8', fontSize: 14 }}>
        Cluster nodes have not been discovered yet.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ color: '#94a3b8', fontSize: 13 }}>
        One live stereo meter column per node. Click any node to switch the full metering dashboard to that target.
      </div>
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 6 }}>
        {nodes.map((node) => (
          <NodeMeterColumn key={node.nodeId} node={node} onSelect={setActiveNode} />
        ))}
      </div>
    </div>
  )
}

export default ClusterMeteringStrip
