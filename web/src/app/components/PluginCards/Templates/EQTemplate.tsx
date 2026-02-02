/**
 * EQTemplate Component
 *
 * Template for EQ plugins with frequency response visualization.
 * Adapts to any number of bands from plugin parameters.
 */

import { useMemo, useCallback, useState } from 'react'
import type { PluginCardProps } from '../types'
import { getCategoryConfig } from '../types'
import { PluginCardShell } from '../Base/PluginCardShell'
import { ParameterSection } from '../Base/ParameterSection'
import { ParameterRow } from '../Base/ParameterRow'
import { ParameterKnob } from '../../Controls/ParameterKnob'
import { EQCurveDisplay, type EQBandData } from '../Visualizations/EQCurveDisplay'
import type { PluginParameter } from '../../../../map2/types'

// Parameter patterns for EQ detection
const FREQ_PATTERNS = ['freq', 'frequency', 'hz', 'fc', 'cutoff']
const GAIN_PATTERNS = ['gain', 'level', 'db', 'boost', 'cut']
const Q_PATTERNS = ['q', 'bw', 'bandwidth', 'resonance', 'width']
const LOW_PATTERNS = ['low', 'bass', 'lf']
const MID_PATTERNS = ['mid', 'middle', 'mf']
const HIGH_PATTERNS = ['high', 'treble', 'hf']
const MASTER_PATTERNS = ['master', 'output', 'out', 'volume', 'level']

interface DetectedBand {
  name: string
  freqParam?: PluginParameter
  gainParam?: PluginParameter
  qParam?: PluginParameter
  estimatedFreq: number
}

function detectEQBands(parameters: PluginParameter[]): DetectedBand[] {
  const bands: DetectedBand[] = []

  // Check for simple 3-band EQ (Low/Mid/High)
  const lowGain = parameters.find(p =>
    LOW_PATTERNS.some(pat => p.name.toLowerCase().includes(pat)) &&
    GAIN_PATTERNS.some(pat => p.name.toLowerCase().includes(pat) || p.symbol.toLowerCase().includes(pat))
  )
  const midGain = parameters.find(p =>
    MID_PATTERNS.some(pat => p.name.toLowerCase().includes(pat)) &&
    GAIN_PATTERNS.some(pat => p.name.toLowerCase().includes(pat) || p.symbol.toLowerCase().includes(pat))
  )
  const highGain = parameters.find(p =>
    HIGH_PATTERNS.some(pat => p.name.toLowerCase().includes(pat)) &&
    GAIN_PATTERNS.some(pat => p.name.toLowerCase().includes(pat) || p.symbol.toLowerCase().includes(pat))
  )

  if (lowGain) {
    const lowFreq = parameters.find(p =>
      LOW_PATTERNS.some(pat => p.name.toLowerCase().includes(pat)) &&
      FREQ_PATTERNS.some(pat => p.name.toLowerCase().includes(pat))
    )
    bands.push({ name: 'Low', gainParam: lowGain, freqParam: lowFreq, estimatedFreq: 200 })
  }

  if (midGain) {
    const midFreq = parameters.find(p =>
      MID_PATTERNS.some(pat => p.name.toLowerCase().includes(pat)) &&
      FREQ_PATTERNS.some(pat => p.name.toLowerCase().includes(pat))
    )
    bands.push({ name: 'Mid', gainParam: midGain, freqParam: midFreq, estimatedFreq: 1000 })
  }

  if (highGain) {
    const highFreq = parameters.find(p =>
      HIGH_PATTERNS.some(pat => p.name.toLowerCase().includes(pat)) &&
      FREQ_PATTERNS.some(pat => p.name.toLowerCase().includes(pat))
    )
    bands.push({ name: 'High', gainParam: highGain, freqParam: highFreq, estimatedFreq: 4000 })
  }

  // If no 3-band detected, look for numbered bands
  if (bands.length === 0) {
    // Look for patterns like "Band 1 Freq", "EQ1 Gain", etc.
    const numberedParams = parameters.filter(p =>
      /\d+/.test(p.name) &&
      (FREQ_PATTERNS.some(pat => p.name.toLowerCase().includes(pat)) ||
       GAIN_PATTERNS.some(pat => p.name.toLowerCase().includes(pat)))
    )

    const bandNumbers = new Set<number>()
    numberedParams.forEach(p => {
      const match = p.name.match(/(\d+)/)
      if (match) bandNumbers.add(parseInt(match[1]))
    })

    bandNumbers.forEach(num => {
      const freqParam = parameters.find(p =>
        p.name.includes(`${num}`) &&
        FREQ_PATTERNS.some(pat => p.name.toLowerCase().includes(pat))
      )
      const gainParam = parameters.find(p =>
        p.name.includes(`${num}`) &&
        GAIN_PATTERNS.some(pat => p.name.toLowerCase().includes(pat))
      )
      const qParam = parameters.find(p =>
        p.name.includes(`${num}`) &&
        Q_PATTERNS.some(pat => p.name.toLowerCase().includes(pat))
      )

      if (gainParam || freqParam) {
        const defaultFreq = freqParam ? freqParam.default : 200 * Math.pow(3, num - 1)
        bands.push({
          name: `Band ${num}`,
          freqParam,
          gainParam,
          qParam,
          estimatedFreq: defaultFreq
        })
      }
    })
  }

  // If still nothing, look for any frequency/gain pairs
  if (bands.length === 0) {
    const freqParams = parameters.filter(p =>
      FREQ_PATTERNS.some(pat => p.name.toLowerCase().includes(pat) || p.symbol.toLowerCase().includes(pat))
    )
    const gainParams = parameters.filter(p =>
      GAIN_PATTERNS.some(pat => p.name.toLowerCase().includes(pat)) &&
      !MASTER_PATTERNS.some(pat => p.name.toLowerCase().includes(pat))
    )

    // Match by position or just use gains
    const numBands = Math.max(freqParams.length, gainParams.length)
    for (let i = 0; i < numBands; i++) {
      bands.push({
        name: `Band ${i + 1}`,
        freqParam: freqParams[i],
        gainParam: gainParams[i],
        estimatedFreq: freqParams[i]?.default || 200 * Math.pow(3, i)
      })
    }
  }

  return bands.sort((a, b) => a.estimatedFreq - b.estimatedFreq)
}

export function EQTemplate({
  plugin,
  parameterValues,
  onParameterChange,
  onParameterChangeEnd,
  accentColor: providedAccent,
  disabled = false,
  compact = false,
}: PluginCardProps) {
  const catConfig = getCategoryConfig(plugin.category)
  const accentColor = providedAccent || catConfig.color

  const [selectedBand, setSelectedBand] = useState<number | null>(null)

  // Detect EQ bands from parameters
  const detectedBands = useMemo(() =>
    detectEQBands(plugin.parameters || []),
    [plugin.parameters]
  )

  // Find master/output parameter
  const masterParam = (plugin.parameters || []).find(p =>
    MASTER_PATTERNS.some(pat => p.name.toLowerCase().includes(pat))
  )

  // Get used parameter indices
  const usedParamIndices = new Set<number>()
  detectedBands.forEach(band => {
    if (band.freqParam) usedParamIndices.add(band.freqParam.index)
    if (band.gainParam) usedParamIndices.add(band.gainParam.index)
    if (band.qParam) usedParamIndices.add(band.qParam.index)
  })
  if (masterParam) usedParamIndices.add(masterParam.index)

  const otherParams = (plugin.parameters || []).filter(p => !usedParamIndices.has(p.index))

  // Build EQ band data for visualization
  const eqBandData: EQBandData[] = useMemo(() => {
    return detectedBands.map(band => {
      const freq = band.freqParam
        ? (parameterValues[band.freqParam.index] ?? band.freqParam.default)
        : band.estimatedFreq
      const gain = band.gainParam
        ? (parameterValues[band.gainParam.index] ?? band.gainParam.default)
        : 0
      const q = band.qParam
        ? (parameterValues[band.qParam.index] ?? band.qParam.default)
        : 1

      return { frequency: freq, gain, q, type: 'peak' as const, enabled: true }
    })
  }, [detectedBands, parameterValues])

  // Parameter change handler
  const handleChange = useCallback((index: number) => (value: number) => {
    onParameterChange(index, value)
  }, [onParameterChange])

  // Value formatters
  const formatFreq = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`
  const formatDb = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`
  const formatQ = (v: number) => v.toFixed(2)

  // Visualization
  const visualization = detectedBands.length > 0 ? (
    <EQCurveDisplay
      bands={eqBandData}
      outputGain={masterParam ? (parameterValues[masterParam.index] ?? masterParam.default) : 0}
      width={compact ? 260 : 320}
      height={compact ? 90 : 120}
      accentColor={accentColor}
      interactive={true}
      selectedBand={selectedBand}
      onBandSelect={setSelectedBand}
    />
  ) : null

  return (
    <PluginCardShell
      plugin={plugin}
      accentColor={accentColor}
      bypassed={plugin.bypassed}
      visualization={visualization}
      compact={compact}
    >
      <div className="eq-parameters">
        {/* Band Controls */}
        {detectedBands.length > 0 && (
          <ParameterSection title="Bands" accentColor={accentColor}>
            <div className="eq-bands-grid">
              {detectedBands.map((band, index) => (
                <div
                  key={index}
                  className={`eq-band-control ${selectedBand === index ? 'selected' : ''}`}
                  onClick={() => setSelectedBand(selectedBand === index ? null : index)}
                >
                  <div className="eq-band-label">{band.name}</div>
                  <ParameterRow gap={8}>
                    {band.freqParam && (
                      <ParameterKnob
                        label="Freq"
                        value={parameterValues[band.freqParam.index] ?? band.freqParam.default}
                        min={band.freqParam.min}
                        max={band.freqParam.max}
                        defaultValue={band.freqParam.default}
                        unit="Hz"
                        onChange={handleChange(band.freqParam.index)}
                        onChangeEnd={onParameterChangeEnd}
                        accentColor={accentColor}
                        disabled={disabled}
                        isLogarithmic={band.freqParam.is_log || band.freqParam.max > 1000}
                        valueFormatter={formatFreq}
                        size="small"
                      />
                    )}
                    {band.gainParam && (
                      <ParameterKnob
                        label="Gain"
                        value={parameterValues[band.gainParam.index] ?? band.gainParam.default}
                        min={band.gainParam.min}
                        max={band.gainParam.max}
                        defaultValue={band.gainParam.default}
                        unit="dB"
                        onChange={handleChange(band.gainParam.index)}
                        onChangeEnd={onParameterChangeEnd}
                        accentColor={accentColor}
                        disabled={disabled}
                        valueFormatter={formatDb}
                        size="small"
                      />
                    )}
                    {band.qParam && (
                      <ParameterKnob
                        label="Q"
                        value={parameterValues[band.qParam.index] ?? band.qParam.default}
                        min={band.qParam.min}
                        max={band.qParam.max}
                        defaultValue={band.qParam.default}
                        onChange={handleChange(band.qParam.index)}
                        onChangeEnd={onParameterChangeEnd}
                        accentColor={accentColor}
                        disabled={disabled}
                        isLogarithmic
                        valueFormatter={formatQ}
                        size="small"
                      />
                    )}
                  </ParameterRow>
                </div>
              ))}
            </div>
          </ParameterSection>
        )}

        {/* Master Output */}
        {masterParam && (
          <ParameterSection title="Output" accentColor={accentColor}>
            <ParameterRow justify="center">
              <ParameterKnob
                label="Master"
                value={parameterValues[masterParam.index] ?? masterParam.default}
                min={masterParam.min}
                max={masterParam.max}
                defaultValue={masterParam.default}
                unit="dB"
                onChange={handleChange(masterParam.index)}
                onChangeEnd={onParameterChangeEnd}
                accentColor={accentColor}
                disabled={disabled}
                valueFormatter={formatDb}
                size={compact ? 'small' : 'medium'}
              />
            </ParameterRow>
          </ParameterSection>
        )}

        {/* Other Parameters */}
        {otherParams.length > 0 && (
          <ParameterSection title="More" accentColor={accentColor} collapsible defaultCollapsed>
            <ParameterRow>
              {otherParams.map(param => (
                <ParameterKnob
                  key={param.index}
                  label={param.name}
                  value={parameterValues[param.index] ?? param.default}
                  min={param.min}
                  max={param.max}
                  defaultValue={param.default}
                  onChange={handleChange(param.index)}
                  onChangeEnd={onParameterChangeEnd}
                  accentColor={accentColor}
                  disabled={disabled}
                  isLogarithmic={param.is_log}
                  size="small"
                />
              ))}
            </ParameterRow>
          </ParameterSection>
        )}
      </div>

      <style>{`
        .eq-parameters {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .eq-bands-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
          gap: 12px;
        }

        .eq-band-control {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 8px;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .eq-band-control:hover {
          background: rgba(0, 0, 0, 0.3);
        }

        .eq-band-control.selected {
          border-color: ${accentColor}60;
          background: ${accentColor}10;
        }

        .eq-band-label {
          font-size: 10px;
          font-weight: 600;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .eq-band-control.selected .eq-band-label {
          color: ${accentColor};
        }
      `}</style>
    </PluginCardShell>
  )
}

export default EQTemplate
