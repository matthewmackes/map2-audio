import type { ParameterNumericInputProps } from './ParameterNumericInput'
import { ParameterNumericInput } from './ParameterNumericInput'
import {
  isDescriptorBackedProps,
  resolveLegacyControlProps,
  type LegacyParameterSliderProps,
} from './legacyProps'

export type SharedParameterSliderProps = ParameterNumericInputProps | LegacyParameterSliderProps

export function ParameterSlider(props: SharedParameterSliderProps) {
  if (!isDescriptorBackedProps(props)) {
    return (
      <ParameterNumericInput
        {...resolveLegacyControlProps(props)}
        className={['parameter-control__slider', props.className].filter(Boolean).join(' ')}
      />
    )
  }

  return (
    <ParameterNumericInput
      {...props}
      className={['parameter-control__slider', props.className].filter(Boolean).join(' ')}
    />
  )
}
