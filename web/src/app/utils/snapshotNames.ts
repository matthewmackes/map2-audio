const SNAPSHOT_NAME_PATTERN = /^[A-Za-z0-9]+$/

const ALPHANUMERIC_UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

function shuffleArray<T>(source: readonly T[]): T[] {
  const result = [...source]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}

function pickArrayElement<T>(source: readonly T[]): T {
  return source[Math.floor(Math.random() * source.length)]
}

function randomUppercaseAlnum(length: number): string {
  let result = ''
  for (let index = 0; index < length; index += 1) {
    result += ALPHANUMERIC_UPPERCASE[Math.floor(Math.random() * ALPHANUMERIC_UPPERCASE.length)]
  }
  return result
}
const RHYMING_NAME_PAIRS = [
  ['Aiden', 'Jayden'],
  ['Ari', 'Mari'],
  ['Cara', 'Sara'],
  ['Cora', 'Nora'],
  ['Ella', 'Stella'],
  ['Kira', 'Mira'],
  ['Lena', 'Xena'],
  ['Lila', 'Mila'],
  ['Lily', 'Millie'],
  ['Mia', 'Tia'],
  ['Nina', 'Tina'],
  ['Riley', 'Miley'],
] as const

type RhymingNamePair = (typeof RHYMING_NAME_PAIRS)[number]

type DefaultSnapshotNameOptions = {
  date?: Date
  pair?: RhymingNamePair
  pairPool?: readonly RhymingNamePair[]
}

export function normalizeSnapshotName(value: string): string {
  return value.trim()
}

function sanitizeSnapshotNameSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, '')
}

function buildNumericDateSuffix(date: Date): string {
  const month = padDateSegment(date.getMonth() + 1)
  const day = padDateSegment(date.getDate())
  const year = date.getFullYear()
  return `${month}${day}${year}`
}

function buildRhymingNameStem(pair: RhymingNamePair): string {
  return sanitizeSnapshotNameSegment(`${pair[0]}${pair[1]}`) || 'Snapshot'
}

function buildOrderedRhymingNamePairs(options: DefaultSnapshotNameOptions): RhymingNamePair[] {
  const source = [...(options.pairPool ?? RHYMING_NAME_PAIRS)]
  const preferredPair = options.pair

  if (!preferredPair) {
    return shuffleArray(source)
  }

  return [
    preferredPair,
    ...source.filter((pair) => pair[0] !== preferredPair[0] || pair[1] !== preferredPair[1]),
  ]
}

export function buildDefaultSnapshotName(
  existingSnapshotNames: string[] = [],
  options: DefaultSnapshotNameOptions = {},
): string {
  const takenNames = new Set(
    existingSnapshotNames
      .map((entry) => normalizeSnapshotName(entry).toLowerCase())
      .filter(Boolean),
  )
  const dateSuffix = buildNumericDateSuffix(options.date ?? new Date())
  const orderedPairs = buildOrderedRhymingNamePairs(options)

  for (const pair of orderedPairs) {
    const candidate = `${buildRhymingNameStem(pair)}${dateSuffix}`
    if (!takenNames.has(candidate.toLowerCase())) {
      return candidate
    }
  }

  for (const primaryPair of orderedPairs) {
    for (const secondaryPair of orderedPairs) {
      if (primaryPair[0] === secondaryPair[0] && primaryPair[1] === secondaryPair[1]) {
        continue
      }
      const candidate = `${buildRhymingNameStem(primaryPair)}${buildRhymingNameStem(secondaryPair)}${dateSuffix}`
      if (!takenNames.has(candidate.toLowerCase())) {
        return candidate
      }
    }
  }

  let attempt = 0
  while (attempt < 256) {
    const primaryPair = pickArrayElement(orderedPairs)
    const secondaryPair = pickArrayElement(orderedPairs)
    const nonce = randomUppercaseAlnum(4)
    const candidate = `${buildRhymingNameStem(primaryPair)}${buildRhymingNameStem(secondaryPair)}${nonce}${dateSuffix}`
    if (!takenNames.has(candidate.toLowerCase())) {
      return candidate
    }
    attempt += 1
  }

  return `Snapshot${randomUppercaseAlnum(8)}${dateSuffix}`
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
