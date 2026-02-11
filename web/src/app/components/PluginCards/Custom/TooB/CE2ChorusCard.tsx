/**
 * CE2ChorusCard - TooB CE-2 Chorus (Boss CE-2 clone)
 *
 * Based on the classic Boss CE-2 chorus pedal.
 * Famous for its simplicity - just Rate and Depth controls.
 *
 * Parameters (simplified like original CE-2):
 * - rate: LFO rate (0.1 - 5Hz)
 * - depth: Modulation depth (0-100%)
 */

import { PluginCardShell } from '../../Base/PluginCardShell'
import { ParameterSection } from '../../Base/ParameterSection'
import { ParameterRow } from '../../Base/ParameterRow'
import { ParameterKnob } from '../../../Controls/ParameterKnob'
import { LFOWaveform } from '../../Visualizations/LFOWaveform'
import type { PluginCardProps } from '../../types'

// Parameter indices for CE-2 Chorus
const PARAM_MAP = {
  rate: 0,
  depth: 1,
}

export function CE2ChorusCard({
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
    <PluginCardShell
      plugin={plugin}
      accentColor={accentColor}
      bypassed={plugin.bypassed}
      visualization={visualization}
      compact={compact}
    >
      {/* Classic CE-2 Layout - Just two big knobs like the original */}
      <ParameterSection title="Boss CE-2 Style Chorus" accentColor={accentColor}>
        <ParameterRow justify="space-around">
          <ParameterKnob
            label="Rate"
            value={getValue('rate', 0.8)}
            min={0.1}
            max={5}
            defaultValue={0.8}
            step={0.1}
            unit="Hz"
            onChange={(v) => setValue('rate', v)}
            isLogarithmic
            accentColor={accentColor}
            size="large"
          />
          <ParameterKnob
            label="Depth"
            value={getValue('depth', 50)}
            min={0}
            max={100}
            defaultValue={50}
            unit="%"
            onChange={(v) => setValue('depth', v)}
            accentColor={accentColor}
            size="large"
          />
        </ParameterRow>
      </ParameterSection>

      {/* CE-2 Info */}
      <div
        style={{
          textAlign: 'center',
          padding: '8px',
          fontSize: '10px',
          color: '#666',
          fontStyle: 'italic',
        }}
      >
        Classic BBD chorus warmth
      </div>
    </PluginCardShell>
  )
}

export default CE2ChorusCard
