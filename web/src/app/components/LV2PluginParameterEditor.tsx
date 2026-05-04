import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity as Pulse,
  Add as Plus,
  ChartLine as ChartBar,
  CheckmarkFilled as CheckCircle,
  ChevronDown as CaretDown,
  ChevronRight as CaretRight,
  Close as X,
  Copy,
  FolderOpen,
  MeterAlt as Gauge,
  Paste as Clipboard,
  Radio as Broadcast,
  Renew as SpinnerGap,
  Reset as ArrowCounterClockwise,
  Save as FloppyDisk,
  Search as MagnifyingGlass,
  SettingsAdjust as Faders,
  SettingsAdjust as GearSix,
  Star,
  StarFilled,
  WarningAlt as Warning,
} from '@carbon/icons-react'
import { pluginsApi, pluginPresetsApi, chainsApi } from '../../map2/api'
import { usePluginOutput } from '../hooks/usePluginOutputs'
import { NumberInput } from './ParameterControl'
import type { Plugin, PluginParameter, OutputPort } from '../../map2/types'
import { getCategoryConfig } from './PluginCards/types'
import { getDisplayPluginName, sanitizeRestrictedDisplayText } from '../../map2/displayNames'

interface LV2PluginParameterEditorProps {
  plugin: Plugin
  onAddToChain?: (chainId: number) => void
  showAddToChain?: boolean
  instanceId?: number
  pluginPosition?: number
}

// Parameter Control Component - Smart control based on parameter type
function ParameterControl({
  pluginId,
  param,
  value,
  onChange,
  onChangeEnd,
  accentColor,
  disabled,
}: {
  pluginId: string
  param: PluginParameter
  value: number
  onChange: (value: number) => void
  onChangeEnd?: () => void
  accentColor: string
  disabled?: boolean
}) {
  const [localValue, setLocalValue] = useState(value)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    if (!isDragging) {
      setLocalValue(value)
    }
  }, [value, isDragging])

  // Format value for display
  const formatValue = (val: number): string => {
    if (param.is_toggled) {
      return val > 0.5 ? 'ON' : 'OFF'
    }
    if (Math.abs(val) >= 1000) {
      return `${(val / 1000).toFixed(1)}k`
    }
    if (Math.abs(val) < 0.01 && val !== 0) {
      return val.toExponential(1)
    }
    if (Number.isInteger(val)) {
      return val.toString()
    }
    return val.toFixed(2)
  }

  // Convert slider position to parameter value (handles logarithmic)
  const sliderToValue = (sliderPos: number): number => {
    if (param.is_log && param.min > 0) {
      const logMin = Math.log(param.min)
      const logMax = Math.log(param.max)
      return Math.exp(logMin + (sliderPos / 100) * (logMax - logMin))
    }
    return param.min + (sliderPos / 100) * (param.max - param.min)
  }

  // Convert parameter value to slider position
  const valueToSlider = (val: number): number => {
    if (param.is_log && param.min > 0) {
      const logMin = Math.log(param.min)
      const logMax = Math.log(param.max)
      return ((Math.log(val) - logMin) / (logMax - logMin)) * 100
    }
    return ((val - param.min) / (param.max - param.min)) * 100
  }

  // Toggle control
  if (param.is_toggled) {
    const isOn = localValue > 0.5
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 11, color: '#aaa', fontWeight: 500 }}>
            {param.name}
          </span>
          <span style={{
            fontSize: 9,
            color: isOn ? accentColor : '#666',
            fontWeight: 600,
          }}>
            {isOn ? 'ON' : 'OFF'}
          </span>
        </div>
        <button
          onClick={() => {
            const newVal = isOn ? 0 : 1
            setLocalValue(newVal)
            onChange(newVal)
            onChangeEnd?.()
          }}
          disabled={disabled}
          style={{
            width: '100%',
            height: 32,
            borderRadius: 8,
            border: `1px solid ${isOn ? accentColor : '#444'}`,
            background: isOn
              ? `linear-gradient(135deg, ${accentColor}30 0%, ${accentColor}10 100%)`
              : 'rgba(0,0,0,0.2)',
            color: isOn ? accentColor : '#666',
            fontSize: 11,
            fontWeight: 600,
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'all var(--map2-dur-base, 220ms) var(--map2-ease-in-out-rack, ease)',
            boxShadow: isOn ? `0 0 12px ${accentColor}40` : 'none',
            opacity: disabled ? 0.5 : 1,
          }}
        >
          {isOn ? '● ENABLED' : '○ DISABLED'}
        </button>
      </div>
    )
  }

  // Calculate step based on range
  const range = param.max - param.min
  const step = range > 100 ? 1 : range > 10 ? 0.1 : 0.01

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{
          fontSize: 11,
          color: '#aaa',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}>
          {param.name}
          {param.is_log && (
            <span style={{
              fontSize: 8,
              padding: '1px 4px',
              background: 'rgba(168, 85, 247, 0.2)',
              color: '#a855f7',
              borderRadius: 3,
            }}>
              LOG
            </span>
          )}
        </span>
      </div>

      {/* Number input control */}
      <NumberInput
        value={localValue}
        min={param.min}
        max={param.max}
        step={step}
        pluginId={pluginId}
        paramKey={param.symbol || param.name}
        scale={param.is_log ? 'log' : undefined}
        onChange={(v) => {
          setLocalValue(v)
          onChange(v)
        }}
        onChangeEnd={onChangeEnd}
        disabled={disabled}
        size="small"
        showLabel={false}
        valueFormatter={formatValue}
      />

      {/* Min/Max labels */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 9,
        color: '#666',
      }}>
        <span>{formatValue(param.min)}</span>
        <span style={{ color: '#555' }}>Default: {formatValue(param.default)}</span>
        <span>{formatValue(param.max)}</span>
      </div>
    </div>
  )
}

// Output Port Meter Component
function OutputMeter({
  port,
  value,
  accentColor,
}: {
  port: OutputPort
  value: number
  accentColor: string
}) {
  const percentage = useMemo(() => {
    const range = port.max_value - port.min_value
    if (range === 0) return 0
    return Math.max(0, Math.min(100, ((value - port.min_value) / range) * 100))
  }, [value, port])

  const isGainReduction = port.designation === 'gain_reduction'
  const displayValue = isGainReduction ? -Math.abs(value) : value

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      padding: 8,
      background: 'rgba(0,0,0,0.2)',
      borderRadius: 8,
      border: '1px solid rgba(255,255,255,0.05)',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 10, color: '#888', letterSpacing: '0.02em' }}>
          {port.name}
        </span>
        <span style={{
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          color: isGainReduction && value > 0 ? '#22c55e' : accentColor,
          fontWeight: 600,
        }}>
          {displayValue.toFixed(1)} {port.unit || 'dB'}
        </span>
      </div>

      {/* Meter bar */}
      <div style={{
        height: 8,
        background: 'rgba(0,0,0,0.4)',
        borderRadius: 4,
        overflow: 'hidden',
        position: 'relative',
      }}>
        {isGainReduction ? (
          // Gain reduction meter (fills from right to left)
          <div style={{
            position: 'absolute',
            right: 0,
            width: `${percentage}%`,
            height: '100%',
            background: `linear-gradient(90deg, #22c55e, #4ade80)`,
            boxShadow: '0 0 8px rgba(34, 197, 94, 0.5)',
            borderRadius: 4,
            transition: 'width var(--map2-dur-instant, 80ms) var(--map2-ease-in-out-rack, ease)',
          }} />
        ) : (
          // Standard meter
          <div style={{
            width: `${percentage}%`,
            height: '100%',
            background: percentage > 90
              ? 'linear-gradient(90deg, #22c55e, #f59e0b, #ef4444)'
              : percentage > 70
                ? 'linear-gradient(90deg, #22c55e, #f59e0b)'
                : `linear-gradient(90deg, ${accentColor}80, ${accentColor})`,
            boxShadow: percentage > 90 ? '0 0 8px rgba(239, 68, 68, 0.5)' : `0 0 8px ${accentColor}40`,
            borderRadius: 4,
            transition: 'width var(--map2-dur-instant, 80ms) var(--map2-ease-in-out-rack, ease)',
          }} />
        )}
      </div>
    </div>
  )
}

// Preset Card Component
function PresetCard({
  preset,
  isActive,
  onLoad,
  onToggleFavorite,
  accentColor,
}: {
  preset: {
    id: number
    name: string
    is_favorite: boolean
    is_default: boolean
    usage_count: number
    description: string
  }
  isActive: boolean
  onLoad: () => void
  onToggleFavorite: () => void
  accentColor: string
}) {
  return (
    <div
      onClick={onLoad}
      style={{
        padding: '10px 12px',
        background: isActive
          ? `linear-gradient(135deg, ${accentColor}20 0%, rgba(0,0,0,0.3) 100%)`
          : 'rgba(0,0,0,0.15)',
        border: `1px solid ${isActive ? accentColor : 'rgba(255,255,255,0.05)'}`,
        borderRadius: 8,
        cursor: 'pointer',
        transition: 'all var(--map2-dur-base, 220ms) var(--map2-ease-in-out-rack, ease)',
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
      }}>
        <span style={{
          fontSize: 12,
          fontWeight: 600,
          color: isActive ? accentColor : '#f2f6ff',
        }}>
          {preset.name}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleFavorite()
          }}
          style={{
            background: 'none',
            border: 'none',
            padding: 4,
            cursor: 'pointer',
            color: preset.is_favorite ? '#fbbf24' : '#666',
          }}
        >
          {preset.is_favorite ? (
            <StarFilled size={14} style={{ color: '#fbbf24' }} />
          ) : (
            <Star size={14} />
          )}
        </button>
      </div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 10,
        color: '#888',
      }}>
        {preset.is_default && (
          <span style={{
            padding: '1px 6px',
            background: 'rgba(55, 214, 201, 0.2)',
            color: '#37d6c9',
            borderRadius: 4,
          }}>
            Default
          </span>
        )}
        <span>{preset.usage_count} uses</span>
      </div>
    </div>
  )
}

export function LV2PluginParameterEditor({
  plugin,
  onAddToChain,
  showAddToChain = true,
  instanceId,
  pluginPosition,
}: LV2PluginParameterEditorProps) {
  const queryClient = useQueryClient()
  const catConfig = getCategoryConfig(plugin.category)
  const accentColor = catConfig.color
  const resolvedInstanceId = typeof instanceId === 'number' && instanceId > 0 ? instanceId : plugin.instance_id
  const resolvedPluginPosition = typeof pluginPosition === 'number' && pluginPosition >= 0 ? pluginPosition : undefined

  // Real-time output data from WebSocket
  const { outputPorts: pluginOutputValues } = usePluginOutput({
    uri: plugin.uri,
    instanceId: resolvedInstanceId,
    pluginPosition: resolvedPluginPosition,
  })

  // State
  const [parameterValues, setParameterValues] = useState<Record<number, number>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['all']))
  const [showPresets, setShowPresets] = useState(false)
  const [savePresetName, setSavePresetName] = useState('')
  const [showSavePreset, setShowSavePreset] = useState(false)
  const [copiedParams, setCopiedParams] = useState<Record<number, number> | null>(null)
  const [alerts, setAlerts] = useState<Array<{ id: string; type: 'success' | 'error' | 'warning'; message: string }>>([])

  // Ensure plugin parameters are properly initialized
  useEffect(() => {
    if (!plugin.parameters || plugin.parameters.length === 0) {
      addAlert('error', 'Plugin parameters could not be loaded. Ensure the LV2 plugin is compatible.');
      return;
    }

    const values: Record<number, number> = {}
    plugin.parameters.forEach(param => {
      values[param.index] = param.value ?? param.default
    })
    setParameterValues(values)
  }, [plugin])

  // Fetch presets for this plugin
  const presetsQuery = useQuery({
    queryKey: ['plugin-presets', plugin.uri],
    queryFn: () => pluginPresetsApi.getByPluginUri(plugin.uri),
    staleTime: 30000,
  })

  // Fetch available chains
  const chainsQuery = useQuery({
    queryKey: ['chains'],
    queryFn: () => chainsApi.list(),
    staleTime: 60000,
  })

  // Set parameter mutation
  const setParameterMutation = useMutation({
    mutationFn: async ({ paramIndex, value }: { paramIndex: number; value: number }) => {
      return pluginsApi.setParameterBatched(
        plugin.uri,
        paramIndex,
        value,
        resolvedInstanceId,
        resolvedPluginPosition,
      )
    },
  })

  // Save preset mutation
  const savePresetMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!plugin.parameters || plugin.parameters.length === 0) {
        throw new Error('Cannot save preset: Plugin parameters are missing.')
      }

      const parameters: Record<string, number> = {}
      Object.entries(parameterValues).forEach(([idx, val]) => {
        const param = plugin.parameters?.find(p => p.index === parseInt(idx))
        if (param) {
          parameters[param.symbol] = val
        }
      })
      return pluginPresetsApi.create({
        name,
        plugin_uri: plugin.uri,
        plugin_name: plugin.name,
        parameters,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugin-presets', plugin.uri] })
      setShowSavePreset(false)
      setSavePresetName('')
      addAlert('success', 'Preset saved successfully!')
    },
    onError: (error) => {
      addAlert('error', `Failed to save preset: ${error.message}`)
    },
  })

  // Load preset mutation
  const loadPresetMutation = useMutation({
    mutationFn: async (presetId: number) => {
      return pluginPresetsApi.load(presetId)
    },
    onSuccess: (data) => {
      // Apply parameters from preset
      if (data.parameters) {
        const newValues: Record<number, number> = { ...parameterValues }
        Object.entries(data.parameters).forEach(([symbol, value]) => {
          const param = plugin.parameters?.find(p => p.symbol === symbol)
          if (param && typeof value === 'number') {
            newValues[param.index] = value
            setParameterMutation.mutate({ paramIndex: param.index, value })
          }
        })
        setParameterValues(newValues)
      }
      addAlert('success', `Loaded preset: ${data.name}`)
    },
    onError: () => {
      addAlert('error', 'Failed to load preset')
    },
  })

  // Toggle favorite mutation
  const toggleFavoriteMutation = useMutation({
    mutationFn: (presetId: number) => pluginPresetsApi.toggleFavorite(presetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugin-presets', plugin.uri] })
    },
  })

  // Add to chain mutation
  const addToChainMutation = useMutation({
    mutationFn: async (chainId: number) => {
      return chainsApi.addPlugin(chainId, plugin.uri)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      addAlert('success', 'Plugin added to chain!')
    },
    onError: () => {
      addAlert('error', 'Failed to add plugin to chain')
    },
  })

  // Add alert helper
  const addAlert = (type: 'success' | 'error' | 'warning', message: string) => {
    const id = Date.now().toString()
    setAlerts(prev => [...prev, { id, type, message }])
    setTimeout(() => {
      setAlerts(prev => prev.filter(a => a.id !== id))
    }, 3000)
  }

  // Handle parameter change
  const handleParameterChange = useCallback((paramIndex: number, value: number) => {
    setParameterValues(prev => ({ ...prev, [paramIndex]: value }))
    setParameterMutation.mutate({ paramIndex, value })
  }, [setParameterMutation])

  // Handle parameter change end (flush batched updates)
  const handleParameterChangeEnd = useCallback(() => {
    pluginsApi.flushParameterBatch()
  }, [])

  // Reset all to defaults
  const resetToDefaults = useCallback(() => {
    const newValues: Record<number, number> = {}
    plugin.parameters?.forEach(param => {
      newValues[param.index] = param.default
      setParameterMutation.mutate({ paramIndex: param.index, value: param.default })
    })
    setParameterValues(newValues)
    pluginsApi.flushParameterBatch()
    addAlert('success', 'Parameters reset to defaults')
  }, [plugin.parameters, setParameterMutation])

  // Copy parameters
  const copyParameters = useCallback(() => {
    setCopiedParams({ ...parameterValues })
    addAlert('success', 'Parameters copied to clipboard')
  }, [parameterValues])

  // Paste parameters
  const pasteParameters = useCallback(() => {
    if (!copiedParams) return
    Object.entries(copiedParams).forEach(([idx, value]) => {
      const paramIndex = parseInt(idx)
      setParameterMutation.mutate({ paramIndex, value })
    })
    setParameterValues(copiedParams)
    pluginsApi.flushParameterBatch()
    addAlert('success', 'Parameters pasted')
  }, [copiedParams, setParameterMutation])

  // Filter parameters by search
  const filteredParameters = useMemo(() => {
    if (!plugin.parameters) return []
    if (!searchQuery) return plugin.parameters
    const term = searchQuery.toLowerCase()
    return plugin.parameters.filter(p =>
      p.name.toLowerCase().includes(term) ||
      p.symbol.toLowerCase().includes(term)
    )
  }, [plugin.parameters, searchQuery])

  // Group parameters by first word of name
  const groupedParameters = useMemo(() => {
    const groups: Record<string, PluginParameter[]> = {}
    filteredParameters.forEach(param => {
      const groupName = param.name.split(' ')[0] || 'Other'
      if (!groups[groupName]) groups[groupName] = []
      groups[groupName].push(param)
    })
    // If only 1-2 groups or few params, just show all
    if (Object.keys(groups).length <= 2 || filteredParameters.length <= 8) {
      return { 'All Parameters': filteredParameters }
    }
    return groups
  }, [filteredParameters])

  const uiInfo = plugin.ui_info
  const outputPorts = uiInfo?.output_ports || []
  const hasMeters = uiInfo?.has_meters || outputPorts.length > 0

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
    }}>
      {/* Alerts */}
      {alerts.length > 0 && (
        <div style={{
          position: 'fixed',
          top: 16,
          right: 16,
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          {alerts.map(alert => (
            <div
              key={alert.id}
              style={{
                padding: '10px 16px',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: alert.type === 'success'
                  ? 'rgba(34, 197, 94, 0.9)'
                  : alert.type === 'error'
                    ? 'rgba(239, 68, 68, 0.9)'
                    : 'rgba(245, 158, 11, 0.9)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 500,
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                animation: 'slideIn 0.3s ease',
              }}
            >
              {alert.type === 'success' && <CheckCircle size={16} />}
              {alert.type === 'error' && <Warning size={16} />}
              {alert.type === 'warning' && <Warning size={16} />}
              {alert.message}
            </div>
          ))}
        </div>
      )}

      {/* Plugin Header */}
      <div style={{
        padding: 16,
        borderRadius: 12,
        background: `linear-gradient(135deg, ${catConfig.bg} 0%, rgba(0,0,0,0.3) 100%)`,
        border: `1px solid ${accentColor}40`,
        boxShadow: `0 0 20px ${accentColor}20`,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: `linear-gradient(135deg, ${accentColor}30 0%, ${accentColor}10 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: `1px solid ${accentColor}40`,
              boxShadow: `0 0 12px ${accentColor}30`,
            }}>
              <Faders size={20} style={{ color: accentColor }} />
            </div>
            <div>
              <h3 style={{
                fontSize: 16,
                fontWeight: 700,
                color: accentColor,
                margin: 0,
              }}>
                {getDisplayPluginName(plugin.name, plugin.uri)}
              </h3>
              <div style={{
                fontSize: 11,
                color: '#888',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <span>{sanitizeRestrictedDisplayText(plugin.author) || 'Unknown author'}</span>
                <span>•</span>
                <span style={{
                  padding: '1px 6px',
                  background: catConfig.bg,
                  color: accentColor,
                  borderRadius: 4,
                  fontSize: 10,
                }}>
                  {plugin.category}
                </span>
              </div>
            </div>
          </div>

          {/* Quick stats */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{
              padding: '6px 10px',
              background: 'rgba(0,0,0,0.2)',
              borderRadius: 6,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: accentColor }}>
                {plugin.parameters?.length || 0}
              </div>
              <div style={{ fontSize: 9, color: '#888', letterSpacing: '0.02em' }}>
                Params
              </div>
            </div>
            <div style={{
              padding: '6px 10px',
              background: 'rgba(0,0,0,0.2)',
              borderRadius: 6,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: accentColor }}>
                {plugin.in_ports}→{plugin.out_ports}
              </div>
              <div style={{ fontSize: 9, color: '#888', letterSpacing: '0.02em' }}>
                Ports
              </div>
            </div>
          </div>
        </div>

        {/* UI Capability Badges */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {uiInfo?.has_native_ui && (
            <span style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: 'var(--cds-spacing-02) var(--cds-spacing-03)',
              background: 'rgba(59, 130, 246, 0.15)',
              color: '#3b82f6',
              borderRadius: 6,
              fontSize: 10,
              fontWeight: 600,
              border: '1px solid rgba(59, 130, 246, 0.3)',
            }}>
              <GearSix size={12} /> Native GUI
            </span>
          )}
          {hasMeters && (
            <span style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: 'var(--cds-spacing-02) var(--cds-spacing-03)',
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#10b981',
              borderRadius: 6,
              fontSize: 10,
              fontWeight: 600,
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}>
              <Gauge size={12} /> Meters
            </span>
          )}
          {uiInfo?.has_tuner && (
            <span style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: 'var(--cds-spacing-02) var(--cds-spacing-03)',
              background: 'rgba(34, 211, 238, 0.15)',
              color: '#22d3ee',
              borderRadius: 6,
              fontSize: 10,
              fontWeight: 600,
              border: '1px solid rgba(34, 211, 238, 0.3)',
            }}>
              <Broadcast size={12} /> Tuner
            </span>
          )}
          {uiInfo?.has_spectrum && (
            <span style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: 'var(--cds-spacing-02) var(--cds-spacing-03)',
              background: 'rgba(168, 85, 247, 0.15)',
              color: '#a855f7',
              borderRadius: 6,
              fontSize: 10,
              fontWeight: 600,
              border: '1px solid rgba(168, 85, 247, 0.3)',
            }}>
              <ChartBar size={12} /> Spectrum
            </span>
          )}
        </div>
      </div>

      {/* Output Meters (if available) */}
      {outputPorts.length > 0 && (
        <div style={{
          padding: 12,
          borderRadius: 12,
          background: 'linear-gradient(135deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.2) 100%)',
          border: '1px solid rgba(255,255,255,0.05)',
        }}>
          <div style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#888',
            letterSpacing: '0.02em',
            marginBottom: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <Pulse size={14} />
            Output Meters
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 8,
          }}>
            {outputPorts.map(port => (
              <OutputMeter
                key={port.index}
                port={port}
                value={pluginOutputValues[port.index] ?? 0}
                accentColor={accentColor}
              />
            ))}
          </div>
        </div>
      )}

      {/* Action Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
      }}>
        <button
          onClick={() => setShowPresets(!showPresets)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: 'var(--cds-spacing-03) var(--cds-spacing-04)',
            background: showPresets ? accentColor : 'rgba(0,0,0,0.2)',
            color: showPresets ? '#000' : '#ddd',
            border: `1px solid ${showPresets ? accentColor : '#444'}`,
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all var(--map2-dur-base, 220ms) var(--map2-ease-in-out-rack, ease)',
          }}
        >
          <FolderOpen size={14} />
          Presets
          {presetsQuery.data?.count ? ` (${presetsQuery.data.count})` : ''}
        </button>

        <button
          onClick={() => setShowSavePreset(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: 'var(--cds-spacing-03) var(--cds-spacing-04)',
            background: 'rgba(0,0,0,0.2)',
            color: '#ddd',
            border: '1px solid #444',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <FloppyDisk size={14} />
          Save
        </button>

        <button
          onClick={resetToDefaults}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: 'var(--cds-spacing-03) var(--cds-spacing-04)',
            background: 'rgba(0,0,0,0.2)',
            color: '#ddd',
            border: '1px solid #444',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <ArrowCounterClockwise size={14} />
          Reset
        </button>

        <button
          onClick={copyParameters}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: 'var(--cds-spacing-03) var(--cds-spacing-04)',
            background: 'rgba(0,0,0,0.2)',
            color: '#ddd',
            border: '1px solid #444',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Copy size={14} />
          Copy
        </button>

        {copiedParams && (
          <button
            onClick={pasteParameters}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: 'var(--cds-spacing-03) var(--cds-spacing-04)',
              background: 'rgba(34, 197, 94, 0.2)',
              color: '#4ade80',
              border: '1px solid rgba(34, 197, 94, 0.4)',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Clipboard size={14} />
            Paste
          </button>
        )}

        <div style={{ flex: 1 }} />

        {/* Search */}
        {(plugin.parameters?.length || 0) > 8 && (
          <div style={{ position: 'relative' }}>
            <MagnifyingGlass size={14} style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#666',
            }} />
            <input
              type="text"
              placeholder="Search parameters..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                padding: 'var(--cds-spacing-03) var(--cds-spacing-04) var(--cds-spacing-03) var(--cds-spacing-07)',
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid #444',
                borderRadius: 8,
                color: '#f2f6ff',
                fontSize: 12,
                width: 180,
              }}
            />
          </div>
        )}
      </div>

      {/* Save Preset Modal */}
      {showSavePreset && (
        <div style={{
          padding: 16,
          borderRadius: 12,
          background: 'linear-gradient(135deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.3) 100%)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Save Preset</span>
            <button
              onClick={() => setShowSavePreset(false)}
              style={{
                background: 'none',
                border: 'none',
                color: '#888',
                cursor: 'pointer',
              }}
            >
              <X size={16} />
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="Preset name..."
              value={savePresetName}
              onChange={(e) => setSavePresetName(e.target.value)}
              style={{
                flex: 1,
                padding: 'var(--cds-spacing-03) var(--cds-spacing-04)',
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid #444',
                borderRadius: 8,
                color: '#f2f6ff',
                fontSize: 12,
              }}
            />
            <button
              onClick={() => savePresetName && savePresetMutation.mutate(savePresetName)}
              disabled={!savePresetName || savePresetMutation.isPending}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: 'var(--cds-spacing-03) var(--cds-spacing-05)',
                background: savePresetName ? accentColor : '#444',
                color: savePresetName ? '#000' : '#888',
                border: 'none',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: savePresetName ? 'pointer' : 'not-allowed',
              }}
            >
              {savePresetMutation.isPending ? (
                <SpinnerGap size={14} className="animate-spin" />
              ) : (
                <FloppyDisk size={14} />
              )}
              Save
            </button>
          </div>
        </div>
      )}

      {/* Presets Panel */}
      {showPresets && (
        <div style={{
          padding: 16,
          borderRadius: 12,
          background: 'linear-gradient(135deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.2) 100%)',
          border: '1px solid rgba(255,255,255,0.05)',
        }}>
          <div style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#888',
            letterSpacing: '0.02em',
            marginBottom: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <FolderOpen size={14} />
            Plugin Presets
          </div>

          {presetsQuery.isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
              <SpinnerGap size={20} className="animate-spin" style={{ color: accentColor }} />
            </div>
          ) : presetsQuery.data?.presets && presetsQuery.data.presets.length > 0 ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 8,
            }}>
              {presetsQuery.data.presets.map(preset => (
                <PresetCard
                  key={preset.id}
                  preset={preset}
                  isActive={false}
                  onLoad={() => loadPresetMutation.mutate(preset.id)}
                  onToggleFavorite={() => toggleFavoriteMutation.mutate(preset.id)}
                  accentColor={accentColor}
                />
              ))}
            </div>
          ) : (
            <div style={{
              padding: 20,
              textAlign: 'center',
              color: '#888',
              fontSize: 12,
            }}>
              No presets saved for this plugin yet
            </div>
          )}
        </div>
      )}

      {/* Parameters */}
      {(!plugin.parameters || plugin.parameters.length === 0) ? (
        <div style={{
          padding: 24,
          textAlign: 'center',
          color: '#888',
          fontSize: 13,
          background: 'rgba(0,0,0,0.2)',
          borderRadius: 12,
        }}>
          This plugin has no adjustable parameters
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Object.entries(groupedParameters).map(([groupName, params]) => {
            const isExpanded = expandedGroups.has('all') || expandedGroups.has(groupName)
            const hasMultipleGroups = Object.keys(groupedParameters).length > 1 && groupName !== 'All Parameters'

            return (
              <div
                key={groupName}
                style={{
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.2) 100%)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  overflow: 'hidden',
                }}
              >
                {/* Group header (only show if multiple groups) */}
                {hasMultipleGroups && (
                  <div
                    onClick={() => {
                      setExpandedGroups(prev => {
                        const next = new Set(prev)
                        if (next.has(groupName)) {
                          next.delete(groupName)
                        } else {
                          next.add(groupName)
                        }
                        return next
                      })
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      cursor: 'pointer',
                      background: 'rgba(0,0,0,0.2)',
                      borderBottom: isExpanded ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}>
                      {isExpanded ? (
                        <CaretDown size={14} style={{ color: accentColor }} />
                      ) : (
                        <CaretRight size={14} style={{ color: '#888' }} />
                      )}
                      <span style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: isExpanded ? accentColor : '#aaa',
                      }}>
                        {groupName}
                      </span>
                      <span style={{
                        fontSize: 10,
                        color: '#666',
                        padding: '2px 6px',
                        background: 'rgba(0,0,0,0.2)',
                        borderRadius: 4,
                      }}>
                        {params.length}
                      </span>
                    </div>
                  </div>
                )}

                {/* Parameters grid */}
                {(isExpanded || !hasMultipleGroups) && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                    gap: 16,
                    padding: 16,
                  }}>
                    {params.map(param => (
                      <ParameterControl
                        key={param.index}
                        pluginId={plugin.uri}
                        param={param}
                        value={parameterValues[param.index] ?? param.default}
                        onChange={(value) => handleParameterChange(param.index, value)}
                        onChangeEnd={handleParameterChangeEnd}
                        accentColor={accentColor}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add to Chain */}
      {showAddToChain && chainsQuery.data?.chains && (
        <div style={{
          padding: 16,
          borderRadius: 12,
          background: 'linear-gradient(135deg, rgba(55, 214, 201, 0.1) 0%, rgba(0,0,0,0.2) 100%)',
          border: '1px solid rgba(55, 214, 201, 0.2)',
        }}>
          <div style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#888',
            letterSpacing: '0.02em',
            marginBottom: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <Plus size={14} />
            Add to Chain
          </div>
          <div style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
          }}>
            {chainsQuery.data.chains.map(chain => (
              <button
                key={chain.id}
                onClick={() => {
                  addToChainMutation.mutate(chain.id)
                  onAddToChain?.(chain.id)
                }}
                disabled={addToChainMutation.isPending}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  background: chain.is_active
                    ? 'rgba(55, 214, 201, 0.2)'
                    : 'rgba(0,0,0,0.2)',
                  color: chain.is_active ? '#37d6c9' : '#ddd',
                  border: `1px solid ${chain.is_active ? 'rgba(55, 214, 201, 0.4)' : '#444'}`,
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                <Plus size={14} />
                {chain.name}
                {chain.is_active && (
                  <span style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--cds-support-success)',
                    boxShadow: '0 0 6px #22c55e',
                  }} />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Plugin URI */}
      <div style={{
        padding: 10,
        background: 'rgba(0,0,0,0.2)',
        borderRadius: 8,
        fontSize: 10,
        fontFamily: 'var(--font-mono)',
        color: '#666',
        wordBreak: 'break-all',
      }}>
        <span style={{ color: '#888' }}>URI: </span>
        {plugin.uri}
      </div>

      {/* Animation keyframes */}
      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  )
}

export default LV2PluginParameterEditor
