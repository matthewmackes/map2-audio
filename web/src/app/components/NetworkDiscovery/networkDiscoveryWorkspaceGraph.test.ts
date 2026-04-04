import { buildNetworkDiscoveryWorkspaceGraphModel } from './networkDiscoveryWorkspaceGraph'

describe('buildNetworkDiscoveryWorkspaceGraphModel', () => {
  it('builds source, fabric, and peer nodes from discovery records', () => {
    const model = buildNetworkDiscoveryWorkspaceGraphModel({
      sourceNode: {
        node_id: 'node-local',
        hostname: 'rack-local',
        display_label: 'Primary',
        role: 'all_in_one',
        status: 'ok',
        cpu_percent: 18,
        memory_percent: 35,
        xrun_count: 0,
        audio_latency_ms: 2.7,
        services: {
          backend: true,
          juce_engine: true,
          pipewire: true,
        },
        last_seen: '2026-04-03T22:00:00Z',
        is_local: true,
        is_viewed: true,
      },
      records: [
        {
          id: 'node-b',
          label: 'rack-b',
          hostname: 'rack-b',
          host: '10.0.0.20',
          nodeMode: 'MANAGEMENT-NODE',
          isOnline: true,
          visibilityState: 'managed-online',
          registrationRequired: false,
          routingReady: true,
          latencyMs: 3.1,
          discoverySources: ['heartbeat', 'registry'],
        },
      ],
      selectedPeerId: 'node-b',
    })

    expect(model.nodes.find((node) => node.id === 'network-discovery-workspace:source')?.data.label).toContain('rack-local')
    expect(model.nodes.find((node) => node.id === 'network-discovery-workspace:node-b')?.data.selected).toBe(true)
    expect(model.edges).toHaveLength(2)
    expect(model.summaryTags[0]).toEqual({ label: '1 peers online', type: 'green' })
  })
})
