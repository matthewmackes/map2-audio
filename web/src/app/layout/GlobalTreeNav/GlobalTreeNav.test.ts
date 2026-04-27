import { buildDevicesSubtree, resolveSnapshotEditorTreeStatus } from './GlobalTreeNav'
import { DEVICE_REGISTRY } from '../../data/deviceRegistry'

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

  it('renders pinned devices grouped by kind in processor → console → control-surface → audio-interface order', () => {
    const sample = {
      processor: DEVICE_REGISTRY.find((entry) => entry.kind === 'processor'),
      console: DEVICE_REGISTRY.find((entry) => entry.kind === 'console'),
      controlSurface: DEVICE_REGISTRY.find((entry) => entry.kind === 'control-surface'),
      audioInterface: DEVICE_REGISTRY.find((entry) => entry.kind === 'audio-interface'),
    }

    if (!sample.processor || !sample.console || !sample.controlSurface || !sample.audioInterface) {
      throw new Error('Fixture assumption broken: registry missing expected kinds')
    }

    // Intentionally scramble input order.
    const pinned = [sample.audioInterface.id, sample.controlSurface.id, sample.processor.id, sample.console.id]
    const subtree = buildDevicesSubtree(pinned, navigate, onRequestUnpin)
    expect(subtree.map((item) => item.label)).toEqual([
      sample.processor.label,
      sample.console.label,
      sample.controlSurface.label,
      sample.audioInterface.label,
    ])
  })

  it('sorts multiple pinned devices alphabetically within a kind group', () => {
    const processors = DEVICE_REGISTRY.filter((entry) => entry.kind === 'processor')
    if (processors.length < 2) {
      throw new Error('Fixture assumption broken: need ≥ 2 processors to verify alpha sort')
    }
    const pinned = processors.map((entry) => entry.id)
    const subtree = buildDevicesSubtree(pinned, navigate, onRequestUnpin)
    const renderedLabels = subtree.map((item) => item.label)
    const expectedLabels = [...processors].sort((a, b) => a.label.localeCompare(b.label)).map((entry) => entry.label)
    expect(renderedLabels).toEqual(expectedLabels)
  })

  it('marks the first entry of every non-leading kind group with a groupBoundary flag', () => {
    const processors = DEVICE_REGISTRY.filter((entry) => entry.kind === 'processor').slice(0, 2)
    const consoleEntry = DEVICE_REGISTRY.find((entry) => entry.kind === 'console')
    if (processors.length < 2 || !consoleEntry) {
      throw new Error('Fixture assumption broken')
    }

    const pinned = [...processors.map((entry) => entry.id), consoleEntry.id]
    const subtree = buildDevicesSubtree(pinned, navigate, onRequestUnpin)

    // Expected: [processor-A, processor-B, consoleEntry].
    expect(subtree[0]?.groupBoundary).toBeFalsy() // first overall → no boundary
    expect(subtree[1]?.groupBoundary).toBeFalsy() // same kind → no boundary
    expect(subtree[2]?.groupBoundary).toBe(true) // first console after processors
  })

  it('attaches Unpin + "Open in store" actions on each pinned device row', () => {
    const mpx1 = DEVICE_REGISTRY.find((entry) => entry.id === 'mpx1')
    if (!mpx1) throw new Error('Fixture assumption broken: mpx1 missing from registry')

    const subtree = buildDevicesSubtree([mpx1.id], navigate, onRequestUnpin)
    const node = subtree[0]
    expect(node?.actions).toBeDefined()
    expect(node?.actions?.map((action) => action.label)).toEqual(['Unpin', 'Open in store'])

    node?.actions?.[0]?.onClick()
    expect(onRequestUnpin).toHaveBeenCalledWith(mpx1)

    node?.actions?.[1]?.onClick()
    expect(navigate).toHaveBeenCalledWith('/devices')
  })

  it('exposes each device view as a child route under a unified pinned row', () => {
    const mpx1 = DEVICE_REGISTRY.find((entry) => entry.id === 'mpx1')
    if (!mpx1) throw new Error('Fixture assumption broken: mpx1 missing from registry')

    const [node] = buildDevicesSubtree([mpx1.id], navigate, onRequestUnpin)
    expect(node?.children?.length).toBe(mpx1.views.length)
    for (const child of node?.children ?? []) {
      expect(child.route).toMatch(new RegExp(`^/devices/${mpx1.id}/`))
    }
    // Unified route goes to /devices/mpx1/panel, not a legacy redirect.
    expect(node?.route).toBe(`/devices/${mpx1.id}/${mpx1.defaultView}`)
  })

  it('routes control-surface pins to their legacyRoute instead of the unified /devices/<id> path', () => {
    const mk1 = DEVICE_REGISTRY.find((entry) => entry.id === 'maschine-mk1')
    if (!mk1 || !mk1.legacyRoute) throw new Error('Fixture assumption broken: maschine-mk1 needs a legacyRoute')

    const [node] = buildDevicesSubtree([mk1.id], navigate, onRequestUnpin)
    expect(node?.route).toBe(mk1.legacyRoute)
    // Control surfaces have no unified route yet, so the tree must not expand fake sub-views.
    expect(node?.children ?? []).toHaveLength(0)
  })

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
          node_id: 'node-local',
          seq: 1,
          emitted_at: '2026-04-23T18:13:00Z',
          state: 'stopped',
          snapshot_id: null,
          snapshot_revision: null,
          snapshot_name: null,
          triggered_by: null,
          live_snapshot_payload: null,
          last_successful_request_id: null,
          failure_reason: null,
          runtime_metrics: {},
          warning_threshold_seconds: 10,
          offline_threshold_seconds: 15,
          age_seconds: 0.5,
          is_warning: false,
          is_offline: false,
          display_state: 'stopped',
          display_label: 'Stopped',
        },
        {
          node_id: 'node-remote',
          seq: 9,
          emitted_at: '2026-04-23T18:13:01Z',
          state: 'live',
          snapshot_id: 42,
          snapshot_revision: 'rev-42',
          snapshot_name: 'Arena Intro',
          triggered_by: 'ui',
          live_snapshot_payload: null,
          last_successful_request_id: 'request-42',
          failure_reason: null,
          runtime_metrics: {},
          warning_threshold_seconds: 10,
          offline_threshold_seconds: 15,
          age_seconds: 0.1,
          is_warning: false,
          is_offline: false,
          display_state: 'live',
          display_label: 'Live',
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
          node_id: 'node-local',
          seq: 2,
          emitted_at: '2026-04-23T18:13:00Z',
          state: 'stopped',
          snapshot_id: null,
          snapshot_revision: null,
          snapshot_name: null,
          triggered_by: null,
          live_snapshot_payload: null,
          last_successful_request_id: null,
          failure_reason: null,
          runtime_metrics: {},
          warning_threshold_seconds: 10,
          offline_threshold_seconds: 15,
          age_seconds: 1,
          is_warning: false,
          is_offline: true,
          display_state: 'offline',
          display_label: 'Offline',
        },
        {
          node_id: 'node-remote',
          seq: 7,
          emitted_at: '2026-04-23T18:13:01Z',
          state: 'stopped',
          snapshot_id: null,
          snapshot_revision: null,
          snapshot_name: null,
          triggered_by: null,
          live_snapshot_payload: null,
          last_successful_request_id: null,
          failure_reason: null,
          runtime_metrics: {},
          warning_threshold_seconds: 10,
          offline_threshold_seconds: 15,
          age_seconds: 0.2,
          is_warning: true,
          is_offline: false,
          display_state: 'live_warning',
          display_label: 'Live + Warning',
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
    // Pick a real legacy pin id so the legacy section is non-empty.
    const legacyPinId = DEVICE_REGISTRY[0]?.id
    if (!legacyPinId) {
      throw new Error('expected DEVICE_REGISTRY to have at least one entry')
    }
    const subtree = buildDevicesSubtree(
      [legacyPinId],
      navigate,
      onRequestUnpin,
      ['edirol-ua/ua-1000.audio', 'hotone/jogg.audio'],
    )

    // 1 legacy + 2 bench-store = 3 nodes total.
    expect(subtree).toHaveLength(3)
    // The bench-store nodes route to the v2 detail strip.
    expect(subtree[1]?.route).toBe('/devices/profile/edirol-ua/ua-1000/v2')
    expect(subtree[2]?.route).toBe('/devices/profile/hotone/jogg/v2')
    // Labels carry the model + the "(Hardware Store)" qualifier.
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
    // Should be: the Browse row + 1 bench-store pin = 2 nodes.
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
    // Browse + 1 valid bench-store pin = 2 nodes (the malformed one
    // is dropped silently).
    expect(subtree).toHaveLength(2)
    expect(subtree[1]?.label).toBe('ua-1000 (Hardware Store)')
  })
})
