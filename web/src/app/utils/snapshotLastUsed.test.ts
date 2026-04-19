import { formatSnapshotLastUsedLabel, formatSnapshotLastUsedValue } from './snapshotLastUsed'

describe('snapshotLastUsed', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-04-01T12:00:00Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('formats never, relative, and absolute last-used timestamps', () => {
    expect(formatSnapshotLastUsedValue(null)).toBe('Never')
    expect(formatSnapshotLastUsedValue('2026-04-01T11:59:40Z')).toBe('just now')
    expect(formatSnapshotLastUsedValue('2026-04-01T11:58:00Z')).toBe('2 minutes ago')
    expect(formatSnapshotLastUsedValue('2026-04-01T09:00:00Z')).toBe('3 hours ago')
    expect(formatSnapshotLastUsedValue('2026-03-30T12:00:00Z')).toBe('2 days ago')
    expect(formatSnapshotLastUsedValue('2026-02-28T12:00:00Z')).toBe('Feb 28, 2026')
  })

  it('builds the user-facing label copy', () => {
    expect(formatSnapshotLastUsedLabel('2026-04-01T11:58:00Z')).toBe('Last used: 2 minutes ago')
  })
})
