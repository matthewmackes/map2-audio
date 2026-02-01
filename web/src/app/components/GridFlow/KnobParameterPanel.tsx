/**
 * KnobParameterPanel Component
 *
 * Bottom panel displaying parameter knobs for the selected plugin.
 * Cortex Control inspired layout with grid of minimal knobs.
 */

import { useState, useCallback } from 'react'
import { Power, Settings2 } from 'lucide-react'
import { ParameterKnob } from '../Controls/ParameterKnob'
import type { ChainPlugin, Plugin, PluginParameter } from '../../../map2/types'

// Category colors for accent
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
}

export function KnobParameterPanel({
  plugin,
  meta,
  onParameterChange,
  onParameterChangeEnd,
  onToggleBypass,
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

  if (!plugin || !meta) {
    return (
      <div className="knob-param-panel">
        <div className="knob-param-panel-empty">
          <Settings2 size={32} strokeWidth={1.5} />
          <p>Select a plugin to edit parameters</p>
        </div>
      </div>
    )
  }

  const accentColor = getCategoryColor(meta.category)
  const parameters = meta.parameters || []
  // All parameters in the parameters array are control/input parameters
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
