import { buildDevicesSubtree, resolveSnapshotEditorTreeStatus } from './GlobalTreeNav'
import { LEGACY_DEVICE_MANIFEST } from '../../data/legacyDeviceManifest'

describe('GlobalTreeNav devices subtree', () => {
  const navigate = jest.fn()
  const onRequestUnpin = jest.fn()

  beforeEach(() => {
    navigate.mockReset()
    onRequestUnpin.mockReset()
  })

  it('shows a single "Browse devices…" row when no devices are pinned', () => {
    const subtree = buildDevicesSubtree([], navigate, onRequestUnpin)
    expect(subtree).toHaveLength(1)
    expect(subtree[0]?.label).toMatch(/Browse devices/i)
    expect(subtree[0]?.route).toBe('/devices')
    expect(subtree[0]?.actions).toBeUndefined()
  })

  it('ignores pin IDs that do not correspond to known devices', () => {
    const subtree = buildDevicesSubtree(['bogus-id'], navigate, onRequestUnpin)
    // With zero resolvable entries, fall back to the browse row.
    expect(subtree).toHaveLength(1)
    expect(subtree[0]?.id).toMatch(/browse/)
  })

  it('renders pinned devices as a single flat group sorted by label (T2459-G11b)', () => {
    // Pick three real manifest entries; pass them in scrambled order.
    const sample = LEGACY_DEVICE_MANIFEST.slice(0, 3)
    if (sample.length < 3) {
      throw new Error('Fixture assumption broken: manifest needs at least 3 entries')
    }
    const scrambled = [sample[2].id, sample[0].id, sample[1].id]
    const subtree = buildDevicesSubtree(scrambled, navigate, onRequestUnpin)
    const renderedLabels = subtree.map((item) => item.label)
    const expectedLabels = [...sample]
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((entry) => entry.label)
    expect(renderedLabels).toEqual(expectedLabels)
  })

  it('attaches Unpin + "Open in store" actions on each pinned device row', () => {
    const mpx1 = LEGACY_DEVICE_MANIFEST.find((entry) => entry.id === 'mpx1')
    if (!mpx1) throw new Error('Fixture assumption broken: mpx1 missing from manifest')

    const subtree = buildDevicesSubtree([mpx1.id], navigate, onRequestUnpin)
    const node = subtree[0]
    expect(node?.actions).toBeDefined()
    expect(node?.actions?.map((action) => action.label)).toEqual(['Unpin', 'Open in store'])

    node?.actions?.[0]?.onClick()
    expect(onRequestUnpin).toHaveBeenCalledWith(mpx1)

    node?.actions?.[1]?.onClick()
    expect(navigate).toHaveBeenCalledWith('/devices')
  })

  it('routes pinned devices to their legacyRoute (T2459-G11b)', () => {
    const mpx1 = LEGACY_DEVICE_MANIFEST.find((entry) => entry.id === 'mpx1')
    if (!mpx1) throw new Error('Fixture assumption broken: mpx1 missing from manifest')

    const [node] = buildDevicesSubtree([mpx1.id], navigate, onRequestUnpin)
    expect(node?.route).toBe(mpx1.legacyRoute)
    expect(node?.children).toEqual([])
  })
})

describe('GlobalTreeNav resolveSnapshotEditorTreeStatus', () => {
  it('defaults the Snapshot Editor tree status to Live when no cluster runtime state is available yet', () => {
    expect(resolveSnapshotEditorTreeStatus(undefined)).toEqual({
      label: 'Live',
      tone: 'live',
    })
  })

  it('prefers an active live runtime node when deriving Snapshot Editor status', () => {
    expect(resolveSnapshotEditorTreeStatus({
      local_node_id: 'node-local',
      generated_at: '2026-04-23T18:13:00Z',
      count: 2,
      nodes: [
        {
          node_id: 'node-local', seq: 1, emitted_at: '2026-04-23T18:13:00Z',
          state: 'stopped', snapshot_id: null, snapshot_revision: null,
          snapshot_name: null, triggered_by: null,
          live_snapshot_payload: null, last_successful_request_id: null,
          failure_reason: null, runtime_metrics: {},
          warning_threshold_seconds: 10, offline_threshold_seconds: 15,
          age_seconds: 0.5, is_warning: false, is_offline: false,
          display_state: 'stopped', display_label: 'Stopped',
        },
        {
          node_id: 'node-remote', seq: 9, emitted_at: '2026-04-23T18:13:01Z',
          state: 'live', snapshot_id: 42, snapshot_revision: 'rev-42',
          snapshot_name: 'Arena Intro', triggered_by: 'ui',
          live_snapshot_payload: null, last_successful_request_id: 'request-42',
          failure_reason: null, runtime_metrics: {},
          warning_threshold_seconds: 10, offline_threshold_seconds: 15,
          age_seconds: 0.1, is_warning: false, is_offline: false,
          display_state: 'live', display_label: 'Live',
        },
      ],
    })).toEqual({
      label: 'Live',
      tone: 'live',
    })
  })

  it('falls back to the preferred local runtime node when no active live node exists', () => {
    expect(resolveSnapshotEditorTreeStatus({
      local_node_id: 'node-local',
      generated_at: '2026-04-23T18:13:00Z',
      count: 2,
      nodes: [
        {
          node_id: 'node-local', seq: 2, emitted_at: '2026-04-23T18:13:00Z',
          state: 'stopped', snapshot_id: null, snapshot_revision: null,
          snapshot_name: null, triggered_by: null,
          live_snapshot_payload: null, last_successful_request_id: null,
          failure_reason: null, runtime_metrics: {},
          warning_threshold_seconds: 10, offline_threshold_seconds: 15,
          age_seconds: 1, is_warning: false, is_offline: true,
          display_state: 'offline', display_label: 'Offline',
        },
        {
          node_id: 'node-remote', seq: 7, emitted_at: '2026-04-23T18:13:01Z',
          state: 'stopped', snapshot_id: null, snapshot_revision: null,
          snapshot_name: null, triggered_by: null,
          live_snapshot_payload: null, last_successful_request_id: null,
          failure_reason: null, runtime_metrics: {},
          warning_threshold_seconds: 10, offline_threshold_seconds: 15,
          age_seconds: 0.2, is_warning: true, is_offline: false,
          display_state: 'live_warning', display_label: 'Live + Warning',
        },
      ],
    })).toEqual({
      label: 'Offline',
      tone: 'offline',
    })
  })
})

describe('GlobalTreeNav T2459-G11b — bench-store pins', () => {
  const navigate = jest.fn()
  const onRequestUnpin = jest.fn()

  beforeEach(() => {
    navigate.mockReset()
    onRequestUnpin.mockReset()
  })

  it('appends bench-store pins as separate tree nodes after the legacy pins', () => {
    const legacyPinId = LEGACY_DEVICE_MANIFEST[0]?.id
    if (!legacyPinId) {
      throw new Error('expected LEGACY_DEVICE_MANIFEST to have at least one entry')
    }
    const subtree = buildDevicesSubtree(
      [legacyPinId],
      navigate,
      onRequestUnpin,
      ['edirol-ua/ua-1000.audio', 'hotone/jogg.audio'],
    )

    // 1 legacy + 2 bench-store = 3 nodes total.
    expect(subtree).toHaveLength(3)
    expect(subtree[1]?.route).toBe('/devices/profile/edirol-ua/ua-1000/v2')
    expect(subtree[2]?.route).toBe('/devices/profile/hotone/jogg/v2')
    expect(subtree[1]?.label).toBe('ua-1000 (Hardware Store)')
    expect(subtree[2]?.label).toBe('jogg (Hardware Store)')
  })

  it('renders bench-store pins even when the legacy registry pin set is empty', () => {
    const subtree = buildDevicesSubtree(
      [],
      navigate,
      onRequestUnpin,
      ['edirol-ua/ua-1000.audio'],
    )
    expect(subtree).toHaveLength(2)
    expect(subtree[0]?.label).toMatch(/Browse devices/i)
    expect(subtree[1]?.label).toBe('ua-1000 (Hardware Store)')
  })

  it('falls back to the Browse row when both pin sets are empty', () => {
    const subtree = buildDevicesSubtree([], navigate, onRequestUnpin, [])
    expect(subtree).toHaveLength(1)
    expect(subtree[0]?.label).toMatch(/Browse devices/i)
  })

  it('skips malformed bench-store profile keys', () => {
    const subtree = buildDevicesSubtree(
      [],
      navigate,
      onRequestUnpin,
      ['malformed-no-slash', 'edirol-ua/ua-1000.audio'],
    )
    expect(subtree).toHaveLength(2)
    expect(subtree[1]?.label).toBe('ua-1000 (Hardware Store)')
  })
})
