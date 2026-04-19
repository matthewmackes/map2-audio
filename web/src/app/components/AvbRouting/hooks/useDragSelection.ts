/**
 * Drag Selection Hook
 *
 * Enables drag-to-select multiple cells for batch operations.
 * Users can click and drag to select a rectangular region of the matrix,
 * then perform bulk connect/disconnect operations.
 *
 * Features:
 * - Mouse drag to select rectangular region
 * - Visual feedback with selection overlay
 * - Shift+click for range selection
 * - Ctrl+click for multi-select
 * - Escape to clear selection
 *
 * Usage:
 *   const dragSelection = useDragSelection();
 *   // In cell component: onMouseDown={() => dragSelection.handleMouseDown(row, col)}
 */

import { useState, useCallback, useEffect, useRef } from 'react';

export interface CellPosition {
  row: number;
  col: number;
}

export interface SelectionRect {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export interface DragSelectionState {
  /**
   * Whether user is actively dragging to select
   */
  isDragging: boolean;

  /**
   * Current selection rectangle (null if no selection)
   */
  selectionRect: SelectionRect | null;

  /**
   * List of currently selected cell positions
   */
  selectedCells: CellPosition[];

  /**
   * Whether multi-select mode is active (Ctrl held)
   */
  isMultiSelect: boolean;
}

export interface DragSelectionHandlers {
  /**
   * Handle mouse down on a cell (start drag or toggle selection)
   */
  handleMouseDown: (row: number, col: number, event: React.MouseEvent) => void;

  /**
   * Handle mouse move over a cell (update drag selection)
   */
  handleMouseMove: (row: number, col: number) => void;

  /**
   * Handle mouse up (end drag)
   */
  handleMouseUp: () => void;

  /**
   * Clear all selections
   */
  clearSelection: () => void;

  /**
   * Check if a specific cell is selected
   */
  isCellSelected: (row: number, col: number) => boolean;

  /**
   * Get all selected cells as array of positions
   */
  getSelectedCells: () => CellPosition[];
}

export interface DragSelectionReturn extends DragSelectionState, DragSelectionHandlers {}

/**
 * Hook for drag-to-select functionality
 */
export function useDragSelection(): DragSelectionReturn {
  const [isDragging, setIsDragging] = useState(false);
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const [selectedCells, setSelectedCells] = useState<CellPosition[]>([]);
  const [isMultiSelect, setIsMultiSelect] = useState(false);

  const dragStartRef = useRef<CellPosition | null>(null);
  const previousSelectionRef = useRef<CellPosition[]>([]);

  // Track modifier keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') {
        setIsMultiSelect(true);
      }
      if (e.key === 'Escape') {
        clearSelection();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') {
        setIsMultiSelect(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Calculate selected cells from rectangle
  const calculateSelectedCells = useCallback((rect: SelectionRect): CellPosition[] => {
    const cells: CellPosition[] = [];
    const minRow = Math.min(rect.startRow, rect.endRow);
    const maxRow = Math.max(rect.startRow, rect.endRow);
    const minCol = Math.min(rect.startCol, rect.endCol);
    const maxCol = Math.max(rect.startCol, rect.endCol);

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        cells.push({ row, col });
      }
    }

    return cells;
  }, []);

  // Handle mouse down
  const handleMouseDown = useCallback(
    (row: number, col: number, event: React.MouseEvent) => {
      // Prevent text selection while dragging
      event.preventDefault();

      // Shift+click: extend selection to this cell
      if (event.shiftKey && dragStartRef.current) {
        const rect: SelectionRect = {
          startRow: dragStartRef.current.row,
          startCol: dragStartRef.current.col,
          endRow: row,
          endCol: col,
        };
        setSelectionRect(rect);
        setSelectedCells(calculateSelectedCells(rect));
        return;
      }

      // Ctrl+click: toggle cell in selection
      if (event.ctrlKey || event.metaKey) {
        const cellIndex = selectedCells.findIndex((c) => c.row === row && c.col === col);
        if (cellIndex >= 0) {
          // Remove from selection
          setSelectedCells(selectedCells.filter((_, i) => i !== cellIndex));
        } else {
          // Add to selection
          setSelectedCells([...selectedCells, { row, col }]);
        }
        dragStartRef.current = { row, col };
        return;
      }

      // Regular click: start new drag selection
      setIsDragging(true);
      dragStartRef.current = { row, col };
      previousSelectionRef.current = selectedCells;

      const rect: SelectionRect = {
        startRow: row,
        startCol: col,
        endRow: row,
        endCol: col,
      };
      setSelectionRect(rect);
      setSelectedCells([{ row, col }]);
    },
    [selectedCells, calculateSelectedCells]
  );

  // Handle mouse move
  const handleMouseMove = useCallback(
    (row: number, col: number) => {
      if (!isDragging || !dragStartRef.current) return;

      const rect: SelectionRect = {
        startRow: dragStartRef.current.row,
        startCol: dragStartRef.current.col,
        endRow: row,
        endCol: col,
      };

      setSelectionRect(rect);
      setSelectedCells(calculateSelectedCells(rect));
    },
    [isDragging, calculateSelectedCells]
  );

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    // Keep the selection but clear the drag state
  }, []);

  // Handle mouse up globally
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        handleMouseUp();
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isDragging, handleMouseUp]);

  // Clear selection
  const clearSelection = useCallback(() => {
    setIsDragging(false);
    setSelectionRect(null);
    setSelectedCells([]);
    dragStartRef.current = null;
    previousSelectionRef.current = [];
  }, []);

  // Check if cell is selected
  const isCellSelected = useCallback(
    (row: number, col: number): boolean => {
      return selectedCells.some((cell) => cell.row === row && cell.col === col);
    },
    [selectedCells]
  );

  // Get selected cells
  const getSelectedCells = useCallback((): CellPosition[] => {
    return selectedCells;
  }, [selectedCells]);

  return {
    // State
    isDragging,
    selectionRect,
    selectedCells,
    isMultiSelect,

    // Handlers
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    clearSelection,
    isCellSelected,
    getSelectedCells,
  };
}

export default useDragSelection;
