/**
 * Crosshair Overlay Component
 *
 * Renders the professional row/column highlighting effect when hovering cells.
 * Creates a "crosshair" visual that highlights the entire row and column of the
 * hovered cell, making it easy to trace connections in large matrices.
 *
 * Features:
 * - Vertical highlight for the hovered column (talker)
 * - Horizontal highlight for the hovered row (listener)
 * - Smooth fade animations
 * - Non-intrusive overlay (pointer-events: none)
 * - Responsive to cell size and grid dimensions
 */

import React from 'react';
import { Box } from '@mui/material';

interface CrosshairOverlayProps {
  /**
   * Index of the hovered column (talker), null if none
   */
  columnIndex: number | null;

  /**
   * Index of the hovered row (listener), null if none
   */
  rowIndex: number | null;

  /**
   * Width of each cell in pixels
   */
  cellWidth: number;

  /**
   * Height of each cell in pixels
   */
  cellHeight: number;

  /**
   * Width of the left header (listener names)
   */
  headerWidth: number;

  /**
   * Height of the top header (talker names)
   */
  headerHeight: number;

  /**
   * Total number of columns (talkers)
   */
  totalColumns: number;

  /**
   * Total number of rows (listeners)
   */
  totalRows: number;
}

/**
 * Crosshair overlay component
 */
export function CrosshairOverlay({
  columnIndex,
  rowIndex,
  cellWidth,
  cellHeight,
  headerWidth,
  headerHeight,
  totalColumns,
  totalRows,
}: CrosshairOverlayProps) {
  // Don't render if nothing is hovered
  if (columnIndex === null && rowIndex === null) {
    return null;
  }

  const gridWidth = totalColumns * cellWidth;
  const gridHeight = totalRows * cellHeight;

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: headerWidth + gridWidth,
        height: headerHeight + gridHeight,
        pointerEvents: 'none', // Allow clicks to pass through
        zIndex: 10,
      }}
    >
      {/* Vertical highlight (column) */}
      {columnIndex !== null && (
        <Box
          sx={{
            position: 'absolute',
            top: headerHeight,
            left: headerWidth + columnIndex * cellWidth,
            width: cellWidth,
            height: gridHeight,
            bgcolor: 'rgba(33, 150, 243, 0.08)',
            borderLeft: '1px solid rgba(33, 150, 243, 0.3)',
            borderRight: '1px solid rgba(33, 150, 243, 0.3)',
            transition: 'all 0.15s ease-out',
            animation: 'fadeIn 0.15s ease-out',
            '@keyframes fadeIn': {
              from: { opacity: 0 },
              to: { opacity: 1 },
            },
          }}
        />
      )}

      {/* Horizontal highlight (row) */}
      {rowIndex !== null && (
        <Box
          sx={{
            position: 'absolute',
            top: headerHeight + rowIndex * cellHeight,
            left: headerWidth,
            width: gridWidth,
            height: cellHeight,
            bgcolor: 'rgba(33, 150, 243, 0.08)',
            borderTop: '1px solid rgba(33, 150, 243, 0.3)',
            borderBottom: '1px solid rgba(33, 150, 243, 0.3)',
            transition: 'all 0.15s ease-out',
            animation: 'fadeIn 0.15s ease-out',
            '@keyframes fadeIn': {
              from: { opacity: 0 },
              to: { opacity: 1 },
            },
          }}
        />
      )}

      {/* Intersection highlight (hovered cell) */}
      {columnIndex !== null && rowIndex !== null && (
        <Box
          sx={{
            position: 'absolute',
            top: headerHeight + rowIndex * cellHeight,
            left: headerWidth + columnIndex * cellWidth,
            width: cellWidth,
            height: cellHeight,
            bgcolor: 'rgba(33, 150, 243, 0.12)',
            border: '1px solid rgba(33, 150, 243, 0.4)',
            borderRadius: '2px',
            transition: 'all 0.15s ease-out',
            animation: 'fadeIn 0.15s ease-out',
            '@keyframes fadeIn': {
              from: { opacity: 0, transform: 'scale(0.95)' },
              to: { opacity: 1, transform: 'scale(1)' },
            },
          }}
        />
      )}
    </Box>
  );
}

export default CrosshairOverlay;
