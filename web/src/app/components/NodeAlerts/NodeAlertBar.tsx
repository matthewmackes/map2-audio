import './NodeAlerts.css'

import { ChevronDown, ChevronUp } from '@carbon/icons-react'
import { ActionableNotification, Button, Tag } from '@carbon/react'
import { useNavigate } from 'react-router-dom'

import { useNodeAlertStore } from '../../stores/nodeAlertStore'

export function NodeAlertBar() {
  const navigate = useNavigate()
  const alerts = useNodeAlertStore((state) => state.alerts)
  const collapsed = useNodeAlertStore((state) => state.collapsed)
  const dismissAlert = useNodeAlertStore((state) => state.dismissAlert)
  const setCollapsed = useNodeAlertStore((state) => state.setCollapsed)

  if (alerts.length === 0) {
    return null
  }

  return (
    <div className="node-alert-bar" role="region" aria-label="Node alerts">
      <div className="node-alert-bar__toolbar">
        <Button
          kind="ghost"
          size="sm"
          renderIcon={collapsed ? ChevronDown : ChevronUp}
          iconDescription={collapsed ? 'Expand node alerts' : 'Collapse node alerts'}
          onClick={() => setCollapsed(!collapsed)}
        >
          Node alerts
        </Button>
        <Tag type={alerts.some((alert) => alert.severity === 'critical') ? 'red' : 'warm-gray'}>
          {`${alerts.length} alerts`}
        </Tag>
      </div>

      {!collapsed ? (
        <div className="node-alert-bar__list">
          {alerts.slice(0, 3).map((alert) => (
            <ActionableNotification
              key={alert.id}
              kind={alert.severity === 'critical' ? 'error' : 'warning'}
              lowContrast
              inline
              title={`${alert.severity === 'critical' ? '✕' : '⚠'} ${alert.hostname}`}
              subtitle={alert.message}
              actionButtonLabel="Open nodes"
              onActionButtonClick={() => navigate('/nodes')}
              onCloseButtonClick={() => dismissAlert(alert.node_id)}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

