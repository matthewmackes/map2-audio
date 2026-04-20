import { useState, useEffect } from 'react'
import {
  Checkbox,
  InlineNotification,
  Modal,
  Select,
  SelectItem,
  Toggle,
} from '@carbon/react'
import { apiUrl } from '../utils/apiTarget'
import {
  DEFAULT_SNAPSHOT_EDITOR_SIGNAL_CANVAS_SETTINGS,
  SNAPSHOT_EDITOR_FLOW_ANIMATION_OPTIONS,
  type SnapshotEditorFlowAnimation,
  type SnapshotEditorNodeShape,
} from '../hooks/useSpecialSettings'
import { getDisplayPluginName } from '../../map2/displayNames'
import { EmptyState } from './shared/EmptyState'
import { LoadingState } from './shared/LoadingState'
import './SpecialSettingsDialog.css'

interface Plugin {
  uri: string
  name: string
  category: string
}

interface SpecialSettingsDialogProps {
  isOpen: boolean
  onClose: () => void
  currentHiddenPlugins: string[]
  currentSnapshotEditorFlowAnimation?: SnapshotEditorFlowAnimation
  currentSnapshotEditorGridBackdrop?: boolean
  currentSnapshotEditorNodeShape?: SnapshotEditorNodeShape
  onSave: (settings: {
    hiddenPlugins: string[]
    'snapshot_editor.flow_animation': SnapshotEditorFlowAnimation
    'snapshot_editor.grid_backdrop': boolean
    'snapshot_editor.node_shape': SnapshotEditorNodeShape
  }) => Promise<void>
}

const SNAPSHOT_EDITOR_NODE_SHAPE_OPTIONS: Array<{ id: SnapshotEditorNodeShape; label: string }> = [
  { id: 'square', label: 'Square' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'hex', label: 'Hex' },
]

export function SpecialSettingsDialog({
  isOpen,
  onClose,
  currentHiddenPlugins,
  currentSnapshotEditorFlowAnimation = DEFAULT_SNAPSHOT_EDITOR_SIGNAL_CANVAS_SETTINGS.flowAnimation,
  currentSnapshotEditorGridBackdrop = DEFAULT_SNAPSHOT_EDITOR_SIGNAL_CANVAS_SETTINGS.gridBackdrop,
  currentSnapshotEditorNodeShape = DEFAULT_SNAPSHOT_EDITOR_SIGNAL_CANVAS_SETTINGS.nodeShape,
  onSave,
}: SpecialSettingsDialogProps) {
  const [nativePlugins, setNativePlugins] = useState<Plugin[]>([])
  const [hiddenPlugins, setHiddenPlugins] = useState<Set<string>>(new Set())
  const [snapshotEditorFlowAnimation, setSnapshotEditorFlowAnimation] = useState<SnapshotEditorFlowAnimation>(currentSnapshotEditorFlowAnimation)
  const [snapshotEditorGridBackdrop, setSnapshotEditorGridBackdrop] = useState(currentSnapshotEditorGridBackdrop)
  const [snapshotEditorNodeShape, setSnapshotEditorNodeShape] = useState<SnapshotEditorNodeShape>(currentSnapshotEditorNodeShape)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    if (isOpen) {
      setSaveError('')
      setHiddenPlugins(new Set(currentHiddenPlugins))
      setSnapshotEditorFlowAnimation(currentSnapshotEditorFlowAnimation)
      setSnapshotEditorGridBackdrop(currentSnapshotEditorGridBackdrop)
      setSnapshotEditorNodeShape(currentSnapshotEditorNodeShape)
      void fetchNativePlugins()
    }
  }, [
    currentHiddenPlugins,
    currentSnapshotEditorFlowAnimation,
    currentSnapshotEditorGridBackdrop,
    currentSnapshotEditorNodeShape,
    isOpen,
  ])

  const fetchNativePlugins = async () => {
    setIsLoading(true)
    setLoadError('')
    
    try {
      const response = await fetch(apiUrl('/api/plugins/discover'))
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      const data = await response.json() as { plugins?: Plugin[] }
      
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
      await onSave({
        hiddenPlugins: Array.from(hiddenPlugins),
        'snapshot_editor.flow_animation': snapshotEditorFlowAnimation,
        'snapshot_editor.grid_backdrop': snapshotEditorGridBackdrop,
        'snapshot_editor.node_shape': snapshotEditorNodeShape,
      })
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
        <h3 className="special-settings-section-title">Appearance / UI</h3>
        <div className="special-settings-control-grid">
          <Select
            id="snapshot-editor-flow-animation"
            labelText="Signal flow animation"
            value={snapshotEditorFlowAnimation}
            onChange={(event) => {
              const nextValue = event.currentTarget.value
              if (SNAPSHOT_EDITOR_FLOW_ANIMATION_OPTIONS.some((option) => option.id === nextValue)) {
                setSnapshotEditorFlowAnimation(nextValue as SnapshotEditorFlowAnimation)
              }
            }}
          >
            {SNAPSHOT_EDITOR_FLOW_ANIMATION_OPTIONS.map((option) => (
              <SelectItem key={option.id} value={option.id} text={option.label} />
            ))}
          </Select>

          <Toggle
            id="snapshot-editor-grid-backdrop"
            labelText="Signal grid backdrop"
            labelA="Off"
            labelB="On"
            toggled={snapshotEditorGridBackdrop}
            onToggle={setSnapshotEditorGridBackdrop}
          />
        </div>

        <div className="special-settings-segmented" role="radiogroup" aria-label="Signal node shape">
          {SNAPSHOT_EDITOR_NODE_SHAPE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={snapshotEditorNodeShape === option.id}
              className={`special-settings-segment${snapshotEditorNodeShape === option.id ? ' is-selected' : ''}`}
              onClick={() => setSnapshotEditorNodeShape(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="special-settings-section">
        <h3 className="special-settings-section-title">Native plugin visibility</h3>
        <p className="special-settings-copy">
          Select which native plugins to show in the plugin chooser. Cleared plugins are hidden.
        </p>

        {isLoading ? (
          <LoadingState description="Loading plugins" variant="inline" />
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
          <EmptyState
            title="No native plugins found"
            description="No plugins matched the map2:// native namespace."
            compact
            align="left"
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
    </Modal>
  )
}
