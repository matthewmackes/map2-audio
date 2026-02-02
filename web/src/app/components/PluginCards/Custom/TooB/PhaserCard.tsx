/**
 * PhaserCard - TooB Phaser
 *
 * Multi-stage phaser effect.
 *
 * Parameters:
 * - rate: LFO rate
 * - depth: Modulation depth
 * - feedback: Resonance amount
 * - stages: Number of all-pass filter stages
 */

import { PluginCardShell } from '../../Base/PluginCardShell'
import { ParameterSection } from '../../Base/ParameterSection'
import { ParameterRow } from '../../Base/ParameterRow'
import { ParameterKnob } from '../../../Controls/ParameterKnob'
import { LFOWaveform } from '../../Visualizations/LFOWaveform'
import type { PluginCardProps } from '../../types'

// Parameter indices for Phaser
const PARAM_MAP = {
  rate: 0,
  depth: 1,
  feedback: 2,
  stages: 3,
  mix: 4,
}

export function PhaserCard({
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
      rate={getValue('rate', 0.5)}
      depth={getValue('depth', 70)}
      waveform="sine"
      width={compact ? 200 : 280}
      height={compact ? 60 : 80}
      accentColor={accentColor}
      animated
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
      {/* Modulation Section */}
      <ParameterSection title="Modulation" accentColor={accentColor}>
        <ParameterRow>
          <ParameterKnob
            label="Rate"
            value={getValue('rate', 0.5)}
            min={0.05}
            max={10}
            defaultValue={0.5}
            step={0.05}
            unit="Hz"
            onChange={(v) => setValue('rate', v)}
            isLogarithmic
            accentColor={accentColor}
            size="medium"
          />
          <ParameterKnob
            label="Depth"
            value={getValue('depth', 70)}
            min={0}
            max={100}
            defaultValue={70}
            unit="%"
            onChange={(v) => setValue('depth', v)}
            accentColor={accentColor}
            size="medium"
          />
        </ParameterRow>
      </ParameterSection>

      {/* Character Section */}
      <ParameterSection title="Character" accentColor={accentColor}>
        <ParameterRow>
          <ParameterKnob
            label="Feedback"
            value={getValue('feedback', 50)}
            min={0}
            max={100}
            defaultValue={50}
            unit="%"
            onChange={(v) => setValue('feedback', v)}
            accentColor={accentColor}
            size="medium"
          />
          <ParameterKnob
            label="Stages"
            value={getValue('stages', 4)}
            min={2}
            max={12}
            defaultValue={4}
            step={2}
            onChange={(v) => setValue('stages', v)}
            valueFormatter={(v) => v.toFixed(0)}
            accentColor={accentColor}
            size="medium"
          />
        </ParameterRow>
      </ParameterSection>

      {/* Mix Section */}
      <ParameterSection title="Mix" accentColor={accentColor}>
        <ParameterRow justify="center">
          <ParameterKnob
            label="Mix"
            value={getValue('mix', 50)}
            min={0}
            max={100}
            defaultValue={50}
            unit="%"
            onChange={(v) => setValue('mix', v)}
            accentColor={accentColor}
            size="medium"
          />
        </ParameterRow>
      </ParameterSection>
    </PluginCardShell>
  )
}

export default PhaserCard
