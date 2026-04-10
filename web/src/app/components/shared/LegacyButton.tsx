import { Button, type ButtonProps } from '@carbon/react'
import type { ReactNode } from 'react'

type CarbonButtonProps = ButtonProps<'button'>

type LegacyVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'error'
  | 'success'
  | 'tertiary'

type LegacySize = 'sm' | 'md' | 'lg'

interface LegacyButtonProps
  extends Omit<CarbonButtonProps, 'kind' | 'size' | 'renderIcon'> {
  variant?: LegacyVariant
  size?: LegacySize
  renderIcon?: CarbonButtonProps['renderIcon']
  iconDescription?: string
  fullWidth?: boolean
  children?: ReactNode
}

const KIND_BY_VARIANT: Record<LegacyVariant, NonNullable<CarbonButtonProps['kind']>> = {
  primary: 'primary',
  secondary: 'secondary',
  ghost: 'ghost',
  tertiary: 'tertiary',
  danger: 'danger',
  error: 'danger',
  success: 'primary',
}

export function LegacyButton({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  style,
  iconDescription,
  children,
  ...props
}: LegacyButtonProps) {
  const hasIconOnly = !children

  return (
    <Button
      kind={KIND_BY_VARIANT[variant]}
      size={size}
      hasIconOnly={hasIconOnly || undefined}
      iconDescription={hasIconOnly ? iconDescription ?? 'Action' : iconDescription}
      style={fullWidth ? { width: '100%', ...style } : style}
      {...props}
    >
      {children}
    </Button>
  )
}

export default LegacyButton
