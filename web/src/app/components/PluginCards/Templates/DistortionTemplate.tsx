/**
 * DistortionTemplate Component
 *
 * Template for distortion/overdrive/saturation plugins.
 */

import { useCallback } from 'react'
import type { PluginCardProps } from '../types'
import { getCategoryConfig } from '../types'
import { PluginCardShell } from '../Base/PluginCardShell'
import { ParameterSection } from '../Base/ParameterSection'
import { ParameterRow } from '../Base/ParameterRow'
import { ParameterKnob } from '../../Controls/ParameterKnob'
import { DistortionCurve } from '../Visualizations/DistortionCurve'
import type { PluginParameter } from '../../../../map2/types'

// Parameter patterns
const DRIVE_PATTERNS = ['drive', 'gain', 'input', 'amount', 'distortion', 'overdrive', 'saturation']
const TONE_PATTERNS = ['tone', 'color', 'bright', 'filter', 'eq', 'presence']
const MIX_PATTERNS = ['mix', 'wet', 'dry', 'blend', 'level']
const OUTPUT_PATTERNS = ['output', 'level', 'volume', 'master']
const BIAS_PATTERNS = ['bias', 'offset', 'dc']
const TYPE_PATTERNS = ['type', 'mode', 'character', 'style']

function findParam(params: PluginParameter[], patterns: string[]): PluginParameter | undefined {
  return params.find(p =>
    patterns.some(pat =>
      p.name.toLowerCase().includes(pat) ||
      p.symbol.toLowerCase().includes(pat)
    )
  )
}

function detectDistortionType(pluginName: string): 'soft' | 'hard' | 'tube' | 'tape' | 'fuzz' {
  const name = pluginName.toLowerCase()
  if (name.includes('tube') || name.includes('valve')) return 'tube'
  if (name.includes('tape') || name.includes('saturat')) return 'tape'
  if (name.includes('fuzz') || name.includes('bit')) return 'fuzz'
  if (name.includes('hard') || name.includes('clip')) return 'hard'
  return 'soft'
}

export function DistortionTemplate({
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
  const driveParam = findParam(params, DRIVE_PATTERNS)
  const toneParam = findParam(params, TONE_PATTERNS)
  const mixParams = params.filter(p =>
    MIX_PATTERNS.some(pat =>
      p.name.toLowerCase().includes(pat) ||
      p.symbol.toLowerCase().includes(pat)
    )
  )
  const outputParam = findParam(params, OUTPUT_PATTERNS)
  const biasParam = findParam(params, BIAS_PATTERNS)
  const typeParam = findParam(params, TYPE_PATTERNS)

  // Get current values
  const drive = driveParam
    ? (parameterValues[driveParam.index] ?? driveParam.default)
    : 0.5
  const bias = biasParam
    ? (parameterValues[biasParam.index] ?? biasParam.default)
    : 0
  const mix = mixParams.length > 0
    ? (parameterValues[mixParams[0].index] ?? mixParams[0].default) / mixParams[0].max
    : 1

  // Detect distortion type from plugin name
  const distType = detectDistortionType(plugin.name)

  // Get used indices
  const usedIndices = new Set<number>()
  ;[driveParam, toneParam, outputParam, biasParam, typeParam]
    .forEach(p => p && usedIndices.add(p.index))
  mixParams.forEach(p => usedIndices.add(p.index))

  const otherParams = params.filter(p => !usedIndices.has(p.index))

  // Parameter change handler
  const handleChange = useCallback((index: number) => (value: number) => {
    onParameterChange(index, value)
  }, [onParameterChange])

  // Formatters
  const formatPercent = (v: number, max: number) => `${((v / max) * 100).toFixed(0)}%`
  const formatDb = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`

  // Visualization
  const visualization = driveParam ? (
    <DistortionCurve
      drive={driveParam.max > 1 ? drive / driveParam.max : drive}
      type={distType}
      bias={biasParam ? (bias / biasParam.max) * 2 - 1 : 0}
      mix={mix}
      width={compact ? 140 : 160}
      height={compact ? 80 : 100}
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
      <div className="distortion-parameters">
        {/* Drive Section */}
        <ParameterSection title="Drive" accentColor={accentColor}>
          <ParameterRow>
            {driveParam && (
              <ParameterKnob
                label="Drive"
                value={drive}
                min={driveParam.min}
                max={driveParam.max}
                defaultValue={driveParam.default}
                onChange={handleChange(driveParam.index)}
                onChangeEnd={onParameterChangeEnd}
                accentColor={accentColor}
                disabled={disabled}
                valueFormatter={(v) => formatPercent(v, driveParam.max)}
                size={compact ? 'small' : 'medium'}
              />
            )}
            {biasParam && (
              <ParameterKnob
                label="Bias"
                value={bias}
                min={biasParam.min}
                max={biasParam.max}
                defaultValue={biasParam.default}
                onChange={handleChange(biasParam.index)}
                onChangeEnd={onParameterChangeEnd}
                accentColor={accentColor}
                disabled={disabled}
                size={compact ? 'small' : 'medium'}
              />
            )}
          </ParameterRow>
        </ParameterSection>

        {/* Tone Section */}
        {toneParam && (
          <ParameterSection title="Tone" accentColor={accentColor}>
            <ParameterRow justify="center">
              <ParameterKnob
                label={toneParam.name}
                value={parameterValues[toneParam.index] ?? toneParam.default}
                min={toneParam.min}
                max={toneParam.max}
                defaultValue={toneParam.default}
                onChange={handleChange(toneParam.index)}
                onChangeEnd={onParameterChangeEnd}
                accentColor={accentColor}
                disabled={disabled}
                valueFormatter={(v) => formatPercent(v, toneParam.max)}
                size={compact ? 'small' : 'medium'}
              />
            </ParameterRow>
          </ParameterSection>
        )}

        {/* Output Section */}
        {(outputParam || mixParams.length > 0) && (
          <ParameterSection title="Output" accentColor={accentColor}>
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
              {outputParam && (
                <ParameterKnob
                  label="Output"
                  value={parameterValues[outputParam.index] ?? outputParam.default}
                  min={outputParam.min}
                  max={outputParam.max}
                  defaultValue={outputParam.default}
                  onChange={handleChange(outputParam.index)}
                  onChangeEnd={onParameterChangeEnd}
                  accentColor={accentColor}
                  disabled={disabled}
                  valueFormatter={formatDb}
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
        .distortion-parameters {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
      `}</style>
    </PluginCardShell>
  )
}

export default DistortionTemplate
