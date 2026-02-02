/**
 * DelayTemplate Component
 *
 * Template for delay plugins with tap grid visualization.
 */

import { useMemo, useCallback } from 'react'
import type { PluginCardProps } from '../types'
import { getCategoryConfig } from '../types'
import { PluginCardShell } from '../Base/PluginCardShell'
import { ParameterSection } from '../Base/ParameterSection'
import { ParameterRow } from '../Base/ParameterRow'
import { ParameterKnob } from '../../Controls/ParameterKnob'
import { DelayTapGrid } from '../Visualizations/DelayTapGrid'
import type { PluginParameter } from '../../../../map2/types'

// Parameter patterns
const TIME_PATTERNS = ['time', 'delay', 'length', 'ms']
const TIME_L_PATTERNS = ['time_l', 'delay_l', 'left', 'time1']
const TIME_R_PATTERNS = ['time_r', 'delay_r', 'right', 'time2']
const FEEDBACK_PATTERNS = ['feedback', 'fb', 'regen', 'repeat']
const MIX_PATTERNS = ['mix', 'wet', 'dry', 'blend', 'level']
const MOD_RATE_PATTERNS = ['mod_rate', 'rate', 'speed', 'lfo']
const MOD_DEPTH_PATTERNS = ['mod_depth', 'depth', 'modulation']
const PINGPONG_PATTERNS = ['ping', 'pong', 'pingpong', 'stereo']
const DAMP_PATTERNS = ['damp', 'damping', 'filter', 'tone', 'hf', 'lf']

function findParam(params: PluginParameter[], patterns: string[]): PluginParameter | undefined {
  return params.find(p =>
    patterns.some(pat =>
      p.name.toLowerCase().includes(pat) ||
      p.symbol.toLowerCase().includes(pat)
    )
  )
}

export function DelayTemplate({
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
  const params = plugin.parameters || []

  // Find key parameters
  const timeParam = findParam(params, TIME_PATTERNS)
  const timeLParam = findParam(params, TIME_L_PATTERNS)
  const timeRParam = findParam(params, TIME_R_PATTERNS)
  const feedbackParam = findParam(params, FEEDBACK_PATTERNS)
  const mixParams = params.filter(p =>
    MIX_PATTERNS.some(pat =>
      p.name.toLowerCase().includes(pat) ||
      p.symbol.toLowerCase().includes(pat)
    )
  )
  const modRateParam = findParam(params, MOD_RATE_PATTERNS)
  const modDepthParam = findParam(params, MOD_DEPTH_PATTERNS)
  const pingPongParam = findParam(params, PINGPONG_PATTERNS)
  const dampParam = findParam(params, DAMP_PATTERNS)

  // Use stereo times if available, otherwise main time
  const effectiveTimeParam = timeLParam || timeParam
  const delayTimeL = effectiveTimeParam
    ? (parameterValues[effectiveTimeParam.index] ?? effectiveTimeParam.default)
    : 300
  const delayTimeR = timeRParam
    ? (parameterValues[timeRParam.index] ?? timeRParam.default)
    : undefined

  const feedback = feedbackParam
    ? (parameterValues[feedbackParam.index] ?? feedbackParam.default)
    : 0.5

  const modRate = modRateParam
    ? (parameterValues[modRateParam.index] ?? modRateParam.default)
    : undefined
  const modDepth = modDepthParam
    ? (parameterValues[modDepthParam.index] ?? modDepthParam.default)
    : undefined

  const pingPong = pingPongParam
    ? (parameterValues[pingPongParam.index] ?? pingPongParam.default) > 0.5
    : false

  // Get used indices
  const usedIndices = new Set<number>()
  ;[effectiveTimeParam, timeRParam, feedbackParam, modRateParam, modDepthParam, pingPongParam, dampParam]
    .forEach(p => p && usedIndices.add(p.index))
  mixParams.forEach(p => usedIndices.add(p.index))

  const otherParams = params.filter(p => !usedIndices.has(p.index))

  // Parameter change handler
  const handleChange = useCallback((index: number) => (value: number) => {
    onParameterChange(index, value)
  }, [onParameterChange])

  // Formatters
  const formatMs = (v: number, max: number) => {
    if (max > 5000) return `${(v / 1000).toFixed(2)}s`
    return `${v.toFixed(0)}ms`
  }
  const formatPercent = (v: number, max: number) => `${((v / max) * 100).toFixed(0)}%`
  const formatHz = (v: number) => v >= 1 ? `${v.toFixed(1)}Hz` : `${(v * 1000).toFixed(0)}mHz`

  // Visualization
  const visualization = effectiveTimeParam ? (
    <DelayTapGrid
      delayTimeL={delayTimeL}
      delayTimeR={delayTimeR}
      feedback={feedbackParam ? feedback / feedbackParam.max : 0.5}
      pingPong={pingPong}
      modulationRate={modRate}
      modulationDepth={modDepth}
      width={compact ? 240 : 280}
      height={compact ? 60 : 80}
      accentColor={accentColor}
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
      <div className="delay-parameters">
        {/* Timing Section */}
        <ParameterSection title="Timing" accentColor={accentColor}>
          <ParameterRow>
            {effectiveTimeParam && (
              <ParameterKnob
                label={timeLParam ? 'Time L' : 'Time'}
                value={delayTimeL}
                min={effectiveTimeParam.min}
                max={effectiveTimeParam.max}
                defaultValue={effectiveTimeParam.default}
                unit="ms"
                onChange={handleChange(effectiveTimeParam.index)}
                onChangeEnd={onParameterChangeEnd}
                accentColor={accentColor}
                disabled={disabled}
                isLogarithmic={effectiveTimeParam.is_log}
                valueFormatter={(v) => formatMs(v, effectiveTimeParam.max)}
                size={compact ? 'small' : 'medium'}
              />
            )}
            {timeRParam && (
              <ParameterKnob
                label="Time R"
                value={delayTimeR!}
                min={timeRParam.min}
                max={timeRParam.max}
                defaultValue={timeRParam.default}
                unit="ms"
                onChange={handleChange(timeRParam.index)}
                onChangeEnd={onParameterChangeEnd}
                accentColor={accentColor}
                disabled={disabled}
                isLogarithmic={timeRParam.is_log}
                valueFormatter={(v) => formatMs(v, timeRParam.max)}
                size={compact ? 'small' : 'medium'}
              />
            )}
            {feedbackParam && (
              <ParameterKnob
                label="Feedback"
                value={feedback}
                min={feedbackParam.min}
                max={feedbackParam.max}
                defaultValue={feedbackParam.default}
                onChange={handleChange(feedbackParam.index)}
                onChangeEnd={onParameterChangeEnd}
                accentColor={accentColor}
                disabled={disabled}
                valueFormatter={(v) => formatPercent(v, feedbackParam.max)}
                size={compact ? 'small' : 'medium'}
              />
            )}
          </ParameterRow>
        </ParameterSection>

        {/* Modulation Section */}
        {(modRateParam || modDepthParam) && (
          <ParameterSection title="Modulation" accentColor={accentColor}>
            <ParameterRow>
              {modRateParam && (
                <ParameterKnob
                  label="Rate"
                  value={modRate!}
                  min={modRateParam.min}
                  max={modRateParam.max}
                  defaultValue={modRateParam.default}
                  onChange={handleChange(modRateParam.index)}
                  onChangeEnd={onParameterChangeEnd}
                  accentColor={accentColor}
                  disabled={disabled}
                  isLogarithmic={modRateParam.is_log}
                  valueFormatter={formatHz}
                  size={compact ? 'small' : 'medium'}
                />
              )}
              {modDepthParam && (
                <ParameterKnob
                  label="Depth"
                  value={modDepth!}
                  min={modDepthParam.min}
                  max={modDepthParam.max}
                  defaultValue={modDepthParam.default}
                  onChange={handleChange(modDepthParam.index)}
                  onChangeEnd={onParameterChangeEnd}
                  accentColor={accentColor}
                  disabled={disabled}
                  valueFormatter={(v) => formatPercent(v, modDepthParam.max)}
                  size={compact ? 'small' : 'medium'}
                />
              )}
            </ParameterRow>
          </ParameterSection>
        )}

        {/* Mix Section */}
        {(mixParams.length > 0 || dampParam) && (
          <ParameterSection title="Mix" accentColor={accentColor}>
            <ParameterRow>
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
              {dampParam && (
                <ParameterKnob
                  label={dampParam.name}
                  value={parameterValues[dampParam.index] ?? dampParam.default}
                  min={dampParam.min}
                  max={dampParam.max}
                  defaultValue={dampParam.default}
                  onChange={handleChange(dampParam.index)}
                  onChangeEnd={onParameterChangeEnd}
                  accentColor={accentColor}
                  disabled={disabled}
                  valueFormatter={(v) => formatPercent(v, dampParam.max)}
                  size={compact ? 'small' : 'medium'}
                />
              )}
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
        .delay-parameters {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
      `}</style>
    </PluginCardShell>
  )
}

export default DelayTemplate
