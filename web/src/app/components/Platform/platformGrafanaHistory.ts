export const PLATFORM_GRAFANA_HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000
export const PLATFORM_GRAFANA_HISTORY_BUCKET_MS = 5 * 60 * 1000

export interface PlatformGrafanaSeriesInput {
  key: string
  value: number | null | undefined
}

export interface PlatformGrafanaHistoryPoint {
  timestamp: number
  label: string
  [seriesKey: string]: number | string
}

function formatBucketLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function appendPlatformGrafanaHistory(
  previous: PlatformGrafanaHistoryPoint[],
  series: PlatformGrafanaSeriesInput[],
  now: number,
  retentionMs = PLATFORM_GRAFANA_HISTORY_WINDOW_MS,
  bucketMs = PLATFORM_GRAFANA_HISTORY_BUCKET_MS,
): PlatformGrafanaHistoryPoint[] {
  const validSeries = series.filter((entry) => Number.isFinite(entry.value ?? Number.NaN))
  const retained = previous.filter((point) => now - point.timestamp <= retentionMs)

  if (validSeries.length === 0) {
    return retained
  }

  const bucketStart = Math.floor(now / bucketMs) * bucketMs
  const nextPoint: PlatformGrafanaHistoryPoint = {
    timestamp: bucketStart,
    label: formatBucketLabel(bucketStart),
  }

  validSeries.forEach((entry) => {
    nextPoint[entry.key] = Number(entry.value)
  })

  const lastPoint = retained[retained.length - 1]
  if (lastPoint && lastPoint.timestamp === bucketStart) {
    return [...retained.slice(0, -1), nextPoint]
  }

  return [...retained, nextPoint]
}
