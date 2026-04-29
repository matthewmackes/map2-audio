// Per-node card in the cluster MIDI overview. T2475 (E1): migrated from
// MUI to Carbon. Card+CardContent → Carbon ClickableTile/Tile. Badge+
// Wifi → flat tone-bordered icon. Chip → StatusChip. Typography →
// semantic spans. The MUI gradient and palette literals (#22c55e/
// #ef4444/#111827/...) all retired per Q1=A; presence is communicated
// by accent border color routed through MAP semantic state tokens.

import { ClickableTile, Tile } from '@carbon/react'
import { Plug, Power, Wifi } from '@carbon/icons-react'
import type { ComponentProps } from 'react'

import { StatusChip } from '../primitives'
import type { MidiClusterEndpoint, MidiClusterNode } from '../../../map2/api'
import './MidiClusterNodeCard.css'

interface Props {
  node: MidiClusterNode
  connections: string[]
  isLocal?: boolean
  onSelect?: (nodeId: string) => void
}

function PortBadge({ port }: { port: MidiClusterEndpoint }) {
  const tone = port.direction === 'output' ? 'info' : 'staged'
  return (
    <StatusChip
      tone={tone}
      label={`${port.port_name}${port.device_name ? ` · ${port.device_name}` : ''}`}
      size="sm"
      className={
        port.available
          ? 'midi-cluster-node-card__port-chip'
          : 'midi-cluster-node-card__port-chip midi-cluster-node-card__port-chip--unavailable'
      }
    />
  )
}

export function MidiClusterNodeCard({ node, connections, isLocal = false, onSelect }: Props) {
  const online = node.online
  const onlineModifier = online
    ? 'midi-cluster-node-card--online'
    : 'midi-cluster-node-card--offline'
  const className = `midi-cluster-node-card ${onlineModifier}`

  const head = (
    <>
      <div className="midi-cluster-node-card__head">
        <span
          className={`midi-cluster-node-card__status-icon midi-cluster-node-card__status-icon--${online ? 'online' : 'offline'}`}
          aria-hidden="true"
        >
          <Wifi size={20} />
        </span>
        <div className="midi-cluster-node-card__copy">
          <span className="midi-cluster-node-card__hostname">
            {node.hostname} {isLocal ? '(local)' : ''}
          </span>
          <span className="midi-cluster-node-card__node-id">{node.node_id}</span>
        </div>
        <StatusChip
          tone="neutral"
          label="Connections"
          value={String(connections.length)}
          size="sm"
        />
      </div>

      <div className="midi-cluster-node-card__status-row">
        <StatusChip
          tone={online ? 'ok' : 'critical'}
          label={online ? 'Online' : 'Offline'}
          size="sm"
          dot
        />
        {node.capabilities?.clock_source && (
          <StatusChip
            tone="info"
            label="Clock"
            value={node.capabilities.clock_source}
            size="sm"
          />
        )}
      </div>

      <div className="midi-cluster-node-card__ports-section">
        <span className="midi-cluster-node-card__ports-heading">Inputs</span>
        <div className="midi-cluster-node-card__ports">
          {node.ports.filter(p => p.direction === 'input').map(p => (
            <PortBadge key={p.endpoint_id} port={p} />
          ))}
        </div>
      </div>

      <div className="midi-cluster-node-card__ports-section">
        <span className="midi-cluster-node-card__ports-heading">Outputs</span>
        <div className="midi-cluster-node-card__ports">
          {node.ports.filter(p => p.direction === 'output').map(p => (
            <PortBadge key={p.endpoint_id} port={p} />
          ))}
        </div>
      </div>
    </>
  )

  // Suppress unused-import warnings for icons retained for future use.
  void Plug
  void Power

  if (onSelect) {
    const clickableProps: ComponentProps<typeof ClickableTile> = {
      className,
      onClick: () => onSelect(node.node_id),
    }
    return <ClickableTile {...clickableProps}>{head}</ClickableTile>
  }

  return <Tile className={className}>{head}</Tile>
}

export default MidiClusterNodeCard
