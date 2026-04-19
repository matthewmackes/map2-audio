/**
 * TremoloCard - TooB Tremolo
 *
 * Uses ModulationCategoryLayout for Carbon-compliant structure.
 * Parameters: rate, depth, waveform.
 */

import { ModulationCategoryLayout } from '../../Layouts/ModulationCategoryLayout'
import { LFOWaveform } from '../../Visualizations/LFOWaveform'
import type { PluginCardProps } from '../../types'
import { resolvePluginAccentColor } from '../../../../utils/pluginAccent'

const PARAM_MAP = {
  rate: 0,
  depth: 1,
  waveform: 2,
}

const WAVEFORM_OPTIONS = ['sine', 'triangle', 'square', 'saw'] as const

function TremoloCardBase({
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

  const waveformIndex = Math.round(getValue('waveform', 0))
  const waveformName = WAVEFORM_OPTIONS[waveformIndex] || 'sine'

  const visualization = (
    <LFOWaveform
      rate={getValue('rate', 4)}
      depth={getValue('depth', 50)}
      waveform={waveformName}
      width={compact ? 280 : 392}
      height={compact ? 84 : 112}
      accentColor={accentColor}
      animated
    />
  )

  return (
    <ModulationCategoryLayout
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      bypassed={plugin.bypassed}
      visualization={visualization}
      rate={{
        label: 'Rate', value: getValue('rate', 4),
        min: 0.5, max: 20, defaultValue: 4, step: 0.1, unit: 'Hz',
        onChange: (v) => setValue('rate', v), isLogarithmic: true,
      }}
      depth={{
        label: 'Depth', value: getValue('depth', 50),
        min: 0, max: 100, defaultValue: 50, unit: '%',
        onChange: (v) => setValue('depth', v),
      }}
      waveform={{
        value: waveformName,
        options: [...WAVEFORM_OPTIONS],
        onChange: (v) => setValue('waveform', WAVEFORM_OPTIONS.indexOf(v as typeof WAVEFORM_OPTIONS[number])),
      }}
    />
  )
}

export { TremoloCardBase as TremoloCard }
export default TremoloCardBase
