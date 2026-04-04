import { buildClusterDashboardWorkspaceGraphModel } from './clusterDashboardWorkspaceGraph'

describe('buildClusterDashboardWorkspaceGraphModel', () => {
  it('builds a graph-first cluster model with peer latency edges and selected node anchors', () => {
    const model = buildClusterDashboardWorkspaceGraphModel({
      nodes: [
        {
          node_id: 'node-local',
          hostname: 'local-rack',
          display_label: 'Stage',
          role: 'all_in_one',
          status: 'ok',
          cpu_percent: 28,
          memory_percent: 44,
          xrun_count: 0,
          audio_latency_ms: 2.3,
          services: { backend: true, juce_engine: true, pipewire: true },
          last_seen: '2026-04-03T22:00:00.000Z',
          is_local: true,
          is_viewed: false,
        },
        {
          node_id: 'node-remote',
          hostname: 'remote-rack',
          display_label: null,
          role: 'audio_node',
          status: 'warn',
          cpu_percent: 66,
          memory_percent: 72,
          xrun_count: 2,
          audio_latency_ms: 4.6,
          services: { backend: true, juce_engine: true, pipewire: false },
          last_seen: '2026-04-03T22:00:04.000Z',
          is_local: false,
          is_viewed: true,
        },
      ],
      audioEdges: [
        {
          source_node_id: 'node-local',
          dest_node_id: 'node-remote',
          stream_type: 'avb',
          active: true,
        },
      ],
      networkEdges: [
        {
          source_node_id: 'node-local',
          dest_node_id: 'node-remote',
          latency_ms: 3.2,
        },
      ],
      selectedNodeId: 'node-remote',
      viewedNodeId: 'node-remote',
      deploymentMode: 'ALL-IN-ONE',
    })

    expect(model.summaryTags).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: '2/2 online', type: 'green' }),
      expect.objectContaining({ label: '1 peer latency link', type: 'green' }),
      expect.objectContaining({ label: '1 active audio path', type: 'green' }),
      expect.objectContaining({ label: 'XRuns 2', type: 'red' }),
    ]))
    expect(model.pulseCopy).toMatch(/Animated peer edges reflect live audio path volume/i)
    expect(model.nodes.find((node) => node.id === 'cluster-dashboard-workspace:fabric')?.data.anchorId).toBe('cluster-dashboard-nodes')
    expect(model.nodes.find((node) => node.id === 'node:node-remote')?.data.selected).toBe(true)
    expect(model.edges.some((edge) => edge.animated && edge.label.includes('3.2 ms'))).toBe(true)
  })
})
