/**
 * CE2ChorusCard - TooB CE-2 Chorus (Boss CE-2 clone)
 *
 * Uses ModulationCategoryLayout for Carbon-compliant structure.
 * Classic BBD chorus — just Rate and Depth like the original.
 */

import { ModulationCategoryLayout } from '../../Layouts/ModulationCategoryLayout'
import { LFOWaveform } from '../../Visualizations/LFOWaveform'
import type { PluginCardProps } from '../../types'

const PARAM_MAP = {
  rate: 0,
  depth: 1,
}

function CE2ChorusCardBase({
  plugin,
  parameterValues,
  onParameterChange,
  accentColor = '#f59e0b',
  compact = false,
}: PluginCardProps) {
  const getValue = (key: keyof typeof PARAM_MAP, defaultVal: number) =>
    parameterValues[PARAM_MAP[key]] ?? defaultVal

  const setValue = (key: keyof typeof PARAM_MAP, value: number) =>
    onParameterChange(PARAM_MAP[key], value)

  const visualization = (
    <LFOWaveform
      rate={getValue('rate', 0.8)}
      depth={getValue('depth', 50)}
      waveform="sine"
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
        label: 'Rate', value: getValue('rate', 0.8),
        min: 0.1, max: 5, defaultValue: 0.8, step: 0.1, unit: 'Hz',
        onChange: (v) => setValue('rate', v), isLogarithmic: true,
      }}
      depth={{
        label: 'Depth', value: getValue('depth', 50),
        min: 0, max: 100, defaultValue: 50, unit: '%',
        onChange: (v) => setValue('depth', v),
      }}
      extraContent={
        <div style={{ textAlign: 'center', padding: 8, fontSize: 10, color: '#666', fontStyle: 'italic' }}>
          Classic BBD chorus warmth
        </div>
      }
    />
  )
}

export { CE2ChorusCardBase as CE2ChorusCard }
export default CE2ChorusCardBase
