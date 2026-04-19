import { useMemo } from 'react'
import { Box, Tooltip, Typography } from '@mui/material'

import type { MidiClusterConnection, MidiClusterNode } from '../../../map2/api'

interface Props {
  nodes: MidiClusterNode[]
  connections: MidiClusterConnection[]
}

interface PositionedNode {
  node: MidiClusterNode
  x: number
  y: number
}

export function MidiClusterTopology({ nodes, connections }: Props) {
  const positioned = useMemo<PositionedNode[]>(() => {
    const radius = 38
    const cx = 50
    const cy = 50
    const count = Math.max(nodes.length, 1)
    return nodes.map((node, idx) => {
      const angle = (idx / count) * 2 * Math.PI
      const x = cx + radius * Math.cos(angle)
      const y = cy + radius * Math.sin(angle)
      return { node, x, y }
    })
  }, [nodes])

  const lookup = useMemo(() => new Map(positioned.map(p => [p.node.node_id, p])), [positioned])

  return (
    <Box sx={{ position: 'relative', minHeight: 320, background: '#0b1224', border: '1px solid #1f2937', borderRadius: 2, overflow: 'hidden', p: 2 }}>
      <Typography variant="subtitle2" sx={{ color: '#e5e7eb', mb: 1 }}>
        Cluster Topology
      </Typography>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
        {connections.map(conn => {
          const src = lookup.get(conn.source.node_id)
          const dst = lookup.get(conn.destination.node_id)
          if (!src || !dst) return null
          const color = conn.transport === 'rtp-midi' ? '#22c55e' : conn.transport === 'udp-raw' ? '#eab308' : '#60a5fa'
          return (
            <line
              key={conn.connection_id}
              x1={src.x}
              y1={src.y}
              x2={dst.x}
              y2={dst.y}
              stroke={color}
              strokeWidth={0.8}
              strokeDasharray={conn.state === 'connecting' ? '2 2' : '0'}
              opacity={0.9}
            />
          )
        })}
      </svg>
      {positioned.map(p => (
        <Tooltip key={p.node.node_id} title={`${p.node.hostname} (${p.node.node_id})`} arrow>
          <Box
            sx={{
              position: 'absolute',
              left: `${p.x}%`,
              top: `${p.y}%`,
              transform: 'translate(-50%, -50%)',
              background: '#111827',
              border: `2px solid ${p.node.online ? '#22c55e' : '#ef4444'}`,
              borderRadius: '12px',
              minWidth: 120,
              p: 1,
              boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
            }}
          >
            <Typography variant="subtitle2" sx={{ color: '#e5e7eb', fontSize: 13 }} noWrap>
              {p.node.hostname}
            </Typography>
            <Typography variant="caption" sx={{ color: '#94a3b8' }}>
              {p.node.capabilities?.input_ports.length ?? 0} in · {p.node.capabilities?.output_ports.length ?? 0} out
            </Typography>
          </Box>
        </Tooltip>
      ))}
    </Box>
  )
}

export default MidiClusterTopology
