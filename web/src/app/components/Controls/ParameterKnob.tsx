import { resolveParameterDescriptor } from '../../data/parameterSchema'
import { ParameterKnob as SharedParameterKnob } from '../ParameterControl'

interface ParameterKnobProps {
  label: string
  value: number
  min: number
  max: number
  defaultValue?: number
  step?: number
  unit?: string
  onChange: (value: number) => void
  onChangeEnd?: () => void
  accentColor?: string
  disabled?: boolean
  isLogarithmic?: boolean
  pluginId?: string
  paramKey?: string
  valueFormatter?: (value: number) => string
  size?: 'small' | 'medium' | 'large' | 'responsive'
  midi?: {
    pluginUri: string
    paramIndex: number
    showWhenEmpty?: boolean
  }
}

export function ParameterKnob({
  label,
  value,
  min,
  max,
  defaultValue,
  step,
  unit = '',
  onChange,
  onChangeEnd,
  accentColor = '#0f62fe',
  disabled = false,
  isLogarithmic,
  pluginId,
  paramKey,
  valueFormatter,
  size = 'responsive',
}: ParameterKnobProps) {
  const descriptor = resolveParameterDescriptor({
    min,
    max,
    step,
    unit,
    defaultValue: defaultValue ?? min,
    name: label,
    symbol: label,
    scale: isLogarithmic ? 'log' : undefined,
  }, { pluginId, paramKey })

  // Logarithmic controls still benefit from the frequency/time profile inference,
  // but the shared primitive now owns the interaction model across all cards.
  void isLogarithmic

  return (
    <SharedParameterKnob
      label={label}
      ariaLabel={label}
      descriptor={descriptor}
      value={value}
      onLiveChange={onChange}
      onCommit={() => onChangeEnd?.()}
      commitStrategy="legacy"
      accentColor={accentColor}
      disabled={disabled}
      size={size}
      valueFormatter={valueFormatter}
    />
  )
}

export default ParameterKnob
