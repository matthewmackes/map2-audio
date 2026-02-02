/**
 * UtilityTemplate Component
 *
 * Clean, simple template for utility plugins (gain, pan, phase, etc.)
 * with automatic parameter grouping.
 */

import { useCallback, useMemo } from 'react'
import type { PluginCardProps } from '../types'
import { getCategoryConfig, generateParameterGroups } from '../types'
import { PluginCardShell } from '../Base/PluginCardShell'
import { ParameterSection } from '../Base/ParameterSection'
import { ParameterRow } from '../Base/ParameterRow'
import { ParameterGrid } from '../Base/ParameterGrid'
import { ParameterKnob } from '../../Controls/ParameterKnob'
import type { PluginParameter } from '../../../../map2/types'

export function UtilityTemplate({
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

  // Generate automatic parameter groups
  const paramGroups = useMemo(() =>
    generateParameterGroups(params),
    [params]
  )

  // Parameter change handler
  const handleChange = useCallback((index: number) => (value: number) => {
    onParameterChange(index, value)
  }, [onParameterChange])

  // Smart value formatter
  const formatValue = (value: number, param: PluginParameter): string => {
    const name = param.name.toLowerCase()
    const symbol = param.symbol.toLowerCase()

    // dB parameters
    if (name.includes('db') || name.includes('gain') || name.includes('level') ||
        symbol.includes('db') || symbol.includes('gain')) {
      return `${value >= 0 ? '+' : ''}${value.toFixed(1)}dB`
    }

    // Percentage parameters
    if (param.max === 1 || param.max === 100 || name.includes('mix') ||
        name.includes('wet') || name.includes('dry') || name.includes('amount')) {
      const pct = param.max > 1 ? value : value * 100
      return `${pct.toFixed(0)}%`
    }

    // Hz/frequency parameters
    if (name.includes('hz') || name.includes('freq') || symbol.includes('hz')) {
      if (value >= 1000) return `${(value / 1000).toFixed(1)}kHz`
      return `${value.toFixed(0)}Hz`
    }

    // Time parameters (ms)
    if (name.includes('ms') || name.includes('time') || name.includes('delay')) {
      if (value >= 1000) return `${(value / 1000).toFixed(2)}s`
      return `${value.toFixed(1)}ms`
    }

    // Generic formatting
    if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`
    if (Number.isInteger(value)) return value.toString()
    if (Math.abs(value) < 0.01 && value !== 0) return value.toExponential(1)
    return value.toFixed(2)
  }

  // Determine if param should use log scale
  const shouldUseLog = (param: PluginParameter): boolean => {
    if (param.is_log) return true
    const name = param.name.toLowerCase()
    if (name.includes('freq') || name.includes('hz')) return true
    if (name.includes('time') && param.max > 100) return true
    return false
  }

  return (
    <PluginCardShell
      plugin={plugin}
      accentColor={accentColor}
      bypassed={plugin.bypassed}
      compact={compact}
    >
      <div className="utility-parameters">
        {paramGroups.map(group => {
          const groupParams = group.parameters
            .map(idx => params.find(p => p.index === idx))
            .filter((p): p is PluginParameter => p !== undefined)

          if (groupParams.length === 0) return null

          const useGrid = groupParams.length > 4 || group.layout === 'grid'

          return (
            <ParameterSection
              key={group.id}
              title={group.label}
              accentColor={accentColor}
              collapsible={group.collapsible}
              defaultCollapsed={group.defaultCollapsed}
            >
              {useGrid ? (
                <ParameterGrid
                  columns={group.columns || 'auto'}
                  minColumnWidth={compact ? 80 : 100}
                  gap={compact ? 12 : 16}
                >
                  {groupParams.map(param => (
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
                      isLogarithmic={shouldUseLog(param)}
                      valueFormatter={(v) => formatValue(v, param)}
                      size={compact ? 'small' : group.knobSize || 'medium'}
                    />
                  ))}
                </ParameterGrid>
              ) : (
                <ParameterRow gap={compact ? 12 : 16}>
                  {groupParams.map(param => (
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
                      isLogarithmic={shouldUseLog(param)}
                      valueFormatter={(v) => formatValue(v, param)}
                      size={compact ? 'small' : group.knobSize || 'medium'}
                    />
                  ))}
                </ParameterRow>
              )}
            </ParameterSection>
          )
        })}
      </div>

      <style>{`
        .utility-parameters {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
      `}</style>
    </PluginCardShell>
  )
}

export default UtilityTemplate
