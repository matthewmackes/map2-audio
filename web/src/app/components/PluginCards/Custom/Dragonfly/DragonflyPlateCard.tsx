/**
 * DragonflyPlateCard - Dragonfly Plate Reverb
 *
 * Based on https://github.com/michaelwillis/dragonfly-reverb
 * Classic studio plate reverb with dense, smooth decay.
 */

import { PluginCardShell } from '../../Base/PluginCardShell'
import { ParameterSection } from '../../Base/ParameterSection'
import { ParameterRow } from '../../Base/ParameterRow'
import { ParameterKnob } from '../../../Controls/ParameterKnob'
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
    <PluginCardShell
      plugin={plugin}
      accentColor={accentColor}
      bypassed={plugin.bypassed}
      visualization={visualization}
      compact={compact}
    >
      {/* Plate Section */}
      <ParameterSection title="Plate" accentColor={accentColor}>
        <ParameterRow>
          <ParameterKnob
            label="Decay"
            value={getValue('decay', 2.0)}
            min={0.1}
            max={10}
            defaultValue={2.0}
            step={0.1}
            unit="s"
            onChange={(v) => setValue('decay', v)}
            isLogarithmic
            accentColor={accentColor}
            size="large"
          />
          <ParameterKnob
            label="Damping"
            value={getValue('damping', 50)}
            min={0}
            max={100}
            defaultValue={50}
            unit="%"
            onChange={(v) => setValue('damping', v)}
            accentColor={accentColor}
            size="large"
          />
        </ParameterRow>
      </ParameterSection>

      {/* Shape Section */}
      <ParameterSection title="Shape" accentColor={accentColor}>
        <ParameterRow>
          <ParameterKnob
            label="Pre-Delay"
            value={getValue('predelay', 5)}
            min={0}
            max={100}
            defaultValue={5}
            unit="ms"
            onChange={(v) => setValue('predelay', v)}
            accentColor={accentColor}
            size="medium"
          />
          <ParameterKnob
            label="Width"
            value={getValue('width', 100)}
            min={0}
            max={100}
            defaultValue={100}
            unit="%"
            onChange={(v) => setValue('width', v)}
            accentColor={accentColor}
            size="medium"
          />
        </ParameterRow>
      </ParameterSection>

      {/* Filter Section */}
      <ParameterSection title="Filter" accentColor={accentColor}>
        <ParameterRow>
          <ParameterKnob
            label="Low Cut"
            value={getValue('low_cut', 80)}
            min={20}
            max={500}
            defaultValue={80}
            unit="Hz"
            onChange={(v) => setValue('low_cut', v)}
            isLogarithmic
            accentColor={accentColor}
            size="medium"
          />
          <ParameterKnob
            label="High Cut"
            value={getValue('high_cut', 12000)}
            min={1000}
            max={20000}
            defaultValue={12000}
            unit="Hz"
            onChange={(v) => setValue('high_cut', v)}
            isLogarithmic
            valueFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0))}
            accentColor={accentColor}
            size="medium"
          />
        </ParameterRow>
      </ParameterSection>

      {/* Mix Section */}
      <ParameterSection title="Mix" accentColor={accentColor}>
        <ParameterRow justify="center">
          <ParameterKnob
            label="Dry"
            value={getValue('dry_level', 80)}
            min={0}
            max={100}
            defaultValue={80}
            unit="%"
            onChange={(v) => setValue('dry_level', v)}
            accentColor={accentColor}
            size="medium"
          />
          <ParameterKnob
            label="Wet"
            value={getValue('wet_level', 30)}
            min={0}
            max={100}
            defaultValue={30}
            unit="%"
            onChange={(v) => setValue('wet_level', v)}
            accentColor={accentColor}
            size="medium"
          />
        </ParameterRow>
      </ParameterSection>
    </PluginCardShell>
  )
}

export default DragonflyPlateCard
