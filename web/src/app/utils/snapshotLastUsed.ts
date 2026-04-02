const LAST_USED_ABSOLUTE_THRESHOLD_DAYS = 30
const MILLISECONDS_PER_MINUTE = 60 * 1000
const MILLISECONDS_PER_HOUR = 60 * MILLISECONDS_PER_MINUTE
const MILLISECONDS_PER_DAY = 24 * MILLISECONDS_PER_HOUR

const relativeTimeFormatter = new Intl.RelativeTimeFormat('en-US', {
  numeric: 'always',
})

const absoluteDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

function formatAbsoluteDate(value: Date): string {
  return absoluteDateFormatter.format(value)
}

export function formatSnapshotLastUsedValue(activatedAt?: string | null, now = Date.now()): string {
  if (!activatedAt) {
    return 'Never'
  }

  const parsed = new Date(activatedAt)
  if (Number.isNaN(parsed.getTime())) {
    return 'Never'
  }

  const elapsedMilliseconds = now - parsed.getTime()
  if (elapsedMilliseconds <= 0 || elapsedMilliseconds < MILLISECONDS_PER_MINUTE) {
    return 'just now'
  }

  if (elapsedMilliseconds < MILLISECONDS_PER_HOUR) {
    const minutes = Math.floor(elapsedMilliseconds / MILLISECONDS_PER_MINUTE)
    return relativeTimeFormatter.format(-minutes, 'minute')
  }

  if (elapsedMilliseconds < MILLISECONDS_PER_DAY) {
    const hours = Math.floor(elapsedMilliseconds / MILLISECONDS_PER_HOUR)
    return relativeTimeFormatter.format(-hours, 'hour')
  }

  if (elapsedMilliseconds < LAST_USED_ABSOLUTE_THRESHOLD_DAYS * MILLISECONDS_PER_DAY) {
    const days = Math.floor(elapsedMilliseconds / MILLISECONDS_PER_DAY)
    return relativeTimeFormatter.format(-days, 'day')
  }

  return formatAbsoluteDate(parsed)
}

export function formatSnapshotLastUsedLabel(activatedAt?: string | null, now = Date.now()): string {
  return `Last used: ${formatSnapshotLastUsedValue(activatedAt, now)}`
}
