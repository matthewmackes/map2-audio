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
import {
  SNAPSHOT_SLOT_STYLE_OPTIONS,
  useSnapshotSlotStyle,
  type SnapshotSlotStyle,
} from '../hooks/useSnapshotSlotStyle'
import { FxIcon } from './FxIcons/FxIcon'

import { getDisplayPluginName } from '../../map2/displayNames'
import { EmptyState } from './shared/EmptyState'
import { LoadingState } from './shared/LoadingState'
// Pull in the real Unified Channel Grid styles so the slot-style preview
// cards render with the exact same .ucg-block treatment that ships in the
// editor — no drift between preview and reality.
import './SnapshotEditor/UnifiedChannelGrid/UnifiedChannelGrid.css'
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

/**
 * Mock plugin used inside the slot-style preview cards. Pinning to "Reverb" so
 * the cyan accent reads cleanly against the Carbon dark layer at any palette
 * tint percentage. CPU value picked to be visibly non-zero in V4/V6 (which
 * floor at 4%) and visibly non-full in V4 (clamps at 95%).
 */
const PREVIEW_ACCENT = 'var(--map2-cat-reverb, #3db7c9)'
const PREVIEW_CPU_PERCENT = 42

const PREVIEW_RING_RADIUS = 13
const PREVIEW_RING_CIRCUMFERENCE = 2 * Math.PI * PREVIEW_RING_RADIUS

function SlotStylePreview({ style }: { style: SnapshotSlotStyle }) {
  const dash = (PREVIEW_CPU_PERCENT / 100) * PREVIEW_RING_CIRCUMFERENCE
  return (
    <div className="special-settings-slot-preview" aria-hidden="true">
      <div
        className="ucg-block"
        style={{
          width: 116,
          // Match the live editor block height (T2504 stretched blocks
          // to fill the slot cell — 148px row − 12px padding ≈ 136px).
          // Keeps the picker honest: what you select is what you see.
          height: 136,
          borderLeft: `4px solid ${PREVIEW_ACCENT}`,
          ['--ucg-accent' as string]: PREVIEW_ACCENT,
        }}
        data-category="Reverb"
        data-kind="reverb-ir"
        data-bypass="false"
        data-slot-style={style}
      >
        {style === 'v6-led' ? (
          <span className="ucg-block__led-bar">
            <span
              className="ucg-block__led-bar-fill"
              style={{ width: `${PREVIEW_CPU_PERCENT}%` }}
            />
          </span>
        ) : null}
        <span className="ucg-block__icon">
          {style === 'v4-ring' ? (
            <svg className="ucg-block__cpu-ring" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r={PREVIEW_RING_RADIUS} className="ucg-block__cpu-ring-track" />
              <circle
                cx="16"
                cy="16"
                r={PREVIEW_RING_RADIUS}
                className="ucg-block__cpu-ring-fill"
                strokeDasharray={`${dash} ${PREVIEW_RING_CIRCUMFERENCE}`}
                transform="rotate(-90 16 16)"
              />
            </svg>
          ) : null}
          <FxIcon name="reverb" size={32} />
        </span>
        <span className="ucg-block__label">Hall Reverb</span>
        <span className="ucg-block__lower-third">
          <span className="ucg-block__cpu">{PREVIEW_CPU_PERCENT}%</span>
        </span>
      </div>
    </div>
  )
}

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
  // Slot style is per-browser localStorage state, not part of the backend
  // special-settings record. Writes commit immediately so the editor repaints
  // live; the dialog's Save button doesn't apply or revert it.
  const [snapshotSlotStyle, setSnapshotSlotStyle] = useSnapshotSlotStyle()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setSaveError('')
    setHiddenPlugins(new Set(currentHiddenPlugins))
    setSnapshotEditorFlowAnimation(currentSnapshotEditorFlowAnimation)
    setSnapshotEditorGridBackdrop(currentSnapshotEditorGridBackdrop)
    setSnapshotEditorNodeShape(currentSnapshotEditorNodeShape)
    void fetchNativePlugins()
    // Re-seed only on open transitions. Background WS pushes change
    // currentHiddenPlugins/etc. by reference and would otherwise stomp
    // the user's in-progress edits mid-click.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

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

  const activeSlotStyleOption = SNAPSHOT_SLOT_STYLE_OPTIONS.find((option) => option.id === snapshotSlotStyle)

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

        <div className="special-settings-field">
          <span className="special-settings-field__label" id="snapshot-editor-node-shape-label">
            Signal node shape
          </span>
          <div
            className="special-settings-segmented"
            role="radiogroup"
            aria-labelledby="snapshot-editor-node-shape-label"
          >
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
        </div>

        <div className="special-settings-field">
          <span className="special-settings-field__label" id="snapshot-slot-style-label">
            Snapshot slot style
          </span>
          <p className="special-settings-field__helper">
            How each plugin slot looks in the Snapshot Editor's signal grid. Per-browser preference — applies live, no save needed.
            {activeSlotStyleOption ? (
              <>
                {' '}
                <span className="special-settings-field__helper-strong">
                  {activeSlotStyleOption.description}
                </span>
              </>
            ) : null}
          </p>
          <div
            className="special-settings-slot-preview-row"
            role="radiogroup"
            aria-labelledby="snapshot-slot-style-label"
          >
            {SNAPSHOT_SLOT_STYLE_OPTIONS.map((option) => {
              const isSelected = snapshotSlotStyle === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={option.label}
                  title={option.description}
                  className={`special-settings-slot-card${isSelected ? ' is-selected' : ''}`}
                  onClick={() => setSnapshotSlotStyle(option.id)}
                >
                  <SlotStylePreview style={option.id} />
                  <span className="special-settings-slot-card__label">{option.label}</span>
                </button>
              )
            })}
          </div>
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
