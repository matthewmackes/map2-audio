/**
 * TremoloCard - TooB Tremolo
 *
 * Classic amplitude modulation tremolo effect.
 *
 * Parameters:
 * - rate: LFO rate
 * - depth: Modulation depth
 * - waveform: LFO waveform shape
 */

import { PluginCardShell } from '../../Base/PluginCardShell'
import { ParameterSection } from '../../Base/ParameterSection'
import { ParameterRow } from '../../Base/ParameterRow'
import { ParameterKnob } from '../../../Controls/ParameterKnob'
import { LFOWaveform } from '../../Visualizations/LFOWaveform'
import type { PluginCardProps } from '../../types'

// Parameter indices for Tremolo
const PARAM_MAP = {
  rate: 0,
  depth: 1,
  waveform: 2,
}

const WAVEFORM_OPTIONS = ['sine', 'triangle', 'square', 'saw'] as const

export function TremoloCard({
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

  const waveformIndex = Math.round(getValue('waveform', 0))
  const waveformName = WAVEFORM_OPTIONS[waveformIndex] || 'sine'

  const visualization = (
    <LFOWaveform
      rate={getValue('rate', 4)}
      depth={getValue('depth', 50)}
      waveform={waveformName}
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
      {/* Tremolo Controls */}
      <ParameterSection title="Tremolo" accentColor={accentColor}>
        <ParameterRow>
          <ParameterKnob
            label="Rate"
            value={getValue('rate', 4)}
            min={0.5}
            max={20}
            defaultValue={4}
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

      {/* Waveform Selection */}
      <ParameterSection title="Waveform" accentColor={accentColor}>
        <div
          style={{
            display: 'flex',
            gap: '8px',
            justifyContent: 'center',
            padding: '8px 0',
          }}
        >
          {WAVEFORM_OPTIONS.map((wf, idx) => (
            <button
              key={wf}
              onClick={() => setValue('waveform', idx)}
              style={{
                padding: '8px 12px',
                background: waveformIndex === idx ? accentColor : '#333',
                border: `1px solid ${waveformIndex === idx ? accentColor : '#555'}`,
                borderRadius: '4px',
                color: waveformIndex === idx ? '#000' : '#888',
                cursor: 'pointer',
                fontSize: '10px',
                fontWeight: 600,
                textTransform: 'uppercase',
              }}
            >
              {wf}
            </button>
          ))}
        </div>
      </ParameterSection>
    </PluginCardShell>
  )
}

export default TremoloCard
