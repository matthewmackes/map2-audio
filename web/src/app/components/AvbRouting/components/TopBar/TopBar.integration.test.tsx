import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TopBar } from './TopBar'
import { RoutingProvider, useFilteredEndpoints, useRouting, useRoutingState } from '../../context/RoutingContext'
import { initialRoutingState } from '../../types'
import type { AvbNode, ConnectionsResponse, Endpoint, EndpointsResponse, Route, RoutingAction } from '../../types'

let mockEndpointsData: EndpointsResponse | undefined
let mockConnectionsData: ConnectionsResponse | undefined
let mockNodesData: AvbNode[] | undefined
let mockLocalNodeId = 'node-a'
let mockAvbDevicesData: any
let mockAvbStreamsData: any

const mockBatchMutate = jest.fn()
const mockNotify = {
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
}
let topBarSceneSyncDispatch: React.Dispatch<RoutingAction> | null = null

jest.mock('../../hooks/useAvbApi', () => ({
  useEndpoints: () => ({
    data: mockEndpointsData,
    isLoading: false,
    error: null,
  }),
  useConnections: () => ({
    data: mockConnectionsData,
    isLoading: false,
    error: null,
  }),
  useBatchPatchMutation: () => ({
    mutate: mockBatchMutate,
    isPending: false,
  }),
  useAvbDevices: () => ({
    data: mockAvbDevicesData,
  }),
  useAvbStreams: () => ({
    data: mockAvbStreamsData,
  }),
}))

jest.mock('../../hooks/useNodeApi', () => ({
  useNodes: () => ({
    data: mockNodesData,
    isLoading: false,
    error: null,
  }),
  usePtpStatus: () => ({
    data: undefined,
  }),
  useLocalNodeId: () => mockLocalNodeId,
}))

jest.mock('../../hooks/useNotifications', () => ({
  useNotifications: () => mockNotify,
}))

jest.mock('./NodeSelector', () => ({
  NodeSelector: () => <div data-testid="mock-node-selector">node-selector</div>,
}))

jest.mock('../NetworkTopology/NetworkTopologyModal', () => ({
  NetworkTopologyModal: () => null,
}))

function makeEndpoint(overrides: Partial<Endpoint>): Endpoint {
  return {
    endpoint_id: 'endpoint-1',
    entity_id: '001122fffe334455',
    unique_id: 1,
    direction: 'talker',
    device_type: 'map2',
    device_name: 'Endpoint',
    channels: 2,
    sample_rate: 48000,
    format: '24-bit PCM',
    mac_address: '00:11:22:33:44:55',
    node_address: 'http://127.0.0.1:8080',
    available: true,
    last_seen: '2026-02-17T00:00:00Z',
    node_id: 'node-a',
    tags: [],
    color: '#ffffff',
    group: 'Default',
    bank: 0,
    pinned: false,
    locked: false,
    ...overrides,
  }
}

function makeNode(overrides: Partial<AvbNode>): AvbNode {
  return {
    node_id: 'node-a',
    name: 'Node A',
    type: 'map2_local',
    status: 'online',
    capabilities: {
      talker: true,
      listener: true,
      avdecc_controller: true,
      audio_processing: true,
      remote_control: true,
      max_talkers: 8,
      max_listeners: 8,
      sample_rates: [48000, 96000],
      formats: ['24-bit PCM'],
    },
    ptp: null,
    health: null,
    address: '192.168.1.10',
    api_url: 'http://192.168.1.10:8080',
    entity_id: null,
    talker_count: 0,
    listener_count: 0,
    active_routes: 0,
    version: '3.0.0',
    manufacturer: 'MAP2',
    model: 'Node',
    discovered_at: '2026-02-17T00:00:00Z',
    last_seen: '2026-02-17T00:00:00Z',
    color: '#00aaff',
    pinned: false,
    notes: '',
    ...overrides,
  }
}

function makeSceneRoute(talker_id: string, listener_id: string): Route {
  return {
    id: `${talker_id}→${listener_id}`,
    talker_id,
    listener_id,
    state: 'connected',
    established_time: '2026-02-17T00:00:00Z',
    error_message: null,
    connection_count: 1,
    srp_reservation_id: null,
    srp_admission_id: null,
    locked: false,
    valid: true,
    messages: [],
    cross_node: false,
  }
}

function TopBarFilterProbe() {
  const state = useRoutingState()
  const orderedEndpointIds = useFilteredEndpoints()
    .map((endpoint) => endpoint.endpoint_id)
    .join('|') || 'none'
  const endpointIds = orderedEndpointIds
    .split('|')
    .filter((id) => id.length > 0 && id !== 'none')
    .sort()
    .join('|') || 'none'
  const selectedNodeIds = [...state.network.nodeSelection.selected_node_ids].sort().join('|') || 'none'

  return (
    <div>
      <span data-testid="probe-view-mode">{state.network.nodeSelection.view_mode}</span>
      <span data-testid="probe-selected-node-ids">{selectedNodeIds}</span>
      <span data-testid="probe-endpoint-ids">{endpointIds}</span>
      <span data-testid="probe-endpoint-order">{orderedEndpointIds}</span>
    </div>
  )
}

function TopBarSceneDiffPreviewLifecycleProbe() {
  const state = useRoutingState()
  const previewLifecycleEntries = state.auditLog.filter((entry) => (
    entry.event_type === 'SCENE_DIFF' &&
    typeof entry.payload.mode === 'string' &&
    entry.payload.mode.startsWith('preset_import_preview_')
  ))
  const previewLifecycleSummary = previewLifecycleEntries
    .map((entry) => {
      const phase = typeof entry.payload.phase === 'string' ? entry.payload.phase : 'unknown'
      const reason = typeof entry.payload.reason === 'string' ? entry.payload.reason : 'none'
      return `${phase}:${reason}`
    })
    .join('|') || 'none'
  const previewLifecycleCountSummary = previewLifecycleEntries
    .map((entry) => {
      const phase = typeof entry.payload.phase === 'string' ? entry.payload.phase : 'unknown'
      const reason = typeof entry.payload.reason === 'string' ? entry.payload.reason : 'none'
      const sourceCount = typeof entry.payload.source_count === 'number' ? entry.payload.source_count : 'none'
      const acceptedCount = typeof entry.payload.accepted_count === 'number' ? entry.payload.accepted_count : 'none'
      const conflictCount = typeof entry.payload.conflict_count === 'number' ? entry.payload.conflict_count : 'none'
      const skippedCount = typeof entry.payload.skipped_count === 'number' ? entry.payload.skipped_count : 'none'
      return `${phase}:${reason}:${sourceCount}:${acceptedCount}:${conflictCount}:${skippedCount}`
    })
    .join('|') || 'none'
  const cancelledReasons = previewLifecycleEntries
    .filter((entry) => entry.payload.phase === 'cancelled')
    .map((entry) => (typeof entry.payload.reason === 'string' ? entry.payload.reason : 'none'))
    .join('|') || 'none'

  return (
    <div>
      <span data-testid="probe-scene-diff-preview-lifecycle-count">{String(previewLifecycleEntries.length)}</span>
      <span data-testid="probe-scene-diff-preview-lifecycle-summary">{previewLifecycleSummary}</span>
      <span data-testid="probe-scene-diff-preview-lifecycle-count-summary">{previewLifecycleCountSummary}</span>
      <span data-testid="probe-scene-diff-preview-cancelled-reasons">{cancelledReasons}</span>
    </div>
  )
}

function TopBarRemoteSceneSyncProbe() {
  const { state, dispatch } = useRouting()

  React.useEffect(() => {
    topBarSceneSyncDispatch = dispatch
    return () => {
      if (topBarSceneSyncDispatch === dispatch) {
        topBarSceneSyncDispatch = null
      }
    }
  }, [dispatch])

  const sceneEntries = Object.values(state.scenes)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
  const sceneSummary = sceneEntries.map((scene) => `${scene.name}:${scene.id}`).join('|') || 'none'
  const baselineSceneId = state.sceneDiff.baseline_scene_id
  const compareSceneId = state.sceneDiff.compare_scene_id
  const baselineSceneName = baselineSceneId ? (state.scenes[baselineSceneId]?.name || 'missing') : 'none'
  const compareSceneName = compareSceneId ? (state.scenes[compareSceneId]?.name || 'missing') : 'none'
  const selectionValidity = !baselineSceneId || !compareSceneId
    ? 'incomplete'
    : (!state.scenes[baselineSceneId] || !state.scenes[compareSceneId] ? 'stale' : 'ready')
  const previewSummary = state.sceneDiff.preview ? String(state.sceneDiff.preview.total_changes) : 'none'
  const presetSummary = (state.sceneDiff.presets || [])
    .map((preset) => `${preset.name}:${preset.baseline_scene_id}->${preset.compare_scene_id}`)
    .join('|') || 'none'
  const activePreset = state.sceneDiff.active_preset_id || 'none'
  const sceneOperationEntries = state.auditLog.filter((entry) => (
    entry.event_type === 'SAVE_SCENE' ||
    entry.event_type === 'RECALL_SCENE' ||
    entry.event_type === 'DELETE_SCENE' ||
    entry.event_type === 'UPDATE_SCENE'
  ))
  const sceneAuditWarnings = sceneOperationEntries.filter((entry) => entry.validation_outcome === 'warning').length
  const sceneAuditErrors = sceneOperationEntries.filter((entry) => entry.validation_outcome === 'error').length
  const sceneAuditDeletes = sceneOperationEntries.filter((entry) => entry.event_type === 'DELETE_SCENE').length
  const sceneAuditSequence = sceneOperationEntries.map((entry) => entry.event_type).join('|') || 'none'

  return (
    <div>
      <span data-testid="topbar-probe-scene-sync-scenes">{sceneSummary}</span>
      <span data-testid="topbar-probe-scene-sync-baseline">{baselineSceneName}</span>
      <span data-testid="topbar-probe-scene-sync-compare">{compareSceneName}</span>
      <span data-testid="topbar-probe-scene-sync-selection-validity">{selectionValidity}</span>
      <span data-testid="topbar-probe-scene-sync-preview-summary">{previewSummary}</span>
      <span data-testid="topbar-probe-scene-sync-preset-summary">{presetSummary}</span>
      <span data-testid="topbar-probe-scene-sync-active-preset">{activePreset}</span>
      <span data-testid="topbar-probe-scene-sync-audit-sequence">{sceneAuditSequence}</span>
      <span data-testid="topbar-probe-scene-sync-audit-warnings">{String(sceneAuditWarnings)}</span>
      <span data-testid="topbar-probe-scene-sync-audit-errors">{String(sceneAuditErrors)}</span>
      <span data-testid="topbar-probe-scene-sync-audit-deletes">{String(sceneAuditDeletes)}</span>
    </div>
  )
}

describe('TopBar filter controls provider integration', () => {
  beforeEach(() => {
    mockEndpointsData = undefined
    mockConnectionsData = undefined
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]
    mockLocalNodeId = 'node-a'
    mockBatchMutate.mockReset()
    mockNotify.success.mockReset()
    mockNotify.error.mockReset()
    mockNotify.warning.mockReset()
    mockNotify.info.mockReset()
    topBarSceneSyncDispatch = null
    mockAvbDevicesData = {
      available: true,
      count: 2,
      device_names: ['AVB Listener [eth0]', 'AVB Talker [eth0]'],
      discovered_count: 2,
      discovered_devices: [],
    }
    mockAvbStreamsData = {
      available: true,
      streams: [],
    }
  })

  it('renders AVB engine/cache/transport chips from backend inventory hooks', async () => {
    const endpointA = makeEndpoint({
      endpoint_id: 'endpoint-a',
      node_id: 'node-a',
      direction: 'talker',
    })
    const endpointB = makeEndpoint({
      endpoint_id: 'endpoint-b',
      node_id: 'node-b',
      direction: 'listener',
    })

    mockAvbDevicesData = {
      available: true,
      count: 4,
      device_names: [
        'AVB Listener [eth0]',
        'AVB Talker [eth0]',
        'AVB Talker [node-a::endpoint-a]',
        'AVB Listener [node-b::endpoint-b]',
      ],
      discovered_count: 3,
      discovered_devices: [
        {
          endpoint_id: 'endpoint-a',
          device_name: 'AVB Talker [node-a::endpoint-a]',
          direction: 'talker',
          device_type: 'map2',
          node_address: 'http://127.0.0.1:8080',
          audio_format: '24-bit PCM',
          channels: 2,
          sample_rate: 48000,
          available: true,
        },
        {
          endpoint_id: 'endpoint-z',
          device_name: 'AVB Listener [node-z::endpoint-z]',
          direction: 'listener',
          device_type: 'map2',
          node_address: 'http://127.0.0.1:8081',
          audio_format: '24-bit PCM',
          channels: 2,
          sample_rate: 48000,
          available: true,
        },
        {
          endpoint_id: 'endpoint-b',
          device_name: 'AVB Listener [node-b::endpoint-b]',
          direction: 'listener',
          device_type: 'map2',
          node_address: 'http://127.0.0.1:8082',
          audio_format: '24-bit PCM',
          channels: 2,
          sample_rate: 48000,
          available: true,
        },
      ],
    }
    mockAvbStreamsData = {
      available: true,
      streams: [
        {
          stream_id: 'stream-ready',
          state: 'running',
          health: { ready: true },
          diagnostics: {
            effective_config: {
              stream_id: 'stream-ready',
              direction: 'talker',
              interface: 'eth0',
              channels: 2,
              sample_rate: 48000,
              buffer_size: 256,
              presentation_offset_us: 2000,
              priority: 3,
              dest_mac: null,
              failover_policy: 'none',
              interface_candidates: ['eth0'],
            },
            ptp_lock: {
              locked: true,
              state: 'SLAVE',
              reason: null,
              offset_ns: 10,
              mean_path_delay_ns: 20,
              last_update: '2026-02-20T00:00:00Z',
            },
            tsn_qdisc: {
              available: true,
              interface: 'eth0',
              mqprio_configured: true,
              cbs_configured: true,
              etf_configured: true,
              vlan_configured: true,
              error: null,
            },
            srp: {
              enabled: true,
              required: true,
              bound: true,
              reservation_id: 'res-1',
              admission_id: 'adm-1',
              metadata: {},
            },
          },
        },
        {
          stream_id: 'stream-issue',
          state: 'running',
          health: { ready: false },
          diagnostics: {
            effective_config: {
              stream_id: 'stream-issue',
              direction: 'listener',
              interface: 'eth0',
              channels: 2,
              sample_rate: 48000,
              buffer_size: 256,
              presentation_offset_us: 2000,
              priority: 3,
              dest_mac: null,
              failover_policy: 'none',
              interface_candidates: ['eth0'],
            },
            ptp_lock: {
              locked: false,
              state: 'LISTENING',
              reason: 'PTP_STATE_LISTENING',
              offset_ns: null,
              mean_path_delay_ns: null,
              last_update: null,
            },
            tsn_qdisc: {
              available: false,
              interface: 'eth0',
              mqprio_configured: false,
              cbs_configured: false,
              etf_configured: false,
              vlan_configured: false,
              error: 'TSN unavailable',
            },
            srp: {
              enabled: true,
              required: true,
              bound: false,
              reservation_id: null,
              admission_id: null,
              metadata: {},
            },
          },
        },
      ],
    }

    const initialState = {
      ...initialRoutingState,
      endpoints: {
        [endpointA.endpoint_id]: endpointA,
        [endpointB.endpoint_id]: endpointB,
      },
    }

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('topbar-avb-engine-summary').textContent).toBe('Engine: 4/3')
      expect(screen.getByTestId('topbar-avb-cache-drift').textContent).toBe('Cache Drift: 0|1')
      expect(screen.getByTestId('topbar-avb-transport-summary').textContent).toBe('Transport: 1/2')
      expect(screen.getByTestId('topbar-avb-transport-issues').textContent).toBe('Issues: 1')
      expect(screen.getByTestId('topbar-avb-diagnostics-summary').textContent).toBe('Diag: 2/2')
      expect(screen.getByTestId('topbar-avb-ptp-lock-summary').textContent).toBe('PTP Lock: 1/2')
      expect(screen.getByTestId('topbar-avb-srp-summary').textContent).toBe('SRP: 1/2')
      expect(screen.getByTestId('topbar-avb-failover-summary').textContent).toBe('Failover: none (2)')
    })
  })

  it('updates filtered endpoint output under multi-select node context when TopBar filters change', async () => {
    const endpointA = makeEndpoint({
      endpoint_id: 'endpoint-a',
      node_id: 'node-a',
      device_type: 'map2',
      sample_rate: 48000,
      channels: 2,
      group: 'Stage',
      host: 'stage.local',
      available: true,
      locked: false,
    })
    const endpointB = makeEndpoint({
      endpoint_id: 'endpoint-b',
      node_id: 'node-b',
      direction: 'listener',
      device_type: 'avdecc',
      sample_rate: 96000,
      channels: 8,
      group: 'FOH',
      host: 'foh.local',
      available: false,
      locked: true,
    })
    const endpointC = makeEndpoint({
      endpoint_id: 'endpoint-c',
      node_id: 'node-c',
      device_type: 'map2',
      sample_rate: 48000,
      channels: 2,
      group: 'Aux',
      host: 'aux.local',
      available: true,
      locked: false,
    })

    const initialState = {
      ...initialRoutingState,
      network: {
        ...initialRoutingState.network,
        nodeSelection: {
          ...initialRoutingState.network.nodeSelection,
          view_mode: 'multi_select' as const,
          selected_node_ids: ['node-a', 'node-b'],
          show_offline: true,
        },
      },
      endpoints: {
        [endpointA.endpoint_id]: endpointA,
        [endpointB.endpoint_id]: endpointB,
        [endpointC.endpoint_id]: endpointC,
      },
    }

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
        <TopBarFilterProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('probe-view-mode').textContent).toBe('multi_select')
      expect(screen.getByTestId('probe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('probe-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b')
    })

    fireEvent.click(screen.getByTestId('topbar-filters-button'))

    fireEvent.click(screen.getByTestId('topbar-filter-available-only'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-ids').textContent).toBe('endpoint-a')
    })

    fireEvent.click(screen.getByTestId('topbar-filter-available-only'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b')
    })

    fireEvent.click(screen.getByTestId('topbar-filter-sample-96000'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-ids').textContent).toBe('endpoint-b')
    })

    fireEvent.click(screen.getByTestId('topbar-filter-channels-8'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-ids').textContent).toBe('endpoint-b')
    })

    fireEvent.click(screen.getByTestId('topbar-filter-group-foh'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-ids').textContent).toBe('endpoint-b')
    })

    fireEvent.click(screen.getByTestId('topbar-filter-host-foh-local'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-ids').textContent).toBe('endpoint-b')
    })

    fireEvent.click(screen.getByTestId('topbar-filter-direction-listener'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-ids').textContent).toBe('endpoint-b')
    })

    fireEvent.click(screen.getByTestId('topbar-filter-quality-critical'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-ids').textContent).toBe('endpoint-b')
    })

    fireEvent.click(screen.getByTestId('topbar-filter-show-locked'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-ids').textContent).toBe('none')
    })

    fireEvent.click(screen.getByTestId('topbar-filters-clear-all'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b')
    })
  })

  it('toggles endpoint-issues quick chip and keeps filtered endpoint output aligned', async () => {
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'degraded' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]

    const endpointA = makeEndpoint({
      endpoint_id: 'endpoint-a',
      node_id: 'node-a',
      available: true,
      locked: false,
    })
    const endpointB = makeEndpoint({
      endpoint_id: 'endpoint-b',
      node_id: 'node-b',
      available: true,
      locked: false,
    })
    const endpointC = makeEndpoint({
      endpoint_id: 'endpoint-c',
      node_id: 'node-c',
      available: true,
      locked: false,
    })

    const initialState = {
      ...initialRoutingState,
      network: {
        ...initialRoutingState.network,
        nodeSelection: {
          ...initialRoutingState.network.nodeSelection,
          view_mode: 'multi_select' as const,
          selected_node_ids: ['node-a', 'node-b'],
          show_offline: true,
        },
      },
      endpoints: {
        [endpointA.endpoint_id]: endpointA,
        [endpointB.endpoint_id]: endpointB,
        [endpointC.endpoint_id]: endpointC,
      },
    }

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
        <TopBarFilterProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('topbar-endpoint-issues-filter-chip').textContent).toBe('Endpoint Issues: 1')
      expect(screen.getByTestId('probe-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b')
      expect(screen.getByTestId('topbar-filter-summary').textContent).toContain('No filters')
    })

    fireEvent.click(screen.getByTestId('topbar-endpoint-issues-filter-chip'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-ids').textContent).toBe('endpoint-b')
      expect(screen.getByTestId('topbar-filter-summary').textContent).toContain('1 filter')
    })

    fireEvent.click(screen.getByTestId('topbar-endpoint-issues-filter-chip'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b')
      expect(screen.getByTestId('topbar-filter-summary').textContent).toContain('No filters')
    })
  })

  it('keeps deterministic endpoint ordering when combining search text with expanded filters in multi-select mode', async () => {
    const endpointA = makeEndpoint({
      endpoint_id: 'endpoint-a',
      node_id: 'node-a',
      device_name: 'Zulu Vox',
      device_type: 'map2',
      sample_rate: 48000,
      channels: 2,
      group: 'Stage',
      pinned: false,
    })
    const endpointB = makeEndpoint({
      endpoint_id: 'endpoint-b',
      node_id: 'node-b',
      device_name: 'Alpha Vox',
      device_type: 'avdecc',
      sample_rate: 96000,
      channels: 8,
      group: 'FOH',
      pinned: false,
    })
    const endpointC = makeEndpoint({
      endpoint_id: 'endpoint-c',
      node_id: 'node-b',
      device_name: 'Bravo Vox',
      device_type: 'map2',
      sample_rate: 96000,
      channels: 8,
      group: 'FOH',
      pinned: true,
    })
    const endpointD = makeEndpoint({
      endpoint_id: 'endpoint-d',
      node_id: 'node-c',
      device_name: 'Alpha Vox Remote',
      device_type: 'map2',
      sample_rate: 96000,
      channels: 8,
      group: 'FOH',
      pinned: true,
    })

    const initialState = {
      ...initialRoutingState,
      network: {
        ...initialRoutingState.network,
        nodeSelection: {
          ...initialRoutingState.network.nodeSelection,
          view_mode: 'multi_select' as const,
          selected_node_ids: ['node-a', 'node-b'],
          show_offline: true,
        },
      },
      endpoints: {
        [endpointA.endpoint_id]: endpointA,
        [endpointB.endpoint_id]: endpointB,
        [endpointC.endpoint_id]: endpointC,
        [endpointD.endpoint_id]: endpointD,
      },
    }

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
        <TopBarFilterProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-order').textContent).toBe('endpoint-c|endpoint-b|endpoint-a')
    })

    fireEvent.change(screen.getByTestId('topbar-search-input'), {
      target: { value: 'vox' },
    })
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-order').textContent).toBe('endpoint-c|endpoint-b|endpoint-a')
    })

    fireEvent.click(screen.getByTestId('topbar-filters-button'))

    fireEvent.click(screen.getByTestId('topbar-filter-sample-96000'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-order').textContent).toBe('endpoint-c|endpoint-b')
    })

    fireEvent.click(screen.getByTestId('topbar-filter-channels-8'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-order').textContent).toBe('endpoint-c|endpoint-b')
    })

    fireEvent.click(screen.getByTestId('topbar-filter-group-foh'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-order').textContent).toBe('endpoint-c|endpoint-b')
    })

    fireEvent.change(screen.getByTestId('topbar-search-input'), {
      target: { value: 'alpha' },
    })
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-order').textContent).toBe('endpoint-b')
    })

    fireEvent.click(screen.getByTestId('topbar-filters-clear-all'))
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-order').textContent).toBe('endpoint-b')
    })

    fireEvent.change(screen.getByTestId('topbar-search-input'), {
      target: { value: '' },
    })
    await waitFor(() => {
      expect(screen.getByTestId('probe-endpoint-order').textContent).toBe('endpoint-c|endpoint-b|endpoint-a')
      expect(screen.getByTestId('probe-selected-node-ids').textContent).toBe('node-a|node-b')
    })
  })

  it('drives scene diff preview generation and clear actions through TopBar controls with provider state', async () => {
    const talkerOne = makeEndpoint({
      endpoint_id: 'talker-1',
      direction: 'talker',
      unique_id: 11,
      device_name: 'Talker One',
    })
    const listenerOne = makeEndpoint({
      endpoint_id: 'listener-1',
      direction: 'listener',
      unique_id: 12,
      device_name: 'Listener One',
    })
    const talkerTwo = makeEndpoint({
      endpoint_id: 'talker-2',
      direction: 'talker',
      unique_id: 13,
      device_name: 'Talker Two',
    })
    const listenerTwo = makeEndpoint({
      endpoint_id: 'listener-2',
      direction: 'listener',
      unique_id: 14,
      device_name: 'Listener Two',
    })

    const baselineRoute = makeSceneRoute('talker-1', 'listener-1')
    const compareOnlyRoute = makeSceneRoute('talker-2', 'listener-2')

    const initialState = {
      ...initialRoutingState,
      endpoints: {
        [talkerOne.endpoint_id]: talkerOne,
        [listenerOne.endpoint_id]: listenerOne,
        [talkerTwo.endpoint_id]: talkerTwo,
        [listenerTwo.endpoint_id]: listenerTwo,
      },
      scenes: {
        'scene-a': {
          id: 'scene-a',
          name: 'Baseline Scene',
          description: '',
          routes: [baselineRoute],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
        'scene-b': {
          id: 'scene-b',
          name: 'Compare Scene',
          description: '',
          routes: [baselineRoute, compareOnlyRoute],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
      },
    }

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
      </RoutingProvider>
    )

    expect(screen.queryByTestId('scene-diff-preview')).toBeNull()

    fireEvent.click(screen.getByTestId('topbar-scene-diff-button'))

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Baseline Scene' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Baseline Scene' }))
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Compare Scene' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Compare Scene' }))
    fireEvent.click(screen.getByTestId('topbar-scene-diff-generate'))

    await waitFor(() => {
      expect(screen.getByTestId('scene-diff-preview')).toBeTruthy()
      expect(screen.getByTestId('scene-diff-preview-scope').textContent).toContain('Baseline Scene vs Compare Scene')
      expect(screen.getByTestId('scene-diff-preview-add-count').textContent).toContain('1 add')
      expect(screen.getByTestId('scene-diff-preview-remove-count').textContent).toContain('0 remove')
      expect(screen.getByTestId('scene-diff-preview-total-changes').textContent).toContain('Total changes: 1')
      expect(screen.getByTestId('scene-diff-preview-add-routes').textContent).toContain('Talker Two -> Listener Two')
    })

    expect(mockNotify.info).toHaveBeenCalledWith('Generated scene diff: Baseline Scene vs Compare Scene.')

    fireEvent.click(screen.getByTestId('topbar-scene-diff-clear'))

    await waitFor(() => {
      expect(screen.queryByTestId('scene-diff-preview')).toBeNull()
    })
  })

  it('supports scene diff preset save/apply and swap controls with provider state', async () => {
    const talkerOne = makeEndpoint({
      endpoint_id: 'talker-1',
      direction: 'talker',
      unique_id: 111,
      device_name: 'Talker One',
    })
    const listenerOne = makeEndpoint({
      endpoint_id: 'listener-1',
      direction: 'listener',
      unique_id: 112,
      device_name: 'Listener One',
    })
    const talkerTwo = makeEndpoint({
      endpoint_id: 'talker-2',
      direction: 'talker',
      unique_id: 113,
      device_name: 'Talker Two',
    })
    const listenerTwo = makeEndpoint({
      endpoint_id: 'listener-2',
      direction: 'listener',
      unique_id: 114,
      device_name: 'Listener Two',
    })

    const baselineRoute = makeSceneRoute('talker-1', 'listener-1')
    const compareOnlyRoute = makeSceneRoute('talker-2', 'listener-2')

    const initialState = {
      ...initialRoutingState,
      endpoints: {
        [talkerOne.endpoint_id]: talkerOne,
        [listenerOne.endpoint_id]: listenerOne,
        [talkerTwo.endpoint_id]: talkerTwo,
        [listenerTwo.endpoint_id]: listenerTwo,
      },
      scenes: {
        'scene-a': {
          id: 'scene-a',
          name: 'Baseline Scene',
          description: '',
          routes: [baselineRoute],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
        'scene-b': {
          id: 'scene-b',
          name: 'Compare Scene',
          description: '',
          routes: [baselineRoute, compareOnlyRoute],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
      },
    }

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
      </RoutingProvider>
    )

    fireEvent.click(screen.getByTestId('topbar-scene-diff-button'))
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Baseline Scene' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Baseline Scene' }))
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Compare Scene' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Compare Scene' }))

    fireEvent.change(screen.getByTestId('topbar-scene-diff-preset-name-input'), {
      target: { value: 'Ops Compare Pair' },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-save'))

    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-diff-preset-summary').textContent).toContain('1 preset')
      expect(screen.getByTestId('topbar-scene-diff-active-preset').textContent).toContain('Ops Compare Pair')
    })

    fireEvent.click(screen.getByTestId('topbar-scene-diff-swap'))

    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-status-baseline').textContent).toContain('Compare Scene')
      expect(screen.getByTestId('topbar-scene-status-compare').textContent).toContain('Baseline Scene')
    })

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Saved Preset' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Ops Compare Pair' }))
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-apply'))

    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-status-baseline').textContent).toContain('Baseline Scene')
      expect(screen.getByTestId('topbar-scene-status-compare').textContent).toContain('Compare Scene')
      expect(screen.getByTestId('scene-diff-preview-scope').textContent).toContain('Baseline Scene vs Compare Scene')
    })
  })

  it('round-trips imported per-row conflict-policy hints and supports policy reset before export', async () => {
    const route = makeSceneRoute('talker-1', 'listener-1')
    const initialState = {
      ...initialRoutingState,
      scenes: {
        'scene-a': {
          id: 'scene-a',
          name: 'Baseline Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
        'scene-b': {
          id: 'scene-b',
          name: 'Compare Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
      },
    }

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
      </RoutingProvider>
    )

    fireEvent.click(screen.getByTestId('topbar-scene-diff-button'))
    fireEvent.change(screen.getByTestId('topbar-scene-diff-preset-transfer-input'), {
      target: {
        value: JSON.stringify({
          schema_version: 1,
          preferred_conflict_action: 'upsert',
          presets: [
            {
              name: 'Imported Policy Preset',
              baseline_scene_id: 'scene-a',
              compare_scene_id: 'scene-b',
              preferred_conflict_action: 'rename',
            },
          ],
        }),
      },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))

    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-diff-import-preview-summary').textContent).toContain('1 source')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-row-conflict-policy-hint-row-1').textContent).toContain(
        'Conflict policy hint: rename (row override; wrapper default upsert)'
      )
    })

    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-import'))

    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-diff-preset-summary').textContent).toContain('1 preset')
      expect(screen.getByTestId('topbar-scene-diff-preset-policy-summary').textContent).toContain(
        'Imported Policy Preset: Rename'
      )
      expect(screen.getByTestId('topbar-scene-diff-selected-preset-policy').textContent).toContain(
        'Selected preset policy: none'
      )
    })

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Saved Preset' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Imported Policy Preset' }))
    expect(screen.getByRole('combobox', { name: 'Conflict Policy' }).textContent).toContain('Rename')
    expect(screen.getByTestId('topbar-scene-diff-selected-preset-policy').textContent).toContain(
      'Selected preset policy: Rename'
    )

    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-apply'))
    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-status-readiness').textContent).toContain('Diff selection ready')
    })

    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-conflict-policy-reset'))
    expect(screen.getByRole('combobox', { name: 'Conflict Policy' }).textContent).toContain('Upsert')

    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-save'))
    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-diff-preset-policy-summary').textContent).toContain(
        'Imported Policy Preset: Upsert'
      )
      expect(screen.getByTestId('topbar-scene-diff-selected-preset-policy').textContent).toContain(
        'Selected preset policy: Upsert'
      )
    })

    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-export'))
    const transferField = screen.getByTestId('topbar-scene-diff-preset-transfer-input') as HTMLInputElement
    expect(transferField.value).toContain('"schema_version": 1')
    expect(transferField.value).toContain('"preferred_conflict_action": "upsert"')
    expect(transferField.value).toContain('"name": "Imported Policy Preset"')
    expect(transferField.value).not.toContain('"preferred_conflict_action": "rename"')
  })

  it('keeps policy summary and draft conflict policy aligned through rapid preset switch/delete/reimport churn', async () => {
    const route = makeSceneRoute('talker-1', 'listener-1')
    const initialState = {
      ...initialRoutingState,
      scenes: {
        'scene-a': {
          id: 'scene-a',
          name: 'Baseline Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
        'scene-b': {
          id: 'scene-b',
          name: 'Compare Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
      },
      sceneDiff: {
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
        preview: null,
        presets: [
          {
            id: 'preset-rename',
            name: 'Preset Rename',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
            preferred_conflict_action: 'rename',
          },
          {
            id: 'preset-skip',
            name: 'Preset Skip',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
            preferred_conflict_action: 'skip',
          },
        ],
        active_preset_id: null,
      },
    }

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
      </RoutingProvider>
    )

    fireEvent.click(screen.getByTestId('topbar-scene-diff-button'))

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Saved Preset' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Preset Rename' }))
    expect(screen.getByRole('combobox', { name: 'Conflict Policy' }).textContent).toContain('Rename')
    expect(screen.getByTestId('topbar-scene-diff-selected-preset-policy').textContent).toContain(
      'Selected preset policy: Rename'
    )

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Saved Preset' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Preset Skip' }))
    expect(screen.getByRole('combobox', { name: 'Conflict Policy' }).textContent).toContain('Skip')
    expect(screen.getByTestId('topbar-scene-diff-selected-preset-policy').textContent).toContain(
      'Selected preset policy: Skip'
    )

    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-delete'))
    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-diff-preset-policy-summary').textContent).not.toContain(
        'Preset Skip: Skip'
      )
      expect(screen.getByTestId('topbar-scene-diff-selected-preset-policy').textContent).toContain(
        'Selected preset policy: none'
      )
    })

    fireEvent.change(screen.getByTestId('topbar-scene-diff-preset-transfer-input'), {
      target: {
        value: JSON.stringify([
          {
            name: 'Preset Skip',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            preferred_conflict_action: 'rename',
          },
        ]),
      },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-import'))

    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-diff-preset-policy-summary').textContent).toContain(
        'Preset Skip: Rename'
      )
    })

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Saved Preset' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Preset Skip' }))
    expect(screen.getByRole('combobox', { name: 'Conflict Policy' }).textContent).toContain('Rename')
    expect(screen.getByTestId('topbar-scene-diff-selected-preset-policy').textContent).toContain(
      'Selected preset policy: Rename'
    )
  })

  it('keeps saved policy summaries deterministic when import payload mixes wrapper and row-level hints', async () => {
    const route = makeSceneRoute('talker-1', 'listener-1')
    const initialState = {
      ...initialRoutingState,
      scenes: {
        'scene-a': {
          id: 'scene-a',
          name: 'Baseline Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
        'scene-b': {
          id: 'scene-b',
          name: 'Compare Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
      },
    }

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
      </RoutingProvider>
    )

    fireEvent.click(screen.getByTestId('topbar-scene-diff-button'))
    fireEvent.change(screen.getByTestId('topbar-scene-diff-preset-transfer-input'), {
      target: {
        value: JSON.stringify({
          schema_version: 1,
          preferred_conflict_action: 'skip',
          presets: [
            {
              name: 'Preset Explicit Rename',
              baseline_scene_id: 'scene-a',
              compare_scene_id: 'scene-b',
              preferred_conflict_action: 'rename',
            },
            {
              name: 'Preset Wrapper Only',
              baseline_scene_id: 'scene-a',
              compare_scene_id: 'scene-b',
            },
          ],
        }),
      },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-import'))

    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-diff-preset-policy-summary').textContent).toContain(
        'Preset Explicit Rename: Rename'
      )
      expect(screen.getByTestId('topbar-scene-diff-preset-policy-summary').textContent).toContain(
        'Preset Wrapper Only: Upsert'
      )
      expect(screen.getByTestId('topbar-scene-diff-selected-preset-policy').textContent).toContain(
        'Selected preset policy: none'
      )
    })
  })

  it('keeps duplicate-name preview rejections deterministic with wrapper and row policy hints', async () => {
    const route = makeSceneRoute('talker-1', 'listener-1')
    const initialState = {
      ...initialRoutingState,
      scenes: {
        'scene-a': {
          id: 'scene-a',
          name: 'Baseline Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
        'scene-b': {
          id: 'scene-b',
          name: 'Compare Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
      },
    }

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
      </RoutingProvider>
    )

    fireEvent.click(screen.getByTestId('topbar-scene-diff-button'))
    fireEvent.change(screen.getByTestId('topbar-scene-diff-preset-transfer-input'), {
      target: {
        value: JSON.stringify({
          schema_version: 1,
          preferred_conflict_action: 'upsert',
          presets: [
            {
              name: 'Preset Duplicate Hint',
              baseline_scene_id: 'scene-a',
              compare_scene_id: 'scene-b',
              preferred_conflict_action: 'rename',
            },
            {
              name: '  preset duplicate hint  ',
              baseline_scene_id: 'scene-a',
              compare_scene_id: 'scene-b',
              preferred_conflict_action: 'skip',
            },
          ],
        }),
      },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))

    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-diff-import-preview-summary').textContent).toContain('2 source')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-accepted-count').textContent).toContain('1 accepted')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-conflict-count').textContent).toContain('0 conflict')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-skipped-count').textContent).toContain('1 skipped')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-row-conflict-policy-hint-row-1').textContent).toContain(
        'Conflict policy hint: rename (row override; wrapper default upsert)'
      )
      expect(screen.getByText('Duplicate preset name within import payload')).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-import'))

    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-diff-preset-summary').textContent).toContain('1 preset')
      expect(screen.getByTestId('topbar-scene-diff-preset-policy-summary').textContent).toContain(
        'Preset Duplicate Hint: Rename'
      )
      expect(screen.getByTestId('topbar-scene-diff-preset-policy-summary').textContent).not.toContain(
        'Preset Duplicate Hint: Skip'
      )
    })
  })

  it('keeps preview row ordering and import-plan totals deterministic during rapid page/toggle alternation', async () => {
    const route = makeSceneRoute('talker-1', 'listener-1')
    const initialState = {
      ...initialRoutingState,
      scenes: {
        'scene-a': {
          id: 'scene-a',
          name: 'Baseline Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
        'scene-b': {
          id: 'scene-b',
          name: 'Compare Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
      },
      sceneDiff: {
        ...initialRoutingState.sceneDiff,
        presets: [
          {
            id: 'preset-existing-a',
            name: 'Ops Existing A',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
          {
            id: 'preset-existing-b',
            name: 'Ops Existing B',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
        ],
      },
    }

    const payload = JSON.stringify([
      {
        name: 'Ops Existing A',
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
      },
      {
        name: 'Ops Existing B',
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
      },
      ...Array.from({ length: 10 }, (_, index) => ({
        name: `Valid Preset ${index + 1}`,
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
      })),
      {
        name: 'Missing Compare 1',
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-missing',
      },
      {
        name: 'Missing Compare 2',
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-missing',
      },
    ])

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
      </RoutingProvider>
    )

    fireEvent.click(screen.getByTestId('topbar-scene-diff-button'))
    fireEvent.change(screen.getByTestId('topbar-scene-diff-preset-transfer-input'), {
      target: { value: payload },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))

    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-diff-import-preview-page-summary').textContent).toContain(
        'Showing 1-12 of 14 visible rows (14 total)'
      )
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 2')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-renames').textContent).toContain('Planned rename: 0')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-skips').textContent).toContain('Planned skip: 0')
    })

    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-page-next'))
    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-diff-import-preview-page-summary').textContent).toContain(
        'Showing 13-14 of 14 visible rows (14 total)'
      )
      expect(
        screen.getAllByTestId('topbar-scene-diff-import-preview-row-status').map((entry) => (entry.textContent || '').trim())
      ).toEqual(['skipped', 'skipped'])
    })

    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-group-toggle-conflict'))
    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-diff-import-preview-page-summary').textContent).toContain(
        'Showing 1-12 of 12 visible rows (14 total)'
      )
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 2')
    })

    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-group-toggle-skipped'))
    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-diff-import-preview-page-summary').textContent).toContain(
        'Showing 1-10 of 10 visible rows (14 total)'
      )
      expect(
        screen.getAllByTestId('topbar-scene-diff-import-preview-row-status').map((entry) => (entry.textContent || '').trim())
      ).toEqual(Array.from({ length: 10 }, () => 'accepted'))
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 2')
    })

    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-group-toggle-conflict'))
    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-diff-import-preview-page-summary').textContent).toContain(
        'Showing 1-12 of 12 visible rows (14 total)'
      )
    })

    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-group-toggle-skipped'))
    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-diff-import-preview-page-summary').textContent).toContain(
        'Showing 1-12 of 14 visible rows (14 total)'
      )
      expect(
        screen.getAllByTestId('topbar-scene-diff-import-preview-row-status').map((entry) => (entry.textContent || '').trim())
      ).toEqual(['conflict', 'conflict', ...Array.from({ length: 10 }, () => 'accepted')])
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 2')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-renames').textContent).toContain('Planned rename: 0')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-skips').textContent).toContain('Planned skip: 0')
    })

    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-page-next'))
    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-diff-import-preview-page-summary').textContent).toContain(
        'Showing 13-14 of 14 visible rows (14 total)'
      )
      expect(
        screen.getAllByTestId('topbar-scene-diff-import-preview-row-status').map((entry) => (entry.textContent || '').trim())
      ).toEqual(['skipped', 'skipped'])
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 2')
    })
  })

  it('keeps mixed pointer/keyboard bulk conflict actions deterministic while non-conflict groups are hidden', async () => {
    const route = makeSceneRoute('talker-1', 'listener-1')
    const initialState = {
      ...initialRoutingState,
      scenes: {
        'scene-a': {
          id: 'scene-a',
          name: 'Baseline Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
        'scene-b': {
          id: 'scene-b',
          name: 'Compare Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
      },
      sceneDiff: {
        ...initialRoutingState.sceneDiff,
        presets: [
          {
            id: 'preset-existing-a',
            name: 'Ops Existing A',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
          {
            id: 'preset-existing-b',
            name: 'Ops Existing B',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
        ],
      },
    }

    const payload = JSON.stringify([
      {
        name: 'Ops Existing A',
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
      },
      {
        name: 'Ops Existing B',
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
      },
      {
        name: 'Valid New',
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
      },
      {
        name: 'Missing Compare 1',
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-missing',
      },
      {
        name: 'Missing Compare 2',
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-missing',
      },
    ])

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
      </RoutingProvider>
    )

    fireEvent.click(screen.getByTestId('topbar-scene-diff-button'))
    fireEvent.change(screen.getByTestId('topbar-scene-diff-preset-transfer-input'), {
      target: { value: payload },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))

    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 2')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-renames').textContent).toContain('Planned rename: 0')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-skips').textContent).toContain('Planned skip: 0')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-page-summary').textContent).toContain(
        'Showing 1-5 of 5 visible rows (5 total)'
      )
    })

    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-group-toggle-accepted'))
    fireEvent.keyDown(screen.getByTestId('topbar-scene-diff-import-preview-group-toggle-skipped'), { key: ' ' })

    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-diff-import-preview-page-summary').textContent).toContain(
        'Showing 1-2 of 2 visible rows (5 total)'
      )
      expect(
        screen.getAllByTestId('topbar-scene-diff-import-preview-row-status').map((entry) => (entry.textContent || '').trim())
      ).toEqual(['conflict', 'conflict'])
    })

    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-conflict-bulk-skip'))
    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 0')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-renames').textContent).toContain('Planned rename: 0')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-skips').textContent).toContain('Planned skip: 2')
    })

    fireEvent.keyDown(screen.getByTestId('topbar-scene-diff-import-preview-conflict-bulk-rename'), { key: 'Enter' })
    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 0')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-renames').textContent).toContain('Planned rename: 2')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-skips').textContent).toContain('Planned skip: 0')
    })

    fireEvent.keyDown(screen.getByTestId('topbar-scene-diff-import-preview-conflict-bulk-upsert'), { key: ' ' })
    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 2')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-renames').textContent).toContain('Planned rename: 0')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-skips').textContent).toContain('Planned skip: 0')
    })
  })

  it('keeps conflict-action plan totals deterministic while paging between preview slices', async () => {
    const route = makeSceneRoute('talker-1', 'listener-1')
    const initialState = {
      ...initialRoutingState,
      scenes: {
        'scene-a': {
          id: 'scene-a',
          name: 'Baseline Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
        'scene-b': {
          id: 'scene-b',
          name: 'Compare Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
      },
      sceneDiff: {
        ...initialRoutingState.sceneDiff,
        presets: [
          {
            id: 'preset-existing-a',
            name: 'Ops Existing A',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
          {
            id: 'preset-existing-b',
            name: 'Ops Existing B',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
          {
            id: 'preset-existing-c',
            name: 'Ops Existing C',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
        ],
      },
    }

    const payload = JSON.stringify([
      {
        name: 'Ops Existing A',
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
      },
      {
        name: 'Ops Existing B',
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
      },
      {
        name: 'Ops Existing C',
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
      },
      ...Array.from({ length: 10 }, (_, index) => ({
        name: `Accepted Preset ${index + 1}`,
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
      })),
      {
        name: 'Missing Compare 1',
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-missing',
      },
      {
        name: 'Missing Compare 2',
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-missing',
      },
    ])

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
      </RoutingProvider>
    )

    fireEvent.click(screen.getByTestId('topbar-scene-diff-button'))
    fireEvent.change(screen.getByTestId('topbar-scene-diff-preset-transfer-input'), {
      target: { value: payload },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))

    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-diff-import-preview-page-summary').textContent).toContain(
        'Showing 1-12 of 15 visible rows (15 total)'
      )
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 3')
    })

    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-conflict-action-rename-row-1'))
    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-conflict-action-skip-row-2'))
    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-conflict-action-upsert-row-3'))

    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 1')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-renames').textContent).toContain('Planned rename: 1')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-skips').textContent).toContain('Planned skip: 1')
      expect(
        screen.getAllByTestId('topbar-scene-diff-import-preview-row-status').map((entry) => (entry.textContent || '').trim())
      ).toEqual(['conflict', 'conflict', 'conflict', ...Array.from({ length: 9 }, () => 'accepted')])
    })

    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-page-next'))
    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-diff-import-preview-page-summary').textContent).toContain(
        'Showing 13-15 of 15 visible rows (15 total)'
      )
      expect(
        screen.getAllByTestId('topbar-scene-diff-import-preview-row-status').map((entry) => (entry.textContent || '').trim())
      ).toEqual(['accepted', 'skipped', 'skipped'])
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 1')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-renames').textContent).toContain('Planned rename: 1')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-skips').textContent).toContain('Planned skip: 1')
    })

    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-page-prev'))
    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-diff-import-preview-page-summary').textContent).toContain(
        'Showing 1-12 of 15 visible rows (15 total)'
      )
      expect(
        screen.getAllByTestId('topbar-scene-diff-import-preview-row-status').map((entry) => (entry.textContent || '').trim())
      ).toEqual(['conflict', 'conflict', 'conflict', ...Array.from({ length: 9 }, () => 'accepted')])
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 1')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-renames').textContent).toContain('Planned rename: 1')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-skips').textContent).toContain('Planned skip: 1')
    })
  })

  it('updates policy helper text from dirty draft to persisted sync after preset save', async () => {
    const route = makeSceneRoute('talker-1', 'listener-1')
    const initialState = {
      ...initialRoutingState,
      scenes: {
        'scene-a': {
          id: 'scene-a',
          name: 'Baseline Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
        'scene-b': {
          id: 'scene-b',
          name: 'Compare Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
      },
      sceneDiff: {
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
        preview: null,
        presets: [
          {
            id: 'preset-a',
            name: 'Preset A',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
            preferred_conflict_action: 'rename',
          },
        ],
        active_preset_id: null,
      },
    }

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
      </RoutingProvider>
    )

    fireEvent.click(screen.getByTestId('topbar-scene-diff-button'))
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Saved Preset' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Preset A' }))

    expect(screen.getByTestId('topbar-scene-diff-selected-preset-policy-sync').textContent).toContain(
      'Draft conflict policy matches persisted preset metadata.'
    )

    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-conflict-policy-reset'))
    expect(screen.getByTestId('topbar-scene-diff-selected-preset-policy-sync').textContent).toContain(
      'Draft conflict policy differs (draft: Upsert). Save Preset to persist.'
    )

    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-save'))
    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-diff-selected-preset-policy').textContent).toContain(
        'Selected preset policy: Upsert'
      )
      expect(screen.getByTestId('topbar-scene-diff-selected-preset-policy-sync').textContent).toContain(
        'Draft conflict policy matches persisted preset metadata.'
      )
    })
  })

  it('exports deterministic mixed-policy payloads with explicit rename rows only', () => {
    const route = makeSceneRoute('talker-1', 'listener-1')
    const initialState = {
      ...initialRoutingState,
      scenes: {
        'scene-a': {
          id: 'scene-a',
          name: 'Baseline Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
        'scene-b': {
          id: 'scene-b',
          name: 'Compare Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
      },
      sceneDiff: {
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
        preview: null,
        presets: [
          {
            id: 'preset-default',
            name: 'Preset Default',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
          {
            id: 'preset-rename',
            name: 'Preset Rename',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
            preferred_conflict_action: 'rename',
          },
        ],
        active_preset_id: null,
      },
    }

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
      </RoutingProvider>
    )

    fireEvent.click(screen.getByTestId('topbar-scene-diff-button'))
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-export'))

    const transferField = screen.getByTestId('topbar-scene-diff-preset-transfer-input') as HTMLInputElement
    const payload = JSON.parse(transferField.value) as {
      schema_version: number;
      preferred_conflict_action?: string;
      presets: Array<{
        name: string;
        preferred_conflict_action?: string;
      }>;
    }

    expect(payload.schema_version).toBe(1)
    expect(payload.preferred_conflict_action).toBe('upsert')

    const renamePreset = payload.presets.find((preset) => preset.name === 'Preset Rename')
    const defaultPreset = payload.presets.find((preset) => preset.name === 'Preset Default')
    expect(renamePreset?.preferred_conflict_action).toBe('rename')
    expect(defaultPreset && 'preferred_conflict_action' in defaultPreset).toBe(false)
  })

  it('replaces active diff selections with newly saved scenes after lifecycle churn', async () => {
    const talker = makeEndpoint({
      endpoint_id: 'talker-1',
      direction: 'talker',
      unique_id: 21,
      device_name: 'Talker One',
    })
    const listener = makeEndpoint({
      endpoint_id: 'listener-1',
      direction: 'listener',
      unique_id: 22,
      device_name: 'Listener One',
    })
    const liveRoute = makeSceneRoute('talker-1', 'listener-1')

    const initialState = {
      ...initialRoutingState,
      endpoints: {
        [talker.endpoint_id]: talker,
        [listener.endpoint_id]: listener,
      },
      liveRoutes: {
        [liveRoute.id]: liveRoute,
      },
      scenes: {
        'scene-legacy-a': {
          id: 'scene-legacy-a',
          name: 'Legacy Baseline v1',
          description: '',
          routes: [liveRoute],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
        'scene-legacy-b': {
          id: 'scene-legacy-b',
          name: 'Legacy Compare v1',
          description: '',
          routes: [liveRoute],
          timestamp: '2026-02-17T00:01:00Z',
          tags: [],
        },
      },
      sceneDiff: {
        baseline_scene_id: 'scene-legacy-a',
        compare_scene_id: 'scene-legacy-b',
        preview: null,
      },
    }

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-status-baseline').textContent).toContain('Legacy Baseline v1')
      expect(screen.getByTestId('topbar-scene-status-compare').textContent).toContain('Legacy Compare v1')
      expect(screen.getByTestId('topbar-scene-status-readiness').textContent).toContain('Diff selection ready')
    })

    fireEvent.click(screen.getByTestId('topbar-scenes-button'))

    fireEvent.change(screen.getByTestId('topbar-scene-name-input'), {
      target: { value: 'Baseline Scene v2' },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-save'))

    fireEvent.change(screen.getByTestId('topbar-scene-name-input'), {
      target: { value: 'Compare Scene v2' },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-save'))

    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-status-count').textContent).toContain('4 scenes')
    })

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Saved Scene' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Legacy Baseline v1' }))
    fireEvent.click(screen.getByTestId('topbar-scene-delete'))
    fireEvent.click(screen.getByTestId('topbar-scene-delete'))

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Saved Scene' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Legacy Compare v1' }))
    fireEvent.click(screen.getByTestId('topbar-scene-delete'))
    fireEvent.click(screen.getByTestId('topbar-scene-delete'))

    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-status-count').textContent).toContain('2 scenes')
      expect(screen.getByTestId('topbar-scene-status-baseline').textContent).toContain('Baseline: None')
      expect(screen.getByTestId('topbar-scene-status-compare').textContent).toContain('Compare: None')
      expect(screen.getByTestId('topbar-scene-status-readiness').textContent).toContain('Diff selection incomplete')
    })

    fireEvent.click(screen.getByTestId('topbar-scene-close'))

    fireEvent.click(screen.getByTestId('topbar-scene-diff-button'))
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Baseline Scene' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Baseline Scene v2' }))
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Compare Scene' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Compare Scene v2' }))
    fireEvent.click(screen.getByTestId('topbar-scene-diff-generate'))

    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-status-baseline').textContent).toContain('Baseline Scene v2')
      expect(screen.getByTestId('topbar-scene-status-compare').textContent).toContain('Compare Scene v2')
      expect(screen.getByTestId('topbar-scene-status-readiness').textContent).toContain('Diff selection ready')
      expect(screen.getByTestId('scene-diff-preview')).toBeTruthy()
      expect(screen.getByTestId('scene-diff-preview-total-changes').textContent).toContain('Total changes: 0')
    })
  })

  it('keeps duplicate-name scene selection deterministic in TopBar dropdown workflows', async () => {
    const talkerOne = makeEndpoint({
      endpoint_id: 'talker-1',
      direction: 'talker',
      unique_id: 31,
      device_name: 'Talker One',
    })
    const listenerOne = makeEndpoint({
      endpoint_id: 'listener-1',
      direction: 'listener',
      unique_id: 32,
      device_name: 'Listener One',
    })
    const talkerTwo = makeEndpoint({
      endpoint_id: 'talker-2',
      direction: 'talker',
      unique_id: 33,
      device_name: 'Talker Two',
    })
    const listenerTwo = makeEndpoint({
      endpoint_id: 'listener-2',
      direction: 'listener',
      unique_id: 34,
      device_name: 'Listener Two',
    })
    const routeA = makeSceneRoute('talker-1', 'listener-1')
    const routeB = makeSceneRoute('talker-2', 'listener-2')

    const initialState = {
      ...initialRoutingState,
      endpoints: {
        [talkerOne.endpoint_id]: talkerOne,
        [listenerOne.endpoint_id]: listenerOne,
        [talkerTwo.endpoint_id]: talkerTwo,
        [listenerTwo.endpoint_id]: listenerTwo,
      },
      scenes: {
        'scene-twin-a': {
          id: 'scene-twin-a',
          name: 'Twin Scene',
          description: '',
          routes: [routeA],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
        'scene-twin-b': {
          id: 'scene-twin-b',
          name: 'Twin Scene',
          description: '',
          routes: [routeA, routeB],
          timestamp: '2026-02-17T00:01:00Z',
          tags: [],
        },
      },
    }

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
      </RoutingProvider>
    )

    fireEvent.click(screen.getByTestId('topbar-scenes-button'))
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Saved Scene' }))

    const duplicateSceneOptions = await screen.findAllByRole('option', {
      name: /Twin Scene \(scene-twin-[ab]\)/,
    })
    expect(duplicateSceneOptions.map((option) => option.textContent)).toEqual([
      'Twin Scene (scene-twin-a)',
      'Twin Scene (scene-twin-b)',
    ])

    fireEvent.click(await screen.findByRole('option', { name: 'Twin Scene (scene-twin-a)' }))
    expect(screen.getByTestId('topbar-scene-selected-summary').textContent).toContain('Selected: Twin Scene (1 routes)')

    fireEvent.click(screen.getByTestId('topbar-scene-close'))

    fireEvent.click(screen.getByTestId('topbar-scene-diff-button'))
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Baseline Scene' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Twin Scene (scene-twin-a)' }))
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Compare Scene' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Twin Scene (scene-twin-b)' }))
    fireEvent.click(screen.getByTestId('topbar-scene-diff-generate'))

    await waitFor(() => {
      expect(screen.getByTestId('scene-diff-preview-add-count').textContent).toContain('1 add')
      expect(screen.getByTestId('scene-diff-preview-remove-count').textContent).toContain('0 remove')
      expect(screen.getByTestId('scene-diff-preview-add-routes').textContent).toContain('Talker Two -> Listener Two')
    })
  })

  it('keeps status-strip counter keyboard activation aligned with pointer-filtered scene-audit views', async () => {
    const initialState = {
      ...initialRoutingState,
      auditLog: [
        {
          id: 'audit-1',
          timestamp: '2026-02-17T00:00:00Z',
          event_type: 'SAVE_SCENE' as const,
          actor: 'user',
          payload: {},
          diff_summary: 'Saved scene: Baseline Scene (1 routes)',
          validation_outcome: 'success' as const,
        },
        {
          id: 'audit-2',
          timestamp: '2026-02-17T00:01:00Z',
          event_type: 'UPDATE_SCENE' as const,
          actor: 'user',
          payload: {},
          diff_summary: 'Updated scene metadata: Baseline Scene -> Baseline Scene v2',
          validation_outcome: 'warning' as const,
        },
        {
          id: 'audit-3',
          timestamp: '2026-02-17T00:02:00Z',
          event_type: 'DELETE_SCENE' as const,
          actor: 'user',
          payload: {},
          diff_summary: 'Deleted scene: Baseline Scene',
          validation_outcome: 'error' as const,
        },
        {
          id: 'audit-4',
          timestamp: '2026-02-17T00:03:00Z',
          event_type: 'SCENE_DIFF' as const,
          actor: 'user',
          payload: {
            mode: 'preset_import_preview_cancelled',
            phase: 'cancelled',
            reason: 'transfer_draft_changed',
          },
          diff_summary: 'Cancelled scene diff preset import preview (3 rows)',
          validation_outcome: 'warning' as const,
        },
      ],
    }

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
      </RoutingProvider>
    )

    fireEvent.click(screen.getByTestId('topbar-scene-status-warnings'))
    await waitFor(() => {
      expect(screen.getAllByTestId('topbar-scene-audit-entry')).toHaveLength(1)
      expect(screen.getByText('Updated scene metadata: Baseline Scene -> Baseline Scene v2')).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('topbar-scene-close'))

    fireEvent.keyDown(screen.getByTestId('topbar-scene-status-warnings'), { key: ' ' })
    await waitFor(() => {
      expect(screen.getAllByTestId('topbar-scene-audit-entry')).toHaveLength(1)
      expect(screen.getByText('Updated scene metadata: Baseline Scene -> Baseline Scene v2')).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('topbar-scene-close'))

    fireEvent.click(screen.getByTestId('topbar-scene-status-diff-preview-warnings'))
    await waitFor(() => {
      expect(screen.getAllByTestId('topbar-scene-audit-entry')).toHaveLength(1)
      expect(screen.getByText('Cancelled scene diff preset import preview (3 rows)')).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('topbar-scene-close'))

    fireEvent.keyDown(screen.getByTestId('topbar-scene-status-diff-preview-warnings'), { key: 'Enter' })
    await waitFor(() => {
      expect(screen.getAllByTestId('topbar-scene-audit-entry')).toHaveLength(1)
      expect(screen.getByText('Cancelled scene diff preset import preview (3 rows)')).toBeTruthy()
    })
  })

  it('keeps status-strip counter prefilters deterministic during save/update/delete scene churn with controls open', async () => {
    const route = makeSceneRoute('talker-1', 'listener-1')
    const initialState = {
      ...initialRoutingState,
      scenes: {
        'scene-a': {
          id: 'scene-a',
          name: 'Baseline Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
        'scene-b': {
          id: 'scene-b',
          name: 'Compare Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
      },
      auditLog: [
        {
          id: 'audit-legacy-delete-error',
          timestamp: '2026-02-17T00:00:00Z',
          event_type: 'DELETE_SCENE' as const,
          actor: 'user',
          payload: {},
          diff_summary: 'Deleted scene: Legacy Scene',
          validation_outcome: 'error' as const,
        },
        {
          id: 'audit-preview-warning',
          timestamp: '2026-02-17T00:01:00Z',
          event_type: 'SCENE_DIFF' as const,
          actor: 'user',
          payload: {
            mode: 'preset_import_preview_cancelled',
            phase: 'cancelled',
            reason: 'transfer_draft_changed',
          },
          diff_summary: 'Cancelled scene diff preset import preview (2 rows)',
          validation_outcome: 'warning' as const,
        },
      ],
    }

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
      </RoutingProvider>
    )

    fireEvent.click(screen.getByTestId('topbar-scenes-button'))
    fireEvent.click(screen.getByTestId('topbar-scene-autosuffix-toggle'))

    fireEvent.change(screen.getByTestId('topbar-scene-name-input'), {
      target: { value: 'Ops Snapshot' },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-save'))

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Saved Scene' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Baseline Scene' }))
    fireEvent.change(screen.getByTestId('topbar-scene-edit-name-input'), {
      target: { value: 'Compare Scene' },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-update'))

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Saved Scene' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Compare Scene (scene-b)' }))
    fireEvent.click(screen.getByTestId('topbar-scene-delete'))
    fireEvent.click(screen.getByTestId('topbar-scene-delete'))

    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-status-errors').textContent).toContain('Errors: 1')
      expect(screen.getByTestId('topbar-scene-status-warnings').textContent).toContain('Warnings: 1')
      expect(screen.getByTestId('topbar-scene-status-deletes').textContent).toContain('Deletes: 2')
      expect(screen.getByTestId('topbar-scene-status-diff-preview-warnings').textContent).toContain('Diff Preview Warnings: 1')
    })

    fireEvent.click(screen.getByTestId('topbar-scene-status-warnings'))
    await waitFor(() => {
      expect(screen.getAllByTestId('topbar-scene-audit-entry')).toHaveLength(1)
      expect(screen.getByText('Updated scene metadata: Baseline Scene -> Compare Scene')).toBeTruthy()
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('1 of 1 matching (4 total)')
    })

    fireEvent.click(screen.getByTestId('topbar-scene-status-errors'))
    await waitFor(() => {
      expect(screen.getAllByTestId('topbar-scene-audit-entry')).toHaveLength(1)
      expect(screen.getByText('Deleted scene: Legacy Scene')).toBeTruthy()
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('1 of 1 matching (4 total)')
    })

    fireEvent.click(screen.getByTestId('topbar-scene-status-deletes'))
    await waitFor(() => {
      expect(screen.getAllByTestId('topbar-scene-audit-entry')).toHaveLength(2)
      expect(screen.getByText('Deleted scene: Legacy Scene')).toBeTruthy()
      expect(screen.getByText('Deleted scene: Compare Scene')).toBeTruthy()
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('2 of 2 matching (4 total)')
    })

    fireEvent.click(screen.getByTestId('topbar-scene-status-diff-preview-warnings'))
    await waitFor(() => {
      expect(screen.getAllByTestId('topbar-scene-audit-entry')).toHaveLength(1)
      expect(screen.getByText('Cancelled scene diff preset import preview (2 rows)')).toBeTruthy()
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('1 of 1 matching (1 total)')
    })
  })

  it('keeps status-strip counter keyboard activation deterministic after churn-driven counter value changes in-session', async () => {
    const route = makeSceneRoute('talker-1', 'listener-1')
    const initialState = {
      ...initialRoutingState,
      scenes: {
        'scene-a': {
          id: 'scene-a',
          name: 'Baseline Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
        'scene-b': {
          id: 'scene-b',
          name: 'Compare Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
      },
      auditLog: [
        {
          id: 'audit-legacy-delete-error',
          timestamp: '2026-02-17T00:00:00Z',
          event_type: 'DELETE_SCENE' as const,
          actor: 'user',
          payload: {},
          diff_summary: 'Deleted scene: Legacy Scene',
          validation_outcome: 'error' as const,
        },
        {
          id: 'audit-preview-warning',
          timestamp: '2026-02-17T00:01:00Z',
          event_type: 'SCENE_DIFF' as const,
          actor: 'user',
          payload: {
            mode: 'preset_import_preview_cancelled',
            phase: 'cancelled',
            reason: 'transfer_draft_changed',
          },
          diff_summary: 'Cancelled scene diff preset import preview (2 rows)',
          validation_outcome: 'warning' as const,
        },
      ],
    }

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
      </RoutingProvider>
    )

    fireEvent.click(screen.getByTestId('topbar-scenes-button'))
    fireEvent.click(screen.getByTestId('topbar-scene-autosuffix-toggle'))

    fireEvent.change(screen.getByTestId('topbar-scene-name-input'), {
      target: { value: 'Ops Snapshot' },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-save'))

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Saved Scene' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Baseline Scene' }))
    fireEvent.change(screen.getByTestId('topbar-scene-edit-name-input'), {
      target: { value: 'Compare Scene' },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-update'))

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Saved Scene' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Compare Scene (scene-b)' }))
    fireEvent.click(screen.getByTestId('topbar-scene-delete'))
    fireEvent.click(screen.getByTestId('topbar-scene-delete'))

    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-status-errors').textContent).toContain('Errors: 1')
      expect(screen.getByTestId('topbar-scene-status-warnings').textContent).toContain('Warnings: 1')
      expect(screen.getByTestId('topbar-scene-status-deletes').textContent).toContain('Deletes: 2')
      expect(screen.getByTestId('topbar-scene-status-diff-preview-warnings').textContent).toContain('Diff Preview Warnings: 1')
    })

    fireEvent.keyDown(screen.getByTestId('topbar-scene-status-warnings'), { key: 'Enter' })
    await waitFor(() => {
      expect(screen.getAllByTestId('topbar-scene-audit-entry')).toHaveLength(1)
      expect(screen.getByText('Updated scene metadata: Baseline Scene -> Compare Scene')).toBeTruthy()
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('1 of 1 matching (4 total)')
    })

    fireEvent.keyDown(screen.getByTestId('topbar-scene-status-errors'), { key: ' ' })
    await waitFor(() => {
      expect(screen.getAllByTestId('topbar-scene-audit-entry')).toHaveLength(1)
      expect(screen.getByText('Deleted scene: Legacy Scene')).toBeTruthy()
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('1 of 1 matching (4 total)')
    })

    fireEvent.keyDown(screen.getByTestId('topbar-scene-status-deletes'), { key: 'Enter' })
    await waitFor(() => {
      expect(screen.getAllByTestId('topbar-scene-audit-entry')).toHaveLength(2)
      expect(screen.getByText('Deleted scene: Legacy Scene')).toBeTruthy()
      expect(screen.getByText('Deleted scene: Compare Scene')).toBeTruthy()
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('2 of 2 matching (4 total)')
    })

    fireEvent.keyDown(screen.getByTestId('topbar-scene-status-diff-preview-warnings'), { key: ' ' })
    await waitFor(() => {
      expect(screen.getAllByTestId('topbar-scene-audit-entry')).toHaveLength(1)
      expect(screen.getByText('Cancelled scene diff preset import preview (2 rows)')).toBeTruthy()
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('1 of 1 matching (1 total)')
    })
  })

  it('remediates stale scene-diff presets while scene-diff controls remain open during scene churn', async () => {
    const route = makeSceneRoute('talker-1', 'listener-1')
    const initialState = {
      ...initialRoutingState,
      scenes: {
        'scene-a': {
          id: 'scene-a',
          name: 'Baseline Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
        'scene-b': {
          id: 'scene-b',
          name: 'Compare Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
      },
      sceneDiff: {
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
        preview: null,
        presets: [
          {
            id: 'preset-live',
            name: 'A to B',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
            preset_version: 1,
            notes: '',
          },
        ],
        active_preset_id: 'preset-live',
      },
    }

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
      </RoutingProvider>
    )

    fireEvent.click(screen.getByTestId('topbar-scene-diff-button'))
    expect(screen.getByTestId('topbar-scene-diff-preset-summary').textContent).toContain('1 preset')

    fireEvent.click(screen.getByTestId('topbar-scenes-button'))
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Saved Scene' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Compare Scene' }))
    fireEvent.click(screen.getByTestId('topbar-scene-delete'))
    fireEvent.click(screen.getByTestId('topbar-scene-delete'))

    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-status-count').textContent).toContain('1 scene')
      expect(screen.getByTestId('topbar-scene-diff-preset-summary').textContent).toContain('No saved compare presets')
      expect(screen.getByTestId('topbar-scene-diff-active-preset').textContent).toContain('Active preset: none')
    })
  })

  it('keeps stale-preset remediation and status-strip counter prefilters deterministic during remote scene sync while controls stay open', async () => {
    const routeA = makeSceneRoute('talker-1', 'listener-1')
    const routeB = makeSceneRoute('talker-2', 'listener-2')
    const initialState = {
      ...initialRoutingState,
      scenes: {
        'scene-a': {
          id: 'scene-a',
          name: 'Baseline Scene',
          description: '',
          routes: [routeA],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
        'scene-b': {
          id: 'scene-b',
          name: 'Compare Scene',
          description: '',
          routes: [routeA, routeB],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
      },
      sceneDiff: {
        ...initialRoutingState.sceneDiff,
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
        preview: {
          scene_id: 'scene-b',
          scene_name: 'Compare Scene',
          to_add: [{ talker_id: 'talker-2', listener_id: 'listener-2' }],
          to_remove: [],
          unchanged: ['talker-1→listener-1'],
          total_changes: 1,
        },
        presets: [
          {
            id: 'preset-live',
            name: 'Live Pair',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
          {
            id: 'preset-stale-active',
            name: 'Stale Pair',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-missing',
            updated_at: '2026-02-17T00:00:00Z',
          },
        ],
        active_preset_id: 'preset-stale-active',
      },
      auditLog: [
        {
          id: 'audit-preview-warning',
          timestamp: '2026-02-17T00:00:00Z',
          event_type: 'SCENE_DIFF' as const,
          actor: 'user',
          payload: {
            mode: 'preset_import_preview_cancelled',
            phase: 'cancelled',
            reason: 'transfer_draft_changed',
          },
          diff_summary: 'Cancelled scene diff preset import preview (1 rows)',
          validation_outcome: 'warning' as const,
        },
      ],
    }

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
        <TopBarRemoteSceneSyncProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('topbar-probe-scene-sync-baseline').textContent).toBe('Baseline Scene')
      expect(screen.getByTestId('topbar-probe-scene-sync-compare').textContent).toBe('Compare Scene')
      expect(screen.getByTestId('topbar-probe-scene-sync-selection-validity').textContent).toBe('ready')
      expect(screen.getByTestId('topbar-probe-scene-sync-preview-summary').textContent).toBe('1')
      expect(screen.getByTestId('topbar-probe-scene-sync-preset-summary').textContent).toContain('Live Pair:scene-a->scene-b')
      expect(screen.getByTestId('topbar-probe-scene-sync-preset-summary').textContent).toContain(
        'Stale Pair:scene-a->scene-missing'
      )
      expect(screen.getByTestId('topbar-probe-scene-sync-active-preset').textContent).toBe('preset-stale-active')
      expect(screen.getByTestId('topbar-scene-status-errors').textContent).toContain('Errors: 0')
      expect(screen.getByTestId('topbar-scene-status-warnings').textContent).toContain('Warnings: 0')
      expect(screen.getByTestId('topbar-scene-status-deletes').textContent).toContain('Deletes: 0')
      expect(screen.getByTestId('topbar-scene-status-diff-preview-warnings').textContent).toContain('Diff Preview Warnings: 1')
    })

    fireEvent.click(screen.getByTestId('topbar-scenes-button'))
    fireEvent.click(screen.getByTestId('topbar-scene-audit-remember-filters-toggle'))
    fireEvent.change(screen.getByTestId('topbar-scene-audit-search-input'), {
      target: { value: 'stale' },
    })

    act(() => {
      topBarSceneSyncDispatch?.({
        type: 'UPDATE_SCENE_METADATA',
        payload: {
          scene_id: 'scene-b',
          name: 'Compare Scene Remote',
          description: 'remote compare update',
          tags: ['compare', 'remote'],
        },
      })
      topBarSceneSyncDispatch?.({
        type: 'DELETE_SCENE',
        payload: { scene_id: 'scene-a' },
      })
    })

    await waitFor(() => {
      expect((screen.getByTestId('topbar-scene-audit-search-input') as HTMLInputElement).value).toBe('stale')
      expect(screen.getByTestId('topbar-probe-scene-sync-scenes').textContent).toContain('Compare Scene Remote:scene-b')
      expect(screen.getByTestId('topbar-probe-scene-sync-scenes').textContent).not.toContain('Baseline Scene:scene-a')
      expect(screen.getByTestId('topbar-probe-scene-sync-baseline').textContent).toBe('none')
      expect(screen.getByTestId('topbar-probe-scene-sync-compare').textContent).toBe('Compare Scene Remote')
      expect(screen.getByTestId('topbar-probe-scene-sync-selection-validity').textContent).toBe('incomplete')
      expect(screen.getByTestId('topbar-probe-scene-sync-preview-summary').textContent).toBe('none')
      expect(screen.getByTestId('topbar-probe-scene-sync-preset-summary').textContent).toBe('none')
      expect(screen.getByTestId('topbar-probe-scene-sync-active-preset').textContent).toBe('none')
      expect(screen.getByTestId('topbar-probe-scene-sync-audit-sequence').textContent).toBe('UPDATE_SCENE|DELETE_SCENE')
      expect(screen.getByTestId('topbar-probe-scene-sync-audit-warnings').textContent).toBe('0')
      expect(screen.getByTestId('topbar-probe-scene-sync-audit-errors').textContent).toBe('0')
      expect(screen.getByTestId('topbar-probe-scene-sync-audit-deletes').textContent).toBe('1')
      expect(screen.getByTestId('topbar-scene-status-errors').textContent).toContain('Errors: 0')
      expect(screen.getByTestId('topbar-scene-status-warnings').textContent).toContain('Warnings: 0')
      expect(screen.getByTestId('topbar-scene-status-deletes').textContent).toContain('Deletes: 1')
      expect(screen.getByTestId('topbar-scene-status-diff-preview-warnings').textContent).toContain('Diff Preview Warnings: 1')
    })

    fireEvent.click(screen.getByTestId('topbar-scene-status-deletes'))
    await waitFor(() => {
      expect((screen.getByTestId('topbar-scene-audit-search-input') as HTMLInputElement).value).toBe('delete')
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('1 of 1 matching (2 total)')
      expect(screen.getByText('Deleted scene: Baseline Scene')).toBeTruthy()
    })

    fireEvent.keyDown(screen.getByTestId('topbar-scene-status-diff-preview-warnings'), { key: 'Enter' })
    await waitFor(() => {
      expect((screen.getByTestId('topbar-scene-audit-search-input') as HTMLInputElement).value).toBe('')
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('1 of 1 matching (1 total)')
      expect(screen.getByText('Cancelled scene diff preset import preview (1 rows)')).toBeTruthy()
    })
  })

  it('keeps scene-audit quick-filter chips deterministic after remote scene-sync mutations while scene controls stay open', async () => {
    const route = makeSceneRoute('talker-1', 'listener-1')
    const initialState = {
      ...initialRoutingState,
      scenes: {
        'scene-a': {
          id: 'scene-a',
          name: 'Baseline Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
        'scene-b': {
          id: 'scene-b',
          name: 'Compare Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
      },
      auditLog: [
        {
          id: 'audit-legacy-delete-error',
          timestamp: '2026-02-17T00:00:00Z',
          event_type: 'DELETE_SCENE' as const,
          actor: 'user',
          payload: {},
          diff_summary: 'Deleted scene: Legacy Scene',
          validation_outcome: 'error' as const,
        },
        {
          id: 'audit-preview-warning',
          timestamp: '2026-02-17T00:01:00Z',
          event_type: 'SCENE_DIFF' as const,
          actor: 'user',
          payload: {
            mode: 'preset_import_preview_cancelled',
            phase: 'cancelled',
            reason: 'transfer_draft_changed',
          },
          diff_summary: 'Cancelled scene diff preset import preview (2 rows)',
          validation_outcome: 'warning' as const,
        },
      ],
    }

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
        <TopBarRemoteSceneSyncProbe />
      </RoutingProvider>
    )

    fireEvent.click(screen.getByTestId('topbar-scenes-button'))
    fireEvent.click(screen.getByTestId('topbar-scene-audit-remember-filters-toggle'))
    fireEvent.change(screen.getByTestId('topbar-scene-audit-search-input'), {
      target: { value: 'scene' },
    })

    act(() => {
      topBarSceneSyncDispatch?.({
        type: 'UPDATE_SCENE_METADATA',
        payload: {
          scene_id: 'scene-b',
          name: 'Baseline Scene',
          description: 'remote compare update',
          tags: ['compare', 'remote'],
        },
      })
      topBarSceneSyncDispatch?.({
        type: 'DELETE_SCENE',
        payload: { scene_id: 'scene-a' },
      })
    })

    await waitFor(() => {
      expect((screen.getByTestId('topbar-scene-audit-search-input') as HTMLInputElement).value).toBe('scene')
      expect(screen.getByTestId('topbar-probe-scene-sync-scenes').textContent).toContain('Baseline Scene:scene-b')
      expect(screen.getByTestId('topbar-probe-scene-sync-scenes').textContent).not.toContain('Baseline Scene:scene-a')
      expect(screen.getByTestId('topbar-probe-scene-sync-audit-sequence').textContent).toBe(
        'DELETE_SCENE|UPDATE_SCENE|DELETE_SCENE'
      )
      expect(screen.getByTestId('topbar-probe-scene-sync-audit-warnings').textContent).toBe('1')
      expect(screen.getByTestId('topbar-probe-scene-sync-audit-errors').textContent).toBe('1')
      expect(screen.getByTestId('topbar-probe-scene-sync-audit-deletes').textContent).toBe('2')
    })

    fireEvent.click(screen.getByTestId('topbar-scene-audit-quick-all'))
    await waitFor(() => {
      expect((screen.getByTestId('topbar-scene-audit-search-input') as HTMLInputElement).value).toBe('')
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('3 of 3 matching (3 total)')
      expect(screen.getByText('Deleted scene: Legacy Scene')).toBeTruthy()
      expect(screen.getByText('Updated scene metadata: Compare Scene -> Baseline Scene')).toBeTruthy()
      expect(screen.getByText('Deleted scene: Baseline Scene')).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('topbar-scene-audit-quick-errors'))
    await waitFor(() => {
      expect((screen.getByTestId('topbar-scene-audit-search-input') as HTMLInputElement).value).toBe('')
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('1 of 1 matching (3 total)')
      expect(screen.getByText('Deleted scene: Legacy Scene')).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('topbar-scene-audit-quick-warnings'))
    await waitFor(() => {
      expect((screen.getByTestId('topbar-scene-audit-search-input') as HTMLInputElement).value).toBe('')
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('1 of 1 matching (3 total)')
      expect(screen.getByText('Updated scene metadata: Compare Scene -> Baseline Scene')).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('topbar-scene-audit-quick-deletes'))
    await waitFor(() => {
      expect((screen.getByTestId('topbar-scene-audit-search-input') as HTMLInputElement).value).toBe('delete')
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('2 of 2 matching (3 total)')
      expect(screen.getByText('Deleted scene: Legacy Scene')).toBeTruthy()
      expect(screen.getByText('Deleted scene: Baseline Scene')).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('topbar-scene-audit-quick-diff-preview'))
    await waitFor(() => {
      expect((screen.getByTestId('topbar-scene-audit-search-input') as HTMLInputElement).value).toBe('')
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('1 of 1 matching (1 total)')
      expect(screen.getByText('Cancelled scene diff preset import preview (2 rows)')).toBeTruthy()
    })
  })

  it('keeps scene-audit quick-filter chip keyboard activation aligned with pointer results after remote scene-sync mutations', async () => {
    const route = makeSceneRoute('talker-1', 'listener-1')
    const initialState = {
      ...initialRoutingState,
      scenes: {
        'scene-a': {
          id: 'scene-a',
          name: 'Baseline Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
        'scene-b': {
          id: 'scene-b',
          name: 'Compare Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
      },
      auditLog: [
        {
          id: 'audit-legacy-delete-error',
          timestamp: '2026-02-17T00:00:00Z',
          event_type: 'DELETE_SCENE' as const,
          actor: 'user',
          payload: {},
          diff_summary: 'Deleted scene: Legacy Scene',
          validation_outcome: 'error' as const,
        },
        {
          id: 'audit-preview-warning',
          timestamp: '2026-02-17T00:01:00Z',
          event_type: 'SCENE_DIFF' as const,
          actor: 'user',
          payload: {
            mode: 'preset_import_preview_cancelled',
            phase: 'cancelled',
            reason: 'transfer_draft_changed',
          },
          diff_summary: 'Cancelled scene diff preset import preview (2 rows)',
          validation_outcome: 'warning' as const,
        },
      ],
    }

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
        <TopBarRemoteSceneSyncProbe />
      </RoutingProvider>
    )

    fireEvent.click(screen.getByTestId('topbar-scenes-button'))
    fireEvent.click(screen.getByTestId('topbar-scene-audit-remember-filters-toggle'))
    fireEvent.change(screen.getByTestId('topbar-scene-audit-search-input'), {
      target: { value: 'scene' },
    })

    act(() => {
      topBarSceneSyncDispatch?.({
        type: 'UPDATE_SCENE_METADATA',
        payload: {
          scene_id: 'scene-b',
          name: 'Baseline Scene',
          description: 'remote compare update',
          tags: ['compare', 'remote'],
        },
      })
      topBarSceneSyncDispatch?.({
        type: 'DELETE_SCENE',
        payload: { scene_id: 'scene-a' },
      })
    })

    await waitFor(() => {
      expect(screen.getByTestId('topbar-probe-scene-sync-audit-sequence').textContent).toBe(
        'DELETE_SCENE|UPDATE_SCENE|DELETE_SCENE'
      )
      expect(screen.getByTestId('topbar-probe-scene-sync-audit-warnings').textContent).toBe('1')
      expect(screen.getByTestId('topbar-probe-scene-sync-audit-errors').textContent).toBe('1')
      expect(screen.getByTestId('topbar-probe-scene-sync-audit-deletes').textContent).toBe('2')
    })

    fireEvent.click(screen.getByTestId('topbar-scene-audit-quick-all'))
    await waitFor(() => {
      expect((screen.getByTestId('topbar-scene-audit-search-input') as HTMLInputElement).value).toBe('')
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('3 of 3 matching (3 total)')
    })
    fireEvent.keyDown(screen.getByTestId('topbar-scene-audit-quick-all'), { key: 'Enter' })
    await waitFor(() => {
      expect((screen.getByTestId('topbar-scene-audit-search-input') as HTMLInputElement).value).toBe('')
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('3 of 3 matching (3 total)')
    })

    fireEvent.click(screen.getByTestId('topbar-scene-audit-quick-errors'))
    await waitFor(() => {
      expect((screen.getByTestId('topbar-scene-audit-search-input') as HTMLInputElement).value).toBe('')
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('1 of 1 matching (3 total)')
      expect(screen.getByText('Deleted scene: Legacy Scene')).toBeTruthy()
    })
    fireEvent.keyDown(screen.getByTestId('topbar-scene-audit-quick-errors'), { key: ' ' })
    await waitFor(() => {
      expect((screen.getByTestId('topbar-scene-audit-search-input') as HTMLInputElement).value).toBe('')
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('1 of 1 matching (3 total)')
      expect(screen.getByText('Deleted scene: Legacy Scene')).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('topbar-scene-audit-quick-warnings'))
    await waitFor(() => {
      expect((screen.getByTestId('topbar-scene-audit-search-input') as HTMLInputElement).value).toBe('')
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('1 of 1 matching (3 total)')
      expect(screen.getByText('Updated scene metadata: Compare Scene -> Baseline Scene')).toBeTruthy()
    })
    fireEvent.keyDown(screen.getByTestId('topbar-scene-audit-quick-warnings'), { key: 'Enter' })
    await waitFor(() => {
      expect((screen.getByTestId('topbar-scene-audit-search-input') as HTMLInputElement).value).toBe('')
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('1 of 1 matching (3 total)')
      expect(screen.getByText('Updated scene metadata: Compare Scene -> Baseline Scene')).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('topbar-scene-audit-quick-deletes'))
    await waitFor(() => {
      expect((screen.getByTestId('topbar-scene-audit-search-input') as HTMLInputElement).value).toBe('delete')
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('2 of 2 matching (3 total)')
      expect(screen.getByText('Deleted scene: Legacy Scene')).toBeTruthy()
      expect(screen.getByText('Deleted scene: Baseline Scene')).toBeTruthy()
    })
    fireEvent.keyDown(screen.getByTestId('topbar-scene-audit-quick-deletes'), { key: ' ' })
    await waitFor(() => {
      expect((screen.getByTestId('topbar-scene-audit-search-input') as HTMLInputElement).value).toBe('delete')
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('2 of 2 matching (3 total)')
      expect(screen.getByText('Deleted scene: Legacy Scene')).toBeTruthy()
      expect(screen.getByText('Deleted scene: Baseline Scene')).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('topbar-scene-audit-quick-diff-preview'))
    await waitFor(() => {
      expect((screen.getByTestId('topbar-scene-audit-search-input') as HTMLInputElement).value).toBe('')
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('1 of 1 matching (1 total)')
      expect(screen.getByText('Cancelled scene diff preset import preview (2 rows)')).toBeTruthy()
    })
    fireEvent.keyDown(screen.getByTestId('topbar-scene-audit-quick-diff-preview'), { key: 'Enter' })
    await waitFor(() => {
      expect((screen.getByTestId('topbar-scene-audit-search-input') as HTMLInputElement).value).toBe('')
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('1 of 1 matching (1 total)')
      expect(screen.getByText('Cancelled scene diff preset import preview (2 rows)')).toBeTruthy()
    })
  })

  it('keeps status-strip counter activation aligned with quick-chip filters under the same remote mutation window', async () => {
    const route = makeSceneRoute('talker-1', 'listener-1')
    const initialState = {
      ...initialRoutingState,
      scenes: {
        'scene-a': {
          id: 'scene-a',
          name: 'Baseline Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
        'scene-b': {
          id: 'scene-b',
          name: 'Compare Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
      },
      auditLog: [
        {
          id: 'audit-legacy-delete-error',
          timestamp: '2026-02-17T00:00:00Z',
          event_type: 'DELETE_SCENE' as const,
          actor: 'user',
          payload: {},
          diff_summary: 'Deleted scene: Legacy Scene',
          validation_outcome: 'error' as const,
        },
        {
          id: 'audit-preview-warning',
          timestamp: '2026-02-17T00:01:00Z',
          event_type: 'SCENE_DIFF' as const,
          actor: 'user',
          payload: {
            mode: 'preset_import_preview_cancelled',
            phase: 'cancelled',
            reason: 'transfer_draft_changed',
          },
          diff_summary: 'Cancelled scene diff preset import preview (2 rows)',
          validation_outcome: 'warning' as const,
        },
      ],
    }

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
        <TopBarRemoteSceneSyncProbe />
      </RoutingProvider>
    )

    fireEvent.click(screen.getByTestId('topbar-scenes-button'))
    fireEvent.click(screen.getByTestId('topbar-scene-audit-remember-filters-toggle'))
    fireEvent.change(screen.getByTestId('topbar-scene-audit-search-input'), {
      target: { value: 'scene' },
    })

    act(() => {
      topBarSceneSyncDispatch?.({
        type: 'UPDATE_SCENE_METADATA',
        payload: {
          scene_id: 'scene-b',
          name: 'Baseline Scene',
          description: 'remote compare update',
          tags: ['compare', 'remote'],
        },
      })
      topBarSceneSyncDispatch?.({
        type: 'DELETE_SCENE',
        payload: { scene_id: 'scene-a' },
      })
    })

    await waitFor(() => {
      expect(screen.getByTestId('topbar-probe-scene-sync-audit-sequence').textContent).toBe(
        'DELETE_SCENE|UPDATE_SCENE|DELETE_SCENE'
      )
    })

    fireEvent.click(screen.getByTestId('topbar-scene-audit-quick-errors'))
    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('1 of 1 matching (3 total)')
      expect(screen.getByText('Deleted scene: Legacy Scene')).toBeTruthy()
    })
    fireEvent.keyDown(screen.getByTestId('topbar-scene-status-errors'), { key: 'Enter' })
    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('1 of 1 matching (3 total)')
      expect(screen.getByText('Deleted scene: Legacy Scene')).toBeTruthy()
    })

    fireEvent.keyDown(screen.getByTestId('topbar-scene-audit-quick-warnings'), { key: ' ' })
    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('1 of 1 matching (3 total)')
      expect(screen.getByText('Updated scene metadata: Compare Scene -> Baseline Scene')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('topbar-scene-status-warnings'))
    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('1 of 1 matching (3 total)')
      expect(screen.getByText('Updated scene metadata: Compare Scene -> Baseline Scene')).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('topbar-scene-audit-quick-deletes'))
    await waitFor(() => {
      expect((screen.getByTestId('topbar-scene-audit-search-input') as HTMLInputElement).value).toBe('delete')
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('2 of 2 matching (3 total)')
      expect(screen.getByText('Deleted scene: Legacy Scene')).toBeTruthy()
      expect(screen.getByText('Deleted scene: Baseline Scene')).toBeTruthy()
    })
    fireEvent.keyDown(screen.getByTestId('topbar-scene-status-deletes'), { key: ' ' })
    await waitFor(() => {
      expect((screen.getByTestId('topbar-scene-audit-search-input') as HTMLInputElement).value).toBe('delete')
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('2 of 2 matching (3 total)')
      expect(screen.getByText('Deleted scene: Legacy Scene')).toBeTruthy()
      expect(screen.getByText('Deleted scene: Baseline Scene')).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('topbar-scene-audit-quick-diff-preview'))
    await waitFor(() => {
      expect((screen.getByTestId('topbar-scene-audit-search-input') as HTMLInputElement).value).toBe('')
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('1 of 1 matching (1 total)')
      expect(screen.getByText('Cancelled scene diff preset import preview (2 rows)')).toBeTruthy()
    })
    fireEvent.keyDown(screen.getByTestId('topbar-scene-status-diff-preview-warnings'), { key: 'Enter' })
    await waitFor(() => {
      expect((screen.getByTestId('topbar-scene-audit-search-input') as HTMLInputElement).value).toBe('')
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('1 of 1 matching (1 total)')
      expect(screen.getByText('Cancelled scene diff preset import preview (2 rows)')).toBeTruthy()
    })
  })

  it('refreshes scene-diff import preview deterministically when remote sync invalidates referenced scenes mid-session', async () => {
    const routeA = makeSceneRoute('talker-1', 'listener-1')
    const routeB = makeSceneRoute('talker-2', 'listener-2')
    const initialState = {
      ...initialRoutingState,
      scenes: {
        'scene-a': {
          id: 'scene-a',
          name: 'Baseline Scene',
          description: '',
          routes: [routeA],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
        'scene-b': {
          id: 'scene-b',
          name: 'Compare Scene',
          description: '',
          routes: [routeA, routeB],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
      },
      sceneDiff: {
        ...initialRoutingState.sceneDiff,
        presets: [
          {
            id: 'preset-existing-a',
            name: 'Ops Existing A',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
        ],
      },
    }

    const payload = JSON.stringify([
      {
        name: 'Ops Existing A',
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
      },
      {
        name: 'Ops Fresh B',
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
      },
    ])

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
        <TopBarRemoteSceneSyncProbe />
        <TopBarSceneDiffPreviewLifecycleProbe />
      </RoutingProvider>
    )

    fireEvent.click(screen.getByTestId('topbar-scene-diff-button'))
    fireEvent.change(screen.getByTestId('topbar-scene-diff-preset-transfer-input'), {
      target: { value: payload },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))

    await waitFor(() => {
      expect(screen.getByTestId('probe-scene-diff-preview-lifecycle-count').textContent).toBe('1')
      expect(screen.getByTestId('probe-scene-diff-preview-lifecycle-summary').textContent).toBe('opened:none')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-accepted-count').textContent).toContain('2 accepted')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-conflict-count').textContent).toContain('1 conflict')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-skipped-count').textContent).toContain('0 skipped')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 1')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-renames').textContent).toContain('Planned rename: 0')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-skips').textContent).toContain('Planned skip: 0')
    })

    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-conflict-action-rename-row-1'))
    fireEvent.change(screen.getByTestId('topbar-scene-diff-import-preview-conflict-rename-input-row-1'), {
      target: { value: 'Carryover Remote Rename' },
    })

    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 0')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-renames').textContent).toContain('Planned rename: 1')
      expect(
        (screen.getByTestId('topbar-scene-diff-import-preview-conflict-rename-input-row-1') as HTMLInputElement).value
      ).toBe('Carryover Remote Rename')
    })

    act(() => {
      topBarSceneSyncDispatch?.({
        type: 'UPDATE_SCENE_METADATA',
        payload: {
          scene_id: 'scene-b',
          name: 'Compare Scene Remote',
          description: 'remote compare update',
          tags: ['compare', 'remote'],
        },
      })
      topBarSceneSyncDispatch?.({
        type: 'DELETE_SCENE',
        payload: { scene_id: 'scene-a' },
      })
    })

    await waitFor(() => {
      expect(screen.getByTestId('topbar-probe-scene-sync-scenes').textContent).toContain('Compare Scene Remote:scene-b')
      expect(screen.getByTestId('topbar-probe-scene-sync-scenes').textContent).not.toContain('Baseline Scene:scene-a')
      expect(screen.getByTestId('topbar-probe-scene-sync-selection-validity').textContent).toBe('incomplete')
      expect(screen.getByTestId('topbar-probe-scene-sync-preset-summary').textContent).toBe('none')
      expect(screen.getByTestId('topbar-probe-scene-sync-active-preset').textContent).toBe('none')
    })

    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))

    await waitFor(() => {
      expect(screen.getByTestId('probe-scene-diff-preview-lifecycle-count').textContent).toBe('2')
      expect(screen.getByTestId('probe-scene-diff-preview-lifecycle-summary').textContent).toBe('opened:none|refreshed:none')
      expect(screen.getByTestId('probe-scene-diff-preview-lifecycle-count-summary').textContent).toContain('opened:none:2:')
      expect(screen.getByTestId('probe-scene-diff-preview-lifecycle-count-summary').textContent).toContain(
        '|refreshed:none:2:'
      )
      expect(screen.getByTestId('topbar-scene-diff-import-preview-accepted-count').textContent).toContain('0 accepted')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-conflict-count').textContent).toContain('0 conflict')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-skipped-count').textContent).toContain('2 skipped')
      expect(
        screen.getAllByTestId('topbar-scene-diff-import-preview-row-status').map((entry) => (entry.textContent || '').trim())
      ).toEqual(['skipped', 'skipped'])
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 0')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-renames').textContent).toContain('Planned rename: 0')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-skips').textContent).toContain('Planned skip: 0')
      expect(screen.queryByTestId('topbar-scene-diff-import-preview-conflict-rename-input-row-1')).toBeNull()
    })
  })

  it('preserves deterministic cancellation reason ordering under rapid transfer edit, export, and close handlers', async () => {
    const route = makeSceneRoute('talker-1', 'listener-1')
    const initialState = {
      ...initialRoutingState,
      scenes: {
        'scene-a': {
          id: 'scene-a',
          name: 'Baseline Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
        'scene-b': {
          id: 'scene-b',
          name: 'Compare Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
      },
      sceneDiff: {
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
        preview: null,
        presets: [
          {
            id: 'preset-ops',
            name: 'Ops Pair',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
            preset_version: 1,
            notes: '',
          },
        ],
        active_preset_id: null,
      },
    }

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
        <TopBarSceneDiffPreviewLifecycleProbe />
      </RoutingProvider>
    )

    fireEvent.click(screen.getByTestId('topbar-scene-diff-button'))

    fireEvent.change(screen.getByTestId('topbar-scene-diff-preset-transfer-input'), {
      target: {
        value: JSON.stringify([
          {
            name: 'Imported One',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
          },
        ]),
      },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))

    fireEvent.change(screen.getByTestId('topbar-scene-diff-preset-transfer-input'), {
      target: {
        value: JSON.stringify([
          {
            name: 'Imported Two',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
          },
        ]),
      },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-export'))
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))
    fireEvent.click(screen.getByTestId('topbar-scene-diff-close'))

    await waitFor(() => {
      expect(screen.getByTestId('probe-scene-diff-preview-lifecycle-count').textContent).toBe('6')
      expect(screen.getByTestId('probe-scene-diff-preview-cancelled-reasons').textContent).toBe(
        'transfer_draft_changed|exported_payload_reset|popover_closed'
      )
      expect(screen.getByTestId('probe-scene-diff-preview-lifecycle-summary').textContent).toBe(
        'opened:none|cancelled:transfer_draft_changed|opened:none|cancelled:exported_payload_reset|opened:none|cancelled:popover_closed'
      )
    })
  })

  it('keeps preview lifecycle audit counts deterministic when refreshing from non-default collapse and page state', async () => {
    const route = makeSceneRoute('talker-1', 'listener-1')
    const initialState = {
      ...initialRoutingState,
      scenes: {
        'scene-a': {
          id: 'scene-a',
          name: 'Baseline Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
        'scene-b': {
          id: 'scene-b',
          name: 'Compare Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
      },
      sceneDiff: {
        ...initialRoutingState.sceneDiff,
        presets: [
          {
            id: 'preset-existing-a',
            name: 'Ops Existing A',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
          {
            id: 'preset-existing-b',
            name: 'Ops Existing B',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
          {
            id: 'preset-existing-c',
            name: 'Ops Existing C',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
        ],
      },
    }

    const payload = JSON.stringify([
      {
        name: 'Ops Existing A',
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
      },
      {
        name: 'Ops Existing B',
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
      },
      {
        name: 'Ops Existing C',
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
      },
      ...Array.from({ length: 10 }, (_, index) => ({
        name: `Accepted Preset ${index + 1}`,
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
      })),
      {
        name: 'Missing Compare 1',
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-missing',
      },
      {
        name: 'Missing Compare 2',
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-missing',
      },
    ])

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
        <TopBarSceneDiffPreviewLifecycleProbe />
      </RoutingProvider>
    )

    fireEvent.click(screen.getByTestId('topbar-scene-diff-button'))
    fireEvent.change(screen.getByTestId('topbar-scene-diff-preset-transfer-input'), {
      target: { value: payload },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))

    await waitFor(() => {
      expect(screen.getByTestId('probe-scene-diff-preview-lifecycle-count').textContent).toBe('1')
      expect(screen.getByTestId('probe-scene-diff-preview-lifecycle-summary').textContent).toBe('opened:none')
      expect(screen.getByTestId('probe-scene-diff-preview-lifecycle-count-summary').textContent).toBe(
        'opened:none:15:13:3:2'
      )
      expect(screen.getByTestId('topbar-scene-diff-import-preview-page-summary').textContent).toContain(
        'Showing 1-12 of 15 visible rows (15 total)'
      )
    })

    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-group-toggle-skipped'))
    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-page-next'))

    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-diff-import-preview-page-summary').textContent).toContain(
        'Showing 13-13 of 13 visible rows (15 total)'
      )
      expect(
        screen.getAllByTestId('topbar-scene-diff-import-preview-row-status').map((entry) => (entry.textContent || '').trim())
      ).toEqual(['accepted'])
    })

    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))

    await waitFor(() => {
      expect(screen.getByTestId('probe-scene-diff-preview-lifecycle-count').textContent).toBe('2')
      expect(screen.getByTestId('probe-scene-diff-preview-lifecycle-summary').textContent).toBe('opened:none|refreshed:none')
      expect(screen.getByTestId('probe-scene-diff-preview-lifecycle-count-summary').textContent).toBe(
        'opened:none:15:13:3:2|refreshed:none:15:13:3:2'
      )
      expect(screen.getByTestId('topbar-scene-diff-import-preview-page-summary').textContent).toContain(
        'Showing 1-12 of 15 visible rows (15 total)'
      )
      expect(
        screen.getAllByTestId('topbar-scene-diff-import-preview-row-status').map((entry) => (entry.textContent || '').trim())
      ).toEqual(['conflict', 'conflict', 'conflict', ...Array.from({ length: 9 }, () => 'accepted')])
    })
  })

  it('resets manual conflict overrides, rename drafts, and preview pagination state on refresh', async () => {
    const route = makeSceneRoute('talker-1', 'listener-1')
    const initialState = {
      ...initialRoutingState,
      scenes: {
        'scene-a': {
          id: 'scene-a',
          name: 'Baseline Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
        'scene-b': {
          id: 'scene-b',
          name: 'Compare Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
      },
      sceneDiff: {
        ...initialRoutingState.sceneDiff,
        presets: [
          {
            id: 'preset-existing-a',
            name: 'Ops Existing A',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
          {
            id: 'preset-existing-b',
            name: 'Ops Existing B',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
          {
            id: 'preset-existing-c',
            name: 'Ops Existing C',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
        ],
      },
    }

    const payload = JSON.stringify([
      {
        name: 'Ops Existing A',
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
      },
      {
        name: 'Ops Existing B',
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
      },
      {
        name: 'Ops Existing C',
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
      },
      ...Array.from({ length: 10 }, (_, index) => ({
        name: `Accepted Preset ${index + 1}`,
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
      })),
      {
        name: 'Missing Compare 1',
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-missing',
      },
      {
        name: 'Missing Compare 2',
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-missing',
      },
    ])

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
        <TopBarSceneDiffPreviewLifecycleProbe />
      </RoutingProvider>
    )

    fireEvent.click(screen.getByTestId('topbar-scene-diff-button'))
    fireEvent.change(screen.getByTestId('topbar-scene-diff-preset-transfer-input'), {
      target: { value: payload },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))

    await waitFor(() => {
      expect(screen.getByTestId('probe-scene-diff-preview-lifecycle-count').textContent).toBe('1')
      expect(screen.getByTestId('probe-scene-diff-preview-lifecycle-summary').textContent).toBe('opened:none')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 3')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-renames').textContent).toContain('Planned rename: 0')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-skips').textContent).toContain('Planned skip: 0')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-page-summary').textContent).toContain(
        'Showing 1-12 of 15 visible rows (15 total)'
      )
    })

    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-conflict-action-rename-row-1'))
    const rowOneRenameInput = screen.getByTestId(
      'topbar-scene-diff-import-preview-conflict-rename-input-row-1'
    ) as HTMLInputElement
    expect(rowOneRenameInput.value).toBe('Ops Existing A Imported')
    fireEvent.change(rowOneRenameInput, {
      target: { value: 'Carryover Rename Draft' },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-conflict-action-skip-row-2'))
    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-conflict-action-upsert-row-3'))

    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 1')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-renames').textContent).toContain('Planned rename: 1')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-skips').textContent).toContain('Planned skip: 1')
      expect(
        (screen.getByTestId('topbar-scene-diff-import-preview-conflict-rename-input-row-1') as HTMLInputElement).value
      ).toBe('Carryover Rename Draft')
    })

    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-group-toggle-skipped'))
    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-page-next'))

    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-diff-import-preview-page-summary').textContent).toContain(
        'Showing 13-13 of 13 visible rows (15 total)'
      )
    })

    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))

    await waitFor(() => {
      expect(screen.getByTestId('probe-scene-diff-preview-lifecycle-count').textContent).toBe('2')
      expect(screen.getByTestId('probe-scene-diff-preview-lifecycle-summary').textContent).toBe('opened:none|refreshed:none')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 3')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-renames').textContent).toContain('Planned rename: 0')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-skips').textContent).toContain('Planned skip: 0')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-page-summary').textContent).toContain(
        'Showing 1-12 of 15 visible rows (15 total)'
      )
      expect(screen.queryByTestId('topbar-scene-diff-import-preview-conflict-rename-input-row-1')).toBeNull()
    })

    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-conflict-action-rename-row-1'))

    await waitFor(() => {
      const refreshedRowOneRenameInput = screen.getByTestId(
        'topbar-scene-diff-import-preview-conflict-rename-input-row-1'
      ) as HTMLInputElement
      expect(refreshedRowOneRenameInput.value).toBe('Ops Existing A Imported')
      expect(refreshedRowOneRenameInput.value).not.toBe('Carryover Rename Draft')
    })
  })

  it('rebuilds bulk conflict rename inventories and resets per-row actions across repeated refresh cycles', async () => {
    const route = makeSceneRoute('talker-1', 'listener-1')
    const initialState = {
      ...initialRoutingState,
      scenes: {
        'scene-a': {
          id: 'scene-a',
          name: 'Baseline Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
        'scene-b': {
          id: 'scene-b',
          name: 'Compare Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
      },
      sceneDiff: {
        ...initialRoutingState.sceneDiff,
        presets: [
          {
            id: 'preset-existing-a',
            name: 'Ops Existing A',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
          {
            id: 'preset-existing-b',
            name: 'Ops Existing B',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
          {
            id: 'preset-existing-c',
            name: 'Ops Existing C',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
        ],
      },
    }

    const payload = JSON.stringify([
      {
        name: 'Ops Existing A',
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
      },
      {
        name: 'Ops Existing B',
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
      },
      {
        name: 'Ops Existing C',
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
      },
      {
        name: 'Accepted Preset 1',
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
      },
      {
        name: 'Accepted Preset 2',
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
      },
      {
        name: 'Missing Compare',
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-missing',
      },
    ])

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
        <TopBarSceneDiffPreviewLifecycleProbe />
      </RoutingProvider>
    )

    fireEvent.click(screen.getByTestId('topbar-scene-diff-button'))
    fireEvent.change(screen.getByTestId('topbar-scene-diff-preset-transfer-input'), {
      target: { value: payload },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))

    await waitFor(() => {
      expect(screen.getByTestId('probe-scene-diff-preview-lifecycle-summary').textContent).toBe('opened:none')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 3')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-renames').textContent).toContain('Planned rename: 0')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-skips').textContent).toContain('Planned skip: 0')
    })

    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-conflict-bulk-rename'))

    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 0')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-renames').textContent).toContain('Planned rename: 3')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-skips').textContent).toContain('Planned skip: 0')
      expect(
        (screen.getByTestId('topbar-scene-diff-import-preview-conflict-rename-input-row-1') as HTMLInputElement).value
      ).toBe('Ops Existing A Imported')
      expect(
        (screen.getByTestId('topbar-scene-diff-import-preview-conflict-rename-input-row-2') as HTMLInputElement).value
      ).toBe('Ops Existing B Imported')
      expect(
        (screen.getByTestId('topbar-scene-diff-import-preview-conflict-rename-input-row-3') as HTMLInputElement).value
      ).toBe('Ops Existing C Imported')
    })

    fireEvent.change(screen.getByTestId('topbar-scene-diff-import-preview-conflict-rename-input-row-2'), {
      target: { value: 'Temporary Custom Rename' },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-conflict-action-upsert-row-1'))
    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-conflict-action-skip-row-2'))
    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-conflict-action-rename-row-3'))

    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 1')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-renames').textContent).toContain('Planned rename: 1')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-skips').textContent).toContain('Planned skip: 1')
      expect(
        (screen.getByTestId('topbar-scene-diff-import-preview-conflict-rename-input-row-3') as HTMLInputElement).value
      ).toBe('Ops Existing C Imported')
    })

    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))

    await waitFor(() => {
      expect(screen.getByTestId('probe-scene-diff-preview-lifecycle-summary').textContent).toBe('opened:none|refreshed:none')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 3')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-renames').textContent).toContain('Planned rename: 0')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-skips').textContent).toContain('Planned skip: 0')
      expect(screen.queryByTestId('topbar-scene-diff-import-preview-conflict-rename-input-row-1')).toBeNull()
      expect(screen.queryByTestId('topbar-scene-diff-import-preview-conflict-rename-input-row-2')).toBeNull()
      expect(screen.queryByTestId('topbar-scene-diff-import-preview-conflict-rename-input-row-3')).toBeNull()
    })

    fireEvent.keyDown(screen.getByTestId('topbar-scene-diff-import-preview-conflict-bulk-rename'), { key: 'Enter' })

    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 0')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-renames').textContent).toContain('Planned rename: 3')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-skips').textContent).toContain('Planned skip: 0')
      expect(
        (screen.getByTestId('topbar-scene-diff-import-preview-conflict-rename-input-row-2') as HTMLInputElement).value
      ).toBe('Ops Existing B Imported')
      expect(
        (screen.getByTestId('topbar-scene-diff-import-preview-conflict-rename-input-row-2') as HTMLInputElement).value
      ).not.toBe('Temporary Custom Rename')
    })

    fireEvent.keyDown(screen.getByTestId('topbar-scene-diff-import-preview-conflict-bulk-skip'), { key: ' ' })
    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 0')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-renames').textContent).toContain('Planned rename: 0')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-skips').textContent).toContain('Planned skip: 3')
    })

    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))

    await waitFor(() => {
      expect(screen.getByTestId('probe-scene-diff-preview-lifecycle-summary').textContent).toBe(
        'opened:none|refreshed:none|refreshed:none'
      )
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 3')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-renames').textContent).toContain('Planned rename: 0')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-skips').textContent).toContain('Planned skip: 0')
      expect(screen.queryByTestId('topbar-scene-diff-import-preview-conflict-rename-input-row-2')).toBeNull()
    })
  })

  it('clears invalid rename-row errors and rehydrates deterministic rename defaults across repeated refreshes', async () => {
    const route = makeSceneRoute('talker-1', 'listener-1')
    const initialState = {
      ...initialRoutingState,
      scenes: {
        'scene-a': {
          id: 'scene-a',
          name: 'Baseline Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
        'scene-b': {
          id: 'scene-b',
          name: 'Compare Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
      },
      sceneDiff: {
        ...initialRoutingState.sceneDiff,
        presets: [
          {
            id: 'preset-existing-a',
            name: 'Ops Existing A',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
          {
            id: 'preset-existing-b',
            name: 'Ops Existing B',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-b',
            updated_at: '2026-02-17T00:00:00Z',
          },
        ],
      },
    }

    const payload = JSON.stringify([
      {
        name: 'Ops Existing A',
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
      },
      {
        name: 'Ops Existing B',
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
      },
      {
        name: 'Accepted Preset',
        baseline_scene_id: 'scene-a',
        compare_scene_id: 'scene-b',
      },
    ])

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
        <TopBarSceneDiffPreviewLifecycleProbe />
      </RoutingProvider>
    )

    fireEvent.click(screen.getByTestId('topbar-scene-diff-button'))
    fireEvent.change(screen.getByTestId('topbar-scene-diff-preset-transfer-input'), {
      target: { value: payload },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))

    await waitFor(() => {
      expect(screen.getByTestId('probe-scene-diff-preview-lifecycle-count').textContent).toBe('1')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 2')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-renames').textContent).toContain('Planned rename: 0')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-skips').textContent).toContain('Planned skip: 0')
    })

    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-conflict-action-rename-row-1'))
    fireEvent.change(screen.getByTestId('topbar-scene-diff-import-preview-conflict-rename-input-row-1'), {
      target: { value: 'Ops Existing B' },
    })

    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 1')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-renames').textContent).toContain('Planned rename: 0')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-skips').textContent).toContain('Planned skip: 0')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-conflict-rename-error-row-1').textContent).toContain(
        'rename "Ops Existing B" already exists.'
      )
    })

    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))

    await waitFor(() => {
      expect(screen.getByTestId('probe-scene-diff-preview-lifecycle-count').textContent).toBe('2')
      expect(screen.getByTestId('probe-scene-diff-preview-lifecycle-summary').textContent).toBe('opened:none|refreshed:none')
      expect(screen.queryByTestId('topbar-scene-diff-import-preview-conflict-rename-error-row-1')).toBeNull()
      expect(screen.queryByTestId('topbar-scene-diff-import-preview-conflict-rename-input-row-1')).toBeNull()
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-upserts').textContent).toContain('Planned upsert: 2')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-renames').textContent).toContain('Planned rename: 0')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-plan-skips').textContent).toContain('Planned skip: 0')
    })

    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-conflict-action-rename-row-1'))

    await waitFor(() => {
      expect(
        (screen.getByTestId('topbar-scene-diff-import-preview-conflict-rename-input-row-1') as HTMLInputElement).value
      ).toBe('Ops Existing A Imported')
      expect(screen.getByTestId('topbar-scene-diff-import-preview-conflict-rename-valid-row-1').textContent).toContain(
        'Rename target is valid.'
      )
    })

    fireEvent.change(screen.getByTestId('topbar-scene-diff-import-preview-conflict-rename-input-row-1'), {
      target: { value: 'Ops Existing B' },
    })
    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-diff-import-preview-conflict-rename-error-row-1').textContent).toContain(
        'rename "Ops Existing B" already exists.'
      )
    })

    fireEvent.click(screen.getByTestId('topbar-scene-diff-preset-preview'))
    fireEvent.click(screen.getByTestId('topbar-scene-diff-import-preview-conflict-action-rename-row-1'))

    await waitFor(() => {
      expect(screen.getByTestId('probe-scene-diff-preview-lifecycle-count').textContent).toBe('3')
      expect(screen.getByTestId('probe-scene-diff-preview-lifecycle-summary').textContent).toBe(
        'opened:none|refreshed:none|refreshed:none'
      )
      expect(screen.queryByTestId('topbar-scene-diff-import-preview-conflict-rename-error-row-1')).toBeNull()
      expect(
        (screen.getByTestId('topbar-scene-diff-import-preview-conflict-rename-input-row-1') as HTMLInputElement).value
      ).toBe('Ops Existing A Imported')
    })
  })

  it('keeps mixed remember-filter toggles and status-counter activation deterministic during scene churn', async () => {
    const route = makeSceneRoute('talker-1', 'listener-1')
    const initialState = {
      ...initialRoutingState,
      scenes: {
        'scene-a': {
          id: 'scene-a',
          name: 'Baseline Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
        'scene-b': {
          id: 'scene-b',
          name: 'Compare Scene',
          description: '',
          routes: [route],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
      },
      auditLog: [
        {
          id: 'audit-legacy-delete-error',
          timestamp: '2026-02-17T00:00:00Z',
          event_type: 'DELETE_SCENE' as const,
          actor: 'user',
          payload: {},
          diff_summary: 'Deleted scene: Legacy Scene',
          validation_outcome: 'error' as const,
        },
        {
          id: 'audit-preview-warning',
          timestamp: '2026-02-17T00:01:00Z',
          event_type: 'SCENE_DIFF' as const,
          actor: 'user',
          payload: {
            mode: 'preset_import_preview_cancelled',
            phase: 'cancelled',
            reason: 'transfer_draft_changed',
          },
          diff_summary: 'Cancelled scene diff preset import preview (2 rows)',
          validation_outcome: 'warning' as const,
        },
      ],
    }

    render(
      <RoutingProvider initialState={initialState}>
        <TopBar />
      </RoutingProvider>
    )

    fireEvent.click(screen.getByTestId('topbar-scenes-button'))
    fireEvent.click(screen.getByTestId('topbar-scene-autosuffix-toggle'))

    fireEvent.change(screen.getByTestId('topbar-scene-name-input'), {
      target: { value: 'Ops Snapshot' },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-save'))

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Saved Scene' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Baseline Scene' }))
    fireEvent.change(screen.getByTestId('topbar-scene-edit-name-input'), {
      target: { value: 'Compare Scene' },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-update'))

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Saved Scene' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Compare Scene (scene-b)' }))
    fireEvent.click(screen.getByTestId('topbar-scene-delete'))
    fireEvent.click(screen.getByTestId('topbar-scene-delete'))

    await waitFor(() => {
      expect(screen.getByTestId('topbar-scene-status-errors').textContent).toContain('Errors: 1')
      expect(screen.getByTestId('topbar-scene-status-warnings').textContent).toContain('Warnings: 1')
      expect(screen.getByTestId('topbar-scene-status-deletes').textContent).toContain('Deletes: 2')
      expect(screen.getByTestId('topbar-scene-status-diff-preview-warnings').textContent).toContain('Diff Preview Warnings: 1')
    })

    fireEvent.click(screen.getByTestId('topbar-scene-audit-remember-filters-toggle'))
    fireEvent.change(screen.getByTestId('topbar-scene-audit-search-input'), {
      target: { value: 'saved' },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-close'))

    fireEvent.keyDown(screen.getByTestId('topbar-scene-status-warnings'), { key: 'Enter' })
    await waitFor(() => {
      expect((screen.getByTestId('topbar-scene-audit-search-input') as HTMLInputElement).value).toBe('')
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('1 of 1 matching (4 total)')
      expect(screen.getByText('Updated scene metadata: Baseline Scene -> Compare Scene')).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('topbar-scene-audit-remember-filters-toggle'))
    fireEvent.change(screen.getByTestId('topbar-scene-audit-search-input'), {
      target: { value: 'saved' },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-close'))

    fireEvent.click(screen.getByTestId('topbar-scene-status-errors'))
    await waitFor(() => {
      expect((screen.getByTestId('topbar-scene-audit-search-input') as HTMLInputElement).value).toBe('')
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('1 of 1 matching (4 total)')
      expect(screen.getByText('Deleted scene: Legacy Scene')).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('topbar-scene-audit-remember-filters-toggle'))
    fireEvent.change(screen.getByTestId('topbar-scene-audit-search-input'), {
      target: { value: 'saved' },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-close'))

    fireEvent.keyDown(screen.getByTestId('topbar-scene-status-deletes'), { key: ' ' })
    await waitFor(() => {
      expect((screen.getByTestId('topbar-scene-audit-search-input') as HTMLInputElement).value).toBe('delete')
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('2 of 2 matching (4 total)')
      expect(screen.getByText('Deleted scene: Legacy Scene')).toBeTruthy()
      expect(screen.getByText('Deleted scene: Compare Scene')).toBeTruthy()
    })

    fireEvent.click(screen.getByTestId('topbar-scene-audit-remember-filters-toggle'))
    fireEvent.change(screen.getByTestId('topbar-scene-audit-search-input'), {
      target: { value: 'saved' },
    })
    fireEvent.click(screen.getByTestId('topbar-scene-close'))

    fireEvent.click(screen.getByTestId('topbar-scene-status-diff-preview-warnings'))
    await waitFor(() => {
      expect((screen.getByTestId('topbar-scene-audit-search-input') as HTMLInputElement).value).toBe('')
      expect(screen.getByTestId('topbar-scene-audit-summary').textContent).toContain('1 of 1 matching (1 total)')
      expect(screen.getByText('Cancelled scene diff preset import preview (2 rows)')).toBeTruthy()
    })
  })
})
