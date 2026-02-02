/**
 * DelayCard - TooB Delay
 *
 * Versatile delay effect with feedback and filtering.
 *
 * Parameters:
 * - time: Delay time (ms or synced)
 * - feedback: Feedback amount
 * - mix: Dry/wet mix
 * - tone: High-cut filter on feedback
 */

import { PluginCardShell } from '../../Base/PluginCardShell'
import { ParameterSection } from '../../Base/ParameterSection'
import { ParameterRow } from '../../Base/ParameterRow'
import { ParameterKnob } from '../../../Controls/ParameterKnob'
import { DelayTapGrid } from '../../Visualizations/DelayTapGrid'
import type { PluginCardProps } from '../../types'

// Parameter indices for Delay
const PARAM_MAP = {
  time: 0,
  feedback: 1,
  mix: 2,
  tone: 3,
  sync: 4,
}

export function DelayCard({
  plugin,
  parameterValues,
  onParameterChange,
  accentColor = '#45b7d1',
  compact = false,
}: PluginCardProps) {
  const getValue = (key: keyof typeof PARAM_MAP, defaultVal: number) =>
    parameterValues[PARAM_MAP[key]] ?? defaultVal

  const setValue = (key: keyof typeof PARAM_MAP, value: number) =>
    onParameterChange(PARAM_MAP[key], value)

  const visualization = (
    <DelayTapGrid
      delayTimeL={getValue('time', 350)}
      feedback={getValue('feedback', 40)}
      width={compact ? 200 : 280}
      height={compact ? 60 : 80}
      accentColor={accentColor}
      maxTaps={8}
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
      {/* Delay Time Section */}
      <ParameterSection title="Time" accentColor={accentColor}>
        <ParameterRow justify="center">
          <ParameterKnob
            label="Delay"
            value={getValue('time', 350)}
            min={10}
            max={2000}
            defaultValue={350}
            step={1}
            unit="ms"
            onChange={(v) => setValue('time', v)}
            isLogarithmic
            valueFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${v.toFixed(0)}ms`)}
            accentColor={accentColor}
            size="large"
          />
        </ParameterRow>
      </ParameterSection>

      {/* Character Section */}
      <ParameterSection title="Character" accentColor={accentColor}>
        <ParameterRow>
          <ParameterKnob
            label="Feedback"
            value={getValue('feedback', 40)}
            min={0}
            max={100}
            defaultValue={40}
            unit="%"
            onChange={(v) => setValue('feedback', v)}
            accentColor={accentColor}
            size="medium"
          />
          <ParameterKnob
            label="Tone"
            value={getValue('tone', 70)}
            min={0}
            max={100}
            defaultValue={70}
            unit="%"
            onChange={(v) => setValue('tone', v)}
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
            value={getValue('mix', 30)}
            min={0}
            max={100}
            defaultValue={30}
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

export default DelayCard
