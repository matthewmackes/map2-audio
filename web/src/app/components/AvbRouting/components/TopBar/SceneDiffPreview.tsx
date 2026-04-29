// Scene Diff Preview — read-only operator summary of pending
// scene→scene route changes. T2475 (E1) Carbon migration:
// Box → semantic divs, Button → Carbon Button (size sm), Chip →
// StatusChip (canonical primitive routed through MAP semantic
// tokens), Typography → semantic spans. Color hints (success.main /
// error.main) replaced by tones consumed by StatusChip. Preset
// chips wrap StatusChip in a <button> to preserve click behavior
// without adding click props to the canonical primitive.

import { Button } from '@carbon/react'
import { AddAlt, Compare, Draggable, Subtract } from '@carbon/icons-react'

import { StatusChip } from '../../../primitives'
import { useRouting } from '../../context/RoutingContext'
import './SceneDiffPreview.css'

function renderAddRouteLabel(route: {
  talker_id: string
  listener_id: string
  talker_name?: string
  listener_name?: string
}): string {
  const talker = route.talker_name || route.talker_id
  const listener = route.listener_name || route.listener_id
  return `${talker} -> ${listener}`
}

function renderRemoveRouteLabel(route: {
  route_id: string
  talker_id: string
  listener_id: string
  talker_name?: string
  listener_name?: string
}): string {
  const talker = route.talker_name || route.talker_id
  const listener = route.listener_name || route.listener_id
  return `${talker} -> ${listener}`
}

export function SceneDiffPreview() {
  const { state, dispatch } = useRouting()
  const preview = state.sceneDiff.preview
  if (!preview) {
    return null
  }

  const sceneDiffPresets = (state.sceneDiff.presets || [])
    .slice()
    .sort((a, b) => {
      const byName = a.name.localeCompare(b.name)
      return byName !== 0 ? byName : a.id.localeCompare(b.id)
    })
  const activePresetId = state.sceneDiff.active_preset_id || null

  const baselineName = state.sceneDiff.baseline_scene_id
    ? (state.scenes[state.sceneDiff.baseline_scene_id]?.name || 'Unknown Scene')
    : 'Current'
  const compareName = state.sceneDiff.compare_scene_id
    ? (state.scenes[state.sceneDiff.compare_scene_id]?.name || preview.scene_name)
    : preview.scene_name

  const handleSwapSelections = () => {
    if (!state.sceneDiff.baseline_scene_id || !state.sceneDiff.compare_scene_id) {
      return
    }
    dispatch({ type: 'SWAP_SCENE_DIFF_SELECTION' })
    dispatch({ type: 'GENERATE_SCENE_DIFF' })
  }

  const handleApplyPreset = (presetId: string) => {
    dispatch({
      type: 'APPLY_SCENE_DIFF_PRESET',
      payload: { preset_id: presetId },
    })
    dispatch({ type: 'GENERATE_SCENE_DIFF' })
  }

  return (
    <div className="scene-diff-preview" data-testid="scene-diff-preview">
      <div className="scene-diff-preview__header">
        <Compare size={16} />
        <span className="scene-diff-preview__title">Scene Diff Preview</span>
        <Button
          size="sm"
          kind="ghost"
          onClick={handleSwapSelections}
          disabled={!state.sceneDiff.baseline_scene_id || !state.sceneDiff.compare_scene_id}
          data-testid="scene-diff-preview-swap"
        >
          Swap
        </Button>
        <span className="scene-diff-preview__scope" data-testid="scene-diff-preview-scope">
          {baselineName} vs {compareName}
        </span>
        <span data-testid="scene-diff-preview-add-count">
          <StatusChip
            tone="ok"
            label={
              <span className="scene-diff-preview__chip-label">
                <AddAlt size={14} aria-hidden="true" />
                {`${preview.to_add.length} add`}
              </span>
            }
            size="sm"
          />
        </span>
        <span data-testid="scene-diff-preview-remove-count">
          <StatusChip
            tone="critical"
            label={
              <span className="scene-diff-preview__chip-label">
                <Subtract size={14} aria-hidden="true" />
                {`${preview.to_remove.length} remove`}
              </span>
            }
            size="sm"
          />
        </span>
        <span data-testid="scene-diff-preview-unchanged-count">
          <StatusChip
            tone="neutral"
            label={
              <span className="scene-diff-preview__chip-label">
                <Draggable size={14} aria-hidden="true" />
                {`${preview.unchanged.length} unchanged`}
              </span>
            }
            size="sm"
          />
        </span>
      </div>

      {sceneDiffPresets.length > 0 && (
        <div className="scene-diff-preview__presets">
          <span className="scene-diff-preview__presets-label">Presets:</span>
          {sceneDiffPresets.slice(0, 4).map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="scene-diff-preview__preset-button"
              onClick={() => handleApplyPreset(preset.id)}
              data-testid="scene-diff-preview-preset-chip"
            >
              <StatusChip
                tone={activePresetId === preset.id ? 'info' : 'neutral'}
                label={preset.name}
                size="sm"
              />
            </button>
          ))}
          {sceneDiffPresets.length > 4 && (
            <span data-testid="scene-diff-preview-preset-overflow">
              <StatusChip
                tone="neutral"
                label={`+${sceneDiffPresets.length - 4}`}
                size="sm"
              />
            </span>
          )}
        </div>
      )}

      {preview.to_add.length > 0 && (
        <span
          className="scene-diff-preview__line scene-diff-preview__line--add"
          data-testid="scene-diff-preview-add-routes"
        >
          Add: {preview.to_add.map(renderAddRouteLabel).join(' | ')}
        </span>
      )}
      {preview.to_remove.length > 0 && (
        <span
          className="scene-diff-preview__line scene-diff-preview__line--remove"
          data-testid="scene-diff-preview-remove-routes"
        >
          Remove: {preview.to_remove.map(renderRemoveRouteLabel).join(' | ')}
        </span>
      )}
      <span
        className="scene-diff-preview__total"
        data-testid="scene-diff-preview-total-changes"
      >
        Total changes: {preview.total_changes}
      </span>
    </div>
  )
}

export default SceneDiffPreview
