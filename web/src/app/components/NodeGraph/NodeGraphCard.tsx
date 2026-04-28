import './NodeGraph.css'

import type { NodeProps } from 'reactflow'
import { Handle, Position } from 'reactflow'

import { StatusChip } from '../primitives'
import type { NodeSummary } from '../../types/node'
import {
  formatNodeDisplayName,
  getNodePresenceAccent,
  getNodePresence,
  getNodeStatusChipTone,
  type NodeRolePresence,
} from '../../utils/nodeDisplay'

export type NodeGraphCardData = {
  node: NodeSummary
  presence: NodeRolePresence
  onSelect: (nodeId: string) => void
}

export function NodeGraphCard({ data }: NodeProps<NodeGraphCardData>) {
  const { node, presence, onSelect } = data
  const accentColor = getNodePresenceAccent(presence || getNodePresence(node))

  return (
    <button
      type="button"
      className="node-graph-card"
      style={{ borderInlineStartColor: accentColor }}
      onClick={() => onSelect(node.node_id)}
    >
      <Handle type="target" position={Position.Top} className="node-graph-card__handle" />
      <div className="node-graph-card__row">
        <div className="node-graph-card__title-wrap">
          <span
            className="node-graph-card__dot"
            style={{ backgroundColor: accentColor }}
            aria-hidden="true"
          />
          <span className="node-graph-card__title">{formatNodeDisplayName(node)}</span>
        </div>
        {/* T2474 B5: Migrated from Carbon Tag to canonical StatusChip primitive,
         * using the MAP node-status tone vocabulary (ok/caution/critical/offline). */}
        <StatusChip
          tone={getNodeStatusChipTone(node.status)}
          label={node.status.toUpperCase()}
          size="sm"
        />
      </div>
      {node.display_label ? (
        <span className="node-graph-card__label">{node.hostname}</span>
      ) : null}
      <Handle type="source" position={Position.Bottom} className="node-graph-card__handle" />
    </button>
  )
}
