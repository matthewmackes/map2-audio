// ActionButton — Carbon Button with explicit intent semantics for MAP2.
// Replaces ad-hoc Carbon `<Button>` calls scattered across pages where
// the intent (apply, configure, monitor) is implicit. Renders as a
// Carbon primary or secondary button depending on `intent`.
//
//   intent='primary'  → Carbon kind="primary"  — commit/apply/start
//   intent='secondary' → Carbon kind="secondary" — configure/edit
//   intent='ghost'    → Carbon kind="ghost"    — monitor/inspect/cancel
//
// Use DangerButton (separate primitive) for destructive actions.

import { Button, type ButtonProps } from '@carbon/react'
import type { ReactNode } from 'react'

export type ActionButtonIntent = 'primary' | 'secondary' | 'ghost'

interface ActionButtonProps extends Omit<ButtonProps<'button'>, 'kind'> {
  intent?: ActionButtonIntent
  children: ReactNode
}

function kindForIntent(intent: ActionButtonIntent): ButtonProps<'button'>['kind'] {
  switch (intent) {
    case 'primary':
      return 'primary'
    case 'secondary':
      return 'secondary'
    case 'ghost':
    default:
      return 'ghost'
  }
}

export function ActionButton({ intent = 'primary', children, ...rest }: ActionButtonProps) {
  return (
    <Button {...rest} kind={kindForIntent(intent)}>
      {children}
    </Button>
  )
}

export default ActionButton
