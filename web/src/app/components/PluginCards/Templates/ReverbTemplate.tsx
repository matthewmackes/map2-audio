/**
 * ReverbTemplate — Carbon-compliant fallback for unknown reverb plugins
 *
 * Wraps ReverbCategoryLayout, mapping generic parameters by name patterns.
 */

import { useMemo } from 'react'
import type { PluginCardProps } from '../types'
import { getCategoryConfig } from '../types'
import { ReverbCategoryLayout, type ParamSlot } from '../Layouts/ReverbCategoryLayout'
import type { PluginParameter } from '../../../../map2/types'
import { buildResidualParameterSections } from './buildResidualParameterSections'

const DECAY_PATTERNS = ['decay', 'time', 'rt60', 'reverb_time', 'tail', 'length']
const PREDELAY_PATTERNS = ['predelay', 'pre_delay', 'pre-delay', 'early_delay']
const SIZE_PATTERNS = ['size', 'room', 'space']
const DAMPING_PATTERNS = ['damp', 'damping', 'hf_damp', 'high_damp', 'color', 'tone']
const WIDTH_PATTERNS = ['width', 'stereo', 'spread']
const MIX_PATTERNS = ['mix', 'wet', 'blend']
const DIFFUSION_PATTERNS = ['diffusion', 'diffuse', 'density']

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

export function ReverbTemplate({
  plugin,
  parameterValues,
  onParameterChange,
  accentColor: providedAccent,
  compact = false,
}: PluginCardProps) {
  const catConfig = getCategoryConfig(plugin.category)
  const accentColor = providedAccent || catConfig.color
  const params = plugin.parameters || []

  const decayParam = findParam(params, DECAY_PATTERNS)
  const predelayParam = findParam(params, PREDELAY_PATTERNS)
  const sizeParam = findParam(params, SIZE_PATTERNS)
  const dampingParam = findParam(params, DAMPING_PATTERNS)
  const widthParam = findParam(params, WIDTH_PATTERNS)
  const mixParam = findParam(params, MIX_PATTERNS)
  const diffusionParam = findParam(params, DIFFUSION_PATTERNS)

  const mainIndices = new Set(
    [decayParam, predelayParam, sizeParam, dampingParam, widthParam, mixParam, diffusionParam]
      .filter(Boolean)
      .map(p => p!.index)
  )
  const otherParams = params.filter(p => !mainIndices.has(p.index))

  const formatTime = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${v.toFixed(1)}ms`)
  const formatPercent = (v: number) => `${v.toFixed(0)}%`

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
    <ReverbCategoryLayout
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      bypassed={plugin.bypassed}
      size={toSlot(sizeParam, parameterValues, onParameterChange, { label: 'Size' })}
      width={toSlot(widthParam, parameterValues, onParameterChange, { label: 'Width' })}
      diffusion={toSlot(diffusionParam, parameterValues, onParameterChange, { label: 'Diffusion' })}
      preDelay={toSlot(predelayParam, parameterValues, onParameterChange, {
        label: 'Pre-Delay', unit: 'ms', valueFormatter: formatTime,
      })}
      decay={toSlot(decayParam, parameterValues, onParameterChange, {
        label: 'Decay', isLogarithmic: true,
      })}
      damping={toSlot(dampingParam, parameterValues, onParameterChange, { label: 'Damping' })}
      mix={toSlot(mixParam, parameterValues, onParameterChange, { label: 'Mix', unit: '%' })}
      advancedSections={advancedSections}
    />
  )
}

export default ReverbTemplate
