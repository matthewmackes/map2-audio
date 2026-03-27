/**
 * DragonflyRoomCard - Dragonfly Room Reverb
 *
 * Based on https://github.com/michaelwillis/dragonfly-reverb
 *
 * Parameters:
 * - dry_level: 0-100%
 * - wet_level: 0-100%
 * - width: 0-100%
 * - predelay: 0-100ms
 * - decay: 0.1-10s
 * - diffuse: 0-100%
 * - spin: 0-5Hz
 * - wander: 0-100%
 * - high_cut: 1000-16000Hz
 * - early_level: 0-100%
 * - late_level: 0-100%
 * - low_cut: 0-200Hz
 * - size: 10-60m (room size in meters)
 */

import { ReverbCategoryLayout } from '../../Layouts/ReverbCategoryLayout'
import { ReverbDecayCurve } from '../../Visualizations/ReverbDecayCurve'
import { ParameterKnob } from '../../../ParameterControl'
import type { PluginCardProps } from '../../types'
import type { AdvancedSection } from '../../Base/CarbonCardShell'
import { Activity } from '@carbon/icons-react'

// Parameter indices for Dragonfly Room Reverb (from LV2 manifest)
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
  spin: 9,
  wander: 10,
  high_cut: 11,
  low_cut: 12,
}

export function DragonflyRoomCard({
  plugin,
  parameterValues,
  onParameterChange,
  accentColor = '#a855f7',
  compact = false,
}: PluginCardProps) {
  const getValue = (key: keyof typeof PARAM_MAP, defaultVal: number) =>
    parameterValues[PARAM_MAP[key]] ?? defaultVal

  const setValue = (key: keyof typeof PARAM_MAP, value: number) =>
    onParameterChange(PARAM_MAP[key], value)

  const visualization = (
    <ReverbDecayCurve
      decayTime={getValue('decay', 1.6)}
      preDelay={getValue('predelay', 10)}
      earlyReflections={getValue('early_level', 60)}
      damping={100 - (getValue('high_cut', 8000) / 16000) * 100}
      width={compact ? 336 : 448}
      height={compact ? 112 : 140}
      accentColor={accentColor}
    />
  )

  const advancedSections: AdvancedSection[] = [
    {
      id: 'character',
      title: 'Character',
      icon: <Activity size={16} />,
      children: (
        <div className="carbon-param-row">
          <ParameterKnob
            label="Spin" value={getValue('spin', 0.4)}
            min={0} max={5} defaultValue={0.4} step={0.1} unit="Hz"
            onChange={(v) => setValue('spin', v)}
            accentColor={accentColor} size="small"
          />
          <ParameterKnob
            label="Wander" value={getValue('wander', 10)}
            min={0} max={100} defaultValue={10} unit="%"
            onChange={(v) => setValue('wander', v)}
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
        label: 'Size', value: getValue('size', 24),
        min: 10, max: 60, defaultValue: 24, unit: 'm',
        onChange: (v) => setValue('size', v),
      }}
      width={{
        label: 'Width', value: getValue('width', 80),
        min: 0, max: 100, defaultValue: 80, unit: '%',
        onChange: (v) => setValue('width', v),
      }}
      diffusion={{
        label: 'Diffuse', value: getValue('diffuse', 80),
        min: 0, max: 100, defaultValue: 80, unit: '%',
        onChange: (v) => setValue('diffuse', v),
      }}
      preDelay={{
        label: 'Pre-Delay', value: getValue('predelay', 10),
        min: 0, max: 100, defaultValue: 10, unit: 'ms',
        onChange: (v) => setValue('predelay', v),
      }}
      decay={{
        label: 'Decay', value: getValue('decay', 1.6),
        min: 0.1, max: 10, defaultValue: 1.6, step: 0.1, unit: 's',
        onChange: (v) => setValue('decay', v), isLogarithmic: true,
      }}
      highCut={{
        label: 'High Cut', value: getValue('high_cut', 8000),
        min: 1000, max: 16000, defaultValue: 8000, unit: 'Hz',
        onChange: (v) => setValue('high_cut', v), isLogarithmic: true,
        valueFormatter: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)),
      }}
      lowCut={{
        label: 'Low Cut', value: getValue('low_cut', 80),
        min: 0, max: 200, defaultValue: 80, unit: 'Hz',
        onChange: (v) => setValue('low_cut', v),
      }}
      dryLevel={{
        label: 'Dry', value: getValue('dry_level', 80),
        min: 0, max: 100, defaultValue: 80, unit: '%',
        onChange: (v) => setValue('dry_level', v),
      }}
      wetLevel={{
        label: 'Wet', value: getValue('wet_level', 20),
        min: 0, max: 100, defaultValue: 20, unit: '%',
        onChange: (v) => setValue('wet_level', v),
      }}
      earlyLevel={{
        label: 'Early', value: getValue('early_level', 60),
        min: 0, max: 100, defaultValue: 60, unit: '%',
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

export default DragonflyRoomCard
