import type { ParameterNumericInputProps } from './ParameterNumericInput'
import { ParameterNumericInput } from './ParameterNumericInput'

export type SharedParameterKnobProps = ParameterNumericInputProps

export function ParameterKnob(props: SharedParameterKnobProps) {
  return (
    <ParameterNumericInput
      {...props}
      className={['parameter-control__knob', props.className].filter(Boolean).join(' ')}
    />
  )
}
