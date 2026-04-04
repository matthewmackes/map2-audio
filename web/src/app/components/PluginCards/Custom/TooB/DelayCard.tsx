/**
 * DelayCard - TooB Delay
 *
 * Uses DelayCategoryLayout for Carbon-compliant structure.
 * Parameters: time, feedback, mix, tone.
 */

import { DelayCategoryLayout } from '../../Layouts/DelayCategoryLayout'
import { DelayTapGrid } from '../../Visualizations/DelayTapGrid'
import type { PluginCardProps } from '../../types'
import { resolvePluginAccentColor } from '../../../../utils/pluginAccent'

const PARAM_MAP = {
  time: 0,
  feedback: 1,
  mix: 2,
  tone: 3,
  sync: 4,
}

function DelayCardBase({
  plugin,
  parameterValues,
  onParameterChange,
  accentColor: providedAccent,
  compact = false,
}: PluginCardProps) {
  const accentColor = resolvePluginAccentColor(providedAccent, plugin.uri, plugin.category)
  const getValue = (key: keyof typeof PARAM_MAP, defaultVal: number) =>
    parameterValues[PARAM_MAP[key]] ?? defaultVal

  const setValue = (key: keyof typeof PARAM_MAP, value: number) =>
    onParameterChange(PARAM_MAP[key], value)

  const formatDelay = (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms.toFixed(0)}ms`

  const visualization = (
    <DelayTapGrid
      delayTimeL={getValue('time', 350)}
      feedback={getValue('feedback', 40)}
      width={compact ? 280 : 392}
      height={compact ? 84 : 112}
      accentColor={accentColor}
      maxTaps={8}
    />
  )

  return (
    <DelayCategoryLayout
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      bypassed={plugin.bypassed}
      visualization={visualization}
      delayTimeL={{
        label: 'Delay', value: getValue('time', 350),
        min: 10, max: 2000, defaultValue: 350, step: 1, unit: 'ms',
        onChange: (v) => setValue('time', v),
        isLogarithmic: true,
        valueFormatter: formatDelay,
      }}
      feedback={{
        label: 'Feedback', value: getValue('feedback', 40),
        min: 0, max: 100, defaultValue: 40, unit: '%',
        onChange: (v) => setValue('feedback', v),
      }}
      tone={{
        label: 'Tone', value: getValue('tone', 70),
        min: 0, max: 100, defaultValue: 70, unit: '%',
        onChange: (v) => setValue('tone', v),
      }}
      mix={{
        label: 'Mix', value: getValue('mix', 30),
        min: 0, max: 100, defaultValue: 30, unit: '%',
        onChange: (v) => setValue('mix', v),
      }}
    />
  )
}

export { DelayCardBase as DelayCard }
export default DelayCardBase
