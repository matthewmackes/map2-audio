/**
 * audioTableKeyboard.ts — Table-optimized keyboard navigation for the AUDIO-TABLE page.
 *
 * Uses data-row and data-col attributes on table cells for grid-style navigation.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AudioTableKeyboardActions {
  onUndo: () => void
  onRedo: () => void
  onDeleteRow: (flowIndex: number, rowIndex: number) => void
}

// ---------------------------------------------------------------------------
// Navigation helpers
// ---------------------------------------------------------------------------

function findCell(container: HTMLElement, row: number, col: number): HTMLElement | null {
  return container.querySelector(`[data-row="${row}"][data-col="${col}"]`)
}

function focusInput(cell: HTMLElement): void {
  const input = cell.querySelector<HTMLElement>('input, select, [role="combobox"], [role="listbox"], button')
  if (input) {
    input.focus()
  } else {
    cell.focus()
  }
}

function getCellCoords(el: HTMLElement): { row: number; col: number } | null {
  const cell = el.closest<HTMLElement>('[data-row][data-col]')
  if (!cell) return null
  const row = parseInt(cell.dataset.row ?? '', 10)
  const col = parseInt(cell.dataset.col ?? '', 10)
  if (isNaN(row) || isNaN(col)) return null
  return { row, col }
}

function getFlowIndex(el: HTMLElement): number | null {
  const section = el.closest<HTMLElement>('[data-flow-index]')
  if (!section) return null
  const idx = parseInt(section.dataset.flowIndex ?? '', 10)
  return isNaN(idx) ? null : idx
}

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

// ---------------------------------------------------------------------------
// Main keyboard handler factory
// ---------------------------------------------------------------------------

export function createAudioTableKeyHandler(
  containerRef: React.RefObject<HTMLElement | null>,
  actions: AudioTableKeyboardActions,
) {
  return function handleKeyDown(e: KeyboardEvent): void {
    const container = containerRef.current
    if (!container) return

    const target = e.target as HTMLElement

    // Ctrl+Z / Ctrl+Y — undo/redo (always active)
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault()
      actions.onUndo()
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault()
      actions.onRedo()
      return
    }

    // Don't intercept when typing in an input (except for navigation keys)
    if (isTextEntry(target) && !['Tab', 'Enter', 'Escape', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      return
    }

    const coords = getCellCoords(target)
    if (!coords) return

    switch (e.key) {
      case 'Tab': {
        e.preventDefault()
        const nextCol = e.shiftKey ? coords.col - 1 : coords.col + 1
        const nextCell = findCell(container, coords.row, nextCol)
        if (nextCell) {
          focusInput(nextCell)
        }
        break
      }

      case 'Enter': {
        e.preventDefault()
        // Commit current edit (blur), then move down
        if (target instanceof HTMLInputElement) {
          target.blur()
        }
        const belowCell = findCell(container, coords.row + 1, coords.col)
        if (belowCell) {
          focusInput(belowCell)
        }
        break
      }

      case 'Escape': {
        // Cancel edit — blur the current input
        if (target instanceof HTMLInputElement) {
          target.blur()
        }
        break
      }

      case 'ArrowUp': {
        if (!isTextEntry(target)) {
          e.preventDefault()
          const aboveCell = findCell(container, coords.row - 1, coords.col)
          if (aboveCell) focusInput(aboveCell)
        }
        break
      }

      case 'ArrowDown': {
        if (!isTextEntry(target)) {
          e.preventDefault()
          const belowCell = findCell(container, coords.row + 1, coords.col)
          if (belowCell) focusInput(belowCell)
        }
        break
      }

      case 'ArrowLeft': {
        if (!isTextEntry(target)) {
          e.preventDefault()
          const leftCell = findCell(container, coords.row, coords.col - 1)
          if (leftCell) focusInput(leftCell)
        }
        break
      }

      case 'ArrowRight': {
        if (!isTextEntry(target)) {
          e.preventDefault()
          const rightCell = findCell(container, coords.row, coords.col + 1)
          if (rightCell) focusInput(rightCell)
        }
        break
      }

      case ' ': {
        // Space toggles bypass checkbox when the cell is focused (not on input)
        if (!isTextEntry(target)) {
          const checkbox = target.closest('[data-col]')?.querySelector<HTMLInputElement>('input[type="checkbox"]')
          if (checkbox) {
            e.preventDefault()
            checkbox.click()
          }
        }
        break
      }

      case 'Delete': {
        if (!isTextEntry(target)) {
          e.preventDefault()
          const flowIdx = getFlowIndex(target)
          if (flowIdx !== null) {
            actions.onDeleteRow(flowIdx, coords.row)
          }
        }
        break
      }
    }
  }
}
