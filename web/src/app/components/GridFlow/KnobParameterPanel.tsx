/**
 * KnobParameterPanel Component
 *
 * Bottom panel displaying parameter controls for the selected plugin.
 * Uses the PluginCards system for custom templates when available,
 * falls back to Cortex Control inspired knob grid for others.
 */

import { useState, useCallback, useMemo } from 'react'
import { Power, Settings2, RefreshCw, AlertCircle } from 'lucide-react'
import { ParameterKnob } from '../Controls/ParameterKnob'
import type { ChainPlugin, Plugin, PluginParameter } from '../../../map2/types'
import { getPluginCardComponent, getCategoryConfig } from '../PluginCards'
import type { PluginCardProps } from '../PluginCards/types'

// Fallback color for unknown categories
const FALLBACK_COLOR = '#37d6c9'

export interface KnobParameterPanelProps {
  plugin: ChainPlugin | null
  meta: Plugin | null
  onParameterChange: (symbol: string, value: number) => void
  onParameterChangeEnd?: (symbol: string) => void
  onToggleBypass?: () => void
  /** Force use of classic knob grid instead of card templates */
  useClassicMode?: boolean
  /** Callback to refresh plugin discovery when metadata is missing */
  onRefreshPlugins?: () => void
  /** Whether plugin refresh is in progress */
  isRefreshing?: boolean
}

export function KnobParameterPanel({
  plugin,
  meta,
  onParameterChange,
  onParameterChangeEnd,
  onToggleBypass,
  useClassicMode = false,
  onRefreshPlugins,
  isRefreshing = false,
}: KnobParameterPanelProps) {
  // Track which parameters are being edited (for batch updates)
  const [editingParams, setEditingParams] = useState<Set<string>>(new Set())

  const handleParameterChange = useCallback(
    (symbol: string, value: number) => {
      setEditingParams((prev) => new Set(prev).add(symbol))
      onParameterChange(symbol, value)
    },
    [onParameterChange]
  )

  const handleParameterChangeEnd = useCallback(
    (symbol: string) => {
      setEditingParams((prev) => {
        const next = new Set(prev)
        next.delete(symbol)
        return next
      })
      onParameterChangeEnd?.(symbol)
    },
    [onParameterChangeEnd]
  )

  // Build index-to-symbol map for card system integration
  const parameterMap = useMemo(() => {
    const indexToSymbol: Record<number, string> = {}
    const symbolToIndex: Record<string, number> = {}

    meta?.parameters?.forEach((param) => {
      indexToSymbol[param.index] = param.symbol
      symbolToIndex[param.symbol] = param.index
    })

    return { indexToSymbol, symbolToIndex }
  }, [meta?.parameters])

  // Handle index-based parameter change (for card system)
  const handleIndexParameterChange = useCallback(
    (paramIndex: number, value: number) => {
      const symbol = parameterMap.indexToSymbol[paramIndex]
      if (symbol) {
        handleParameterChange(symbol, value)
      }
    },
    [parameterMap.indexToSymbol, handleParameterChange]
  )

  // Handle index-based parameter change end (for card system)
  const handleIndexParameterChangeEnd = useCallback(() => {
    // Flush all editing params
    editingParams.forEach((symbol) => {
      onParameterChangeEnd?.(symbol)
    })
  }, [editingParams, onParameterChangeEnd])

  // Handle bypass toggle for card system
  const handleCardBypassToggle = useCallback(
    (bypassed: boolean) => {
      onToggleBypass?.()
    },
    [onToggleBypass]
  )

  // Check if there's a custom card component for this plugin
  const CardComponent = useMemo(() => {
    if (useClassicMode || !meta) return null
    return getPluginCardComponent(meta.uri, meta.category)
  }, [meta, useClassicMode])

  // Build parameter values from chain plugin (index-based for card system)
  const parameterValues = useMemo(() => {
    const values: Record<number, number> = {}

    if (meta?.parameters && plugin?.parameters) {
      meta.parameters.forEach((param) => {
        values[param.index] = plugin.parameters?.[param.symbol] ?? param.default
      })
    }

    return values
  }, [meta?.parameters, plugin?.parameters])

  // Empty state - no plugin selected
  if (!plugin) {
    return (
      <div className="knob-param-panel">
        <div className="knob-param-panel-empty">
          <Settings2 size={32} strokeWidth={1.5} />
          <p>Select a plugin to edit parameters</p>
        </div>
      </div>
    )
  }

  // Error state - plugin selected but metadata not found in discovery cache
  if (!meta) {
    return (
      <div className="knob-param-panel">
        <div className="knob-param-panel-error">
          <AlertCircle size={32} strokeWidth={1.5} style={{ color: '#f59e0b' }} />
          <div className="knob-param-panel-error-content">
            <p className="knob-param-panel-error-title">
              Plugin metadata not found
            </p>
            <p className="knob-param-panel-error-desc">
              "{plugin.name || 'Unknown plugin'}" is in the chain but not found in the plugin discovery cache.
            </p>
            <p className="knob-param-panel-error-uri">
              URI: {plugin.uri}
            </p>
            {onRefreshPlugins && (
              <button
                className="knob-param-panel-refresh-btn"
                onClick={onRefreshPlugins}
                disabled={isRefreshing}
              >
                <RefreshCw size={14} className={isRefreshing ? 'spin' : ''} />
                {isRefreshing ? 'Refreshing...' : 'Refresh Plugin List'}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  const accentColor = getCategoryConfig(meta.category).color

  // Use custom card component if available
  if (CardComponent) {
    const catConfig = getCategoryConfig(meta.category)

    // Build a Plugin object that includes current parameter values
    const pluginWithValues: Plugin = {
      ...meta,
      parameters: meta.parameters?.map((param) => ({
        ...param,
        value: plugin.parameters?.[param.symbol] ?? param.default,
      })),
      bypassed: plugin.bypassed,
    }

    const cardProps: PluginCardProps = {
      plugin: pluginWithValues,
      parameterValues,
      onParameterChange: handleIndexParameterChange,
      onParameterChangeEnd: handleIndexParameterChangeEnd,
      onBypassToggle: handleCardBypassToggle,
      accentColor: catConfig.color,
      disabled: false,
      compact: false,
    }

    return (
      <div className="knob-param-panel knob-param-panel-card">
        <CardComponent {...cardProps} />
      </div>
    )
  }

  // Classic mode: Use original knob grid
  const parameters = meta.parameters || []
  const toggleParams = parameters.filter((p) => p.is_toggled)
  const continuousParams = parameters.filter((p) => !p.is_toggled)

  return (
    <div className="knob-param-panel">
      {/* Header */}
      <div className="knob-param-panel-header">
        <div className="knob-param-panel-title">
          <span className="knob-param-panel-category" style={{ color: accentColor }}>
            {meta.category}
          </span>
          <span className="knob-param-panel-name">{meta.name}</span>
        </div>

        {/* Bypass toggle */}
        {onToggleBypass && (
          <button
            className={`knob-param-panel-power ${plugin.bypassed ? 'bypassed' : 'active'}`}
            onClick={onToggleBypass}
            title={plugin.bypassed ? 'Enable plugin' : 'Bypass plugin'}
            style={{ '--accent': accentColor } as React.CSSProperties}
          >
            <Power size={18} />
          </button>
        )}
      </div>

      {/* Parameters area */}
      <div className="knob-param-panel-body">
        {/* Toggle parameters as buttons */}
        {toggleParams.length > 0 && (
          <div className="knob-param-toggles">
            {toggleParams.map((param) => {
              const currentValue = plugin.parameters?.[param.symbol] ?? param.default
              const isOn = currentValue > 0.5

              return (
                <button
                  key={param.symbol}
                  className={`knob-param-toggle ${isOn ? 'on' : 'off'}`}
                  onClick={() => handleParameterChange(param.symbol, isOn ? 0 : 1)}
                  style={{ '--accent': accentColor } as React.CSSProperties}
                >
                  <span className="knob-param-toggle-label">{param.name}</span>
                  <span className="knob-param-toggle-state">{isOn ? 'ON' : 'OFF'}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* Continuous parameters as knobs */}
        {continuousParams.length > 0 && (
          <div className="knob-param-grid">
            {continuousParams.map((param) => {
              const currentValue = plugin.parameters?.[param.symbol] ?? param.default

              return (
                <ParameterKnob
                  key={param.symbol}
                  label={param.name}
                  value={currentValue}
                  min={param.min}
                  max={param.max}
                  defaultValue={param.default}
                  onChange={(value) => handleParameterChange(param.symbol, value)}
                  onChangeEnd={() => handleParameterChangeEnd(param.symbol)}
                  accentColor={accentColor}
                  isLogarithmic={param.is_log}
                  size="medium"
                />
              )
            })}
          </div>
        )}

        {/* No parameters message */}
        {parameters.length === 0 && (
          <div className="knob-param-panel-no-params">
            <p>This plugin has no adjustable parameters</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default KnobParameterPanel
