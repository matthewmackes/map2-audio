import type { ParameterNumericInputProps } from './ParameterNumericInput'
import { ParameterNumericInput } from './ParameterNumericInput'
import {
  isDescriptorBackedProps,
  resolveLegacyControlProps,
  type LegacyParameterKnobProps,
} from './legacyProps'

export type SharedParameterKnobProps = ParameterNumericInputProps | LegacyParameterKnobProps

export function ParameterKnob(props: SharedParameterKnobProps) {
  if (!isDescriptorBackedProps(props)) {
    return (
      <ParameterNumericInput
        {...resolveLegacyControlProps(props, {
          explicitScale: props.isLogarithmic ? 'log' : undefined,
        })}
        className={['parameter-control__knob', props.className].filter(Boolean).join(' ')}
      />
    )
  }

  return (
    <ParameterNumericInput
      {...props}
      className={['parameter-control__knob', props.className].filter(Boolean).join(' ')}
    />
  )
}
