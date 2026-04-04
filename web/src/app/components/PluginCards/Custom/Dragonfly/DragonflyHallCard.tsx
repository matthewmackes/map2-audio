/**
 * DragonflyHallCard - Dragonfly Hall Reverb
 *
 * Based on https://github.com/michaelwillis/dragonfly-reverb
 * Concert hall reverb with larger spaces and longer decay times.
 *
 * Parameters similar to Room but optimized for hall spaces.
 */

import { ReverbCategoryLayout } from '../../Layouts/ReverbCategoryLayout'
import { ReverbDecayCurve } from '../../Visualizations/ReverbDecayCurve'
import { ParameterKnob } from '../../../ParameterControl'
import type { PluginCardProps } from '../../types'
import { resolvePluginAccentColor } from '../../../../utils/pluginAccent'
import type { AdvancedSection } from '../../Base/CarbonCardShell'
import { Activity } from '@carbon/icons-react'

// Parameter indices for Dragonfly Hall Reverb
const PARAM_MAP = {
  dry_level: 0,
  wet_level: 1,
  early_level: 2,
  late_level: 3,
  size: 4,
  width: 5,
  predelay: 6,
  decay: 7,
  diffuse: 8,
  modulation: 9,
  high_cut: 10,
  low_cut: 11,
  early_send: 12,
}

export function DragonflyHallCard({
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
    <ReverbDecayCurve
      decayTime={getValue('decay', 3.2)}
      preDelay={getValue('predelay', 25)}
      earlyReflections={getValue('early_level', 40)}
      damping={100 - (getValue('high_cut', 6000) / 16000) * 100}
      width={compact ? 336 : 448}
      height={compact ? 112 : 140}
      accentColor={accentColor}
    />
  )

  const advancedSections: AdvancedSection[] = [
    {
      id: 'modulation',
      title: 'Modulation',
      icon: <Activity size={16} />,
      children: (
        <div className="carbon-param-row">
          <ParameterKnob
            label="Modulation" value={getValue('modulation', 20)}
            min={0} max={100} defaultValue={20} unit="%"
            onChange={(v) => setValue('modulation', v)}
            accentColor={accentColor} size="small"
          />
          <ParameterKnob
            label="Early Send" value={getValue('early_send', 50)}
            min={0} max={100} defaultValue={50} unit="%"
            onChange={(v) => setValue('early_send', v)}
            accentColor={accentColor} size="small"
          />
        </div>
      ),
    },
  ]

  return (
    <ReverbCategoryLayout
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      bypassed={plugin.bypassed}
      visualization={visualization}
      size={{
        label: 'Size', value: getValue('size', 40),
        min: 10, max: 80, defaultValue: 40, unit: 'm',
        onChange: (v) => setValue('size', v),
      }}
      width={{
        label: 'Width', value: getValue('width', 100),
        min: 0, max: 100, defaultValue: 100, unit: '%',
        onChange: (v) => setValue('width', v),
      }}
      diffusion={{
        label: 'Diffuse', value: getValue('diffuse', 90),
        min: 0, max: 100, defaultValue: 90, unit: '%',
        onChange: (v) => setValue('diffuse', v),
      }}
      preDelay={{
        label: 'Pre-Delay', value: getValue('predelay', 25),
        min: 0, max: 200, defaultValue: 25, unit: 'ms',
        onChange: (v) => setValue('predelay', v),
      }}
      decay={{
        label: 'Decay', value: getValue('decay', 3.2),
        min: 0.5, max: 20, defaultValue: 3.2, step: 0.1, unit: 's',
        onChange: (v) => setValue('decay', v), isLogarithmic: true,
      }}
      highCut={{
        label: 'High Cut', value: getValue('high_cut', 6000),
        min: 1000, max: 16000, defaultValue: 6000, unit: 'Hz',
        onChange: (v) => setValue('high_cut', v), isLogarithmic: true,
        valueFormatter: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)),
      }}
      lowCut={{
        label: 'Low Cut', value: getValue('low_cut', 100),
        min: 0, max: 500, defaultValue: 100, unit: 'Hz',
        onChange: (v) => setValue('low_cut', v),
      }}
      dryLevel={{
        label: 'Dry', value: getValue('dry_level', 70),
        min: 0, max: 100, defaultValue: 70, unit: '%',
        onChange: (v) => setValue('dry_level', v),
      }}
      wetLevel={{
        label: 'Wet', value: getValue('wet_level', 30),
        min: 0, max: 100, defaultValue: 30, unit: '%',
        onChange: (v) => setValue('wet_level', v),
      }}
      earlyLevel={{
        label: 'Early', value: getValue('early_level', 40),
        min: 0, max: 100, defaultValue: 40, unit: '%',
        onChange: (v) => setValue('early_level', v),
      }}
      lateLevel={{
        label: 'Late', value: getValue('late_level', 80),
        min: 0, max: 100, defaultValue: 80, unit: '%',
        onChange: (v) => setValue('late_level', v),
      }}
      advancedSections={advancedSections}
    />
  )
}

export default DragonflyHallCard
