import './NodeGraph.css'

import { Tag } from '@carbon/react'
import type { NodeProps } from 'reactflow'
import { Handle, Position } from 'reactflow'

import type { NodeSummary } from '../../types/node'
import {
  formatNodeDisplayName,
  getNodePresenceAccent,
  getNodePresence,
  getNodeStatusTagType,
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
          <span className="node-graph-card__dot" style={{ backgroundColor: accentColor }} aria-hidden="true" />
          <span className="node-graph-card__title">{formatNodeDisplayName(node)}</span>
        </div>
        <Tag type={getNodeStatusTagType(node.status)} size="sm">
          {node.status.toUpperCase()}
        </Tag>
      </div>
      {node.display_label ? (
        <span className="node-graph-card__label">{node.hostname}</span>
      ) : null}
      <Handle type="source" position={Position.Bottom} className="node-graph-card__handle" />
    </button>
  )
}

