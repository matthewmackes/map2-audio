/**
 * ModulationTemplate — Carbon-compliant fallback for unknown modulation plugins
 *
 * Wraps ModulationCategoryLayout, mapping generic parameters by name patterns.
 */

import { useMemo } from 'react'
import type { PluginCardProps } from '../types'
import { getCategoryConfig } from '../types'
import { ModulationCategoryLayout, type ParamSlot } from '../Layouts/ModulationCategoryLayout'
import type { PluginParameter } from '../../../../map2/types'
import { buildResidualParameterSections } from './buildResidualParameterSections'

const RATE_PATTERNS = ['rate', 'speed', 'frequency', 'lfo', 'freq']
const DEPTH_PATTERNS = ['depth', 'amount', 'intensity', 'width', 'range']
const MIX_PATTERNS = ['mix', 'wet', 'blend']
const FEEDBACK_PATTERNS = ['feedback', 'regen', 'resonance', 'color']
const DELAY_PATTERNS = ['delay', 'time', 'center']
const STEREO_PATTERNS = ['stereo', 'spread', 'pan']

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

export function ModulationTemplate({
  plugin,
  parameterValues,
  onParameterChange,
  accentColor: providedAccent,
  compact = false,
}: PluginCardProps) {
  const catConfig = getCategoryConfig(plugin.category)
  const accentColor = providedAccent || catConfig.color
  const params = plugin.parameters || []

  const rateParam = findParam(params, RATE_PATTERNS)
  const depthParam = findParam(params, DEPTH_PATTERNS)
  const mixParam = findParam(params, MIX_PATTERNS)
  const feedbackParam = findParam(params, FEEDBACK_PATTERNS)
  const delayParam = findParam(params, DELAY_PATTERNS)
  const stereoParam = findParam(params, STEREO_PATTERNS)

  const mainIndices = new Set(
    [rateParam, depthParam, mixParam, feedbackParam, delayParam, stereoParam]
      .filter(Boolean)
      .map(p => p!.index)
  )
  const otherParams = params.filter(p => !mainIndices.has(p.index))

  const advancedSections = useMemo(
    () => buildResidualParameterSections({
      params: otherParams,
      parameterValues,
      onParameterChange,
      accentColor,
    }),
    [otherParams, parameterValues, onParameterChange, accentColor],
  )

  return (
    <ModulationCategoryLayout
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      bypassed={plugin.bypassed}
      rate={toSlot(rateParam, parameterValues, onParameterChange, {
        label: 'Rate', unit: 'Hz', isLogarithmic: true,
      })}
      depth={toSlot(depthParam, parameterValues, onParameterChange, { label: 'Depth' })}
      centreDelay={toSlot(delayParam, parameterValues, onParameterChange, {
        label: 'Centre', unit: 'ms',
      })}
      feedback={toSlot(feedbackParam, parameterValues, onParameterChange, { label: 'Feedback' })}
      spread={toSlot(stereoParam, parameterValues, onParameterChange, { label: 'Spread' })}
      mix={toSlot(mixParam, parameterValues, onParameterChange, { label: 'Mix' })}
      advancedSections={advancedSections}
    />
  )
}

export default ModulationTemplate
