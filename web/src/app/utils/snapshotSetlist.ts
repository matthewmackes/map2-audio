import type { SnapshotSummary } from '../../map2/types'

export type SnapshotSetlistDirection = 'earlier' | 'later'

function compareSnapshotsByDisplayOrder(left: SnapshotSummary, right: SnapshotSummary): number {
  if (left.display_order !== right.display_order) {
    return left.display_order - right.display_order
  }

  if (left.updated_at && right.updated_at) {
    const leftUpdated = Date.parse(left.updated_at)
    const rightUpdated = Date.parse(right.updated_at)
    if (Number.isFinite(leftUpdated) && Number.isFinite(rightUpdated) && leftUpdated !== rightUpdated) {
      return rightUpdated - leftUpdated
    }
  }

  return left.id - right.id
}

export function compareSnapshotsByProgramNumber(left: SnapshotSummary, right: SnapshotSummary): number {
  if (left.program_number !== null && right.program_number !== null && left.program_number !== right.program_number) {
    return left.program_number - right.program_number
  }

  if (left.program_number !== null && right.program_number === null) {
    return -1
  }

  if (left.program_number === null && right.program_number !== null) {
    return 1
  }

  return compareSnapshotsByDisplayOrder(left, right)
}

export function sortSnapshotsByProgramNumber(snapshots: SnapshotSummary[]): SnapshotSummary[] {
  return [...snapshots].sort(compareSnapshotsByProgramNumber)
}

export function buildSnapshotSetlistOrder(
  favoriteSnapshots: SnapshotSummary[],
  persistedOrder: number[] | null | undefined,
): number[] {
  const fallbackOrder = [...favoriteSnapshots]
    .sort(compareSnapshotsByDisplayOrder)
    .map((snapshot) => snapshot.id)
  if (favoriteSnapshots.length === 0) {
    return []
  }

  const favoriteIds = new Set(fallbackOrder)
  const normalizedOrder: number[] = []

  ;(persistedOrder ?? []).forEach((snapshotId) => {
    if (!Number.isInteger(snapshotId) || snapshotId < 1 || !favoriteIds.has(snapshotId) || normalizedOrder.includes(snapshotId)) {
      return
    }
    normalizedOrder.push(snapshotId)
  })

  fallbackOrder.forEach((snapshotId) => {
    if (!normalizedOrder.includes(snapshotId)) {
      normalizedOrder.push(snapshotId)
    }
  })

  return normalizedOrder
}

export function sortFavoriteSnapshotsForSetlist(
  favoriteSnapshots: SnapshotSummary[],
  persistedOrder: number[] | null | undefined,
): SnapshotSummary[] {
  const setlistOrder = buildSnapshotSetlistOrder(favoriteSnapshots, persistedOrder)
  const orderById = new Map(setlistOrder.map((snapshotId, index) => [snapshotId, index] as const))

  return [...favoriteSnapshots].sort((left, right) => {
    const leftIndex = orderById.get(left.id) ?? Number.MAX_SAFE_INTEGER
    const rightIndex = orderById.get(right.id) ?? Number.MAX_SAFE_INTEGER
    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex
    }
    return compareSnapshotsByDisplayOrder(left, right)
  })
}

export function moveSnapshotInSetlist(
  setlistOrder: number[],
  snapshotId: number,
  direction: SnapshotSetlistDirection,
): number[] | null {
  const currentIndex = setlistOrder.indexOf(snapshotId)
  if (currentIndex === -1) {
    return null
  }

  const targetIndex = direction === 'earlier' ? currentIndex - 1 : currentIndex + 1
  if (targetIndex < 0 || targetIndex >= setlistOrder.length) {
    return null
  }

  const nextOrder = [...setlistOrder]
  const [movedSnapshotId] = nextOrder.splice(currentIndex, 1)
  nextOrder.splice(targetIndex, 0, movedSnapshotId)
  return nextOrder
}
