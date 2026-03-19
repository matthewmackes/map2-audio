/**
 * PitchTemplate — Carbon-compliant fallback for unknown pitch plugins
 *
 * Wraps PitchCategoryLayout, mapping generic parameters by name patterns.
 */

import { useMemo } from 'react'
import type { PluginCardProps } from '../types'
import { getCategoryConfig } from '../types'
import { PitchCategoryLayout, type ParamSlot } from '../Layouts/PitchCategoryLayout'
import type { AdvancedSection } from '../Base/CarbonCardShell'
import { CarbonParameterSection } from '../Base/CarbonParameterSection'
import { ParameterKnob } from '../../Controls/ParameterKnob'
import type { PluginParameter } from '../../../../map2/types'

const SEMITONE_PATTERNS = ['semitone', 'semi', 'pitch', 'shift', 'transpose', 'interval']
const CENT_PATTERNS = ['cent', 'fine', 'detune', 'tune']
const MIX_PATTERNS = ['mix', 'wet', 'blend']
const FEEDBACK_PATTERNS = ['feedback', 'regen']
const SPEED_PATTERNS = ['speed', 'time', 'rate', 'glide', 'portamento']

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
    step: overrides?.step,
    unit: overrides?.unit,
    onChange: (v: number) => onParameterChange(param.index, v),
    isLogarithmic: overrides?.isLogarithmic ?? param.is_log,
    valueFormatter: overrides?.valueFormatter,
  }
}

export function PitchTemplate({
  plugin,
  parameterValues,
  onParameterChange,
  accentColor: providedAccent,
  compact = false,
}: PluginCardProps) {
  const catConfig = getCategoryConfig(plugin.category)
  const accentColor = providedAccent || catConfig.color
  const params = plugin.parameters || []

  const semitoneParam = findParam(params, SEMITONE_PATTERNS)
  const centParam = findParam(params, CENT_PATTERNS)
  const mixParam = findParam(params, MIX_PATTERNS)
  const feedbackParam = findParam(params, FEEDBACK_PATTERNS)
  const speedParam = findParam(params, SPEED_PATTERNS)

  const mainIndices = new Set(
    [semitoneParam, centParam, mixParam, feedbackParam, speedParam]
      .filter(Boolean)
      .map(p => p!.index)
  )
  const otherParams = params.filter(p => !mainIndices.has(p.index))

  const formatSemitones = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)} st`
  const formatCents = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)} c`
  const formatMs = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${v.toFixed(0)}ms`)

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
    <PitchCategoryLayout
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      bypassed={plugin.bypassed}
      semitones={toSlot(semitoneParam, parameterValues, onParameterChange, {
        label: 'Semitones', step: 1, valueFormatter: formatSemitones,
      })}
      cents={toSlot(centParam, parameterValues, onParameterChange, {
        label: 'Fine', step: 1, valueFormatter: formatCents,
      })}
      glide={toSlot(speedParam, parameterValues, onParameterChange, {
        label: speedParam?.name ?? 'Glide', unit: 'ms', isLogarithmic: true, valueFormatter: formatMs,
      })}
      feedback={toSlot(feedbackParam, parameterValues, onParameterChange, { label: 'Feedback' })}
      mix={toSlot(mixParam, parameterValues, onParameterChange, { label: 'Mix' })}
      advancedSections={advancedSections}
    />
  )
}

export default PitchTemplate
