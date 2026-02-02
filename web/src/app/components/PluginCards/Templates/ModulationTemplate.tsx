/**
 * ModulationTemplate Component
 *
 * Template for chorus, flanger, phaser, tremolo, and similar effects.
 */

import { useCallback, useMemo } from 'react'
import type { PluginCardProps } from '../types'
import { getCategoryConfig } from '../types'
import { PluginCardShell } from '../Base/PluginCardShell'
import { ParameterSection } from '../Base/ParameterSection'
import { ParameterRow } from '../Base/ParameterRow'
import { ParameterKnob } from '../../Controls/ParameterKnob'
import { LFOWaveform } from '../Visualizations/LFOWaveform'
import type { PluginParameter } from '../../../../map2/types'

// Parameter patterns
const RATE_PATTERNS = ['rate', 'speed', 'frequency', 'lfo', 'freq']
const DEPTH_PATTERNS = ['depth', 'amount', 'intensity', 'width', 'range']
const MIX_PATTERNS = ['mix', 'wet', 'dry', 'blend', 'level']
const FEEDBACK_PATTERNS = ['feedback', 'regen', 'resonance', 'color']
const DELAY_PATTERNS = ['delay', 'time', 'center']
const WAVE_PATTERNS = ['wave', 'shape', 'type', 'waveform']
const STEREO_PATTERNS = ['stereo', 'spread', 'pan', 'width']

function findParam(params: PluginParameter[], patterns: string[]): PluginParameter | undefined {
  return params.find(p =>
    patterns.some(pat =>
      p.name.toLowerCase().includes(pat) ||
      p.symbol.toLowerCase().includes(pat)
    )
  )
}

function detectWaveform(param: PluginParameter | undefined, value: number): 'sine' | 'triangle' | 'square' | 'saw' {
  if (!param) return 'sine'
  // Try to detect from scale points or value range
  const normalized = (value - param.min) / (param.max - param.min)
  if (normalized < 0.25) return 'sine'
  if (normalized < 0.5) return 'triangle'
  if (normalized < 0.75) return 'square'
  return 'saw'
}

export function ModulationTemplate({
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
  const rateParam = findParam(params, RATE_PATTERNS)
  const depthParam = findParam(params, DEPTH_PATTERNS)
  const mixParams = params.filter(p =>
    MIX_PATTERNS.some(pat =>
      p.name.toLowerCase().includes(pat) ||
      p.symbol.toLowerCase().includes(pat)
    )
  )
  const feedbackParam = findParam(params, FEEDBACK_PATTERNS)
  const delayParam = findParam(params, DELAY_PATTERNS)
  const waveParam = findParam(params, WAVE_PATTERNS)
  const stereoParam = findParam(params, STEREO_PATTERNS)

  // Get current values
  const rate = rateParam
    ? (parameterValues[rateParam.index] ?? rateParam.default)
    : 1
  const depth = depthParam
    ? (parameterValues[depthParam.index] ?? depthParam.default)
    : 0.5
  const waveValue = waveParam
    ? (parameterValues[waveParam.index] ?? waveParam.default)
    : 0

  // Normalize rate to Hz (some plugins use different scales)
  const rateHz = useMemo(() => {
    if (!rateParam) return 1
    // If max is > 20, likely in Hz
    if (rateParam.max > 20) return rate
    // If max is > 1 but <= 20, assume Hz
    if (rateParam.max > 1) return rate
    // 0-1 range, scale to typical LFO range (0.1-10 Hz)
    return 0.1 + rate * 9.9
  }, [rateParam, rate])

  // Detect waveform type
  const waveform = detectWaveform(waveParam, waveValue)

  // Get used indices
  const usedIndices = new Set<number>()
  ;[rateParam, depthParam, feedbackParam, delayParam, waveParam, stereoParam]
    .forEach(p => p && usedIndices.add(p.index))
  mixParams.forEach(p => usedIndices.add(p.index))

  const otherParams = params.filter(p => !usedIndices.has(p.index))

  // Parameter change handler
  const handleChange = useCallback((index: number) => (value: number) => {
    onParameterChange(index, value)
  }, [onParameterChange])

  // Formatters
  const formatHz = (v: number, max: number) => {
    if (max > 20 || v > 1) return `${v.toFixed(1)}Hz`
    return `${(v * 10).toFixed(1)}Hz`
  }
  const formatPercent = (v: number, max: number) => `${((v / max) * 100).toFixed(0)}%`
  const formatMs = (v: number) => `${v.toFixed(1)}ms`

  // Visualization
  const visualization = rateParam && depthParam ? (
    <LFOWaveform
      rate={rateHz}
      depth={depthParam.max > 1 ? depth / depthParam.max : depth}
      waveform={waveform}
      width={compact ? 180 : 200}
      height={compact ? 50 : 60}
      accentColor={accentColor}
      animated={true}
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
      <div className="modulation-parameters">
        {/* LFO Section */}
        <ParameterSection title="LFO" accentColor={accentColor}>
          <ParameterRow>
            {rateParam && (
              <ParameterKnob
                label="Rate"
                value={rate}
                min={rateParam.min}
                max={rateParam.max}
                defaultValue={rateParam.default}
                onChange={handleChange(rateParam.index)}
                onChangeEnd={onParameterChangeEnd}
                accentColor={accentColor}
                disabled={disabled}
                isLogarithmic={rateParam.is_log}
                valueFormatter={(v) => formatHz(v, rateParam.max)}
                size={compact ? 'small' : 'medium'}
              />
            )}
            {depthParam && (
              <ParameterKnob
                label="Depth"
                value={depth}
                min={depthParam.min}
                max={depthParam.max}
                defaultValue={depthParam.default}
                onChange={handleChange(depthParam.index)}
                onChangeEnd={onParameterChangeEnd}
                accentColor={accentColor}
                disabled={disabled}
                valueFormatter={(v) => formatPercent(v, depthParam.max)}
                size={compact ? 'small' : 'medium'}
              />
            )}
            {waveParam && (
              <ParameterKnob
                label="Wave"
                value={waveValue}
                min={waveParam.min}
                max={waveParam.max}
                defaultValue={waveParam.default}
                onChange={handleChange(waveParam.index)}
                onChangeEnd={onParameterChangeEnd}
                accentColor={accentColor}
                disabled={disabled}
                size={compact ? 'small' : 'medium'}
              />
            )}
          </ParameterRow>
        </ParameterSection>

        {/* Feedback / Color Section */}
        {(feedbackParam || delayParam) && (
          <ParameterSection title="Character" accentColor={accentColor}>
            <ParameterRow>
              {feedbackParam && (
                <ParameterKnob
                  label={feedbackParam.name}
                  value={parameterValues[feedbackParam.index] ?? feedbackParam.default}
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
              {delayParam && (
                <ParameterKnob
                  label={delayParam.name}
                  value={parameterValues[delayParam.index] ?? delayParam.default}
                  min={delayParam.min}
                  max={delayParam.max}
                  defaultValue={delayParam.default}
                  onChange={handleChange(delayParam.index)}
                  onChangeEnd={onParameterChangeEnd}
                  accentColor={accentColor}
                  disabled={disabled}
                  isLogarithmic={delayParam.is_log}
                  valueFormatter={formatMs}
                  size={compact ? 'small' : 'medium'}
                />
              )}
            </ParameterRow>
          </ParameterSection>
        )}

        {/* Mix Section */}
        {(mixParams.length > 0 || stereoParam) && (
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
              {stereoParam && (
                <ParameterKnob
                  label={stereoParam.name}
                  value={parameterValues[stereoParam.index] ?? stereoParam.default}
                  min={stereoParam.min}
                  max={stereoParam.max}
                  defaultValue={stereoParam.default}
                  onChange={handleChange(stereoParam.index)}
                  onChangeEnd={onParameterChangeEnd}
                  accentColor={accentColor}
                  disabled={disabled}
                  valueFormatter={(v) => formatPercent(v, stereoParam.max)}
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
        .modulation-parameters {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
      `}</style>
    </PluginCardShell>
  )
}

export default ModulationTemplate
