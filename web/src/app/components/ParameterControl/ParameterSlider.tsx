import type { ParameterNumericInputProps } from './ParameterNumericInput'
import { ParameterNumericInput } from './ParameterNumericInput'

export type SharedParameterSliderProps = ParameterNumericInputProps

export function ParameterSlider(props: SharedParameterSliderProps) {
  return (
    <ParameterNumericInput
      {...props}
      className={['parameter-control__slider', props.className].filter(Boolean).join(' ')}
    />
  )
}
