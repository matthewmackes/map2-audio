/**
 * KnobParameterPanel Component
 *
 * Bottom panel displaying parameter controls for the selected plugin.
 * Uses the PluginCards system for custom templates when available,
 * falls back to Cortex Control inspired knob grid for others.
 */

import { useState, useCallback, useMemo } from 'react'
import { Power, Settings2 } from 'lucide-react'
import { ParameterKnob } from '../Controls/ParameterKnob'
import type { ChainPlugin, Plugin, PluginParameter } from '../../../map2/types'
import { getPluginCardComponent, getCategoryConfig } from '../PluginCards'
import type { PluginCardProps } from '../PluginCards/types'

// Category colors for accent (fallback when card system not used)
const CATEGORY_COLORS: Record<string, string> = {
  'Distortion': '#ff6b6b',
  'Amplifier': '#ff6b6b',
  'Filter': '#4ecdc4',
  'EQ': '#4ecdc4',
  'Equaliser': '#4ecdc4',
  'Delay': '#45b7d1',
  'Reverb': '#a855f7',
  'Modulation': '#f59e0b',
  'Chorus': '#f59e0b',
  'Flanger': '#f59e0b',
  'Phaser': '#f59e0b',
  'Compressor': '#22c55e',
  'Dynamics': '#22c55e',
  'Limiter': '#22c55e',
  'Gate': '#22c55e',
  'Simulator': '#ec4899',
  'Cabinet': '#f97316',
  'Utility': '#64748b',
  'Generator': '#8b5cf6',
  'Instrument': '#ec4899',
}

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] || '#ff3333'
}

export interface KnobParameterPanelProps {
  plugin: ChainPlugin | null
  meta: Plugin | null
  onParameterChange: (symbol: string, value: number) => void
  onParameterChangeEnd?: (symbol: string) => void
  onToggleBypass?: () => void
  /** Force use of classic knob grid instead of card templates */
  useClassicMode?: boolean
}

export function KnobParameterPanel({
  plugin,
  meta,
  onParameterChange,
  onParameterChangeEnd,
  onToggleBypass,
  useClassicMode = false,
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

  // Loading state - plugin selected but metadata not yet loaded
  if (!meta) {
    return (
      <div className="knob-param-panel">
        <div className="knob-param-panel-loading">
          <Settings2 size={32} strokeWidth={1.5} className="knob-param-panel-loading-icon" />
          <p>Loading {plugin.name || 'plugin'} parameters...</p>
        </div>
      </div>
    )
  }

  const accentColor = getCategoryColor(meta.category)

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
