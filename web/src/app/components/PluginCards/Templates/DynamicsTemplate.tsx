/**
 * DynamicsTemplate Component
 *
 * Template for compressor, limiter, and gate plugins.
 * Features gain reduction meter and transfer curve visualization.
 */

import { useMemo, useCallback } from 'react'
import type { PluginCardProps } from '../types'
import { generateParameterGroups, getCategoryConfig } from '../types'
import { PluginCardShell } from '../Base/PluginCardShell'
import { ParameterSection } from '../Base/ParameterSection'
import { ParameterRow } from '../Base/ParameterRow'
import { ParameterKnob } from '../../Controls/ParameterKnob'
import { GainReductionMeter } from '../../Dynamics/GainReductionMeter'
import { TransferCurve } from '../Visualizations/TransferCurve'
import type { PluginParameter } from '../../../../map2/types'

// Parameter name patterns for dynamics processors
const THRESHOLD_PATTERNS = ['threshold', 'thresh', 'level']
const RATIO_PATTERNS = ['ratio']
const ATTACK_PATTERNS = ['attack', 'att']
const RELEASE_PATTERNS = ['release', 'rel', 'decay']
const KNEE_PATTERNS = ['knee', 'soft']
const MAKEUP_PATTERNS = ['makeup', 'gain', 'output', 'level_out', 'out_level']

function findParameterByPattern(
  parameters: PluginParameter[],
  patterns: string[]
): PluginParameter | undefined {
  const nameMatches = parameters.find(p =>
    patterns.some(pattern =>
      p.name.toLowerCase().includes(pattern) ||
      p.symbol.toLowerCase().includes(pattern)
    )
  )
  return nameMatches
}

export function DynamicsTemplate({
  plugin,
  parameterValues,
  onParameterChange,
  onParameterChangeEnd,
  accentColor: providedAccent,
  disabled = false,
  compact = false,
  realtimeData,
}: PluginCardProps) {
  const catConfig = getCategoryConfig(plugin.category)
  const accentColor = providedAccent || catConfig.color

  // Find key parameters
  const thresholdParam = findParameterByPattern(plugin.parameters || [], THRESHOLD_PATTERNS)
  const ratioParam = findParameterByPattern(plugin.parameters || [], RATIO_PATTERNS)
  const attackParam = findParameterByPattern(plugin.parameters || [], ATTACK_PATTERNS)
  const releaseParam = findParameterByPattern(plugin.parameters || [], RELEASE_PATTERNS)
  const kneeParam = findParameterByPattern(plugin.parameters || [], KNEE_PATTERNS)
  const makeupParam = findParameterByPattern(plugin.parameters || [], MAKEUP_PATTERNS)

  // Get current values
  const threshold = thresholdParam ? (parameterValues[thresholdParam.index] ?? thresholdParam.default) : -12
  const ratio = ratioParam ? (parameterValues[ratioParam.index] ?? ratioParam.default) : 4
  const knee = kneeParam ? (parameterValues[kneeParam.index] ?? kneeParam.default) : 0
  const makeup = makeupParam ? (parameterValues[makeupParam.index] ?? makeupParam.default) : 0

  // Get other parameters (not in the main groups)
  const mainParamIndices = new Set([
    thresholdParam?.index,
    ratioParam?.index,
    attackParam?.index,
    releaseParam?.index,
    kneeParam?.index,
    makeupParam?.index,
  ].filter(i => i !== undefined))

  const otherParams = (plugin.parameters || []).filter(p => !mainParamIndices.has(p.index))

  // Parameter change handler
  const handleChange = useCallback((index: number) => (value: number) => {
    onParameterChange(index, value)
  }, [onParameterChange])

  // Value formatters
  const formatRatio = (v: number) => v >= 20 ? '∞' : v.toFixed(1)
  const formatMs = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${v.toFixed(1)}ms`
  const formatDb = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`

  // Get gain reduction from real-time data if available
  const gainReduction = realtimeData?.gainReduction ?? 0

  // Visualization section
  const visualization = (
    <div className="dynamics-visualization">
      <div className="dynamics-meter-container">
        <GainReductionMeter
          gainReduction={gainReduction}
          height={compact ? 100 : 120}
          width={24}
        />
      </div>
      <div className="dynamics-curve-container">
        <TransferCurve
          threshold={threshold}
          ratio={ratio}
          knee={knee}
          makeupGain={makeup}
          width={compact ? 160 : 200}
          height={compact ? 100 : 120}
          accentColor={accentColor}
        />
      </div>

      <style>{`
        .dynamics-visualization {
          display: flex;
          gap: 16px;
          align-items: center;
          justify-content: center;
        }

        .dynamics-meter-container {
          flex-shrink: 0;
        }

        .dynamics-curve-container {
          flex: 1;
          display: flex;
          justify-content: center;
        }
      `}</style>
    </div>
  )

  return (
    <PluginCardShell
      plugin={plugin}
      accentColor={accentColor}
      bypassed={plugin.bypassed}
      visualization={visualization}
      compact={compact}
    >
      <div className="dynamics-parameters">
        {/* Threshold & Ratio Section */}
        <ParameterSection title="Dynamics" accentColor={accentColor}>
          <ParameterRow>
            {thresholdParam && (
              <ParameterKnob
                label="Threshold"
                value={threshold}
                min={thresholdParam.min}
                max={thresholdParam.max}
                defaultValue={thresholdParam.default}
                unit="dB"
                onChange={handleChange(thresholdParam.index)}
                onChangeEnd={onParameterChangeEnd}
                accentColor={accentColor}
                disabled={disabled}
                valueFormatter={formatDb}
                size={compact ? 'small' : 'medium'}
              />
            )}
            {ratioParam && (
              <ParameterKnob
                label="Ratio"
                value={ratio}
                min={ratioParam.min}
                max={ratioParam.max}
                defaultValue={ratioParam.default}
                unit=":1"
                onChange={handleChange(ratioParam.index)}
                onChangeEnd={onParameterChangeEnd}
                accentColor={accentColor}
                disabled={disabled}
                valueFormatter={formatRatio}
                size={compact ? 'small' : 'medium'}
              />
            )}
            {kneeParam && (
              <ParameterKnob
                label="Knee"
                value={knee}
                min={kneeParam.min}
                max={kneeParam.max}
                defaultValue={kneeParam.default}
                unit="dB"
                onChange={handleChange(kneeParam.index)}
                onChangeEnd={onParameterChangeEnd}
                accentColor={accentColor}
                disabled={disabled}
                valueFormatter={formatDb}
                size={compact ? 'small' : 'medium'}
              />
            )}
          </ParameterRow>
        </ParameterSection>

        {/* Timing Section */}
        {(attackParam || releaseParam) && (
          <ParameterSection title="Timing" accentColor={accentColor}>
            <ParameterRow>
              {attackParam && (
                <ParameterKnob
                  label="Attack"
                  value={parameterValues[attackParam.index] ?? attackParam.default}
                  min={attackParam.min}
                  max={attackParam.max}
                  defaultValue={attackParam.default}
                  unit="ms"
                  onChange={handleChange(attackParam.index)}
                  onChangeEnd={onParameterChangeEnd}
                  accentColor={accentColor}
                  disabled={disabled}
                  isLogarithmic={attackParam.is_log}
                  valueFormatter={formatMs}
                  size={compact ? 'small' : 'medium'}
                />
              )}
              {releaseParam && (
                <ParameterKnob
                  label="Release"
                  value={parameterValues[releaseParam.index] ?? releaseParam.default}
                  min={releaseParam.min}
                  max={releaseParam.max}
                  defaultValue={releaseParam.default}
                  unit="ms"
                  onChange={handleChange(releaseParam.index)}
                  onChangeEnd={onParameterChangeEnd}
                  accentColor={accentColor}
                  disabled={disabled}
                  isLogarithmic={releaseParam.is_log}
                  valueFormatter={formatMs}
                  size={compact ? 'small' : 'medium'}
                />
              )}
            </ParameterRow>
          </ParameterSection>
        )}

        {/* Output Section */}
        {makeupParam && (
          <ParameterSection title="Output" accentColor={accentColor}>
            <ParameterRow justify="center">
              <ParameterKnob
                label="Makeup"
                value={makeup}
                min={makeupParam.min}
                max={makeupParam.max}
                defaultValue={makeupParam.default}
                unit="dB"
                onChange={handleChange(makeupParam.index)}
                onChangeEnd={onParameterChangeEnd}
                accentColor={accentColor}
                disabled={disabled}
                valueFormatter={formatDb}
                size={compact ? 'small' : 'medium'}
              />
            </ParameterRow>
          </ParameterSection>
        )}

        {/* Other Parameters */}
        {otherParams.length > 0 && (
          <ParameterSection title="Other" accentColor={accentColor} collapsible defaultCollapsed>
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
        .dynamics-parameters {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
      `}</style>
    </PluginCardShell>
  )
}

export default DynamicsTemplate
