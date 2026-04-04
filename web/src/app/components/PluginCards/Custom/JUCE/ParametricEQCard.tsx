/**
 * ParametricEQCard - Carbon-compliant JUCE 8-band Parametric EQ
 *
 * Uses EQCategoryLayout for AXE-FX Edit structural parity.
 * All parameters exposed: 8 bands (freq, gain, Q, type, enabled) + output gain.
 */

import { useFilters, type FilterType } from '../../../../hooks/useFilters'
import { EQCategoryLayout, type EQBandConfig } from '../../Layouts/EQCategoryLayout'
import { EQCurveDisplay } from '../../Visualizations/EQCurveDisplay'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import type { PluginCardProps } from '../../types'
import { resolvePluginAccentColor } from '../../../../utils/pluginAccent'

const EQ_URI = 'map2://juce/eq/parametric'

const PARAM = {
  OUTPUT_GAIN: 0,
  // Bands: index 1..24 (band * 3 + offset)
} as const

const EQ_PARAMS: PluginParamDef[] = [
  { index: 0, name: 'Output Gain', symbol: 'outputGain' },
  // Band 1
  { index: 1, name: 'Band 1 Frequency', symbol: 'band1_frequency' },
  { index: 2, name: 'Band 1 Gain', symbol: 'band1_gain' },
  { index: 3, name: 'Band 1 Q', symbol: 'band1_q' },
  // Band 2
  { index: 4, name: 'Band 2 Frequency', symbol: 'band2_frequency' },
  { index: 5, name: 'Band 2 Gain', symbol: 'band2_gain' },
  { index: 6, name: 'Band 2 Q', symbol: 'band2_q' },
  // Band 3
  { index: 7, name: 'Band 3 Frequency', symbol: 'band3_frequency' },
  { index: 8, name: 'Band 3 Gain', symbol: 'band3_gain' },
  { index: 9, name: 'Band 3 Q', symbol: 'band3_q' },
  // Band 4
  { index: 10, name: 'Band 4 Frequency', symbol: 'band4_frequency' },
  { index: 11, name: 'Band 4 Gain', symbol: 'band4_gain' },
  { index: 12, name: 'Band 4 Q', symbol: 'band4_q' },
  // Band 5
  { index: 13, name: 'Band 5 Frequency', symbol: 'band5_frequency' },
  { index: 14, name: 'Band 5 Gain', symbol: 'band5_gain' },
  { index: 15, name: 'Band 5 Q', symbol: 'band5_q' },
  // Band 6
  { index: 16, name: 'Band 6 Frequency', symbol: 'band6_frequency' },
  { index: 17, name: 'Band 6 Gain', symbol: 'band6_gain' },
  { index: 18, name: 'Band 6 Q', symbol: 'band6_q' },
  // Band 7
  { index: 19, name: 'Band 7 Frequency', symbol: 'band7_frequency' },
  { index: 20, name: 'Band 7 Gain', symbol: 'band7_gain' },
  { index: 21, name: 'Band 7 Q', symbol: 'band7_q' },
  // Band 8
  { index: 22, name: 'Band 8 Frequency', symbol: 'band8_frequency' },
  { index: 23, name: 'Band 8 Gain', symbol: 'band8_gain' },
  { index: 24, name: 'Band 8 Q', symbol: 'band8_q' },
]

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

interface ParametricEQCardProps extends PluginCardProps {
  onOpenMidiMappings?: () => void
}

function ParametricEQCardBase({
  plugin,
  pluginPosition,
  accentColor: providedAccent,
  compact = false,
  onOpenMidiMappings,
}: ParametricEQCardProps) {
  const accentColor = resolvePluginAccentColor(providedAccent, plugin.uri, plugin.category)
  const instanceId = typeof plugin.instance_id === 'number' && plugin.instance_id > 0 ? plugin.instance_id : undefined
  const resolvedPluginPosition = typeof pluginPosition === 'number' && pluginPosition >= 0 ? pluginPosition : undefined

  const {
    bands,
    outputGain,
    bypass,
    setBandFrequency,
    setBandGain,
    setBandQ,
    setBandType,
    setBandEnabled,
    setOutputGain,
    setBypass,
  } = useFilters({
    instanceId,
    pluginPosition: resolvedPluginPosition,
  })

  const visualization = (
    <EQCurveDisplay
      bands={bands.map((b) => ({
        frequency: b.frequency,
        gain: b.gain,
        q: b.q,
        type: b.type as 'peak' | 'lowshelf' | 'highshelf' | 'lowpass' | 'highpass' | 'bandpass' | 'notch',
        enabled: b.enabled,
      }))}
      width={compact ? 280 : 380}
      height={compact ? 100 : 140}
      accentColor={accentColor}
      interactive
    />
  )

  const eqBands: EQBandConfig[] = bands.map((band, index) => {
    const baseIndex = index * 3 + 1
    return {
      id: `${index + 1}`,
      enabled: band.enabled,
      onToggleEnabled: () => setBandEnabled(index, !band.enabled),
      frequency: {
        label: 'Freq',
        value: band.frequency,
        min: 20, max: 20000, defaultValue: 1000, step: 1,
        onChange: (v: number) => setBandFrequency(index, v),
        isLogarithmic: true,
        valueFormatter: (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v.toFixed(0)}`),
        midi: { pluginUri: EQ_URI, paramIndex: baseIndex },
      },
      gain: {
        label: 'Gain',
        value: band.gain,
        min: -24, max: 24, defaultValue: 0, step: 0.1,
        unit: 'dB',
        onChange: (v: number) => setBandGain(index, v),
        valueFormatter: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`,
        midi: { pluginUri: EQ_URI, paramIndex: baseIndex + 1 },
      },
      q: {
        label: 'Q',
        value: band.q,
        min: 0.1, max: 10, defaultValue: 1, step: 0.01,
        onChange: (v: number) => setBandQ(index, v),
        isLogarithmic: true,
        midi: { pluginUri: EQ_URI, paramIndex: baseIndex + 2 },
      },
      type: {
        value: band.type,
        options: FILTER_TYPES,
        onChange: (v: string) => setBandType(index, v as FilterType),
      },
    }
  })

  return (
    <EQCategoryLayout
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      bypassed={bypass}
      onBypassToggle={() => setBypass(!bypass)}
      onOpenMidiMappings={onOpenMidiMappings}
      visualization={visualization}
      bands={eqBands}
      outputGain={{
        label: 'Output Gain',
        value: outputGain,
        min: -12, max: 12, defaultValue: 0, step: 0.1,
        unit: 'dB',
        onChange: setOutputGain,
        valueFormatter: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`,
        midi: { pluginUri: EQ_URI, paramIndex: PARAM.OUTPUT_GAIN },
      }}
    />
  )
}

export { ParametricEQCardBase as ParametricEQCard }
export default withMidiDialog(ParametricEQCardBase, EQ_URI, EQ_PARAMS)
