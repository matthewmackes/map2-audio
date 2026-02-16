/**
 * Connection Highlight Component
 *
 * Shows visual highlights on the row and column of hovered/focused cells.
 * Helps users trace connections across large matrices.
 *
 * Features:
 * - Horizontal highlight (listener row)
 * - Vertical highlight (talker column)
 * - Crosshair effect at intersection
 * - Subtle opacity to not obstruct view
 */

import React from 'react';
import { Box } from '@mui/material';

interface ConnectionHighlightProps {
  talkerIndex: number | null;
  listenerIndex: number | null;
  cellWidth: number;
  cellHeight: number;
  headerWidth: number;
  headerHeight: number;
  gridWidth: number;
  gridHeight: number;
}

/**
 * Connection highlight overlay
 */
export function ConnectionHighlight({
  talkerIndex,
  listenerIndex,
  cellWidth,
  cellHeight,
  headerWidth,
  headerHeight,
  gridWidth,
  gridHeight,
}: ConnectionHighlightProps) {
  if (talkerIndex === null || listenerIndex === null) {
    return null;
  }

  const columnLeft = talkerIndex * cellWidth;
  const rowTop = listenerIndex * cellHeight;

  return (
    <>
      {/* Vertical highlight (talker column) */}
      <Box
        sx={{
          position: 'absolute',
          top: headerHeight,
          left: headerWidth + columnLeft,
          width: cellWidth,
          height: gridHeight - headerHeight,
          bgcolor: 'primary.main',
          opacity: 0.08,
          pointerEvents: 'none',
          zIndex: 5,
          transition: 'left 0.1s ease-out',
        }}
      />

      {/* Horizontal highlight (listener row) */}
      <Box
        sx={{
          position: 'absolute',
          top: headerHeight + rowTop,
          left: headerWidth,
          width: gridWidth - headerWidth,
          height: cellHeight,
          bgcolor: 'primary.main',
          opacity: 0.08,
          pointerEvents: 'none',
          zIndex: 5,
          transition: 'top 0.1s ease-out',
        }}
      />

      {/* Crosshair intersection (focused cell) */}
      <Box
        sx={{
          position: 'absolute',
          top: headerHeight + rowTop,
          left: headerWidth + columnLeft,
          width: cellWidth,
          height: cellHeight,
          border: '2px solid',
          borderColor: 'primary.main',
          opacity: 0.5,
          pointerEvents: 'none',
          zIndex: 10,
          transition: 'top 0.1s ease-out, left 0.1s ease-out',
          boxShadow: '0 0 8px rgba(25, 118, 210, 0.3)',
        }}
      />

      {/* Header highlights */}
      {/* Talker header highlight */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: headerWidth + columnLeft,
          width: cellWidth,
          height: headerHeight,
          bgcolor: 'primary.main',
          opacity: 0.12,
          pointerEvents: 'none',
          zIndex: 15,
          transition: 'left 0.1s ease-out',
        }}
      />

      {/* Listener header highlight */}
      <Box
        sx={{
          position: 'absolute',
          top: headerHeight + rowTop,
          left: 0,
          width: headerWidth,
          height: cellHeight,
          bgcolor: 'primary.main',
          opacity: 0.12,
          pointerEvents: 'none',
          zIndex: 15,
          transition: 'top 0.1s ease-out',
        }}
      />
    </>
  );
}

export default ConnectionHighlight;
