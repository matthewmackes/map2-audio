/**
 * PhaserCard - TooB Phaser
 *
 * Uses ModulationCategoryLayout for Carbon-compliant structure.
 * Parameters: rate, depth, feedback, stages, mix.
 */

import { Hashtag } from '@carbon/icons-react'
import { ModulationCategoryLayout } from '../../Layouts/ModulationCategoryLayout'
import { LFOWaveform } from '../../Visualizations/LFOWaveform'
import { ParameterKnob } from '../../../ParameterControl'
import type { PluginCardProps } from '../../types'
import { resolvePluginAccentColor } from '../../../../utils/pluginAccent'
import type { AdvancedSection } from '../../Base/CarbonCardShell'

const PARAM_MAP = {
  rate: 0,
  depth: 1,
  feedback: 2,
  stages: 3,
  mix: 4,
}

function PhaserCardBase({
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

  const visualization = (
    <LFOWaveform
      rate={getValue('rate', 0.5)}
      depth={getValue('depth', 70)}
      waveform="sine"
      width={compact ? 280 : 392}
      height={compact ? 84 : 112}
      accentColor={accentColor}
      animated
    />
  )

  const advancedSections: AdvancedSection[] = [
    {
      id: 'stages',
      title: 'Stages',
      icon: <Hashtag size={14} />,
      children: (
        <div className="carbon-param-row">
          <ParameterKnob
            label="Stages"
            value={getValue('stages', 4)}
            min={2} max={12} defaultValue={4} step={2}
            onChange={(v) => setValue('stages', v)}
            valueFormatter={(v) => v.toFixed(0)}
            accentColor={accentColor}
            size="small"
          />
        </div>
      ),
    },
  ]

  return (
    <ModulationCategoryLayout
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      bypassed={plugin.bypassed}
      visualization={visualization}
      rate={{
        label: 'Rate', value: getValue('rate', 0.5),
        min: 0.05, max: 10, defaultValue: 0.5, step: 0.05, unit: 'Hz',
        onChange: (v) => setValue('rate', v), isLogarithmic: true,
      }}
      depth={{
        label: 'Depth', value: getValue('depth', 70),
        min: 0, max: 100, defaultValue: 70, unit: '%',
        onChange: (v) => setValue('depth', v),
      }}
      feedback={{
        label: 'Feedback', value: getValue('feedback', 50),
        min: 0, max: 100, defaultValue: 50, unit: '%',
        onChange: (v) => setValue('feedback', v),
      }}
      mix={{
        label: 'Mix', value: getValue('mix', 50),
        min: 0, max: 100, defaultValue: 50, unit: '%',
        onChange: (v) => setValue('mix', v),
      }}
      advancedSections={advancedSections}
    />
  )
}

export { PhaserCardBase as PhaserCard }
export default PhaserCardBase
