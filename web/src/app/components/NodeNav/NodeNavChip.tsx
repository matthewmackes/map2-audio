import './NodeNavChip.css'

import { Tag, Tooltip } from '@carbon/react'

import type { NodeSummary } from '../../types/node'
import {
  computeNodeHealthPercent,
  getHealthPercentTone,
  getNodePresence,
  getNodePresenceAccent,
  truncateNodeHostname,
  type NodeRolePresence,
} from '../../utils/nodeDisplay'

interface NodeNavChipProps {
  node: NodeSummary
  onClick: () => void
  presence?: NodeRolePresence
}

export function NodeNavChip({ node, onClick, presence = getNodePresence(node) }: NodeNavChipProps) {
  const accentColor = getNodePresenceAccent(presence)
  const healthPercent = computeNodeHealthPercent(node)
  const healthTone = getHealthPercentTone(healthPercent)

  return (
    <Tooltip label={node.hostname}>
      <button
        type="button"
        className={`node-nav-chip node-nav-chip--${presence.toLowerCase()} node-nav-chip--${node.status}`}
        aria-label={`Node ${node.hostname} - status ${node.status} - health ${healthPercent}%`}
        onClick={onClick}
      >
        <span className="node-nav-chip__accent-wrap" aria-hidden="true">
          <span className="node-nav-chip__accent" style={{ backgroundColor: accentColor }} />
          <span className="node-nav-chip__health" />
        </span>
        <span className={`node-nav-chip__hostname${node.status === 'offline' ? ' node-nav-chip__hostname--offline' : ''}`}>
          {truncateNodeHostname(node.hostname)}
        </span>
        <span className={`node-nav-chip__health-pct node-nav-chip__health-pct--${healthTone}`}>
          {healthPercent}%
        </span>
        <Tag type={presence === 'LOCAL' ? 'blue' : presence === 'VIEW' ? 'green' : 'cool-gray'} size="sm">
          {presence}
        </Tag>
      </button>
    </Tooltip>
  )
}

export type { NodeNavChipProps }

