/**
 * EQTemplate — Carbon-compliant fallback for unknown EQ plugins
 *
 * Wraps EQCategoryLayout, detecting bands from parameter names.
 */

import { useMemo, useState, useCallback } from 'react'
import type { PluginCardProps } from '../types'
import { getCategoryConfig } from '../types'
import { EQCategoryLayout, type EQBandConfig } from '../Layouts/EQCategoryLayout'
import type { AdvancedSection } from '../Base/CarbonCardShell'
import { CarbonParameterSection } from '../Base/CarbonParameterSection'
import { ParameterKnob } from '../../Controls/ParameterKnob'
import type { ParamSlot } from '../Layouts/DynamicsCategoryLayout'
import type { PluginParameter } from '../../../../map2/types'

const FREQ_PATTERNS = ['freq', 'frequency', 'hz', 'fc', 'cutoff']
const GAIN_PATTERNS = ['gain', 'level', 'db', 'boost', 'cut']
const Q_PATTERNS = ['q', 'bw', 'bandwidth', 'resonance', 'width']
const LOW_PATTERNS = ['low', 'bass', 'lf']
const MID_PATTERNS = ['mid', 'middle', 'mf']
const HIGH_PATTERNS = ['high', 'treble', 'hf']
const MASTER_PATTERNS = ['master', 'output', 'out', 'volume', 'level']

function matchesPatterns(p: PluginParameter, patterns: string[]): boolean {
  return patterns.some(pat =>
    p.name.toLowerCase().includes(pat) || p.symbol.toLowerCase().includes(pat)
  )
}

function toParamSlot(
  param: PluginParameter,
  parameterValues: Record<number, number>,
  onParameterChange: (i: number, v: number) => void,
  overrides?: Partial<ParamSlot>,
): ParamSlot {
  return {
    label: overrides?.label ?? param.name,
    value: parameterValues[param.index] ?? param.default,
    min: param.min,
    max: param.max,
    defaultValue: param.default,
    unit: overrides?.unit,
    onChange: (v: number) => onParameterChange(param.index, v),
    isLogarithmic: overrides?.isLogarithmic ?? param.is_log,
    valueFormatter: overrides?.valueFormatter,
  }
}

interface DetectedBand {
  name: string
  freqParam?: PluginParameter
  gainParam?: PluginParameter
  qParam?: PluginParameter
  estimatedFreq: number
}

function detectEQBands(params: PluginParameter[]): DetectedBand[] {
  const bands: DetectedBand[] = []

  // Simple 3-band
  const lowGain = params.find(p =>
    matchesPatterns(p, LOW_PATTERNS) && matchesPatterns(p, GAIN_PATTERNS)
  )
  const midGain = params.find(p =>
    matchesPatterns(p, MID_PATTERNS) && matchesPatterns(p, GAIN_PATTERNS)
  )
  const highGain = params.find(p =>
    matchesPatterns(p, HIGH_PATTERNS) && matchesPatterns(p, GAIN_PATTERNS)
  )

  if (lowGain) {
    const lowFreq = params.find(p =>
      matchesPatterns(p, LOW_PATTERNS) && matchesPatterns(p, FREQ_PATTERNS)
    )
    bands.push({ name: 'Low', gainParam: lowGain, freqParam: lowFreq, estimatedFreq: 200 })
  }
  if (midGain) {
    const midFreq = params.find(p =>
      matchesPatterns(p, MID_PATTERNS) && matchesPatterns(p, FREQ_PATTERNS)
    )
    bands.push({ name: 'Mid', gainParam: midGain, freqParam: midFreq, estimatedFreq: 1000 })
  }
  if (highGain) {
    const highFreq = params.find(p =>
      matchesPatterns(p, HIGH_PATTERNS) && matchesPatterns(p, FREQ_PATTERNS)
    )
    bands.push({ name: 'High', gainParam: highGain, freqParam: highFreq, estimatedFreq: 4000 })
  }

  // Numbered bands fallback
  if (bands.length === 0) {
    const numberedParams = params.filter(p =>
      /\d+/.test(p.name) &&
      (matchesPatterns(p, FREQ_PATTERNS) || matchesPatterns(p, GAIN_PATTERNS))
    )
    const bandNumbers = new Set<number>()
    numberedParams.forEach(p => {
      const match = p.name.match(/(\d+)/)
      if (match) bandNumbers.add(parseInt(match[1]))
    })
    bandNumbers.forEach(num => {
      const freqP = params.find(p => p.name.includes(`${num}`) && matchesPatterns(p, FREQ_PATTERNS))
      const gainP = params.find(p => p.name.includes(`${num}`) && matchesPatterns(p, GAIN_PATTERNS))
      const qP = params.find(p => p.name.includes(`${num}`) && matchesPatterns(p, Q_PATTERNS))
      if (gainP || freqP) {
        bands.push({
          name: `Band ${num}`,
          freqParam: freqP, gainParam: gainP, qParam: qP,
          estimatedFreq: freqP?.default ?? 200 * Math.pow(3, num - 1),
        })
      }
    })
  }

  return bands.sort((a, b) => a.estimatedFreq - b.estimatedFreq)
}

export function EQTemplate({
  plugin,
  parameterValues,
  onParameterChange,
  accentColor: providedAccent,
  compact = false,
}: PluginCardProps) {
  const catConfig = getCategoryConfig(plugin.category)
  const accentColor = providedAccent || catConfig.color
  const params = plugin.parameters || []

  const detectedBands = useMemo(() => detectEQBands(params), [params])

  const masterParam = params.find(p => matchesPatterns(p, MASTER_PATTERNS))

  const usedIndices = new Set<number>()
  detectedBands.forEach(b => {
    if (b.freqParam) usedIndices.add(b.freqParam.index)
    if (b.gainParam) usedIndices.add(b.gainParam.index)
    if (b.qParam) usedIndices.add(b.qParam.index)
  })
  if (masterParam) usedIndices.add(masterParam.index)
  const otherParams = params.filter(p => !usedIndices.has(p.index))

  const formatFreq = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`)
  const formatDb = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`
  const formatQ = (v: number) => v.toFixed(2)

  // Build EQBandConfig[] for the layout
  const [enabledBands, setEnabledBands] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(detectedBands.map((_, i) => [i, true]))
  )

  const bandConfigs: EQBandConfig[] = useMemo(() =>
    detectedBands.map((band, i) => ({
      id: band.name,
      enabled: enabledBands[i] ?? true,
      onToggleEnabled: () => setEnabledBands(prev => ({ ...prev, [i]: !prev[i] })),
      frequency: band.freqParam
        ? toParamSlot(band.freqParam, parameterValues, onParameterChange, {
            label: 'Freq', unit: 'Hz', isLogarithmic: true, valueFormatter: formatFreq,
          })
        : { label: 'Freq', value: band.estimatedFreq, min: 20, max: 20000, defaultValue: band.estimatedFreq, unit: 'Hz', onChange: () => {} },
      gain: band.gainParam
        ? toParamSlot(band.gainParam, parameterValues, onParameterChange, {
            label: 'Gain', unit: 'dB', valueFormatter: formatDb,
          })
        : { label: 'Gain', value: 0, min: -12, max: 12, defaultValue: 0, unit: 'dB', onChange: () => {} },
      q: band.qParam
        ? toParamSlot(band.qParam, parameterValues, onParameterChange, {
            label: 'Q', isLogarithmic: true, valueFormatter: formatQ,
          })
        : { label: 'Q', value: 1, min: 0.1, max: 10, defaultValue: 1, onChange: () => {} },
    })),
    [detectedBands, enabledBands, parameterValues, onParameterChange]
  )

  const advancedSections: AdvancedSection[] = useMemo(() => {
    if (otherParams.length === 0) return []
    return [{
      id: 'other',
      title: 'More',
      children: (
        <CarbonParameterSection>
          {otherParams.map(p => (
            <ParameterKnob
              key={p.index}
              label={p.name}
              value={parameterValues[p.index] ?? p.default}
              min={p.min}
              max={p.max}
              defaultValue={p.default}
              onChange={(v) => onParameterChange(p.index, v)}
              accentColor={accentColor}
              isLogarithmic={p.is_log}
              size="small"
            />
          ))}
        </CarbonParameterSection>
      ),
    }]
  }, [otherParams, parameterValues, onParameterChange, accentColor])

  return (
    <EQCategoryLayout
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      bypassed={plugin.bypassed}
      bands={bandConfigs}
      outputGain={masterParam
        ? toParamSlot(masterParam, parameterValues, onParameterChange, {
            label: 'Master', unit: 'dB', valueFormatter: formatDb,
          })
        : undefined
      }
      advancedSections={advancedSections}
    />
  )
}

export default EQTemplate
