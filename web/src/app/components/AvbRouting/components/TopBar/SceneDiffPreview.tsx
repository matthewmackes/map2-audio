/**
 * Scene Diff Preview
 *
 * Lightweight read-only summary of generated scene diff output.
 * This provides operator visibility into pending scene-to-scene changes
 * without introducing a full scene dialog workflow.
 */

import React from 'react';
import { Box, Chip, Typography } from '@mui/material';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import DragHandleIcon from '@mui/icons-material/DragHandle';
import { useRoutingState } from '../../context/RoutingContext';

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
  const state = useRoutingState();
  const preview = state.sceneDiff.preview;
  if (!preview) {
    return null;
  }

  const baselineName = state.sceneDiff.baseline_scene_id
    ? (state.scenes[state.sceneDiff.baseline_scene_id]?.name || 'Unknown Scene')
    : 'Current';
  const compareName = state.sceneDiff.compare_scene_id
    ? (state.scenes[state.sceneDiff.compare_scene_id]?.name || preview.scene_name)
    : preview.scene_name;

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
        <CompareArrowsIcon fontSize="small" />
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Scene Diff Preview
        </Typography>
        <Typography variant="caption" color="text.secondary" data-testid="scene-diff-preview-scope">
          {baselineName} vs {compareName}
        </Typography>
        <Chip
          size="small"
          icon={<AddIcon />}
          color="success"
          variant="outlined"
          label={`${preview.to_add.length} add`}
          data-testid="scene-diff-preview-add-count"
        />
        <Chip
          size="small"
          icon={<RemoveIcon />}
          color="error"
          variant="outlined"
          label={`${preview.to_remove.length} remove`}
          data-testid="scene-diff-preview-remove-count"
        />
        <Chip
          size="small"
          icon={<DragHandleIcon />}
          variant="outlined"
          label={`${preview.unchanged.length} unchanged`}
          data-testid="scene-diff-preview-unchanged-count"
        />
      </Box>

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
