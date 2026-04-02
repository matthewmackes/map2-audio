const SNAPSHOT_NAME_PATTERN = /^[A-Za-z0-9]+$/

export function normalizeSnapshotName(value: string): string {
  return value.trim()
}

export function buildDefaultSnapshotName(index: number): string {
  return `Snapshot${Math.max(1, index)}`
}

function padDateSegment(value: number): string {
  return String(value).padStart(2, '0')
}

function buildAlphabeticSuffix(sequenceIndex: number): string {
  let value = Math.max(0, Math.trunc(sequenceIndex)) + 1
  let result = ''

  while (value > 0) {
    value -= 1
    result = String.fromCharCode(97 + (value % 26)) + result
    value = Math.floor(value / 26)
  }

  return result
}

export function buildCapturedSnapshotBaseName(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = padDateSegment(date.getMonth() + 1)
  const day = padDateSegment(date.getDate())
  return `Rig${year}${month}${day}`
}

export function buildCapturedSnapshotName(
  existingSnapshotNames: string[] = [],
  date: Date = new Date(),
): string {
  const takenNames = new Set(
    existingSnapshotNames
      .map((entry) => normalizeSnapshotName(entry).toLowerCase())
      .filter(Boolean),
  )
  const baseName = buildCapturedSnapshotBaseName(date)

  if (!takenNames.has(baseName.toLowerCase())) {
    return baseName
  }

  let collisionIndex = 1
  while (collisionIndex < 2048) {
    const candidate = `${baseName}${buildAlphabeticSuffix(collisionIndex)}`
    if (!takenNames.has(candidate.toLowerCase())) {
      return candidate
    }
    collisionIndex += 1
  }

  return `${baseName}${Date.now()}`
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
