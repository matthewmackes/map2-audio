import { buildDevicesSubtree } from './GlobalTreeNav'
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
})
