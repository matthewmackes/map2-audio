import { useState, useEffect, useCallback, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  SlidersHorizontal,
  Save,
  FolderOpen,
  Star,
  RotateCcw,
  Copy,
  Clipboard,
  ChevronDown,
  ChevronRight,
  Search,
  Gauge,
  Activity,
  Plus,
  AlertTriangle,
  CheckCircle,
  Loader2,
  X,
  Settings2,
} from 'lucide-react'
import { vst3Api, chainsApi, pluginPresetsApi } from '../../map2/api'
import type { VST3Plugin } from '../../map2/api'

// Category colors (matching existing system)
const CATEGORY_COLORS: Record<string, { color: string; bg: string }> = {
  'Distortion': { color: '#ff6b6b', bg: 'rgba(255, 107, 107, 0.15)' },
  'Amplifier': { color: '#ff6b6b', bg: 'rgba(255, 107, 107, 0.15)' },
  'Filter': { color: '#4ecdc4', bg: 'rgba(78, 205, 196, 0.15)' },
  'EQ': { color: '#4ecdc4', bg: 'rgba(78, 205, 196, 0.15)' },
  'Delay': { color: '#45b7d1', bg: 'rgba(69, 183, 209, 0.15)' },
  'Reverb': { color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)' },
  'Modulation': { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  'Compressor': { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)' },
  'Dynamics': { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)' },
  'Simulator': { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)' },
  'Cabinet': { color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)' },
  'Utility': { color: '#64748b', bg: 'rgba(100, 116, 139, 0.15)' },
  'Generator': { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)' },
  'Effect': { color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)' },
}

const getCategoryConfig = (category: string) => {
  return CATEGORY_COLORS[category] || { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)' }
}

interface VST3PluginParameterEditorProps {
  plugin: VST3Plugin
  onAddToChain?: (chainId: number) => void
  showAddToChain?: boolean
}

interface PluginParameter {
  index: number
  name: string
  symbol: string
  min: number
  max: number
  default: number
  value?: number
  is_toggled?: boolean
  is_log?: boolean
}

// Parameter Control Component - Smart control based on parameter type
function ParameterControl({
  param,
  value,
  onChange,
  onChangeEnd,
  accentColor,
  disabled,
}: {
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
            transition: 'all 0.2s ease',
            boxShadow: isOn ? `0 0 12px ${accentColor}40` : 'none',
            opacity: disabled ? 0.5 : 1,
          }}
        >
          {isOn ? '● ENABLED' : '○ DISABLED'}
        </button>
      </div>
    )
  }

  // Slider control (linear or logarithmic)
  const sliderPos = valueToSlider(localValue)

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
        <span style={{
          fontSize: 11,
          color: accentColor,
          fontWeight: 600,
          fontFamily: 'monospace',
          minWidth: 50,
          textAlign: 'right',
        }}>
          {formatValue(localValue)}
        </span>
      </div>

      {/* Custom slider track */}
      <div style={{
        position: 'relative',
        height: 24,
        display: 'flex',
        alignItems: 'center',
      }}>
        {/* Track background */}
        <div style={{
          position: 'absolute',
          width: '100%',
          height: 6,
          background: 'rgba(0,0,0,0.4)',
          borderRadius: 3,
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.05)',
        }}>
          {/* Fill */}
          <div style={{
            width: `${sliderPos}%`,
            height: '100%',
            background: `linear-gradient(90deg, ${accentColor}80, ${accentColor})`,
            borderRadius: 3,
            boxShadow: `0 0 8px ${accentColor}60`,
            transition: isDragging ? 'none' : 'width 0.1s ease',
          }} />
        </div>

        {/* Native range input (invisible but interactive) */}
        <input
          type="range"
          min={0}
          max={100}
          step={0.1}
          value={sliderPos}
          disabled={disabled}
          onChange={(e) => {
            const newSliderPos = parseFloat(e.target.value)
            const newValue = sliderToValue(newSliderPos)
            setLocalValue(newValue)
            onChange(newValue)
          }}
          onMouseDown={() => setIsDragging(true)}
          onMouseUp={() => {
            setIsDragging(false)
            onChangeEnd?.()
          }}
          onTouchStart={() => setIsDragging(true)}
          onTouchEnd={() => {
            setIsDragging(false)
            onChangeEnd?.()
          }}
          style={{
            position: 'absolute',
            width: '100%',
            height: 24,
            opacity: 0,
            cursor: disabled ? 'not-allowed' : 'pointer',
            margin: 0,
          }}
        />

        {/* Thumb indicator */}
        <div style={{
          position: 'absolute',
          left: `calc(${sliderPos}% - 8px)`,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: accentColor,
          boxShadow: `0 0 10px ${accentColor}80, 0 2px 4px rgba(0,0,0,0.3)`,
          border: '2px solid #fff',
          transition: isDragging ? 'none' : 'left 0.1s ease',
          pointerEvents: 'none',
        }} />
      </div>

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
        transition: 'all 0.2s ease',
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
          <Star size={14} fill={preset.is_favorite ? '#fbbf24' : 'none'} />
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
            background: 'rgba(139, 92, 246, 0.2)',
            color: '#8b5cf6',
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

export function VST3PluginParameterEditor({
  plugin,
  onAddToChain,
  showAddToChain = true,
}: VST3PluginParameterEditorProps) {
  const queryClient = useQueryClient()
  const catConfig = getCategoryConfig(plugin.category)
  const accentColor = catConfig.color

  // State
  const [parameterValues, setParameterValues] = useState<Record<number, number>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['all']))
  const [showPresets, setShowPresets] = useState(false)
  const [savePresetName, setSavePresetName] = useState('')
  const [showSavePreset, setShowSavePreset] = useState(false)
  const [copiedParams, setCopiedParams] = useState<Record<number, number> | null>(null)
  const [alerts, setAlerts] = useState<Array<{ id: string; type: 'success' | 'error' | 'warning'; message: string }>>([])

  // Convert VST3 plugin parameters to internal format
  const pluginParameters: PluginParameter[] = useMemo(() => {
    if (!plugin.parameters || !Array.isArray(plugin.parameters)) return []
    return plugin.parameters.map((p: any, index: number) => ({
      index: p.index ?? index,
      name: p.name ?? `Parameter ${index}`,
      symbol: p.symbol ?? `param_${index}`,
      min: p.min ?? 0,
      max: p.max ?? 1,
      default: p.default ?? 0.5,
      value: p.value,
      is_toggled: p.is_toggled ?? false,
      is_log: p.is_log ?? false,
    }))
  }, [plugin.parameters])

  // Initialize parameter values from plugin
  useEffect(() => {
    const values: Record<number, number> = {}
    pluginParameters.forEach(param => {
      values[param.index] = param.value ?? param.default
    })
    setParameterValues(values)
  }, [pluginParameters])

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

  // Save preset mutation
  const savePresetMutation = useMutation({
    mutationFn: async (name: string) => {
      const parameters: Record<string, number> = {}
      Object.entries(parameterValues).forEach(([idx, val]) => {
        const param = pluginParameters.find(p => p.index === parseInt(idx))
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
    onError: () => {
      addAlert('error', 'Failed to save preset')
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
          const param = pluginParameters.find(p => p.symbol === symbol)
          if (param && typeof value === 'number') {
            newValues[param.index] = value
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
    // VST3 parameter changes would be sent via JUCE engine
  }, [])

  // Handle parameter change end
  const handleParameterChangeEnd = useCallback(() => {
    // Flush any pending parameter updates
  }, [])

  // Reset all to defaults
  const resetToDefaults = useCallback(() => {
    const newValues: Record<number, number> = {}
    pluginParameters.forEach(param => {
      newValues[param.index] = param.default
    })
    setParameterValues(newValues)
    addAlert('success', 'Parameters reset to defaults')
  }, [pluginParameters])

  // Copy parameters
  const copyParameters = useCallback(() => {
    setCopiedParams({ ...parameterValues })
    addAlert('success', 'Parameters copied to clipboard')
  }, [parameterValues])

  // Paste parameters
  const pasteParameters = useCallback(() => {
    if (!copiedParams) return
    setParameterValues(copiedParams)
    addAlert('success', 'Parameters pasted')
  }, [copiedParams])

  // Filter parameters by search
  const filteredParameters = useMemo(() => {
    if (!pluginParameters.length) return []
    if (!searchQuery) return pluginParameters
    const term = searchQuery.toLowerCase()
    return pluginParameters.filter(p =>
      p.name.toLowerCase().includes(term) ||
      p.symbol.toLowerCase().includes(term)
    )
  }, [pluginParameters, searchQuery])

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
              {alert.type === 'error' && <AlertTriangle size={16} />}
              {alert.type === 'warning' && <AlertTriangle size={16} />}
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
              <SlidersHorizontal size={20} style={{ color: accentColor }} />
            </div>
            <div>
              <h3 style={{
                fontSize: 16,
                fontWeight: 700,
                color: accentColor,
                margin: 0,
              }}>
                {plugin.name}
              </h3>
              <div style={{
                fontSize: 11,
                color: '#888',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <span>{plugin.author || 'Unknown author'}</span>
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
                {pluginParameters.length}
              </div>
              <div style={{ fontSize: 9, color: '#888', textTransform: 'uppercase' }}>
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
              <div style={{ fontSize: 9, color: '#888', textTransform: 'uppercase' }}>
                Ports
              </div>
            </div>
          </div>
        </div>

        {/* UI Capability Badges */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 8px',
            background: 'rgba(139, 92, 246, 0.15)',
            color: '#8b5cf6',
            borderRadius: 6,
            fontSize: 10,
            fontWeight: 600,
            border: '1px solid rgba(139, 92, 246, 0.3)',
          }}>
            VST3
          </span>
          {plugin.has_ui && (
            <span style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 8px',
              background: 'rgba(59, 130, 246, 0.15)',
              color: '#3b82f6',
              borderRadius: 6,
              fontSize: 10,
              fontWeight: 600,
              border: '1px solid rgba(59, 130, 246, 0.3)',
            }}>
              <Settings2 size={12} /> Native GUI
            </span>
          )}
        </div>
      </div>

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
            padding: '8px 12px',
            background: showPresets ? accentColor : 'rgba(0,0,0,0.2)',
            color: showPresets ? '#000' : '#ddd',
            border: `1px solid ${showPresets ? accentColor : '#444'}`,
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
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
            padding: '8px 12px',
            background: 'rgba(0,0,0,0.2)',
            color: '#ddd',
            border: '1px solid #444',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Save size={14} />
          Save
        </button>

        <button
          onClick={resetToDefaults}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 12px',
            background: 'rgba(0,0,0,0.2)',
            color: '#ddd',
            border: '1px solid #444',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <RotateCcw size={14} />
          Reset
        </button>

        <button
          onClick={copyParameters}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 12px',
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
              padding: '8px 12px',
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
        {pluginParameters.length > 8 && (
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{
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
                padding: '8px 12px 8px 32px',
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
                padding: '8px 12px',
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
                padding: '8px 16px',
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
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
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
            textTransform: 'uppercase',
            letterSpacing: 0.5,
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
              <Loader2 size={20} className="animate-spin" style={{ color: accentColor }} />
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
      {pluginParameters.length === 0 ? (
        <div style={{
          padding: 24,
          textAlign: 'center',
          color: '#888',
          fontSize: 13,
          background: 'rgba(0,0,0,0.2)',
          borderRadius: 12,
        }}>
          This plugin has no adjustable parameters (parameters will be loaded when plugin is instantiated)
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
                        <ChevronDown size={14} style={{ color: accentColor }} />
                      ) : (
                        <ChevronRight size={14} style={{ color: '#888' }} />
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
          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(0,0,0,0.2) 100%)',
          border: '1px solid rgba(139, 92, 246, 0.2)',
        }}>
          <div style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#888',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
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
                    ? 'rgba(139, 92, 246, 0.2)'
                    : 'rgba(0,0,0,0.2)',
                  color: chain.is_active ? '#8b5cf6' : '#ddd',
                  border: `1px solid ${chain.is_active ? 'rgba(139, 92, 246, 0.4)' : '#444'}`,
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
                    background: '#22c55e',
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
        fontFamily: 'monospace',
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

export default VST3PluginParameterEditor
