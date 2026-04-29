// Cluster topology canvas. T2475 (E1): migrated from MUI to Carbon.
// Container, nodes, and tooltips use semantic divs + Carbon Tooltip;
// MUI palette literals routed through MAP semantic tokens.

import { useMemo } from 'react'
import { Tooltip } from '@carbon/react'

import type { MidiClusterConnection, MidiClusterNode } from '../../../map2/api'
import './MidiClusterTopology.css'

interface Props {
  nodes: MidiClusterNode[]
  connections: MidiClusterConnection[]
}

interface PositionedNode {
  node: MidiClusterNode
  x: number
  y: number
}

// Transport palette → MAP-aligned hex values. Using literal hex inside
// the SVG <line stroke=...> attribute because SVG attributes don't
// resolve CSS custom properties at all browsers; the values are pinned
// to the same Carbon shades that --map2-state-live / --map2-alert-advisory /
// --map2-clock-master resolve to under the default g100 shell.
const TRANSPORT_COLOR: Record<string, string> = {
  'rtp-midi': '#42be65',  // Carbon green-40 == --map2-state-live (dark shell)
  'udp-raw': '#f1c21b',   // Carbon yellow-30 == --map2-alert-advisory
  default: '#4589ff',     // Carbon blue-50 == --map2-clock-master
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
    <div className="midi-cluster-topology">
      <span className="midi-cluster-topology__title">Cluster Topology</span>
      <svg
        className="midi-cluster-topology__svg"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {connections.map(conn => {
          const src = lookup.get(conn.source.node_id)
          const dst = lookup.get(conn.destination.node_id)
          if (!src || !dst) return null
          const color = TRANSPORT_COLOR[conn.transport] ?? TRANSPORT_COLOR.default
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
        <Tooltip
          key={p.node.node_id}
          label={`${p.node.hostname} (${p.node.node_id})`}
          align="top"
        >
          <div
            className={`midi-cluster-topology__node midi-cluster-topology__node--${p.node.online ? 'online' : 'offline'}`}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
          >
            <span className="midi-cluster-topology__node-hostname">{p.node.hostname}</span>
            <span className="midi-cluster-topology__node-stats">
              {p.node.capabilities?.input_ports.length ?? 0} in · {p.node.capabilities?.output_ports.length ?? 0} out
            </span>
          </div>
        </Tooltip>
      ))}
    </div>
  )
}

export default MidiClusterTopology
