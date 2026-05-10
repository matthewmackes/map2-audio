/**
 * T2500-MV-C2 — layout adapter unit tests.
 */

import {
  buildMidiVisualizationLayout,
  edgeKey,
  type MidiVisualizationEdgeData,
  type MidiVisualizationNodeData,
} from './midiVisualizationLayout'
import type { MidiVisualizationTopology } from './midiVisualizationTypes'

function emptyMaps() {
  return {
    edgeActivity: new Map<string, MidiVisualizationEdgeData>(),
    nodeActivity: new Map<string, MidiVisualizationNodeData>(),
  }
}

describe('buildMidiVisualizationLayout', () => {
  it('returns empty arrays for an empty topology', () => {
    const result = buildMidiVisualizationLayout({
      topology: { nodes: [], edges: [] },
      ...emptyMaps(),
    })
    expect(result).toEqual({ nodes: [], edges: [] })
  })

  it('produces three left-to-right columns for one node per tier', () => {
    const topology: MidiVisualizationTopology = {
      nodes: [
        { id: 'device:p1', kind: 'device', label: 'Port 1', raw: {} },
        { id: 'mapping:m1', kind: 'mapping', label: 'Map 1', raw: {} },
        {
          id: 'target:audio.snapshot.recall',
          kind: 'target',
          label: 'snapshot.recall',
          raw: {},
        },
      ],
      edges: [
        { source: 'device:p1', target: 'mapping:m1' },
        { source: 'mapping:m1', target: 'target:audio.snapshot.recall' },
      ],
    }
    const result = buildMidiVisualizationLayout({
      topology,
      ...emptyMaps(),
    })
    const byId = new Map(result.nodes.map((n) => [n.id, n]))
    const dx = byId.get('device:p1')!.position.x
    const mx = byId.get('mapping:m1')!.position.x
    const tx = byId.get('target:audio.snapshot.recall')!.position.x
    // Strictly increasing x → device < mapping < target columns.
    expect(dx).toBeLessThan(mx)
    expect(mx).toBeLessThan(tx)
  })

  it('strips rank-anchor nodes from the rendered output', () => {
    const result = buildMidiVisualizationLayout({
      topology: {
        nodes: [
          { id: 'device:p1', kind: 'device', label: 'p1', raw: {} },
          { id: 'mapping:m1', kind: 'mapping', label: 'm1', raw: {} },
        ],
        edges: [{ source: 'device:p1', target: 'mapping:m1' }],
      },
      ...emptyMaps(),
    })
    expect(
      result.nodes.every((n) => !n.id.startsWith('__rank_anchor__')),
    ).toBe(true)
    expect(
      result.edges.every((e) => !e.id.startsWith('__rank_anchor__')),
    ).toBe(true)
  })

  it('forces tier rank even when a node has no organic edges', () => {
    // An orphan target with no inbound mapping edge would otherwise
    // sit in dagre rank 0; the anchor edge keeps it in column 3.
    const result = buildMidiVisualizationLayout({
      topology: {
        nodes: [
          { id: 'device:p1', kind: 'device', label: 'p1', raw: {} },
          { id: 'target:orphan', kind: 'target', label: 'orphan', raw: {} },
        ],
        edges: [],
      },
      ...emptyMaps(),
    })
    const byId = new Map(result.nodes.map((n) => [n.id, n]))
    expect(byId.get('device:p1')!.position.x).toBeLessThan(
      byId.get('target:orphan')!.position.x,
    )
  })

  it('threads activity data through to node + edge data', () => {
    const nodeActivity = new Map<string, MidiVisualizationNodeData>()
    nodeActivity.set('device:p1', {
      kind: 'device',
      label: 'p1',
      raw: {},
      lastEventAt: 1234,
      rateHz: 5.5,
      recentEvents: [],
    })
    const edgeActivity = new Map<string, MidiVisualizationEdgeData>()
    edgeActivity.set(edgeKey('device:p1', 'mapping:m1'), {
      rateHz: 12,
      lastEventAt: 5678,
      totalEvents: 99,
    })

    const result = buildMidiVisualizationLayout({
      topology: {
        nodes: [
          { id: 'device:p1', kind: 'device', label: 'p1', raw: {} },
          { id: 'mapping:m1', kind: 'mapping', label: 'm1', raw: {} },
        ],
        edges: [{ source: 'device:p1', target: 'mapping:m1' }],
      },
      edgeActivity,
      nodeActivity,
    })
    const dev = result.nodes.find((n) => n.id === 'device:p1')!
    expect(dev.data.lastEventAt).toBe(1234)
    expect(dev.data.rateHz).toBe(5.5)
    const e = result.edges[0]
    expect(e.data!.rateHz).toBe(12)
    expect(e.data!.totalEvents).toBe(99)
  })
})

describe('edgeKey', () => {
  it('produces a deterministic source=>target key', () => {
    expect(edgeKey('a', 'b')).toBe('a=>b')
    expect(edgeKey('a', 'b')).toBe(edgeKey('a', 'b'))
  })
})
