import './NodeMiniCard.css'

import { Button, Link, Tag } from '@carbon/react'
import { Close } from '@carbon/icons-react'
import { useNavigate } from 'react-router-dom'

import { buildPlatformNodeWorkspaceHref } from '../../platform/routes'
import { useNodeAlertStore } from '../../stores/nodeAlertStore'
import { useViewedNodeStore } from '../../stores/viewedNodeStore'
import type { NodeSummary } from '../../types/node'
import {
  NODE_PAGE_KEYS,
  computeNodeHealthPercent,
  formatNodeDisplayName,
  getHealthPercentTone,
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
  const alerts = useNodeAlertStore((state) => state.alerts).filter((a) => a.node_id === node.node_id)
  const dismissAlert = useNodeAlertStore((state) => state.dismissAlert)
  const accentColor = getNodePresenceAccent(getNodePresence(node))
  const managementHref = buildPlatformNodeWorkspaceHref('management', node.node_id)
  const healthPercent = computeNodeHealthPercent(node)
  const healthTone = getHealthPercentTone(healthPercent)
  const contextLabel = node.is_local ? 'Local studio view' : 'Remote live view'

  return (
    <div className="node-mini-card" style={{ borderInlineStartColor: accentColor }}>
      <div className="node-mini-card__header">
        <div>
          <h3 className="node-mini-card__title">{formatNodeDisplayName(node)}</h3>
          <p className="node-mini-card__subtitle">{node.hostname}</p>
        </div>
        <Tag type="cool-gray">{getNodeRoleLabel(node.role)}</Tag>
      </div>
      <div className="node-mini-card__context">
        <span>{contextLabel}</span>
      </div>
      <div className="node-mini-card__status">
        <span>Status</span>
        <Tag type={getNodeStatusTagType(node.status)}>{node.status.toUpperCase()}</Tag>
      </div>
      <div className="node-mini-card__health-row">
        <span>Health</span>
        <span className={`node-mini-card__health-value node-mini-card__health-value--${healthTone}`}>
          {healthPercent}%
        </span>
      </div>
      {alerts.length > 0 && (
        <div className="node-mini-card__alerts">
          {alerts.map((alert) => (
            <div key={alert.id} className="node-mini-card__alert">
              <Tag type={alert.severity === 'critical' ? 'red' : 'warm-gray'} size="sm">
                {alert.severity}
              </Tag>
              <span className="node-mini-card__alert-msg">{alert.message}</span>
              <button
                type="button"
                className="node-mini-card__alert-dismiss"
                aria-label={`Dismiss alert: ${alert.message}`}
                onClick={() => dismissAlert(alert.node_id)}
              >
                <Close size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
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
          href={managementHref}
          onClick={(event) => {
            event.preventDefault()
            setViewedNode(pageKey, node.node_id)
            setViewedNode(NODE_PAGE_KEYS.platform, node.node_id)
            navigate(managementHref)
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
