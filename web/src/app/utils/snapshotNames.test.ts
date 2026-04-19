import {
  buildCapturedSnapshotBaseName,
  buildCapturedSnapshotName,
  buildDefaultSnapshotName,
  validateSnapshotName,
} from './snapshotNames'

describe('snapshotNames', () => {
  it('builds an alphanumeric rhyming default snapshot name with a numeric date suffix', () => {
    expect(
      buildDefaultSnapshotName([], {
        pair: ['Aiden', 'Jayden'],
        date: new Date('2026-04-02T15:30:00Z'),
      }),
    ).toBe('AidenJayden04022026')
    expect(
      buildDefaultSnapshotName([], {
        pair: ['Mia', 'Tia'],
        date: new Date('2026-04-02T15:30:00Z'),
      }),
    ).toBe('MiaTia04022026')
  })

  it('skips already-taken same-day defaults before returning a new one', () => {
    expect(
      buildDefaultSnapshotName(
        ['AidenJayden04022026'],
        {
          date: new Date('2026-04-02T15:30:00Z'),
          pairPool: [
            ['Aiden', 'Jayden'],
            ['Lila', 'Mila'],
          ],
        },
      ),
    ).toBe('LilaMila04022026')
  })

  it('falls back to combining rhyming pairs when every single-pair name for the day is taken', () => {
    expect(
      buildDefaultSnapshotName(
        ['AidenJayden04022026', 'LilaMila04022026'],
        {
          date: new Date('2026-04-02T15:30:00Z'),
          pair: ['Aiden', 'Jayden'],
          pairPool: [
            ['Aiden', 'Jayden'],
            ['Lila', 'Mila'],
          ],
        },
      ),
    ).toBe('AidenJaydenLilaMila04022026')
  })

  it('keeps generated default names valid under the snapshot naming rule', () => {
    expect(
      validateSnapshotName(
        buildDefaultSnapshotName([], {
          pair: ['Lila', 'Mila'],
          date: new Date('2026-04-02T15:30:00Z'),
        }),
      ),
    ).toBeNull()
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
