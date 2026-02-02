/**
 * ReverbTemplate Component
 *
 * Template for reverb plugins.
 * Features decay curve visualization with early reflections.
 */

import { useMemo, useCallback } from 'react'
import type { PluginCardProps } from '../types'
import { getCategoryConfig } from '../types'
import { PluginCardShell } from '../Base/PluginCardShell'
import { ParameterSection } from '../Base/ParameterSection'
import { ParameterRow } from '../Base/ParameterRow'
import { ParameterKnob } from '../../Controls/ParameterKnob'
import { ReverbDecayCurve } from '../Visualizations/ReverbDecayCurve'
import type { PluginParameter } from '../../../../map2/types'

// Parameter name patterns for reverb
const DECAY_PATTERNS = ['decay', 'time', 'rt60', 'reverb_time', 'tail', 'length']
const PREDELAY_PATTERNS = ['predelay', 'pre_delay', 'pre-delay', 'early_delay']
const SIZE_PATTERNS = ['size', 'room', 'space', 'length']
const DAMPING_PATTERNS = ['damp', 'damping', 'hf_damp', 'high_damp', 'color', 'tone']
const WIDTH_PATTERNS = ['width', 'stereo', 'spread']
const MIX_PATTERNS = ['mix', 'wet', 'dry', 'blend', 'level']
const DIFFUSION_PATTERNS = ['diffusion', 'diffuse', 'density']
const ER_PATTERNS = ['early', 'er_level', 'early_level', 'reflection']

function findParameterByPattern(
  parameters: PluginParameter[],
  patterns: string[]
): PluginParameter | undefined {
  return parameters.find(p =>
    patterns.some(pattern =>
      p.name.toLowerCase().includes(pattern) ||
      p.symbol.toLowerCase().includes(pattern)
    )
  )
}

function findParametersByPattern(
  parameters: PluginParameter[],
  patterns: string[]
): PluginParameter[] {
  return parameters.filter(p =>
    patterns.some(pattern =>
      p.name.toLowerCase().includes(pattern) ||
      p.symbol.toLowerCase().includes(pattern)
    )
  )
}

export function ReverbTemplate({
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

  // Find key parameters
  const decayParam = findParameterByPattern(plugin.parameters || [], DECAY_PATTERNS)
  const predelayParam = findParameterByPattern(plugin.parameters || [], PREDELAY_PATTERNS)
  const sizeParam = findParameterByPattern(plugin.parameters || [], SIZE_PATTERNS)
  const dampingParam = findParameterByPattern(plugin.parameters || [], DAMPING_PATTERNS)
  const widthParam = findParameterByPattern(plugin.parameters || [], WIDTH_PATTERNS)
  const mixParams = findParametersByPattern(plugin.parameters || [], MIX_PATTERNS)
  const diffusionParam = findParameterByPattern(plugin.parameters || [], DIFFUSION_PATTERNS)
  const erParam = findParameterByPattern(plugin.parameters || [], ER_PATTERNS)

  // Get current values
  const decay = decayParam ? (parameterValues[decayParam.index] ?? decayParam.default) : 2
  const predelay = predelayParam ? (parameterValues[predelayParam.index] ?? predelayParam.default) : 0
  const size = sizeParam ? (parameterValues[sizeParam.index] ?? sizeParam.default) : 0.5
  const damping = dampingParam ? (parameterValues[dampingParam.index] ?? dampingParam.default) : 0.5
  const erLevel = erParam ? (parameterValues[erParam.index] ?? erParam.default) : 0.7

  // Normalize decay time to seconds (many plugins use different ranges)
  const decayTimeSeconds = useMemo(() => {
    if (!decayParam) return 2
    const val = parameterValues[decayParam.index] ?? decayParam.default
    // If max is > 30, likely in ms or percent
    if (decayParam.max > 30) {
      if (decayParam.max > 1000) return val / 1000 // ms to seconds
      return val * 10 / decayParam.max // normalize to ~10s max
    }
    return val
  }, [decayParam, parameterValues])

  // Normalize predelay to ms
  const predelayMs = useMemo(() => {
    if (!predelayParam) return 0
    const val = parameterValues[predelayParam.index] ?? predelayParam.default
    if (predelayParam.max < 1) return val * 1000 // 0-1 to ms
    if (predelayParam.max > 1000) return val // already ms
    return val // assume ms
  }, [predelayParam, parameterValues])

  // Get all used parameter indices
  const mainParamIndices = new Set([
    decayParam?.index,
    predelayParam?.index,
    sizeParam?.index,
    dampingParam?.index,
    widthParam?.index,
    diffusionParam?.index,
    erParam?.index,
    ...mixParams.map(p => p.index),
  ].filter(i => i !== undefined))

  const otherParams = (plugin.parameters || []).filter(p => !mainParamIndices.has(p.index))

  // Parameter change handler
  const handleChange = useCallback((index: number) => (value: number) => {
    onParameterChange(index, value)
  }, [onParameterChange])

  // Value formatters
  const formatTime = (v: number, max: number) => {
    if (max > 1000) return `${v.toFixed(0)}ms`
    if (max > 30) return `${(v / 100).toFixed(2)}s`
    return `${v.toFixed(2)}s`
  }
  const formatMs = (v: number) => `${v.toFixed(0)}ms`
  const formatPercent = (v: number, max: number) => `${((v / max) * 100).toFixed(0)}%`

  // Visualization
  const visualization = (
    <ReverbDecayCurve
      decayTime={decayTimeSeconds}
      preDelay={predelayMs}
      earlyReflections={erLevel / (erParam?.max || 1)}
      damping={damping / (dampingParam?.max || 1)}
      width={compact ? 240 : 280}
      height={compact ? 80 : 100}
      accentColor={accentColor}
    />
  )

  return (
    <PluginCardShell
      plugin={plugin}
      accentColor={accentColor}
      bypassed={plugin.bypassed}
      visualization={visualization}
      compact={compact}
    >
      <div className="reverb-parameters">
        {/* Room/Space Section */}
        <ParameterSection title="Space" accentColor={accentColor}>
          <ParameterRow>
            {sizeParam && (
              <ParameterKnob
                label="Size"
                value={size}
                min={sizeParam.min}
                max={sizeParam.max}
                defaultValue={sizeParam.default}
                onChange={handleChange(sizeParam.index)}
                onChangeEnd={onParameterChangeEnd}
                accentColor={accentColor}
                disabled={disabled}
                valueFormatter={(v) => formatPercent(v, sizeParam.max)}
                size={compact ? 'small' : 'medium'}
              />
            )}
            {widthParam && (
              <ParameterKnob
                label="Width"
                value={parameterValues[widthParam.index] ?? widthParam.default}
                min={widthParam.min}
                max={widthParam.max}
                defaultValue={widthParam.default}
                onChange={handleChange(widthParam.index)}
                onChangeEnd={onParameterChangeEnd}
                accentColor={accentColor}
                disabled={disabled}
                valueFormatter={(v) => formatPercent(v, widthParam.max)}
                size={compact ? 'small' : 'medium'}
              />
            )}
            {diffusionParam && (
              <ParameterKnob
                label="Diffusion"
                value={parameterValues[diffusionParam.index] ?? diffusionParam.default}
                min={diffusionParam.min}
                max={diffusionParam.max}
                defaultValue={diffusionParam.default}
                onChange={handleChange(diffusionParam.index)}
                onChangeEnd={onParameterChangeEnd}
                accentColor={accentColor}
                disabled={disabled}
                valueFormatter={(v) => formatPercent(v, diffusionParam.max)}
                size={compact ? 'small' : 'medium'}
              />
            )}
          </ParameterRow>
        </ParameterSection>

        {/* Timing Section */}
        <ParameterSection title="Timing" accentColor={accentColor}>
          <ParameterRow>
            {predelayParam && (
              <ParameterKnob
                label="Pre-Delay"
                value={predelay}
                min={predelayParam.min}
                max={predelayParam.max}
                defaultValue={predelayParam.default}
                unit="ms"
                onChange={handleChange(predelayParam.index)}
                onChangeEnd={onParameterChangeEnd}
                accentColor={accentColor}
                disabled={disabled}
                valueFormatter={formatMs}
                size={compact ? 'small' : 'medium'}
              />
            )}
            {decayParam && (
              <ParameterKnob
                label="Decay"
                value={decay}
                min={decayParam.min}
                max={decayParam.max}
                defaultValue={decayParam.default}
                onChange={handleChange(decayParam.index)}
                onChangeEnd={onParameterChangeEnd}
                accentColor={accentColor}
                disabled={disabled}
                isLogarithmic={decayParam.is_log}
                valueFormatter={(v) => formatTime(v, decayParam.max)}
                size={compact ? 'small' : 'medium'}
              />
            )}
            {dampingParam && (
              <ParameterKnob
                label="Damping"
                value={damping}
                min={dampingParam.min}
                max={dampingParam.max}
                defaultValue={dampingParam.default}
                onChange={handleChange(dampingParam.index)}
                onChangeEnd={onParameterChangeEnd}
                accentColor={accentColor}
                disabled={disabled}
                valueFormatter={(v) => formatPercent(v, dampingParam.max)}
                size={compact ? 'small' : 'medium'}
              />
            )}
          </ParameterRow>
        </ParameterSection>

        {/* Mix Section */}
        {mixParams.length > 0 && (
          <ParameterSection title="Mix" accentColor={accentColor}>
            <ParameterRow justify="center">
              {mixParams.map(param => (
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
                  valueFormatter={(v) => formatPercent(v, param.max)}
                  size={compact ? 'small' : 'medium'}
                />
              ))}
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
        .reverb-parameters {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
      `}</style>
    </PluginCardShell>
  )
}

export default ReverbTemplate
