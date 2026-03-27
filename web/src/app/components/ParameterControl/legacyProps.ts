import type { CSSProperties, ReactNode } from 'react'

import {
  resolveParameterDescriptor,
  type ParameterDescriptor,
  type ParameterScale,
  type SensitivityProfile,
} from '../../data/parameterSchema'

type ParameterControlSize = 'small' | 'medium' | 'large' | 'responsive'

interface LegacyParameterControlBaseProps {
  label?: string
  value: number | null
  min: number
  max: number
  step?: number
  unit?: string
  defaultValue?: number | null
  precision?: number
  profile?: SensitivityProfile
  scale?: ParameterScale
  pluginId?: string
  paramKey?: string
  disabled?: boolean
  size?: ParameterControlSize
  showLabel?: boolean
  showBounds?: boolean
  valueFormatter?: (value: number) => string
  displayOverlay?: ReactNode
  inline?: boolean
  accentColor?: string
  className?: string
}

export interface LegacyParameterKnobProps extends Omit<LegacyParameterControlBaseProps, 'precision' | 'profile' | 'scale' | 'value'> {
  label: string
  value: number
  onChange: (value: number) => void
  onChangeEnd?: () => void
  isLogarithmic?: boolean
  midi?: {
    pluginUri: string
    paramIndex: number
    showWhenEmpty?: boolean
  }
}

export interface LegacyParameterSliderProps extends LegacyParameterControlBaseProps {
  onChange?: (value: number) => void
  onChangeEnd?: () => void
}

export interface LegacyNumberInputProps extends LegacyParameterControlBaseProps {
  onChange?: (value: number) => void
  onChangeEnd?: () => void
  onChangeCommitted?: (value: number) => void
  onClear?: () => void
  fullWidth?: boolean
  style?: CSSProperties
  nullable?: boolean
  sx?: object
}

export interface ResolvedLegacyControlProps {
  descriptor: ParameterDescriptor
  value: number
  onLiveChange?: (value: number) => void
  onCommit?: (value: number) => void
  label?: string
  ariaLabel?: string
  accentColor?: string
  className?: string
  disabled?: boolean
  inline?: boolean
  showBounds?: boolean
  showLabel?: boolean
  size?: ParameterControlSize
  valueFormatter?: (value: number) => string
  displayOverlay?: ReactNode
  containerStyle?: CSSProperties
  nullable?: boolean
  onClear?: () => void
}

export function isDescriptorBackedProps(
  value: object,
): value is { descriptor: ParameterDescriptor } {
  return 'descriptor' in value
}

export function resolveLegacyControlProps(
  props: LegacyParameterKnobProps | LegacyParameterSliderProps | LegacyNumberInputProps,
  overrides?: {
    explicitScale?: ParameterScale
  },
): ResolvedLegacyControlProps {
  const {
    label,
    value,
    min,
    max,
    step = 1,
    unit = '',
    defaultValue = value,
    pluginId,
    paramKey,
    onChange,
    disabled = false,
    size = 'medium',
    showLabel = true,
    showBounds = false,
    valueFormatter,
    displayOverlay,
    inline = false,
    accentColor = '#0f62fe',
    className = '',
  } = props
  const precision = 'precision' in props ? props.precision : undefined
  const profile = 'profile' in props ? props.profile : undefined
  const scale = 'scale' in props ? props.scale : undefined

  const numericValue = value ?? min
  const descriptor = resolveParameterDescriptor({
    min,
    max,
    step,
    unit,
    defaultValue: defaultValue ?? numericValue,
    name: label,
    symbol: label,
    precision,
    profile,
    scale: overrides?.explicitScale ?? scale,
  }, { pluginId, paramKey })

  let onCommit: ((value: number) => void) | undefined
  if ('onChangeCommitted' in props && typeof props.onChangeCommitted === 'function') {
    onCommit = props.onChangeCommitted
  } else if ('onChangeEnd' in props && typeof props.onChangeEnd === 'function') {
    onCommit = () => props.onChangeEnd?.()
  }

  const containerStyle = 'sx' in props || 'style' in props || 'fullWidth' in props
    ? {
        width: 'fullWidth' in props && props.fullWidth ? '100%' : undefined,
        ...(('sx' in props ? props.sx : undefined) as CSSProperties | undefined),
        ...('style' in props ? props.style : undefined),
      }
    : undefined

  return {
    descriptor,
    value: numericValue,
    onLiveChange: onChange,
    onCommit,
    label,
    ariaLabel: label,
    accentColor,
    className,
    disabled,
    inline,
    showBounds,
    showLabel,
    size,
    valueFormatter,
    displayOverlay,
    containerStyle,
    nullable: 'nullable' in props ? props.nullable : false,
    onClear: 'onClear' in props ? props.onClear : undefined,
  }
}
