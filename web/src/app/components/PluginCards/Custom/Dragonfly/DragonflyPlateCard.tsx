/**
 * DragonflyPlateCard - Dragonfly Plate Reverb
 *
 * Based on https://github.com/michaelwillis/dragonfly-reverb
 * Classic studio plate reverb with dense, smooth decay.
 */

import { ReverbCategoryLayout } from '../../Layouts/ReverbCategoryLayout'
import { ReverbDecayCurve } from '../../Visualizations/ReverbDecayCurve'
import type { PluginCardProps } from '../../types'

// Parameter indices for Dragonfly Plate Reverb
const PARAM_MAP = {
  dry_level: 0,
  wet_level: 1,
  width: 2,
  predelay: 3,
  decay: 4,
  damping: 5,
  low_cut: 6,
  high_cut: 7,
}

export function DragonflyPlateCard({
  plugin,
  parameterValues,
  onParameterChange,
  accentColor = '#ec4899',
  compact = false,
}: PluginCardProps) {
  const getValue = (key: keyof typeof PARAM_MAP, defaultVal: number) =>
    parameterValues[PARAM_MAP[key]] ?? defaultVal

  const setValue = (key: keyof typeof PARAM_MAP, value: number) =>
    onParameterChange(PARAM_MAP[key], value)

  const visualization = (
    <ReverbDecayCurve
      decayTime={getValue('decay', 2.0)}
      preDelay={getValue('predelay', 5)}
      damping={getValue('damping', 50)}
      width={compact ? 336 : 448}
      height={compact ? 112 : 140}
      accentColor={accentColor}
    />
  )

  return (
    <ReverbCategoryLayout
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      bypassed={plugin.bypassed}
      visualization={visualization}
      width={{
        label: 'Width', value: getValue('width', 100),
        min: 0, max: 100, defaultValue: 100, unit: '%',
        onChange: (v) => setValue('width', v),
      }}
      preDelay={{
        label: 'Pre-Delay', value: getValue('predelay', 5),
        min: 0, max: 100, defaultValue: 5, unit: 'ms',
        onChange: (v) => setValue('predelay', v),
      }}
      decay={{
        label: 'Decay', value: getValue('decay', 2.0),
        min: 0.1, max: 10, defaultValue: 2.0, step: 0.1, unit: 's',
        onChange: (v) => setValue('decay', v), isLogarithmic: true,
      }}
      damping={{
        label: 'Damping', value: getValue('damping', 50),
        min: 0, max: 100, defaultValue: 50, unit: '%',
        onChange: (v) => setValue('damping', v),
      }}
      lowCut={{
        label: 'Low Cut', value: getValue('low_cut', 80),
        min: 20, max: 500, defaultValue: 80, unit: 'Hz',
        onChange: (v) => setValue('low_cut', v), isLogarithmic: true,
      }}
      highCut={{
        label: 'High Cut', value: getValue('high_cut', 12000),
        min: 1000, max: 20000, defaultValue: 12000, unit: 'Hz',
        onChange: (v) => setValue('high_cut', v), isLogarithmic: true,
        valueFormatter: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)),
      }}
      dryLevel={{
        label: 'Dry', value: getValue('dry_level', 80),
        min: 0, max: 100, defaultValue: 80, unit: '%',
        onChange: (v) => setValue('dry_level', v),
      }}
      wetLevel={{
        label: 'Wet', value: getValue('wet_level', 30),
        min: 0, max: 100, defaultValue: 30, unit: '%',
        onChange: (v) => setValue('wet_level', v),
      }}
    />
  )
}

export default DragonflyPlateCard
