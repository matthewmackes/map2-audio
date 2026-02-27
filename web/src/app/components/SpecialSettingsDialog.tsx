/**
 * SpecialSettingsDialog - Configuration dialog for special mode
 * 
 * Allows user to:
 * 1. Toggle visibility of individual native plugins
 * 2. Configure Advanced Menu location (top nav, mobile only, hidden)
 * 
 * Plugin list is dynamically fetched from API (never hardcoded).
 */

import { useState, useEffect } from 'react'
import { X, GearSix, Eye, EyeSlash, List, Monitor, DeviceMobile } from '@phosphor-icons/react'
import { apiUrl } from '../utils/apiTarget'
import { getDisplayPluginName } from '../../map2/displayNames'

interface Plugin {
  uri: string
  name: string
  category: string
}

interface SpecialSettings {
  enabled: boolean
  hiddenPlugins: string[]
  menuLocation: 'top-nav' | 'mobile-only' | 'hidden'
}

interface SpecialSettingsDialogProps {
  isOpen: boolean
  onClose: () => void
  onSave: (settings: SpecialSettings) => Promise<void>
}

export function SpecialSettingsDialog({ isOpen, onClose, onSave }: SpecialSettingsDialogProps) {
  const [nativePlugins, setNativePlugins] = useState<Plugin[]>([])
  const [hiddenPlugins, setHiddenPlugins] = useState<Set<string>>(new Set())
  const [menuLocation, setMenuLocation] = useState<'top-nav' | 'mobile-only' | 'hidden'>('top-nav')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      loadCurrentSettings()
      fetchNativePlugins()
    }
  }, [isOpen])

  const loadCurrentSettings = async () => {
    try {
      const response = await fetch(apiUrl('/api/settings/special'))
      const data = await response.json()
      setHiddenPlugins(new Set(data.hidden_plugins || []))
      setMenuLocation(data.menu_location || 'top-nav')
    } catch (err) {
      console.error('Failed to load current settings:', err)
    }
  }

  const fetchNativePlugins = async () => {
    setIsLoading(true)
    setError('')
    
    try {
      const response = await fetch(apiUrl('/api/plugins/discover'))
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      const data = await response.json()
      
      // Filter for native plugins (uri starts with "map2://")
      const plugins = data.plugins || []
      const native = plugins.filter((p: Plugin) => p.uri.startsWith('map2://'))
      
      setNativePlugins(native)
    } catch (err) {
      setError('Failed to load plugin list')
      console.error('Failed to fetch plugins:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const togglePluginVisibility = (uri: string) => {
    const newHidden = new Set(hiddenPlugins)
    if (newHidden.has(uri)) {
      newHidden.delete(uri)
    } else {
      newHidden.add(uri)
    }
    setHiddenPlugins(newHidden)
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError('')
    
    try {
      const settings: SpecialSettings = {
        enabled: true,  // Saving settings implies enabling
        hiddenPlugins: Array.from(hiddenPlugins),
        menuLocation
      }
      
      await onSave(settings)
      onClose()
    } catch (err) {
      setError('Failed to save settings')
      console.error('Save error:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleClose = () => {
    setError('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div 
        className="modal-dialog" 
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '600px',
          maxHeight: '80vh',
          background: 'linear-gradient(135deg, rgba(15, 20, 35, 0.95) 0%, rgba(25, 30, 45, 0.95) 100%)',
          borderRadius: '12px',
          border: '1px solid rgba(37, 99, 235, 0.3)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px',
          borderBottom: '1px solid rgba(37, 99, 235, 0.2)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <GearSix size={24} weight="duotone" style={{ color: '#60a5fa' }} />
            <h2 style={{
              fontSize: '18px',
              fontWeight: 700,
              color: '#f3f4f6',
              margin: 0,
            }}>
              Special Settings
            </h2>
          </div>
          <button
            onClick={handleClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#9ca3af',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={20} weight="bold" />
          </button>
        </div>

        {/* Content */}
        <div style={{
          padding: '24px',
          overflowY: 'auto',
          flexGrow: 1,
        }}>
          {/* Native Plugin Visibility Section */}
          <div style={{ marginBottom: '32px' }}>
            <h3 style={{
              fontSize: '15px',
              fontWeight: 600,
              color: '#f3f4f6',
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <Eye size={18} weight="duotone" style={{ color: '#60a5fa' }} />
              Native Plugin Visibility
            </h3>
            <p style={{
              fontSize: '12px',
              color: '#9ca3af',
              marginBottom: '16px',
              lineHeight: '1.5',
            }}>
              Select which native plugins to show in the plugin chooser.
              Unchecked plugins will be hidden.
            </p>

            {isLoading ? (
              <div style={{
                padding: '40px',
                textAlign: 'center',
                color: '#9ca3af',
                fontSize: '13px',
              }}>
                Loading plugins...
              </div>
            ) : error ? (
              <div style={{
                padding: '20px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                color: '#fca5a5',
                fontSize: '13px',
              }}>
                {error}
              </div>
            ) : nativePlugins.length === 0 ? (
              <div style={{
                padding: '20px',
                background: 'rgba(37, 99, 235, 0.1)',
                border: '1px solid rgba(37, 99, 235, 0.3)',
                borderRadius: '8px',
                color: '#60a5fa',
                fontSize: '13px',
              }}>
                No native plugins found
              </div>
            ) : (
              <div style={{
                border: '1px solid rgba(37, 99, 235, 0.2)',
                borderRadius: '8px',
                background: 'rgba(10, 15, 25, 0.5)',
                maxHeight: '300px',
                overflowY: 'auto',
              }}>
                {nativePlugins.map((plugin) => {
                  const isVisible = !hiddenPlugins.has(plugin.uri)
                  const displayName = getDisplayPluginName(plugin.name, plugin.uri)
                  return (
                    <label
                      key={plugin.uri}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '12px 16px',
                        borderBottom: '1px solid rgba(37, 99, 235, 0.1)',
                        cursor: 'pointer',
                        transition: 'background 150ms',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(37, 99, 235, 0.05)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isVisible}
                        onChange={() => togglePluginVisibility(plugin.uri)}
                        style={{
                          marginRight: '12px',
                          width: '16px',
                          height: '16px',
                          cursor: 'pointer',
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontSize: '13px',
                          fontWeight: 500,
                          color: isVisible ? '#f3f4f6' : '#6b7280',
                        }}>
                          {displayName}
                        </div>
                        <div style={{
                          fontSize: '11px',
                          color: '#6b7280',
                          marginTop: '2px',
                        }}>
                          {plugin.category}
                        </div>
                      </div>
                      {isVisible ? (
                        <Eye size={16} weight="duotone" style={{ color: '#22c55e' }} />
                      ) : (
                        <EyeSlash size={16} weight="duotone" style={{ color: '#6b7280' }} />
                      )}
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          {/* Advanced Menu Location Section */}
          <div>
            <h3 style={{
              fontSize: '15px',
              fontWeight: 600,
              color: '#f3f4f6',
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <List size={18} weight="duotone" style={{ color: '#60a5fa' }} />
              Advanced Menu Location
            </h3>
            <p style={{
              fontSize: '12px',
              color: '#9ca3af',
              marginBottom: '16px',
              lineHeight: '1.5',
            }}>
              Choose where the Advanced Menu should appear
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { value: 'top-nav', label: 'Show in Top Navigation', icon: Monitor, description: 'Always visible in the top navigation bar' },
                { value: 'mobile-only', label: 'Mobile Menu Only', icon: DeviceMobile, description: 'Only visible in mobile hamburger menu' },
                { value: 'hidden', label: 'Hide Completely', icon: EyeSlash, description: 'Advanced menu will not be shown' },
              ].map((option) => {
                const Icon = option.icon
                const isSelected = menuLocation === option.value
                
                return (
                  <label
                    key={option.value}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '16px',
                      borderRadius: '8px',
                      border: isSelected 
                        ? '2px solid rgba(37, 99, 235, 0.6)' 
                        : '1px solid rgba(37, 99, 235, 0.2)',
                      background: isSelected 
                        ? 'rgba(37, 99, 235, 0.1)' 
                        : 'rgba(10, 15, 25, 0.5)',
                      cursor: 'pointer',
                      transition: 'all 150ms',
                    }}
                  >
                    <input
                      type="radio"
                      name="menuLocation"
                      value={option.value}
                      checked={isSelected}
                      onChange={() => setMenuLocation(option.value as typeof menuLocation)}
                      style={{
                        marginRight: '12px',
                        width: '16px',
                        height: '16px',
                        cursor: 'pointer',
                      }}
                    />
                    <Icon size={20} style={{ 
                      color: isSelected ? '#60a5fa' : '#6b7280',
                      marginRight: '12px',
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: '13px',
                        fontWeight: 500,
                        color: isSelected ? '#f3f4f6' : '#d1d5db',
                      }}>
                        {option.label}
                      </div>
                      <div style={{
                        fontSize: '11px',
                        color: '#6b7280',
                        marginTop: '4px',
                      }}>
                        {option.description}
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid rgba(37, 99, 235, 0.2)',
          display: 'flex',
          gap: '12px',
          justifyContent: 'flex-end',
          flexShrink: 0,
        }}>
          <button
            onClick={handleClose}
            disabled={isSaving}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 500,
              border: '1px solid rgba(37, 99, 235, 0.3)',
              background: 'rgba(37, 99, 235, 0.05)',
              color: '#60a5fa',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              opacity: isSaving ? 0.5 : 1,
              transition: 'all 150ms',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 500,
              border: 'none',
              background: isSaving 
                ? 'rgba(37, 99, 235, 0.3)' 
                : 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
              color: '#f3f4f6',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              transition: 'all 150ms',
            }}
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}
