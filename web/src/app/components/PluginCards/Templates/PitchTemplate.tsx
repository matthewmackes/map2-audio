/**
 * PitchTemplate Component
 *
 * Template for pitch shifters, harmonizers, and tuning plugins.
 */

import { useCallback, useMemo } from 'react'
import type { PluginCardProps } from '../types'
import { getCategoryConfig } from '../types'
import { PluginCardShell } from '../Base/PluginCardShell'
import { ParameterSection } from '../Base/ParameterSection'
import { ParameterRow } from '../Base/ParameterRow'
import { ParameterKnob } from '../../Controls/ParameterKnob'
import { PitchDisplay } from '../Visualizations/PitchDisplay'
import type { PluginParameter } from '../../../../map2/types'

// Parameter patterns
const SEMITONE_PATTERNS = ['semitone', 'semi', 'pitch', 'shift', 'transpose', 'interval']
const CENT_PATTERNS = ['cent', 'fine', 'detune', 'tune']
const FORMANT_PATTERNS = ['formant', 'throat', 'character']
const MIX_PATTERNS = ['mix', 'wet', 'dry', 'blend', 'level']
const FEEDBACK_PATTERNS = ['feedback', 'regen']
const SPEED_PATTERNS = ['speed', 'time', 'rate', 'glide', 'portamento']

function findParam(params: PluginParameter[], patterns: string[]): PluginParameter | undefined {
  return params.find(p =>
    patterns.some(pat =>
      p.name.toLowerCase().includes(pat) ||
      p.symbol.toLowerCase().includes(pat)
    )
  )
}

export function PitchTemplate({
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
  const semitoneParam = findParam(params, SEMITONE_PATTERNS)
  const centParam = findParam(params, CENT_PATTERNS)
  const formantParam = findParam(params, FORMANT_PATTERNS)
  const mixParams = params.filter(p =>
    MIX_PATTERNS.some(pat =>
      p.name.toLowerCase().includes(pat) ||
      p.symbol.toLowerCase().includes(pat)
    )
  )
  const feedbackParam = findParam(params, FEEDBACK_PATTERNS)
  const speedParam = findParam(params, SPEED_PATTERNS)

  // Get current values
  const semitones = semitoneParam
    ? (parameterValues[semitoneParam.index] ?? semitoneParam.default)
    : 0
  const cents = centParam
    ? (parameterValues[centParam.index] ?? centParam.default)
    : 0
  const formant = formantParam
    ? (parameterValues[formantParam.index] ?? formantParam.default)
    : 0

  // Get used indices
  const usedIndices = new Set<number>()
  ;[semitoneParam, centParam, formantParam, feedbackParam, speedParam]
    .forEach(p => p && usedIndices.add(p.index))
  mixParams.forEach(p => usedIndices.add(p.index))

  const otherParams = params.filter(p => !usedIndices.has(p.index))

  // Parameter change handler
  const handleChange = useCallback((index: number) => (value: number) => {
    onParameterChange(index, value)
  }, [onParameterChange])

  // Formatters
  const formatSemitones = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)} st`
  const formatCents = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)} c`
  const formatPercent = (v: number, max: number) => `${((v / max) * 100).toFixed(0)}%`
  const formatMs = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${v.toFixed(0)}ms`

  // Visualization
  const visualization = semitoneParam ? (
    <PitchDisplay
      semitones={semitones}
      cents={centParam ? cents : 0}
      formant={formantParam ? formant : 0}
      width={compact ? 180 : 200}
      height={compact ? 80 : 100}
      accentColor={accentColor}
      showNote={true}
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
      <div className="pitch-parameters">
        {/* Pitch Section */}
        <ParameterSection title="Pitch" accentColor={accentColor}>
          <ParameterRow>
            {semitoneParam && (
              <ParameterKnob
                label="Semitones"
                value={semitones}
                min={semitoneParam.min}
                max={semitoneParam.max}
                defaultValue={semitoneParam.default}
                step={1}
                onChange={handleChange(semitoneParam.index)}
                onChangeEnd={onParameterChangeEnd}
                accentColor={accentColor}
                disabled={disabled}
                valueFormatter={formatSemitones}
                size={compact ? 'small' : 'large'}
              />
            )}
            {centParam && (
              <ParameterKnob
                label="Fine"
                value={cents}
                min={centParam.min}
                max={centParam.max}
                defaultValue={centParam.default}
                step={1}
                onChange={handleChange(centParam.index)}
                onChangeEnd={onParameterChangeEnd}
                accentColor={accentColor}
                disabled={disabled}
                valueFormatter={formatCents}
                size={compact ? 'small' : 'medium'}
              />
            )}
          </ParameterRow>
        </ParameterSection>

        {/* Formant Section */}
        {formantParam && (
          <ParameterSection title="Character" accentColor={accentColor}>
            <ParameterRow justify="center">
              <ParameterKnob
                label="Formant"
                value={formant}
                min={formantParam.min}
                max={formantParam.max}
                defaultValue={formantParam.default}
                onChange={handleChange(formantParam.index)}
                onChangeEnd={onParameterChangeEnd}
                accentColor={accentColor}
                disabled={disabled}
                valueFormatter={(v) => formatPercent(v, formantParam.max)}
                size={compact ? 'small' : 'medium'}
              />
            </ParameterRow>
          </ParameterSection>
        )}

        {/* Speed/Glide Section */}
        {(speedParam || feedbackParam) && (
          <ParameterSection title="Timing" accentColor={accentColor}>
            <ParameterRow>
              {speedParam && (
                <ParameterKnob
                  label={speedParam.name}
                  value={parameterValues[speedParam.index] ?? speedParam.default}
                  min={speedParam.min}
                  max={speedParam.max}
                  defaultValue={speedParam.default}
                  onChange={handleChange(speedParam.index)}
                  onChangeEnd={onParameterChangeEnd}
                  accentColor={accentColor}
                  disabled={disabled}
                  isLogarithmic={speedParam.is_log}
                  valueFormatter={formatMs}
                  size={compact ? 'small' : 'medium'}
                />
              )}
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
            </ParameterRow>
          </ParameterSection>
        )}

        {/* Mix Section */}
        {mixParams.length > 0 && (
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
        .pitch-parameters {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
      `}</style>
    </PluginCardShell>
  )
}

export default PitchTemplate
