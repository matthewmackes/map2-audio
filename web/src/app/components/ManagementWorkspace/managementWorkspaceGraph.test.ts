import { buildManagementWorkspaceGraphModel } from './managementWorkspaceGraph'

describe('buildManagementWorkspaceGraphModel', () => {
  it('builds a hub node, service nodes, and summary tags from management rows', () => {
    const model = buildManagementWorkspaceGraphModel({
      selectedNode: {
        node_id: 'node-local',
        hostname: 'rack-local',
        display_label: 'Primary',
        role: 'all_in_one',
        status: 'ok',
        cpu_percent: 23,
        memory_percent: 41,
        xrun_count: 0,
        audio_latency_ms: 3.4,
        services: {
          backend: true,
          juce_engine: true,
          pipewire: true,
        },
        last_seen: '2026-04-03T22:00:00Z',
        is_local: true,
        is_viewed: true,
      },
      tableRows: [
        {
          id: 'backend',
          name: 'Backend API',
          status: 'healthy',
          metric1: '23%',
          metric2: '41%',
          alerts: 'Clear',
        },
        {
          id: 'update',
          name: 'Update System',
          status: 'warning',
          metric1: 'Question 4/10',
          metric2: 'Applying payload',
          alerts: 'Update in progress',
        },
      ],
      summaryMetrics: [
        {
          id: 'node',
          label: 'Node',
          value: 'rack-local',
          helper: 'node-local',
          tone: 'healthy',
        },
      ],
      selectedRowId: 'update',
    })

    expect(model.nodes.find((node) => node.id === 'management-workspace:hub')?.data.label).toContain('rack-local')
    expect(model.nodes.find((node) => node.id === 'management-workspace:update')?.data.selected).toBe(true)
    expect(model.edges).toHaveLength(2)
    expect(model.summaryTags).toEqual([{ label: 'Node: rack-local', type: 'green' }])
  })
})
