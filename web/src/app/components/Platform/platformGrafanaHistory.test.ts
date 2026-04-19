import {
  appendPlatformGrafanaHistory,
  PLATFORM_GRAFANA_HISTORY_BUCKET_MS,
  PLATFORM_GRAFANA_HISTORY_WINDOW_MS,
} from './platformGrafanaHistory'

describe('appendPlatformGrafanaHistory', () => {
  it('replaces points inside the same bucket instead of growing unbounded', () => {
    const start = Date.UTC(2026, 3, 4, 12, 0, 0)
    const first = appendPlatformGrafanaHistory([], [{ key: 'cpu', value: 10 }], start)
    const second = appendPlatformGrafanaHistory(first, [{ key: 'cpu', value: 15 }], start + PLATFORM_GRAFANA_HISTORY_BUCKET_MS - 1)

    expect(second).toHaveLength(1)
    expect(second[0]?.cpu).toBe(15)
  })

  it('trims data older than the 24 hour history window', () => {
    const start = Date.UTC(2026, 3, 4, 12, 0, 0)
    const previous = appendPlatformGrafanaHistory([], [{ key: 'cpu', value: 10 }], start)
    const next = appendPlatformGrafanaHistory(
      previous,
      [{ key: 'cpu', value: 20 }],
      start + PLATFORM_GRAFANA_HISTORY_WINDOW_MS + PLATFORM_GRAFANA_HISTORY_BUCKET_MS,
    )

    expect(next).toHaveLength(1)
    expect(next[0]?.cpu).toBe(20)
  })
})
