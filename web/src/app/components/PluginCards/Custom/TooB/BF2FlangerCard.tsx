/**
 * BF2FlangerCard - TooB BF-2 Flanger (Boss BF-2 clone)
 *
 * Based on the classic Boss BF-2 flanger pedal.
 *
 * Parameters:
 * - manual: Base delay time
 * - depth: Modulation depth
 * - rate: LFO rate
 * - res (resonance/feedback): Feedback amount
 */

import { PluginCardShell } from '../../Base/PluginCardShell'
import { ParameterSection } from '../../Base/ParameterSection'
import { ParameterRow } from '../../Base/ParameterRow'
import { ParameterKnob } from '../../../Controls/ParameterKnob'
import { LFOWaveform } from '../../Visualizations/LFOWaveform'
import type { PluginCardProps } from '../../types'

// Parameter indices for BF-2 Flanger
const PARAM_MAP = {
  manual: 0,
  depth: 1,
  rate: 2,
  res: 3,
}

export function BF2FlangerCard({
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
      {/* BF-2 Controls */}
      <ParameterSection title="Boss BF-2 Style Flanger" accentColor={accentColor}>
        <ParameterRow>
          <ParameterKnob
            label="Manual"
            value={getValue('manual', 50)}
            min={0}
            max={100}
            defaultValue={50}
            unit="%"
            onChange={(v) => setValue('manual', v)}
            accentColor={accentColor}
            size="medium"
          />
          <ParameterKnob
            label="Depth"
            value={getValue('depth', 60)}
            min={0}
            max={100}
            defaultValue={60}
            unit="%"
            onChange={(v) => setValue('depth', v)}
            accentColor={accentColor}
            size="medium"
          />
        </ParameterRow>
        <ParameterRow>
          <ParameterKnob
            label="Rate"
            value={getValue('rate', 0.3)}
            min={0.05}
            max={5}
            defaultValue={0.3}
            step={0.05}
            unit="Hz"
            onChange={(v) => setValue('rate', v)}
            isLogarithmic
            accentColor={accentColor}
            size="medium"
          />
          <ParameterKnob
            label="Res"
            value={getValue('res', 40)}
            min={0}
            max={100}
            defaultValue={40}
            unit="%"
            onChange={(v) => setValue('res', v)}
            accentColor={accentColor}
            size="medium"
          />
        </ParameterRow>
      </ParameterSection>

      {/* BF-2 Info */}
      <div
        style={{
          textAlign: 'center',
          padding: '8px',
          fontSize: '10px',
          color: '#666',
          fontStyle: 'italic',
        }}
      >
        Classic jet sweep flanger
      </div>
    </PluginCardShell>
  )
}

export default BF2FlangerCard
