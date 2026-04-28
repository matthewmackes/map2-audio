// DangerButton — Carbon Button with kind="danger" plus a default
// confirmation hook. Use for irreversible operations (delete,
// reboot, force-disconnect, push-to-live).
//
// `requireConfirm` (default true) intercepts the first click and shows
// a window.confirm() dialog with the configured `confirmMessage`. If
// the consumer manages its own confirm modal (preferred), pass
// `requireConfirm={false}` and handle confirmation upstream.

import { Button, type ButtonProps } from '@carbon/react'
import type { MouseEvent, ReactNode } from 'react'

interface DangerButtonProps extends Omit<ButtonProps<'button'>, 'kind' | 'onClick'> {
  children: ReactNode
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
  /** When true (default), wrap onClick in a window.confirm() prompt. */
  requireConfirm?: boolean
  confirmMessage?: string
  /** When true, renders the smaller "danger--ghost" variant. */
  ghost?: boolean
}

export function DangerButton({
  children,
  onClick,
  requireConfirm = true,
  confirmMessage = 'This action cannot be undone. Continue?',
  ghost = false,
  ...rest
}: DangerButtonProps) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (requireConfirm && typeof window !== 'undefined') {
      // eslint-disable-next-line no-alert
      const confirmed = window.confirm(confirmMessage)
      if (!confirmed) {
        event.preventDefault()
        return
      }
    }
    onClick?.(event)
  }
  return (
    <Button {...rest} kind={ghost ? 'danger--ghost' : 'danger'} onClick={handleClick}>
      {children}
    </Button>
  )
}

export default DangerButton
