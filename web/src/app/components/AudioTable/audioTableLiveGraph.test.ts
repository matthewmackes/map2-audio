import { buildSnapshotEditorLiveChainProjection } from '../SnapshotEditor/snapshotEditorLiveChains'
import { buildAudioTableLiveGraphModel } from './audioTableLiveGraph'
import { buildAudioTablePluginTargetKey } from './audioTablePluginPrimitives'

describe('audioTableLiveGraph', () => {
  it('builds nodes only for backend-reported live or degraded chains and excludes inactive workspace chains', () => {
    const chains = [
      {
        id: 1,
        name: 'Main',
        is_active: true,
        created_at: '',
        updated_at: '',
        plugins: [
          { uri: 'urn:test:reverb', name: 'Reverb', position: 0, bypassed: false, parameters: { mix: 0.5 } },
        ],
        loop_insertions: [],
        effects_loops: [],
        runtime_sync: {
          enabled: true,
          status: 'active',
          warnings: [],
          runtime_items: 1,
          restored_positions: [],
          missing_positions: [],
        },
      },
      {
        id: 2,
        name: 'Inactive',
        is_active: false,
        created_at: '',
        updated_at: '',
        plugins: [
          { uri: 'urn:test:delay', name: 'Delay', position: 0, bypassed: false, parameters: { time: 0.3 } },
        ],
        loop_insertions: [],
        effects_loops: [],
        runtime_sync: {
          enabled: true,
          status: 'inactive',
          warnings: [],
          runtime_items: 1,
          restored_positions: [],
          missing_positions: [],
        },
      },
      {
        id: 3,
        name: 'Runtime Only',
        is_active: true,
        created_at: '',
        updated_at: '',
        plugins: [
          { uri: 'urn:test:chorus', name: 'Chorus', position: 0, bypassed: true, parameters: { depth: 0.2 } },
        ],
        loop_insertions: [],
        effects_loops: [],
        runtime_sync: null,
      },
    ]

    const flowSlots = [
      { id: 'flow-0', chainId: 1, label: 'A', color: '#2563eb', muted: false, solo: false, dryWetMix: 100 },
      { id: 'flow-1', chainId: 2, label: 'B', color: '#60a5fa', muted: false, solo: false, dryWetMix: 100 },
    ]
    const routing = {
      mode: 'parallel_blend' as const,
      activeSlotId: 'flow-0',
      blendPositions: {},
      morphProgress: 0.5,
      morphSourceSlotId: null,
      morphTargetSlotId: null,
      seriesOrder: [],
    }

    const projections = buildSnapshotEditorLiveChainProjection(chains, flowSlots)
    const model = buildAudioTableLiveGraphModel({
      chains,
      flowSlots,
      routing,
      projections,
      selectedPluginTargetKey: null,
    })

    expect(projections.map((projection) => projection.chainId)).toEqual([1, 3])
    expect(model.livePathCount).toBe(1)
    expect(model.degradedPathCount).toBe(1)
    expect(model.syntheticPathCount).toBe(1)
    expect(model.nodes.some((node) => node.data.label === 'Delay')).toBe(false)
    expect(model.nodes.some((node) => node.data.label === 'Chorus')).toBe(true)
  })

  it('marks the routing node as workspace-derived and preserves duplicate-safe plugin targeting metadata', () => {
    const chains = [
      {
        id: 11,
        name: 'Primary',
        is_active: true,
        created_at: '',
        updated_at: '',
        plugins: [
          { uri: 'urn:test:delay', name: 'Delay', position: 0, bypassed: false, parameters: { time: 0.3 }, instance_id: 501 },
          { uri: 'urn:test:delay', name: 'Delay', position: 1, bypassed: false, parameters: { time: 0.6 }, instance_id: 777 },
        ],
        loop_insertions: [],
        effects_loops: [],
        runtime_sync: {
          enabled: true,
          status: 'active',
          warnings: [],
          runtime_items: 2,
          restored_positions: [],
          missing_positions: [],
        },
      },
    ]

    const flowSlots = [
      { id: 'flow-0', chainId: 11, label: 'A', color: '#2563eb', muted: false, solo: false, dryWetMix: 100 },
    ]
    const routing = {
      mode: 'series' as const,
      activeSlotId: 'flow-0',
      blendPositions: {},
      morphProgress: 0,
      morphSourceSlotId: null,
      morphTargetSlotId: null,
      seriesOrder: [],
    }

    const selectedPluginTargetKey = buildAudioTablePluginTargetKey({
      chainId: 11,
      pluginUri: 'urn:test:delay',
      pluginPosition: 1,
      instanceId: 777,
    })
    const model = buildAudioTableLiveGraphModel({
      chains,
      flowSlots,
      routing,
      projections: buildSnapshotEditorLiveChainProjection(chains, flowSlots),
      selectedPluginTargetKey,
    })

    const routingNode = model.nodes.find((node) => node.data.kind === 'routing')
    const selectedPluginNode = model.nodes.find((node) => node.data.kind === 'plugin' && node.data.selected)

    expect(routingNode?.data.label).toBe('Series')
    expect(routingNode?.data.caption).toBe('Workspace-derived final routing stage')
    expect(model.routingTruthLabel).toBe('Workspace only')
    expect(selectedPluginNode?.data.pluginTarget?.instanceId).toBe(777)
    expect(selectedPluginNode?.data.pluginTarget?.rowAnchorId).toContain('flow-0')
    expect(selectedPluginNode?.data.pluginTarget?.pluginPosition).toBe(1)
  })
})
