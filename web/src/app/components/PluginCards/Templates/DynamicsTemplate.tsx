/**
 * DynamicsTemplate — Carbon-compliant fallback for unknown dynamics plugins
 *
 * Wraps DynamicsCategoryLayout, mapping generic parameters by name patterns.
 */

import { useCallback, useMemo } from 'react'
import type { PluginCardProps } from '../types'
import { getCategoryConfig } from '../types'
import { DynamicsCategoryLayout, type ParamSlot } from '../Layouts/DynamicsCategoryLayout'
import type { PluginParameter } from '../../../../map2/types'
import { buildResidualParameterSections } from './buildResidualParameterSections'

const THRESHOLD_PATTERNS = ['threshold', 'thresh', 'level']
const RATIO_PATTERNS = ['ratio']
const ATTACK_PATTERNS = ['attack', 'att']
const RELEASE_PATTERNS = ['release', 'rel', 'decay']
const KNEE_PATTERNS = ['knee', 'soft']
const MAKEUP_PATTERNS = ['makeup', 'gain', 'output', 'level_out', 'out_level']

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

export function DynamicsTemplate({
  plugin,
  parameterValues,
  onParameterChange,
  accentColor: providedAccent,
  compact = false,
  realtimeData,
}: PluginCardProps) {
  const catConfig = getCategoryConfig(plugin.category)
  const accentColor = providedAccent || catConfig.color
  const params = plugin.parameters || []

  const thresholdParam = findParam(params, THRESHOLD_PATTERNS)
  const ratioParam = findParam(params, RATIO_PATTERNS)
  const attackParam = findParam(params, ATTACK_PATTERNS)
  const releaseParam = findParam(params, RELEASE_PATTERNS)
  const kneeParam = findParam(params, KNEE_PATTERNS)
  const makeupParam = findParam(params, MAKEUP_PATTERNS)

  const mainIndices = new Set(
    [thresholdParam, ratioParam, attackParam, releaseParam, kneeParam, makeupParam]
      .filter(Boolean)
      .map(p => p!.index)
  )
  const otherParams = params.filter(p => !mainIndices.has(p.index))

  const formatDb = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`
  const formatRatio = (v: number) => (v >= 20 ? '\u221e' : v.toFixed(1))
  const formatMs = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${v.toFixed(1)}ms`)

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
    <DynamicsCategoryLayout
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      bypassed={plugin.bypassed}
      threshold={toSlot(thresholdParam, parameterValues, onParameterChange, {
        label: 'Threshold', unit: 'dB', valueFormatter: formatDb,
      })}
      ratio={toSlot(ratioParam, parameterValues, onParameterChange, {
        label: 'Ratio', unit: ':1', valueFormatter: formatRatio,
      })}
      knee={toSlot(kneeParam, parameterValues, onParameterChange, {
        label: 'Knee', unit: 'dB', valueFormatter: formatDb,
      })}
      attack={toSlot(attackParam, parameterValues, onParameterChange, {
        label: 'Attack', unit: 'ms', isLogarithmic: true, valueFormatter: formatMs,
      })}
      release={toSlot(releaseParam, parameterValues, onParameterChange, {
        label: 'Release', unit: 'ms', isLogarithmic: true, valueFormatter: formatMs,
      })}
      makeupGain={toSlot(makeupParam, parameterValues, onParameterChange, {
        label: 'Makeup', unit: 'dB', valueFormatter: formatDb,
      })}
      gainReduction={realtimeData?.gainReduction ?? 0}
      showTransferCurve
      advancedSections={advancedSections}
    />
  )
}

export default DynamicsTemplate
