export function formatPercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'n/a'
  }
  return `${value.toFixed(1)}%`
}

export function formatMillis(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'n/a'
  }
  return `${value.toFixed(2)} ms`
}

export function truncateLabel(value: string, max = 36): string {
  if (value.length <= max) {
    return value
  }
  return `${value.slice(0, max - 1)}…`
}
