import './NodeMiniCard.css'

import { Button, Link, Tag } from '@carbon/react'
import { useNavigate } from 'react-router-dom'

import { buildPlatformHref } from '../../platform/model'
import { useViewedNodeStore } from '../../stores/viewedNodeStore'
import type { NodeSummary } from '../../types/node'
import {
  NODE_PAGE_KEYS,
  formatNodeDisplayName,
  getNodePresenceAccent,
  getNodeRoleLabel,
  getNodeStatusTagType,
  getNodePresence,
} from '../../utils/nodeDisplay'

interface NodeMiniCardProps {
  node: NodeSummary
  pageKey: string
  onClose?: () => void
}

export function NodeMiniCard({ node, pageKey, onClose }: NodeMiniCardProps) {
  const navigate = useNavigate()
  const setViewedNode = useViewedNodeStore((state) => state.setViewedNode)
  const accentColor = getNodePresenceAccent(getNodePresence(node))
  const singleNodeHref = buildPlatformHref('single-node')

  return (
    <div className="node-mini-card" style={{ borderInlineStartColor: accentColor }}>
      <div className="node-mini-card__header">
        <div>
          <h3 className="node-mini-card__title">{formatNodeDisplayName(node)}</h3>
          <p className="node-mini-card__subtitle">{node.hostname}</p>
        </div>
        <Tag type="cool-gray">{getNodeRoleLabel(node.role)}</Tag>
      </div>
      <div className="node-mini-card__status">
        <span>Status</span>
        <Tag type={getNodeStatusTagType(node.status)}>{node.status.toUpperCase()}</Tag>
      </div>
      <div className="node-mini-card__actions">
        <Button
          kind="ghost"
          size="sm"
          onClick={() => {
            setViewedNode(pageKey, node.node_id)
            onClose?.()
          }}
        >
          Set as page node
        </Button>
        <Link
          href={singleNodeHref}
          onClick={(event) => {
            event.preventDefault()
            setViewedNode(pageKey, node.node_id)
            setViewedNode(NODE_PAGE_KEYS.platform, node.node_id)
            navigate(singleNodeHref)
            onClose?.()
          }}
        >
          View details
        </Link>
      </div>
    </div>
  )
}

export type { NodeMiniCardProps }
