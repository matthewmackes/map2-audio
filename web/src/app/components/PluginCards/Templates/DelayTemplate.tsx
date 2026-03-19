/**
 * DelayTemplate — Carbon-compliant fallback for unknown delay plugins
 *
 * Wraps DelayCategoryLayout, mapping generic parameters by name patterns.
 */

import { useMemo } from 'react'
import type { PluginCardProps } from '../types'
import { getCategoryConfig } from '../types'
import { DelayCategoryLayout, type ParamSlot } from '../Layouts/DelayCategoryLayout'
import type { AdvancedSection } from '../Base/CarbonCardShell'
import { CarbonParameterSection } from '../Base/CarbonParameterSection'
import { ParameterKnob } from '../../Controls/ParameterKnob'
import type { PluginParameter } from '../../../../map2/types'

const TIME_PATTERNS = ['time', 'delay', 'length', 'ms', 'base']
const TIME_L_PATTERNS = ['time_l', 'delay_l', 'left', 'time1']
const TIME_R_PATTERNS = ['time_r', 'delay_r', 'right', 'time2']
const FEEDBACK_PATTERNS = ['feedback', 'fb', 'regen', 'repeat']
const MIX_PATTERNS = ['mix', 'wet', 'blend']
const MOD_RATE_PATTERNS = ['mod_rate', 'rate', 'speed', 'lfo']
const MOD_DEPTH_PATTERNS = ['mod_depth', 'depth', 'modulation']
const DAMP_PATTERNS = ['damp', 'damping', 'filter', 'tone', 'hf', 'lf']

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

export function DelayTemplate({
  plugin,
  parameterValues,
  onParameterChange,
  accentColor: providedAccent,
  compact = false,
}: PluginCardProps) {
  const catConfig = getCategoryConfig(plugin.category)
  const accentColor = providedAccent || catConfig.color
  const params = plugin.parameters || []

  const timeParam = findParam(params, TIME_PATTERNS)
  const timeLParam = findParam(params, TIME_L_PATTERNS)
  const timeRParam = findParam(params, TIME_R_PATTERNS)
  const feedbackParam = findParam(params, FEEDBACK_PATTERNS)
  const mixParam = findParam(params, MIX_PATTERNS)
  const modRateParam = findParam(params, MOD_RATE_PATTERNS)
  const modDepthParam = findParam(params, MOD_DEPTH_PATTERNS)
  const dampParam = findParam(params, DAMP_PATTERNS)

  const effectiveTimeParam = timeLParam || timeParam

  const mainIndices = new Set(
    [effectiveTimeParam, timeRParam, feedbackParam, mixParam, modRateParam, modDepthParam, dampParam]
      .filter(Boolean)
      .map(p => p!.index)
  )
  const otherParams = params.filter(p => !mainIndices.has(p.index))

  const formatMs = (v: number) => (v >= 5000 ? `${(v / 1000).toFixed(2)}s` : `${v.toFixed(0)}ms`)

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
    <DelayCategoryLayout
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      bypassed={plugin.bypassed}
      delayTimeL={toSlot(effectiveTimeParam, parameterValues, onParameterChange, {
        label: timeLParam ? 'Time L' : 'Time', unit: 'ms', valueFormatter: formatMs,
      })}
      delayTimeR={toSlot(timeRParam, parameterValues, onParameterChange, {
        label: 'Time R', unit: 'ms', valueFormatter: formatMs,
      })}
      feedback={toSlot(feedbackParam, parameterValues, onParameterChange, { label: 'Feedback' })}
      tone={toSlot(dampParam, parameterValues, onParameterChange, { label: dampParam?.name ?? 'Tone' })}
      modRate={toSlot(modRateParam, parameterValues, onParameterChange, { label: 'Rate' })}
      modDepth={toSlot(modDepthParam, parameterValues, onParameterChange, { label: 'Depth' })}
      mix={toSlot(mixParam, parameterValues, onParameterChange, { label: 'Mix' })}
      advancedSections={advancedSections}
    />
  )
}

export default DelayTemplate
