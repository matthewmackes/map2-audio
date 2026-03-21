import { useState, useEffect } from 'react'
import {
  Checkbox,
  InlineLoading,
  InlineNotification,
  Modal,
  RadioButton,
  RadioButtonGroup,
} from '@carbon/react'
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
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    if (isOpen) {
      setSaveError('')
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
    setLoadError('')
    
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
      setLoadError('Failed to load plugin list.')
      console.error('Failed to fetch plugins:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const togglePluginVisibility = (uri: string, isVisible: boolean) => {
    const newHidden = new Set(hiddenPlugins)
    if (isVisible) {
      newHidden.delete(uri)
    } else {
      newHidden.add(uri)
    }
    setHiddenPlugins(newHidden)
  }

  const handleSave = async () => {
    setIsSaving(true)
    setSaveError('')
    
    try {
      const settings: SpecialSettings = {
        enabled: true,  // Saving settings implies enabling
        hiddenPlugins: Array.from(hiddenPlugins),
        menuLocation
      }
      
      await onSave(settings)
      onClose()
    } catch (err) {
      setSaveError('Failed to save settings.')
      console.error('Save error:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleClose = () => {
    if (isSaving) {
      return
    }
    setLoadError('')
    setSaveError('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <Modal
      open={isOpen}
      size="lg"
      modalHeading="Special settings"
      primaryButtonText={isSaving ? 'Saving...' : 'Save settings'}
      secondaryButtonText="Cancel"
      primaryButtonDisabled={isSaving || isLoading}
      onRequestClose={handleClose}
      onRequestSubmit={() => {
        void handleSave()
      }}
    >
      {saveError ? (
        <div className="special-settings-banner">
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title="Save failed"
            subtitle={saveError}
          />
        </div>
      ) : null}

      <section className="special-settings-section">
        <h3 className="special-settings-section-title">Native plugin visibility</h3>
        <p className="special-settings-copy">
          Select which native plugins to show in the plugin chooser. Cleared plugins are hidden.
        </p>

        {isLoading ? (
          <InlineLoading description="Loading plugins..." status="active" />
        ) : null}

        {!isLoading && loadError ? (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title="Unable to load plugins"
            subtitle={loadError}
          />
        ) : null}

        {!isLoading && !loadError && nativePlugins.length === 0 ? (
          <InlineNotification
            kind="info"
            lowContrast
            hideCloseButton
            title="No native plugins found"
            subtitle="No plugins matched the map2:// native namespace."
          />
        ) : null}

        {!isLoading && !loadError && nativePlugins.length > 0 ? (
          <div className="special-settings-plugin-list">
            {nativePlugins.map((plugin) => {
              const isVisible = !hiddenPlugins.has(plugin.uri)
              const displayName = getDisplayPluginName(plugin.name, plugin.uri)
              const pluginId = `plugin-visibility-${plugin.uri.replace(/[^a-zA-Z0-9_-]/g, '-')}`
              return (
                <div key={plugin.uri} className="special-settings-plugin-row">
                  <Checkbox
                    id={pluginId}
                    labelText={displayName}
                    checked={isVisible}
                    onChange={(event) => {
                      togglePluginVisibility(plugin.uri, event.currentTarget.checked)
                    }}
                  />
                  <p className="special-settings-plugin-meta">{plugin.category}</p>
                </div>
              )
            })}
          </div>
        ) : null}
      </section>

      <section className="special-settings-section">
        <h3 className="special-settings-section-title">Platforms and Labs location</h3>
        <p className="special-settings-copy">Choose where the unified Platforms and Labs window entry is visible.</p>

        <RadioButtonGroup
          name="menuLocation"
          legendText="Menu location"
          valueSelected={menuLocation}
          onChange={(value) => setMenuLocation(value as typeof menuLocation)}
        >
          <RadioButton id="menu-location-top-nav" value="top-nav" labelText="Show in top navigation" />
          <RadioButton id="menu-location-mobile-only" value="mobile-only" labelText="Mobile menu only" />
          <RadioButton id="menu-location-hidden" value="hidden" labelText="Hide completely" />
        </RadioButtonGroup>
        <p className="special-settings-radio-help">
          Show in top navigation keeps the unified Platforms and Labs window available from the desktop shell. Mobile
          menu only limits access to the compact navigation. Hide completely removes those entry points.
        </p>
      </section>
    </Modal>
  )
}
