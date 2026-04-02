import {
  buildCapturedSnapshotBaseName,
  buildCapturedSnapshotName,
  buildDefaultSnapshotName,
  validateSnapshotName,
} from './snapshotNames'

describe('snapshotNames', () => {
  it('keeps the generic default snapshot helper for non-capture flows', () => {
    expect(buildDefaultSnapshotName(1)).toBe('Snapshot1')
    expect(buildDefaultSnapshotName(3)).toBe('Snapshot3')
  })

  it('builds a dated Rig capture base name', () => {
    expect(buildCapturedSnapshotBaseName(new Date('2026-04-01T15:30:00Z'))).toBe('Rig20260401')
  })

  it('returns the bare Rig date when that name is still available', () => {
    expect(buildCapturedSnapshotName(['Snapshot1', 'FridayNight'], new Date('2026-04-01T15:30:00Z'))).toBe('Rig20260401')
  })

  it('appends alphabetic collision suffixes starting at b for captured snapshots', () => {
    expect(
      buildCapturedSnapshotName(
        ['Rig20260401', 'Rig20260401b'],
        new Date('2026-04-01T15:30:00Z'),
      ),
    ).toBe('Rig20260401c')
  })

  it('matches names case-insensitively when resolving capture collisions', () => {
    expect(
      buildCapturedSnapshotName(
        ['rig20260401', 'RIG20260401B'],
        new Date('2026-04-01T15:30:00Z'),
      ),
    ).toBe('Rig20260401c')
  })

  it('continues to validate captured names under the alphanumeric-only rule', () => {
    expect(validateSnapshotName('Rig20260401b', ['Rig20260401'])).toBeNull()
  })
})
