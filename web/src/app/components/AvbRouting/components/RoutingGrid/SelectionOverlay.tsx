/**
 * Selection Overlay Component
 *
 * Renders a visual overlay for drag-selected cells in the routing matrix.
 * Shows a blue rectangle highlight over the selected region with semi-transparent fill.
 *
 * Features:
 * - Blue border with semi-transparent fill
 * - Smooth animations
 * - Non-intrusive (pointer-events: none)
 * - Cell count badge
 */

import React from 'react';
import { Box, Typography } from '@mui/material';
import type { SelectionRect } from '../../hooks/useDragSelection';

interface SelectionOverlayProps {
  /**
   * Selection rectangle (null if no selection)
   */
  selectionRect: SelectionRect | null;

  /**
   * Width of each cell in pixels
   */
  cellWidth: number;

  /**
   * Height of each cell in pixels
   */
  cellHeight: number;

  /**
   * Width of the left header
   */
  headerWidth: number;

  /**
   * Height of the top header
   */
  headerHeight: number;

  /**
   * Total number of selected cells (for badge)
   */
  selectedCount: number;
}

/**
 * Selection overlay component
 */
export function SelectionOverlay({
  selectionRect,
  cellWidth,
  cellHeight,
  headerWidth,
  headerHeight,
  selectedCount,
}: SelectionOverlayProps) {
  if (!selectionRect) {
    return null;
  }

  // Calculate rectangle bounds
  const minRow = Math.min(selectionRect.startRow, selectionRect.endRow);
  const maxRow = Math.max(selectionRect.startRow, selectionRect.endRow);
  const minCol = Math.min(selectionRect.startCol, selectionRect.endCol);
  const maxCol = Math.max(selectionRect.startCol, selectionRect.endCol);

  const left = headerWidth + minCol * cellWidth;
  const top = headerHeight + minRow * cellHeight;
  const width = (maxCol - minCol + 1) * cellWidth;
  const height = (maxRow - minRow + 1) * cellHeight;

  return (
    <Box
      sx={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        pointerEvents: 'none',
        zIndex: 15, // Above crosshair (10) but below headers (20)
      }}
    >
      {/* Selection rectangle */}
      <Box
        sx={{
          width: '100%',
          height: '100%',
          border: '2px solid #2196f3',
          bgcolor: 'rgba(33, 150, 243, 0.15)',
          borderRadius: '4px',
          transition: 'all 0.1s ease-out',
          animation: 'selectionPulse 1.5s ease-in-out infinite',
          '@keyframes selectionPulse': {
            '0%': {
              boxShadow: '0 0 0 0 rgba(33, 150, 243, 0.4)',
            },
            '50%': {
              boxShadow: '0 0 0 4px rgba(33, 150, 243, 0)',
            },
            '100%': {
              boxShadow: '0 0 0 0 rgba(33, 150, 243, 0)',
            },
          },
        }}
      />

      {/* Cell count badge */}
      {selectedCount > 1 && (
        <Box
          sx={{
            position: 'absolute',
            top: -12,
            right: -12,
            bgcolor: '#2196f3',
            color: 'white',
            borderRadius: '12px',
            px: 1.5,
            py: 0.5,
            fontSize: 12,
            fontWeight: 600,
            boxShadow: 2,
            pointerEvents: 'auto',
            animation: 'badgeFadeIn 0.2s ease-out',
            '@keyframes badgeFadeIn': {
              from: {
                opacity: 0,
                transform: 'scale(0.8)',
              },
              to: {
                opacity: 1,
                transform: 'scale(1)',
              },
            },
          }}
        >
          <Typography variant="caption" component="span" sx={{ fontWeight: 600 }}>
            {selectedCount} selected
          </Typography>
        </Box>
      )}
    </Box>
  );
}

export default SelectionOverlay;
