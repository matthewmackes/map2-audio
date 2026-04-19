/**
 * UtilityTemplate — Carbon-compliant fallback for utility plugins
 *
 * Wraps CarbonCardShell directly with auto-grouped parameters.
 */

import { useCallback, useMemo } from 'react'
import type { PluginCardProps } from '../types'
import { getCategoryConfig, generateParameterGroups } from '../types'
import { CarbonCardShell, type AdvancedSection } from '../Base/CarbonCardShell'
import { CarbonParameterSection } from '../Base/CarbonParameterSection'
import { ParameterKnob } from '../../ParameterControl'
import type { PluginParameter } from '../../../../map2/types'

export function UtilityTemplate({
  plugin,
  parameterValues,
  onParameterChange,
  accentColor: providedAccent,
  disabled = false,
  compact = false,
}: PluginCardProps) {
  const catConfig = getCategoryConfig(plugin.category)
  const accentColor = providedAccent || catConfig.color
  const params = plugin.parameters || []

  const paramGroups = useMemo(
    () => generateParameterGroups(params, { flattenSmallSets: false }),
    [params],
  )

  const handleChange = useCallback(
    (index: number) => (value: number) => onParameterChange(index, value),
    [onParameterChange],
  )

  const formatValue = (value: number, param: PluginParameter): string => {
    const name = param.name.toLowerCase()
    const symbol = param.symbol.toLowerCase()
    if (name.includes('db') || name.includes('gain') || name.includes('level') ||
        symbol.includes('db') || symbol.includes('gain')) {
      return `${value >= 0 ? '+' : ''}${value.toFixed(1)}dB`
    }
    if (param.max === 1 || param.max === 100 || name.includes('mix') ||
        name.includes('wet') || name.includes('dry') || name.includes('amount')) {
      const pct = param.max > 1 ? value : value * 100
      return `${pct.toFixed(0)}%`
    }
    if (name.includes('hz') || name.includes('freq') || symbol.includes('hz')) {
      return value >= 1000 ? `${(value / 1000).toFixed(1)}kHz` : `${value.toFixed(0)}Hz`
    }
    if (name.includes('ms') || name.includes('time') || name.includes('delay')) {
      return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${value.toFixed(1)}ms`
    }
    if (Number.isInteger(value)) return value.toString()
    return value.toFixed(2)
  }

  const shouldUseLog = (param: PluginParameter): boolean => {
    if (param.is_log) return true
    const name = param.name.toLowerCase()
    return name.includes('freq') || name.includes('hz') || (name.includes('time') && param.max > 100)
  }

  const mainGroups = paramGroups.filter(g => !g.collapsible)
  const collapsibleGroups = paramGroups.filter(g => g.collapsible)

  const advancedSections: AdvancedSection[] = useMemo(() =>
    collapsibleGroups.map(group => {
      const groupParams = group.parameters
        .map(idx => params.find(p => p.index === idx))
        .filter((p): p is PluginParameter => p !== undefined)
      if (groupParams.length === 0) return null
      return {
        id: group.id,
        title: group.label,
        children: (
          <CarbonParameterSection>
            {groupParams.map(param => (
              <ParameterKnob
                key={param.index}
                label={param.name}
                value={parameterValues[param.index] ?? param.default}
                min={param.min}
                max={param.max}
                defaultValue={param.default}
                onChange={handleChange(param.index)}
                accentColor={accentColor}
                disabled={disabled}
                isLogarithmic={shouldUseLog(param)}
                valueFormatter={(v) => formatValue(v, param)}
                size="small"
              />
            ))}
          </CarbonParameterSection>
        ),
      }
    }).filter((s): s is NonNullable<typeof s> => s !== null) as AdvancedSection[],
    [collapsibleGroups, params, parameterValues, handleChange, accentColor, disabled]
  )

  return (
    <CarbonCardShell
      plugin={plugin}
      accentColor={accentColor}
      bypassed={plugin.bypassed}
      compact={compact}
      advancedSections={advancedSections}
    >
      {mainGroups.map(group => {
        const groupParams = group.parameters
          .map(idx => params.find(p => p.index === idx))
          .filter((p): p is PluginParameter => p !== undefined)
        if (groupParams.length === 0) return null
        return (
          <CarbonParameterSection key={group.id} title={group.label}>
            {groupParams.map(param => (
              <ParameterKnob
                key={param.index}
                label={param.name}
                value={parameterValues[param.index] ?? param.default}
                min={param.min}
                max={param.max}
                defaultValue={param.default}
                onChange={handleChange(param.index)}
                accentColor={accentColor}
                disabled={disabled}
                isLogarithmic={shouldUseLog(param)}
                valueFormatter={(v) => formatValue(v, param)}
                size={compact ? 'small' : (group.knobSize as 'small' | 'medium' | 'large' | undefined) || 'medium'}
              />
            ))}
          </CarbonParameterSection>
        )
      })}
    </CarbonCardShell>
  )
}

export default UtilityTemplate
