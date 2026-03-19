/**
 * BF2FlangerCard - TooB BF-2 Flanger (Boss BF-2 clone)
 *
 * Uses ModulationCategoryLayout for Carbon-compliant structure.
 * Parameters: manual (centre delay), depth, rate, res (feedback).
 */

import { ModulationCategoryLayout } from '../../Layouts/ModulationCategoryLayout'
import { LFOWaveform } from '../../Visualizations/LFOWaveform'
import type { PluginCardProps } from '../../types'

const PARAM_MAP = {
  manual: 0,
  depth: 1,
  rate: 2,
  res: 3,
}

function BF2FlangerCardBase({
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
      rate={getValue('rate', 0.3)}
      depth={getValue('depth', 60)}
      waveform="triangle"
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
        label: 'Rate', value: getValue('rate', 0.3),
        min: 0.05, max: 5, defaultValue: 0.3, step: 0.05, unit: 'Hz',
        onChange: (v) => setValue('rate', v), isLogarithmic: true,
      }}
      depth={{
        label: 'Depth', value: getValue('depth', 60),
        min: 0, max: 100, defaultValue: 60, unit: '%',
        onChange: (v) => setValue('depth', v),
      }}
      centreDelay={{
        label: 'Manual', value: getValue('manual', 50),
        min: 0, max: 100, defaultValue: 50, unit: '%',
        onChange: (v) => setValue('manual', v),
      }}
      feedback={{
        label: 'Res', value: getValue('res', 40),
        min: 0, max: 100, defaultValue: 40, unit: '%',
        onChange: (v) => setValue('res', v),
      }}
      extraContent={
        <div style={{ textAlign: 'center', padding: 8, fontSize: 10, color: '#666', fontStyle: 'italic' }}>
          Classic jet sweep flanger
        </div>
      }
    />
  )
}

export { BF2FlangerCardBase as BF2FlangerCard }
export default BF2FlangerCardBase
