const SNAPSHOT_NAME_PATTERN = /^[A-Za-z0-9]+$/

export function normalizeSnapshotName(value: string): string {
  return value.trim()
}

export function buildDefaultSnapshotName(index: number): string {
  return `Snapshot${Math.max(1, index)}`
}

export function validateSnapshotName(
  value: string,
  existingSnapshotNames: string[] = [],
  options: {
    currentName?: string | null
  } = {},
): string | null {
  const normalized = normalizeSnapshotName(value)
  const currentName = options.currentName ? normalizeSnapshotName(options.currentName) : null

  if (currentName && normalized.toLowerCase() === currentName.toLowerCase()) {
    return null
  }

  if (!normalized) {
    return 'Name is required.'
  }

  if (!SNAPSHOT_NAME_PATTERN.test(normalized)) {
    return 'Use letters and numbers only. Spaces and special characters are not allowed.'
  }

  if (
    existingSnapshotNames.some((entry) => (
      normalizeSnapshotName(entry).toLowerCase() === normalized.toLowerCase()
      && (!currentName || normalizeSnapshotName(entry).toLowerCase() !== currentName.toLowerCase())
    ))
  ) {
    return 'A snapshot with that name already exists.'
  }

  return null
}
