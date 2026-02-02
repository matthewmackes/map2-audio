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

import { PluginCardShell } from '../../Base/PluginCardShell'
import { ParameterSection } from '../../Base/ParameterSection'
import { ParameterRow } from '../../Base/ParameterRow'
import { ParameterKnob } from '../../../Controls/ParameterKnob'
import { ReverbDecayCurve } from '../../Visualizations/ReverbDecayCurve'
import type { PluginCardProps } from '../../types'

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
      width={compact ? 240 : 320}
      height={compact ? 80 : 100}
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
      {/* Room Section */}
      <ParameterSection title="Room" accentColor={accentColor}>
        <ParameterRow>
          <ParameterKnob
            label="Size"
            value={getValue('size', 24)}
            min={10}
            max={60}
            defaultValue={24}
            unit="m"
            onChange={(v) => setValue('size', v)}
            accentColor={accentColor}
            size="medium"
          />
          <ParameterKnob
            label="Width"
            value={getValue('width', 80)}
            min={0}
            max={100}
            defaultValue={80}
            unit="%"
            onChange={(v) => setValue('width', v)}
            accentColor={accentColor}
            size="medium"
          />
          <ParameterKnob
            label="Diffuse"
            value={getValue('diffuse', 80)}
            min={0}
            max={100}
            defaultValue={80}
            unit="%"
            onChange={(v) => setValue('diffuse', v)}
            accentColor={accentColor}
            size="medium"
          />
        </ParameterRow>
      </ParameterSection>

      {/* Time Section */}
      <ParameterSection title="Time" accentColor={accentColor}>
        <ParameterRow>
          <ParameterKnob
            label="Pre-Delay"
            value={getValue('predelay', 10)}
            min={0}
            max={100}
            defaultValue={10}
            unit="ms"
            onChange={(v) => setValue('predelay', v)}
            accentColor={accentColor}
            size="medium"
          />
          <ParameterKnob
            label="Decay"
            value={getValue('decay', 1.6)}
            min={0.1}
            max={10}
            defaultValue={1.6}
            step={0.1}
            unit="s"
            onChange={(v) => setValue('decay', v)}
            isLogarithmic
            accentColor={accentColor}
            size="medium"
          />
        </ParameterRow>
      </ParameterSection>

      {/* Character Section */}
      <ParameterSection title="Character" accentColor={accentColor}>
        <ParameterRow>
          <ParameterKnob
            label="Spin"
            value={getValue('spin', 0.4)}
            min={0}
            max={5}
            defaultValue={0.4}
            step={0.1}
            unit="Hz"
            onChange={(v) => setValue('spin', v)}
            accentColor={accentColor}
            size="small"
          />
          <ParameterKnob
            label="Wander"
            value={getValue('wander', 10)}
            min={0}
            max={100}
            defaultValue={10}
            unit="%"
            onChange={(v) => setValue('wander', v)}
            accentColor={accentColor}
            size="small"
          />
          <ParameterKnob
            label="High Cut"
            value={getValue('high_cut', 8000)}
            min={1000}
            max={16000}
            defaultValue={8000}
            unit="Hz"
            onChange={(v) => setValue('high_cut', v)}
            isLogarithmic
            valueFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0))}
            accentColor={accentColor}
            size="small"
          />
          <ParameterKnob
            label="Low Cut"
            value={getValue('low_cut', 80)}
            min={0}
            max={200}
            defaultValue={80}
            unit="Hz"
            onChange={(v) => setValue('low_cut', v)}
            accentColor={accentColor}
            size="small"
          />
        </ParameterRow>
      </ParameterSection>

      {/* Mix Section */}
      <ParameterSection title="Mix" accentColor={accentColor}>
        <ParameterRow>
          <ParameterKnob
            label="Dry"
            value={getValue('dry_level', 80)}
            min={0}
            max={100}
            defaultValue={80}
            unit="%"
            onChange={(v) => setValue('dry_level', v)}
            accentColor={accentColor}
            size="small"
          />
          <ParameterKnob
            label="Wet"
            value={getValue('wet_level', 20)}
            min={0}
            max={100}
            defaultValue={20}
            unit="%"
            onChange={(v) => setValue('wet_level', v)}
            accentColor={accentColor}
            size="small"
          />
          <ParameterKnob
            label="Early"
            value={getValue('early_level', 60)}
            min={0}
            max={100}
            defaultValue={60}
            unit="%"
            onChange={(v) => setValue('early_level', v)}
            accentColor={accentColor}
            size="small"
          />
          <ParameterKnob
            label="Late"
            value={getValue('late_level', 80)}
            min={0}
            max={100}
            defaultValue={80}
            unit="%"
            onChange={(v) => setValue('late_level', v)}
            accentColor={accentColor}
            size="small"
          />
        </ParameterRow>
      </ParameterSection>
    </PluginCardShell>
  )
}

export default DragonflyRoomCard
