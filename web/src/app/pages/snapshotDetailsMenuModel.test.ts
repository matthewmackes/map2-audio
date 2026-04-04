import { buildSnapshotDetailsMenuModel } from './snapshotDetailsMenuModel'

describe('buildSnapshotDetailsMenuModel', () => {
  it('returns the Carbon action menu in musician-priority order with grouped separators', () => {
    const items = buildSnapshotDetailsMenuModel({
      activeSnapshot: true,
      snapshotEditingLocked: false,
      flowSlotCount: 2,
      maxFlows: 8,
      liveRuntimeButtonLabel: 'Live',
      liveRuntimeActive: true,
      midiLearnActive: false,
      midiLearnInProgress: false,
      midiMappingCountLabel: '12',
      duplicatePending: false,
    })

    expect(items.map((item) => item.label)).toEqual([
      'Route audio',
      'Edit local routing',
      'Set I/O devices',
      'Set output reference',
      'Restore noise gate defaults',
      'Add signal path',
      'Duplicate snapshot',
      'Open performance view',
      'Edit MIDI mappings',
      'View live state',
      'View version history',
      'View keyboard shortcuts',
      'Clear signal paths',
    ])
    expect(items.filter((item) => item.dividerBefore).map((item) => item.key)).toEqual([
      'restore-noise-gate-defaults',
      'view-live-state',
      'clear-signal-paths',
    ])
  })

  it('disables the context-sensitive actions when snapshot state does not allow them', () => {
    const items = buildSnapshotDetailsMenuModel({
      activeSnapshot: false,
      snapshotEditingLocked: true,
      flowSlotCount: 1,
      maxFlows: 1,
      liveRuntimeButtonLabel: 'Offline',
      liveRuntimeActive: false,
      midiLearnActive: true,
      midiLearnInProgress: false,
      midiMappingCountLabel: '99+',
      duplicatePending: true,
    })

    expect(items.find((item) => item.key === 'edit-local-routing')?.disabled).toBe(true)
    expect(items.find((item) => item.key === 'route-audio')?.disabled).toBe(true)
    expect(items.find((item) => item.key === 'set-io-devices')?.disabled).toBe(true)
    expect(items.find((item) => item.key === 'set-output-reference')?.disabled).toBe(true)
    expect(items.find((item) => item.key === 'add-signal-path')?.disabled).toBe(true)
    expect(items.find((item) => item.key === 'duplicate-snapshot')?.label).toBe('Duplicating…')
    expect(items.find((item) => item.key === 'duplicate-snapshot')?.disabled).toBe(true)
    expect(items.find((item) => item.key === 'edit-midi-mappings')?.disabled).toBe(true)
    expect(items.find((item) => item.key === 'view-version-history')?.disabled).toBe(true)
    expect(items.find((item) => item.key === 'clear-signal-paths')?.kind).toBe('danger')
    expect(items.find((item) => item.key === 'clear-signal-paths')?.disabled).toBe(true)
    expect(items.find((item) => item.key === 'edit-midi-mappings')?.title).toBe('MIDI Learn armed')
    expect(items.find((item) => item.key === 'view-live-state')?.label).toBe('View offline live state')
  })
})
