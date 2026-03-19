/**
 * DistortionTemplate — Carbon-compliant fallback for unknown distortion plugins
 *
 * Wraps AmplifierCategoryLayout (closest match), mapping generic parameters.
 */

import { useMemo } from 'react'
import type { PluginCardProps } from '../types'
import { getCategoryConfig } from '../types'
import { AmplifierCategoryLayout, type ParamSlot } from '../Layouts/AmplifierCategoryLayout'
import type { AdvancedSection } from '../Base/CarbonCardShell'
import { CarbonParameterSection } from '../Base/CarbonParameterSection'
import { ParameterKnob } from '../../Controls/ParameterKnob'
import type { PluginParameter } from '../../../../map2/types'

const DRIVE_PATTERNS = ['drive', 'gain', 'input', 'amount', 'distortion', 'overdrive', 'saturation']
const TONE_PATTERNS = ['tone', 'color', 'bright', 'filter', 'eq', 'presence']
const MIX_PATTERNS = ['mix', 'wet', 'blend']
const OUTPUT_PATTERNS = ['output', 'level', 'volume', 'master']
const BIAS_PATTERNS = ['bias', 'offset', 'dc']

function findParam(params: PluginParameter[], patterns: string[]): PluginParameter | undefined {
  return params.find(p =>
    patterns.some(pat =>
      p.name.toLowerCase().includes(pat) || p.symbol.toLowerCase().includes(pat)
    )
  )
}

function toSlot(
  param: PluginParameter | undefined,
  parameterValues: Record<number, number>,
  onParameterChange: (i: number, v: number) => void,
  overrides?: Partial<ParamSlot>,
): ParamSlot | undefined {
  if (!param) return undefined
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

export function DistortionTemplate({
  plugin,
  parameterValues,
  onParameterChange,
  accentColor: providedAccent,
  compact = false,
}: PluginCardProps) {
  const catConfig = getCategoryConfig(plugin.category)
  const accentColor = providedAccent || catConfig.color
  const params = plugin.parameters || []

  const driveParam = findParam(params, DRIVE_PATTERNS)
  const toneParam = findParam(params, TONE_PATTERNS)
  const mixParam = findParam(params, MIX_PATTERNS)
  const outputParam = findParam(params, OUTPUT_PATTERNS)
  const biasParam = findParam(params, BIAS_PATTERNS)

  const mainIndices = new Set(
    [driveParam, toneParam, mixParam, outputParam, biasParam]
      .filter(Boolean)
      .map(p => p!.index)
  )
  const otherParams = params.filter(p => !mainIndices.has(p.index))

  const formatDb = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`

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
    <AmplifierCategoryLayout
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      bypassed={plugin.bypassed}
      inputGain={toSlot(driveParam, parameterValues, onParameterChange, { label: 'Drive' })}
      treble={toSlot(toneParam, parameterValues, onParameterChange, {
        label: toneParam?.name ?? 'Tone',
      })}
      bias={toSlot(biasParam, parameterValues, onParameterChange, { label: 'Bias' })}
      masterVolume={toSlot(mixParam, parameterValues, onParameterChange, { label: 'Mix' })}
      outputGain={toSlot(outputParam, parameterValues, onParameterChange, {
        label: 'Output', unit: 'dB', valueFormatter: formatDb,
      })}
      advancedSections={advancedSections}
    />
  )
}

export default DistortionTemplate
