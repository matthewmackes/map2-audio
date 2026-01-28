// @ts-nocheck
// ============================================================================
// MAP2 Audio Platform - Node Drag-Drop Hook
// Utilities for dragging plugins from browser to canvas
// ============================================================================

import { DragEvent } from 'react';
import { Plugin } from '../../../types';

/**
 * Hook for handling plugin drag sources
 */
export function usePluginDragSource() {
  const onDragStart = (event: DragEvent, plugin: Plugin) => {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(
      'application/reactflow',
      JSON.stringify({
        type: 'plugin',
        pluginUri: plugin.uri,
        pluginName: plugin.name,
      })
    );
  };

  return { onDragStart };
}

/**
 * Data structure for dragged plugin
 */
export interface DraggedPluginData {
  type: 'plugin';
  pluginUri: string;
  pluginName: string;
}

/**
 * Parse dragged plugin data from dataTransfer
 */
export function parseDraggedPlugin(data: string): DraggedPluginData | null {
  try {
    const parsed = JSON.parse(data);
    if (parsed.type === 'plugin' && parsed.pluginUri) {
      return parsed as DraggedPluginData;
    }
  } catch (error) {
    console.error('Failed to parse dragged plugin data:', error);
  }
  return null;
}
