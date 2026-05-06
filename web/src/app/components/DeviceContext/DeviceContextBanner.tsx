import './DeviceContextBanner.css'

import { useState } from 'react'
import { Button } from '@carbon/react'
import { ErrorFilled, Information, WarningAlt } from '@carbon/icons-react'
import { useDeviceNodeContext } from '../../hooks/useDeviceNodeContext'
import { DeviceContextDialog } from './DeviceContextDialog'
import type { DeviceIssueSeverity, DeviceKey } from './deviceContextTypes'

interface DeviceContextBannerProps {
  deviceName: string
  deviceKey: DeviceKey | DeviceKey[]
  onRequestReassign?: (targetNodeId: string) => void
  onRequestRediscovery?: () => void
  className?: string
}

function severityIcon(severity: DeviceIssueSeverity) {
  switch (severity) {
    case 'error':
      return <ErrorFilled size={16} aria-hidden="true" />
    case 'warning':
      return <WarningAlt size={16} aria-hidden="true" />
    default:
      return <Information size={16} aria-hidden="true" />
  }
}

function bannerMessage(deviceName: string, issues: { severity: DeviceIssueSeverity; title: string; detail: string }[]): string {
  if (issues.length === 0) return ''
  if (issues.length === 1) return `${deviceName}: ${issues[0].detail}`
  return `${deviceName}: ${issues.length} issues detected — click Manage for details`
}

function topSeverity(issues: { severity: DeviceIssueSeverity }[]): DeviceIssueSeverity {
  if (issues.some((i) => i.severity === 'error')) return 'error'
  if (issues.some((i) => i.severity === 'warning')) return 'warning'
  return 'info'
}

export function DeviceContextBanner({
  deviceName,
  deviceKey,
  onRequestReassign,
  onRequestRediscovery,
  className,
}: DeviceContextBannerProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const { deviceState, issues } = useDeviceNodeContext(deviceKey)

  if (deviceState === 'ready' || deviceState === 'loading') {
    return null
  }

  const severity = topSeverity(issues)
  const message = bannerMessage(deviceName, issues)

  return (
    <>
      <div
        className={[
          'device-context-banner',
          `device-context-banner--${severity}`,
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        role="status"
        aria-label={`${deviceName} context status`}
        data-testid="device-context-banner"
      >
        <span className="device-context-banner__icon">{severityIcon(severity)}</span>
        <span className="device-context-banner__message">{message}</span>
        <span className="device-context-banner__action">
          <Button
            kind="ghost"
            size="sm"
            onClick={() => setDialogOpen(true)}
          >
            Manage
          </Button>
        </span>
      </div>

      <DeviceContextDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        deviceName={deviceName}
        deviceKey={deviceKey}
        onRequestReassign={onRequestReassign}
        onRequestRediscovery={onRequestRediscovery}
      />
    </>
  )
}
