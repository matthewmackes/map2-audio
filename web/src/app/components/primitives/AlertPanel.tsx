// AlertPanel — canonical alert primitive with explicit blocking-vs-advisory
// split. Wraps Carbon InlineNotification with MAP semantic tone resolution.
//
// Severity contract:
//   - 'blocking'  → Carbon kind="error", renders red, encodes "this prevents
//                    activation" — operators MUST resolve before continuing
//   - 'advisory'  → Carbon kind="warning", renders yellow, encodes "be aware
//                    but you can proceed"
//   - 'info'      → Carbon kind="info" — neutral context
//   - 'success'   → Carbon kind="success" — confirms an action completed
//
// The blocking-vs-advisory split is required by Q8=C — operators must
// know at a glance whether an alert prevents work or merely informs.

import { InlineNotification, ActionableNotification } from '@carbon/react'
import type { ReactNode } from 'react'

export type AlertPanelSeverity = 'blocking' | 'advisory' | 'info' | 'success'

interface AlertPanelProps {
  severity: AlertPanelSeverity
  title: string
  /** Detail text. May include a single short sentence or short list. */
  children?: ReactNode
  /** Optional action button label — when present, renders as ActionableNotification. */
  actionLabel?: string
  onActionClick?: () => void
  onClose?: () => void
  /** When false, hides the close button. */
  hideCloseButton?: boolean
  /** When true, the alert takes the lower-priority `lowContrast` Carbon variant. */
  lowContrast?: boolean
  className?: string
}

function carbonKindFor(severity: AlertPanelSeverity) {
  switch (severity) {
    case 'blocking':
      return 'error' as const
    case 'advisory':
      return 'warning' as const
    case 'info':
      return 'info' as const
    case 'success':
      return 'success' as const
    default:
      return 'info' as const
  }
}

export function AlertPanel({
  severity,
  title,
  children,
  actionLabel,
  onActionClick,
  onClose,
  hideCloseButton = false,
  lowContrast = false,
  className,
}: AlertPanelProps) {
  const kind = carbonKindFor(severity)
  if (actionLabel && onActionClick) {
    return (
      <ActionableNotification
        kind={kind}
        title={title}
        subtitle={children as string | undefined}
        actionButtonLabel={actionLabel}
        onActionButtonClick={onActionClick}
        onClose={onClose}
        hideCloseButton={hideCloseButton}
        lowContrast={lowContrast}
        className={className}
      />
    )
  }
  return (
    <InlineNotification
      kind={kind}
      title={title}
      subtitle={children as string | undefined}
      onClose={onClose}
      hideCloseButton={hideCloseButton}
      lowContrast={lowContrast}
      className={className}
    />
  )
}

export default AlertPanel
