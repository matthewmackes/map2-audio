import type { PushSurfacePendingConfirmation } from '../../map2/clients/pushSurface'

function labelForAction(actionType: string): string {
  if (actionType === 'instance_switch') {
    return 'Instance switch'
  }
  return actionType.replace(/_/g, ' ')
}

function shortIdentity(identity: string): string {
  return identity.length > 18 ? `${identity.slice(0, 15)}…` : identity
}

export function PushConfirmationNoticePill({
  pendingConfirmation,
}: {
  pendingConfirmation: PushSurfacePendingConfirmation | null
}) {
  if (!pendingConfirmation) {
    return null
  }

  const actionLabel = labelForAction(pendingConfirmation.action_type)
  const deviceLabel = shortIdentity(pendingConfirmation.device_identity)
  const title = `${actionLabel} pending on ${pendingConfirmation.device_identity} for ${pendingConfirmation.target_display_name}`

  return (
    <div
      className="push-confirmation-pill"
      role="status"
      aria-live="polite"
      aria-label={title}
      title={title}
    >
      <span className="push-confirmation-pill__eyebrow">Push confirmation</span>
      <span className="push-confirmation-pill__body">
        {actionLabel} • {deviceLabel}
      </span>
    </div>
  )
}
