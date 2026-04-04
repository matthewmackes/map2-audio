export interface SnapshotDetailsMenuModelOptions {
  activeSnapshot: boolean
  snapshotEditingLocked: boolean
  flowSlotCount: number
  maxFlows: number
  liveRuntimeButtonLabel: string
  liveRuntimeActive: boolean
  midiLearnActive: boolean
  midiLearnInProgress: boolean
  midiMappingCountLabel: string
  duplicatePending: boolean
}

export interface SnapshotDetailsMenuEntry {
  key: string
  label?: string
  iconClassName?: string
  kind?: 'default' | 'danger'
  disabled?: boolean
  title?: string
  dividerBefore?: boolean
  action:
    | 'add-flow'
    | 'clear-flows'
    | 'open-network-routing'
    | 'open-live-runtime'
    | 'open-local-routing'
    | 'open-io-devices'
    | 'open-output-reference'
    | 'open-noise-gate-defaults'
    | 'duplicate-snapshot'
    | 'open-perform'
    | 'open-midi'
    | 'open-version-history'
    | 'open-shortcuts'
}

export function buildSnapshotDetailsMenuModel({
  activeSnapshot,
  snapshotEditingLocked,
  flowSlotCount,
  maxFlows,
  liveRuntimeButtonLabel,
  liveRuntimeActive,
  midiLearnActive,
  midiLearnInProgress,
  midiMappingCountLabel,
  duplicatePending,
}: SnapshotDetailsMenuModelOptions): SnapshotDetailsMenuEntry[] {
  const midiLearning = midiLearnActive || midiLearnInProgress

  return [
    {
      key: 'route-audio',
      label: 'Route audio',
      disabled: snapshotEditingLocked,
      action: 'open-network-routing',
    },
    {
      key: 'edit-local-routing',
      label: 'Edit local routing',
      disabled: snapshotEditingLocked,
      action: 'open-local-routing',
    },
    {
      key: 'set-io-devices',
      label: 'Set I/O devices',
      disabled: snapshotEditingLocked,
      action: 'open-io-devices',
    },
    {
      key: 'set-output-reference',
      label: 'Set output reference',
      disabled: !activeSnapshot,
      action: 'open-output-reference',
    },
    {
      key: 'restore-noise-gate-defaults',
      label: 'Restore noise gate defaults',
      dividerBefore: true,
      action: 'open-noise-gate-defaults',
    },
    {
      key: 'add-signal-path',
      label: 'Add signal path',
      iconClassName: 'juce-grid-page__snapshot-status-details-item--add',
      disabled: snapshotEditingLocked || flowSlotCount >= maxFlows,
      action: 'add-flow',
    },
    {
      key: 'duplicate-snapshot',
      label: duplicatePending ? 'Duplicating…' : 'Duplicate snapshot',
      disabled: !activeSnapshot || duplicatePending,
      action: 'duplicate-snapshot',
    },
    {
      key: 'open-performance-view',
      label: 'Open performance view',
      iconClassName: 'juce-grid-page__snapshot-status-details-item--perform',
      action: 'open-perform',
    },
    {
      key: 'edit-midi-mappings',
      label: 'Edit MIDI mappings',
      iconClassName: `juce-grid-page__snapshot-status-details-item--midi ${midiLearning ? 'is-learning' : ''}`,
      disabled: snapshotEditingLocked,
      title: midiLearning ? 'MIDI Learn armed' : `${midiMappingCountLabel} MIDI mappings`,
      action: 'open-midi',
    },
    {
      key: 'view-live-state',
      label: liveRuntimeButtonLabel === 'Live Warning'
        ? 'View live state warning'
        : liveRuntimeButtonLabel === 'Offline'
          ? 'View offline live state'
          : liveRuntimeActive
            ? 'View live state'
            : 'View live state',
      iconClassName: `juce-grid-page__snapshot-status-details-item--live ${liveRuntimeActive ? 'is-live' : ''}`,
      dividerBefore: true,
      action: 'open-live-runtime',
    },
    {
      key: 'view-version-history',
      label: 'View version history',
      disabled: !activeSnapshot,
      action: 'open-version-history',
    },
    {
      key: 'view-keyboard-shortcuts',
      label: 'View keyboard shortcuts',
      action: 'open-shortcuts',
    },
    {
      key: 'clear-signal-paths',
      label: 'Clear signal paths',
      kind: 'danger',
      disabled: snapshotEditingLocked || flowSlotCount <= 1,
      dividerBefore: true,
      action: 'clear-flows',
    },
  ]
}
