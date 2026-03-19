/**
 * Scene Diff Preview
 *
 * Lightweight read-only summary of generated scene diff output.
 * This provides operator visibility into pending scene-to-scene changes
 * without introducing a full scene dialog workflow.
 */

import React from 'react';
import { AddAlt, Compare, Draggable, Subtract } from '@carbon/icons-react';
import { Box, Button, Chip, Typography } from '@mui/material';
import { useRouting } from '../../context/RoutingContext';

function renderAddRouteLabel(route: {
  talker_id: string;
  listener_id: string;
  talker_name?: string;
  listener_name?: string;
}): string {
  const talker = route.talker_name || route.talker_id;
  const listener = route.listener_name || route.listener_id;
  return `${talker} -> ${listener}`;
}

function renderRemoveRouteLabel(route: {
  route_id: string;
  talker_id: string;
  listener_id: string;
  talker_name?: string;
  listener_name?: string;
}): string {
  const talker = route.talker_name || route.talker_id;
  const listener = route.listener_name || route.listener_id;
  return `${talker} -> ${listener}`;
}

export function SceneDiffPreview() {
  const { state, dispatch } = useRouting();
  const preview = state.sceneDiff.preview;
  if (!preview) {
    return null;
  }

  const sceneDiffPresets = (state.sceneDiff.presets || [])
    .slice()
    .sort((a, b) => {
      const byName = a.name.localeCompare(b.name);
      return byName !== 0 ? byName : a.id.localeCompare(b.id);
    });
  const activePresetId = state.sceneDiff.active_preset_id || null;

  const baselineName = state.sceneDiff.baseline_scene_id
    ? (state.scenes[state.sceneDiff.baseline_scene_id]?.name || 'Unknown Scene')
    : 'Current';
  const compareName = state.sceneDiff.compare_scene_id
    ? (state.scenes[state.sceneDiff.compare_scene_id]?.name || preview.scene_name)
    : preview.scene_name;

  const handleSwapSelections = () => {
    if (!state.sceneDiff.baseline_scene_id || !state.sceneDiff.compare_scene_id) {
      return;
    }
    dispatch({ type: 'SWAP_SCENE_DIFF_SELECTION' });
    dispatch({ type: 'GENERATE_SCENE_DIFF' });
  };

  const handleApplyPreset = (presetId: string) => {
    dispatch({
      type: 'APPLY_SCENE_DIFF_PRESET',
      payload: { preset_id: presetId },
    });
    dispatch({ type: 'GENERATE_SCENE_DIFF' });
  };

  return (
    <Box
      data-testid="scene-diff-preview"
      sx={{
        px: 2,
        py: 1,
        borderTop: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Compare size={16} />
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Scene Diff Preview
        </Typography>
        <Button
          size="small"
          onClick={handleSwapSelections}
          disabled={!state.sceneDiff.baseline_scene_id || !state.sceneDiff.compare_scene_id}
          data-testid="scene-diff-preview-swap"
        >
          Swap
        </Button>
        <Typography variant="caption" color="text.secondary" data-testid="scene-diff-preview-scope">
          {baselineName} vs {compareName}
        </Typography>
        <Chip
          size="small"
          icon={<AddAlt size={16} />}
          color="success"
          variant="outlined"
          label={`${preview.to_add.length} add`}
          data-testid="scene-diff-preview-add-count"
        />
        <Chip
          size="small"
          icon={<Subtract size={16} />}
          color="error"
          variant="outlined"
          label={`${preview.to_remove.length} remove`}
          data-testid="scene-diff-preview-remove-count"
        />
        <Chip
          size="small"
          icon={<Draggable size={16} />}
          variant="outlined"
          label={`${preview.unchanged.length} unchanged`}
          data-testid="scene-diff-preview-unchanged-count"
        />
      </Box>

      {sceneDiffPresets.length > 0 && (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="caption" color="text.secondary">
            Presets:
          </Typography>
          {sceneDiffPresets.slice(0, 4).map((preset) => (
            <Chip
              key={preset.id}
              size="small"
              variant={activePresetId === preset.id ? 'filled' : 'outlined'}
              color={activePresetId === preset.id ? 'primary' : 'default'}
              label={preset.name}
              onClick={() => handleApplyPreset(preset.id)}
              data-testid="scene-diff-preview-preset-chip"
            />
          ))}
          {sceneDiffPresets.length > 4 && (
            <Chip
              size="small"
              variant="outlined"
              label={`+${sceneDiffPresets.length - 4}`}
              data-testid="scene-diff-preview-preset-overflow"
            />
          )}
        </Box>
      )}

      {preview.to_add.length > 0 && (
        <Typography variant="body2" color="success.main" data-testid="scene-diff-preview-add-routes">
          Add: {preview.to_add.map(renderAddRouteLabel).join(' | ')}
        </Typography>
      )}
      {preview.to_remove.length > 0 && (
        <Typography variant="body2" color="error.main" data-testid="scene-diff-preview-remove-routes">
          Remove: {preview.to_remove.map(renderRemoveRouteLabel).join(' | ')}
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary" data-testid="scene-diff-preview-total-changes">
        Total changes: {preview.total_changes}
      </Typography>
    </Box>
  );
}

export default SceneDiffPreview;
