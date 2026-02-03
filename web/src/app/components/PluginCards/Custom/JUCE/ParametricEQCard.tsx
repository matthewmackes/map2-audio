/**
 * ParametricEQCard - 8-band parametric EQ from JUCE FilterProcessor
 *
 * Per-band parameters:
 * - type: FilterType (Peak, LowShelf, HighShelf, LowPass, HighPass, BandPass, Notch, AllPass)
 * - frequency: Hz (20 - 20000)
 * - gain: dB (-24 to +24)
 * - q: Q factor (0.1 to 10)
 * - enabled: boolean
 *
 * Global:
 * - outputGain: dB (-12 to +12)
 * - bypass: boolean
 */

import { useFilters, type FilterType } from '../../../../hooks/useFilters'
import { PluginCardShell } from '../../Base/PluginCardShell'
import { ParameterSection } from '../../Base/ParameterSection'
import { ParameterRow } from '../../Base/ParameterRow'
import { ParameterKnob } from '../../../Controls/ParameterKnob'
import { EQCurveDisplay } from '../../Visualizations/EQCurveDisplay'
import type { PluginCardProps } from '../../types'

const FILTER_TYPES = ['peak', 'lowshelf', 'highshelf', 'lowpass', 'highpass', 'bandpass', 'notch', 'allpass']

const FILTER_TYPE_LABELS: Record<string, string> = {
  peak: 'Peak',
  lowshelf: 'Low Shelf',
  highshelf: 'High Shelf',
  lowpass: 'Low Pass',
  highpass: 'High Pass',
  bandpass: 'Band Pass',
  notch: 'Notch',
  allpass: 'All Pass',
}

export function ParametricEQCard({
  plugin,
  accentColor = '#4ecdc4',
  compact = false,
}: PluginCardProps) {
  const {
    bands,
    outputGain,
    bypass,
    frequencyResponse,
    setBandFrequency,
    setBandGain,
    setBandQ,
    setBandType,
    setBandEnabled,
    setOutputGain,
    setBypass,
    isLoading,
  } = useFilters()

  const visualization = (
    <EQCurveDisplay
      bands={bands.map((b) => ({
        frequency: b.frequency,
        gain: b.gain,
        q: b.q,
        type: b.type as 'peak' | 'lowshelf' | 'highshelf' | 'lowpass' | 'highpass' | 'bandpass' | 'notch',
        enabled: b.enabled,
      }))}
      frequencyResponse={frequencyResponse}
      width={compact ? 280 : 380}
      height={compact ? 100 : 140}
      accentColor={accentColor}
      interactive
      onBandChange={(index: number, updates: { frequency?: number; gain?: number; q?: number }) => {
        if (updates.frequency !== undefined) setBandFrequency(index, updates.frequency)
        if (updates.gain !== undefined) setBandGain(index, updates.gain)
        if (updates.q !== undefined) setBandQ(index, updates.q)
      }}
    />
  )

  return (
    <PluginCardShell
      plugin={plugin}
      accentColor={accentColor}
      bypassed={bypass}
      onBypassToggle={() => setBypass(!bypass)}
      visualization={visualization}
      compact={compact}
    >
      {/* Band Controls - Scrollable container for 8 bands */}
      <ParameterSection title="Bands" accentColor={accentColor}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: compact ? 'repeat(4, 1fr)' : 'repeat(8, 1fr)',
            gap: '8px',
            padding: '4px',
          }}
        >
          {bands.map((band, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '8px 4px',
                background: band.enabled ? '#1a1a1a' : '#111',
                borderRadius: '6px',
                border: `1px solid ${band.enabled ? accentColor + '40' : '#333'}`,
                opacity: band.enabled ? 1 : 0.5,
                transition: 'all 0.2s',
              }}
            >
              {/* Band Header */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  width: '100%',
                  marginBottom: '8px',
                }}
              >
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 'bold',
                    color: band.enabled ? accentColor : '#666',
                  }}
                >
                  {index + 1}
                </span>
                <button
                  onClick={() => setBandEnabled(index, !band.enabled)}
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    border: 'none',
                    background: band.enabled ? accentColor : '#444',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                />
              </div>

              {/* Frequency Knob */}
              <ParameterKnob
                label="Freq"
                value={band.frequency}
                min={20}
                max={20000}
                onChange={(v) => setBandFrequency(index, v)}
                isLogarithmic
                valueFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v.toFixed(0)}`)}
                size="small"
                accentColor={accentColor}
                disabled={!band.enabled}
              />

              {/* Gain Knob */}
              <ParameterKnob
                label="Gain"
                value={band.gain}
                min={-24}
                max={24}
                defaultValue={0}
                onChange={(v) => setBandGain(index, v)}
                valueFormatter={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`}
                unit="dB"
                size="small"
                accentColor={accentColor}
                disabled={!band.enabled}
              />

              {/* Q Knob */}
              <ParameterKnob
                label="Q"
                value={band.q}
                min={0.1}
                max={10}
                defaultValue={1}
                onChange={(v) => setBandQ(index, v)}
                isLogarithmic
                size="small"
                accentColor={accentColor}
                disabled={!band.enabled}
              />

              {/* Filter Type Select */}
              <select
                value={band.type}
                onChange={(e) => setBandType(index, e.target.value as FilterType)}
                disabled={!band.enabled}
                style={{
                  width: '100%',
                  marginTop: '4px',
                  padding: '4px 2px',
                  fontSize: '9px',
                  background: '#222',
                  border: '1px solid #444',
                  borderRadius: '3px',
                  color: band.enabled ? '#fff' : '#666',
                  cursor: band.enabled ? 'pointer' : 'default',
                }}
              >
                {FILTER_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {FILTER_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </ParameterSection>

      {/* Output Section */}
      <ParameterSection title="Output" accentColor={accentColor}>
        <ParameterRow justify="center">
          <ParameterKnob
            label="Output Gain"
            value={outputGain}
            min={-12}
            max={12}
            defaultValue={0}
            step={0.1}
            unit="dB"
            onChange={setOutputGain}
            valueFormatter={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`}
            accentColor={accentColor}
            size="medium"
          />
        </ParameterRow>
      </ParameterSection>
    </PluginCardShell>
  )
}

export default ParametricEQCard
