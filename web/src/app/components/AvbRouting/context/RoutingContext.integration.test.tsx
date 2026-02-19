import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RoutingProvider, useFilteredEndpoints, useRouting, useRoutingState } from './RoutingContext'
import { initialRoutingState } from '../types'
import type {
  AvbNode,
  ConnectionsResponse,
  Endpoint,
  EndpointsResponse,
  NetworkSyncStatus,
} from '../types'
import { NodeSelector } from '../components/TopBar/NodeSelector'
import { NodeTree } from '../components/NodeTree/NodeTree'

let mockEndpointsData: EndpointsResponse | undefined
let mockConnectionsData: ConnectionsResponse | undefined
let mockNodesData: AvbNode[] | undefined
let mockPtpStatus: NetworkSyncStatus | undefined
let mockLocalNodeId = 'local'

jest.mock('../hooks/useAvbApi', () => ({
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
}))

jest.mock('../hooks/useNodeApi', () => ({
  useNodes: () => ({
    data: mockNodesData,
    isLoading: false,
    error: null,
  }),
  usePtpStatus: () => ({
    data: mockPtpStatus,
  }),
  useLocalNodeId: () => mockLocalNodeId,
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
    node_id: 'local',
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
    node_id: 'node-local',
    name: 'Local Node',
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
      sample_rates: [48000],
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

function RoutingStateProbe() {
  const state = useRoutingState()
  const route = state.liveRoutes['talker-1→listener-1']
  const routeSummary = route
    ? `${route.state}:${route.talker_node_id ?? 'none'}:${route.listener_node_id ?? 'none'}:${route.cross_node ? 'cross' : 'local'}`
    : 'none'
  const nodeIds = Object.keys(state.network.nodes).sort().join('|') || 'none'
  const nodeBStatus = state.network.nodes['node-b']?.status ?? 'missing'
  const crossNodeRouteIds = Object.keys(state.network.crossNodeRoutes).sort().join('|') || 'none'

  return (
    <div>
      <span data-testid="route-summary">{routeSummary}</span>
      <span data-testid="node-ids">{nodeIds}</span>
      <span data-testid="local-node-id">{state.network.nodeSelection.local_node_id}</span>
      <span data-testid="node-b-status">{nodeBStatus}</span>
      <span data-testid="cross-route-ids">{crossNodeRouteIds}</span>
    </div>
  )
}

function MultiSelectProbe() {
  const state = useRoutingState()
  const filteredEndpointIds = useFilteredEndpoints()
    .map((endpoint) => endpoint.endpoint_id)
    .sort()
    .join('|') || 'none'
  const selectedNodeIds = [...state.network.nodeSelection.selected_node_ids].sort().join('|') || 'none'
  const nodeIds = Object.keys(state.network.nodes).sort().join('|') || 'none'
  const liveRouteIds = Object.keys(state.liveRoutes).sort().join('|') || 'none'
  const crossNodeRouteIds = Object.keys(state.network.crossNodeRoutes).sort().join('|') || 'none'

  return (
    <div>
      <span data-testid="multi-view-mode">{state.network.nodeSelection.view_mode}</span>
      <span data-testid="multi-selected-node-ids">{selectedNodeIds}</span>
      <span data-testid="multi-endpoint-ids">{filteredEndpointIds}</span>
      <span data-testid="multi-node-ids">{nodeIds}</span>
      <span data-testid="multi-live-route-ids">{liveRouteIds}</span>
      <span data-testid="multi-cross-route-ids">{crossNodeRouteIds}</span>
    </div>
  )
}

function SafePatchMultiSelectProbe() {
  const { state, dispatch } = useRouting()
  const selectedNodeIds = [...state.network.nodeSelection.selected_node_ids].sort().join('|') || 'none'
  const filteredEndpointIds = useFilteredEndpoints()
    .map((endpoint) => endpoint.endpoint_id)
    .sort()
    .join('|') || 'none'
  const pendingRouteIds = Object.keys(state.pendingRoutes).sort().join('|') || 'none'
  const liveRouteIds = Object.keys(state.liveRoutes).sort().join('|') || 'none'
  const nodeBStatus = state.network.nodes['node-b']?.status ?? 'missing'
  const nodeCStatus = state.network.nodes['node-c']?.status ?? 'missing'

  return (
    <div>
      <span data-testid="safe-view-mode">{state.network.nodeSelection.view_mode}</span>
      <span data-testid="safe-selected-node-ids">{selectedNodeIds}</span>
      <span data-testid="safe-endpoint-ids">{filteredEndpointIds}</span>
      <span data-testid="safe-mode">{state.safePatchMode ? 'on' : 'off'}</span>
      <span data-testid="safe-pending-route-ids">{pendingRouteIds}</span>
      <span data-testid="safe-live-route-ids">{liveRouteIds}</span>
      <span data-testid="safe-node-b-status">{nodeBStatus}</span>
      <span data-testid="safe-node-c-status">{nodeCStatus}</span>

      <button
        data-testid="safe-enter"
        type="button"
        onClick={() => dispatch({ type: 'ENTER_SAFE_MODE' })}
      >
        enter-safe
      </button>
      <button
        data-testid="safe-stage-connect"
        type="button"
        onClick={() => dispatch({ type: 'PATCH', payload: { talker_id: 'talker-1', listener_id: 'listener-1' } })}
      >
        stage-connect
      </button>
      <button
        data-testid="safe-stage-disconnect"
        type="button"
        onClick={() => dispatch({ type: 'UNPATCH', payload: { route_id: 'talker-1→listener-1' } })}
      >
        stage-disconnect
      </button>
      <button
        data-testid="safe-apply"
        type="button"
        onClick={() => dispatch({ type: 'APPLY_SAFE_CHANGES' })}
      >
        apply-safe
      </button>
      <button
        data-testid="safe-discard"
        type="button"
        onClick={() => dispatch({ type: 'DISCARD_SAFE_CHANGES' })}
      >
        discard-safe
      </button>
      <button
        data-testid="safe-undo"
        type="button"
        onClick={() => dispatch({ type: 'UNDO' })}
      >
        safe-undo
      </button>
      <button
        data-testid="safe-redo"
        type="button"
        onClick={() => dispatch({ type: 'REDO' })}
      >
        safe-redo
      </button>
    </div>
  )
}

function SceneDiffProbe() {
  const { state, dispatch } = useRouting()
  const sceneEntries = Object.values(state.scenes)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
  const sceneSummary = sceneEntries.map((scene) => `${scene.name}:${scene.id}`).join('|') || 'none'
  const baselineSceneId = state.sceneDiff.baseline_scene_id
  const compareSceneId = state.sceneDiff.compare_scene_id
  const baselineSceneName = baselineSceneId ? (state.scenes[baselineSceneId]?.name || 'missing') : 'none'
  const compareSceneName = compareSceneId ? (state.scenes[compareSceneId]?.name || 'missing') : 'none'
  const preview = state.sceneDiff.preview
  const previewSummary = preview
    ? `${preview.total_changes}:${preview.to_add.length}:${preview.to_remove.length}:${preview.unchanged.length}`
    : 'none'
  const previewAddRoutes = preview
    ? preview.to_add.map((route) => `${route.talker_id}→${route.listener_id}`).sort().join('|') || 'none'
    : 'none'
  const liveRouteIds = Object.keys(state.liveRoutes).sort().join('|') || 'none'
  const errorMessage = state.error || 'none'

  const baselineByName = sceneEntries.find((scene) => scene.name === 'Baseline Scene')?.id || null
  const compareByName = sceneEntries.find((scene) => scene.name === 'Compare Scene')?.id || null

  return (
    <div>
      <span data-testid="scene-diff-scenes">{sceneSummary}</span>
      <span data-testid="scene-diff-baseline">{baselineSceneName}</span>
      <span data-testid="scene-diff-compare">{compareSceneName}</span>
      <span data-testid="scene-diff-preview-summary">{previewSummary}</span>
      <span data-testid="scene-diff-preview-add-routes">{previewAddRoutes}</span>
      <span data-testid="scene-diff-live-route-ids">{liveRouteIds}</span>
      <span data-testid="scene-diff-error">{errorMessage}</span>

      <button
        data-testid="scene-diff-save-baseline"
        type="button"
        onClick={() => dispatch({
          type: 'SAVE_SCENE',
          payload: {
            name: 'Baseline Scene',
            description: 'baseline',
            tags: ['baseline'],
          },
        })}
      >
        save-baseline
      </button>
      <button
        data-testid="scene-diff-save-compare"
        type="button"
        onClick={() => dispatch({
          type: 'SAVE_SCENE',
          payload: {
            name: 'Compare Scene',
            description: 'compare',
            tags: ['compare'],
          },
        })}
      >
        save-compare
      </button>
      <button
        data-testid="scene-diff-add-route"
        type="button"
        onClick={() => {
          dispatch({ type: 'PATCH', payload: { talker_id: 'talker-2', listener_id: 'listener-2' } })
          dispatch({
            type: 'CONNECTION_STATE_CHANGE',
            payload: {
              route_id: 'talker-2→listener-2',
              state: 'connected',
            },
          })
        }}
      >
        add-route
      </button>
      <button
        data-testid="scene-diff-set-baseline"
        type="button"
        onClick={() => dispatch({ type: 'SET_SCENE_DIFF_BASELINE', payload: baselineByName })}
      >
        set-baseline
      </button>
      <button
        data-testid="scene-diff-set-baseline-none"
        type="button"
        onClick={() => dispatch({ type: 'SET_SCENE_DIFF_BASELINE', payload: null })}
      >
        set-baseline-none
      </button>
      <button
        data-testid="scene-diff-set-compare"
        type="button"
        onClick={() => dispatch({ type: 'SET_SCENE_DIFF_COMPARE', payload: compareByName })}
      >
        set-compare
      </button>
      <button
        data-testid="scene-diff-set-compare-none"
        type="button"
        onClick={() => dispatch({ type: 'SET_SCENE_DIFF_COMPARE', payload: null })}
      >
        set-compare-none
      </button>
      <button
        data-testid="scene-diff-set-compare-invalid"
        type="button"
        onClick={() => dispatch({ type: 'SET_SCENE_DIFF_COMPARE', payload: 'scene-invalid' })}
      >
        set-compare-invalid
      </button>
      <button
        data-testid="scene-diff-generate"
        type="button"
        onClick={() => dispatch({ type: 'GENERATE_SCENE_DIFF' })}
      >
        generate
      </button>
      <button
        data-testid="scene-diff-recall-baseline"
        type="button"
        onClick={() => {
          if (baselineByName) {
            dispatch({ type: 'RECALL_SCENE', payload: { scene_id: baselineByName } })
          }
        }}
      >
        recall-baseline
      </button>
      <button
        data-testid="scene-diff-delete-compare"
        type="button"
        onClick={() => {
          if (compareByName) {
            dispatch({ type: 'DELETE_SCENE', payload: { scene_id: compareByName } })
          }
        }}
      >
        delete-compare
      </button>
      <button
        data-testid="scene-diff-clear"
        type="button"
        onClick={() => dispatch({ type: 'CLEAR_SCENE_DIFF' })}
      >
        clear-diff
      </button>
    </div>
  )
}

function SceneSyncAuditProbe() {
  const { state, dispatch } = useRouting()
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
  const previewSummary = state.sceneDiff.preview
    ? `${state.sceneDiff.preview.total_changes}`
    : 'none'
  const presetSummary = (state.sceneDiff.presets || [])
    .map((preset) => `${preset.name}:${preset.baseline_scene_id}->${preset.compare_scene_id}`)
    .join('|') || 'none'
  const activePresetId = state.sceneDiff.active_preset_id || 'none'
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

  const baselineByName = sceneEntries.find((scene) => scene.name === 'Baseline Scene')?.id || null
  const compareByName = sceneEntries.find((scene) => scene.name === 'Compare Scene')?.id || null

  return (
    <div>
      <span data-testid="scene-sync-scenes">{sceneSummary}</span>
      <span data-testid="scene-sync-baseline">{baselineSceneName}</span>
      <span data-testid="scene-sync-compare">{compareSceneName}</span>
      <span data-testid="scene-sync-selection-validity">{selectionValidity}</span>
      <span data-testid="scene-sync-preview-summary">{previewSummary}</span>
      <span data-testid="scene-sync-preset-summary">{presetSummary}</span>
      <span data-testid="scene-sync-active-preset">{activePresetId}</span>
      <span data-testid="scene-sync-audit-sequence">{sceneAuditSequence}</span>
      <span data-testid="scene-sync-audit-warnings">{String(sceneAuditWarnings)}</span>
      <span data-testid="scene-sync-audit-errors">{String(sceneAuditErrors)}</span>
      <span data-testid="scene-sync-audit-deletes">{String(sceneAuditDeletes)}</span>

      <button
        data-testid="scene-sync-set-baseline"
        type="button"
        onClick={() => dispatch({ type: 'SET_SCENE_DIFF_BASELINE', payload: baselineByName })}
      >
        sync-set-baseline
      </button>
      <button
        data-testid="scene-sync-set-compare"
        type="button"
        onClick={() => dispatch({ type: 'SET_SCENE_DIFF_COMPARE', payload: compareByName })}
      >
        sync-set-compare
      </button>
      <button
        data-testid="scene-sync-generate"
        type="button"
        onClick={() => dispatch({ type: 'GENERATE_SCENE_DIFF' })}
      >
        sync-generate
      </button>
      <button
        data-testid="scene-sync-remote-save"
        type="button"
        onClick={() => dispatch({
          type: 'SAVE_SCENE',
          payload: {
            name: 'Remote Sync Scene',
            description: 'remote scene add',
            tags: ['remote'],
          },
        })}
      >
        sync-remote-save
      </button>
      <button
        data-testid="scene-sync-remote-update-compare"
        type="button"
        onClick={() => {
          const targetSceneId = state.sceneDiff.compare_scene_id || compareByName
          if (!targetSceneId) {
            return
          }
          const compareScene = state.scenes[targetSceneId]
          if (!compareScene) {
            return
          }
          dispatch({
            type: 'UPDATE_SCENE_METADATA',
            payload: {
              scene_id: targetSceneId,
              name: 'Compare Scene Remote',
              description: 'remote compare update',
              tags: ['compare', 'remote'],
            },
          })
        }}
      >
        sync-remote-update-compare
      </button>
      <button
        data-testid="scene-sync-remote-delete-baseline"
        type="button"
        onClick={() => {
          const targetSceneId = baselineByName || state.sceneDiff.baseline_scene_id
          if (!targetSceneId) {
            return
          }
          dispatch({ type: 'DELETE_SCENE', payload: { scene_id: targetSceneId } })
        }}
      >
        sync-remote-delete-baseline
      </button>
    </div>
  )
}

function SceneDiffPreviewLifecycleProbe() {
  const { state, dispatch } = useRouting()
  const previewLifecycleEntries = state.auditLog.filter((entry) => {
    if (entry.event_type !== 'SCENE_DIFF') {
      return false
    }
    const mode = entry.payload.mode
    return typeof mode === 'string' && mode.startsWith('preset_import_preview_')
  })

  const previewLifecycleSummary = previewLifecycleEntries
    .map((entry) => {
      const phase = typeof entry.payload.phase === 'string' ? entry.payload.phase : 'unknown'
      const reason = typeof entry.payload.reason === 'string' ? entry.payload.reason : 'none'
      const sourceCount = typeof entry.payload.source_count === 'number' ? entry.payload.source_count : 'none'
      return `${phase}:${reason}:${sourceCount}:${entry.validation_outcome}`
    })
    .join('|') || 'none'

  return (
    <div>
      <span data-testid="scene-diff-preview-lifecycle-count">{String(previewLifecycleEntries.length)}</span>
      <span data-testid="scene-diff-preview-lifecycle-summary">{previewLifecycleSummary}</span>
      <span data-testid="scene-diff-preview-history-past">{String(state.history.past.length)}</span>
      <span data-testid="scene-diff-preview-history-future">{String(state.history.future.length)}</span>

      <button
        data-testid="scene-diff-preview-opened"
        type="button"
        onClick={() => dispatch({
          type: 'LOG_SCENE_DIFF_PRESET_PREVIEW',
          payload: {
            phase: 'opened',
            source_count: 5,
            accepted_count: 3,
            conflict_count: 1,
            skipped_count: 1,
            preferred_conflict_action: 'rename',
          },
        })}
      >
        preview-opened
      </button>
      <button
        data-testid="scene-diff-preview-refreshed"
        type="button"
        onClick={() => dispatch({
          type: 'LOG_SCENE_DIFF_PRESET_PREVIEW',
          payload: {
            phase: 'refreshed',
            source_count: 4,
            accepted_count: 2,
            conflict_count: 1,
            skipped_count: 1,
            preferred_conflict_action: 'rename',
          },
        })}
      >
        preview-refreshed
      </button>
      <button
        data-testid="scene-diff-preview-cancel-draft"
        type="button"
        onClick={() => dispatch({
          type: 'LOG_SCENE_DIFF_PRESET_PREVIEW',
          payload: {
            phase: 'cancelled',
            reason: 'transfer_draft_changed',
            source_count: 4,
            accepted_count: 2,
            conflict_count: 1,
            skipped_count: 1,
            preferred_conflict_action: 'rename',
          },
        })}
      >
        preview-cancel-draft
      </button>
      <button
        data-testid="scene-diff-preview-cancel-export"
        type="button"
        onClick={() => dispatch({
          type: 'LOG_SCENE_DIFF_PRESET_PREVIEW',
          payload: {
            phase: 'cancelled',
            reason: 'exported_payload_reset',
            source_count: 4,
            accepted_count: 2,
            conflict_count: 1,
            skipped_count: 1,
            preferred_conflict_action: 'rename',
          },
        })}
      >
        preview-cancel-export
      </button>
      <button
        data-testid="scene-diff-preview-cancel-popover"
        type="button"
        onClick={() => dispatch({
          type: 'LOG_SCENE_DIFF_PRESET_PREVIEW',
          payload: {
            phase: 'cancelled',
            reason: 'popover_closed',
            source_count: 4,
            accepted_count: 2,
            conflict_count: 1,
            skipped_count: 1,
            preferred_conflict_action: 'rename',
          },
        })}
      >
        preview-cancel-popover
      </button>
    </div>
  )
}

function SceneDiffDuplicateHintPrecedenceProbe() {
  const { state, dispatch } = useRouting()
  const presets = (state.sceneDiff.presets || [])
    .slice()
    .sort((a, b) => {
      const byName = a.name.localeCompare(b.name)
      return byName !== 0 ? byName : a.id.localeCompare(b.id)
    })
  const presetSummary = presets
    .map((preset) => `${preset.name}:${preset.compare_scene_id}:${preset.preferred_conflict_action || 'none'}`)
    .join('|') || 'none'
  const importEntries = state.auditLog.filter((entry) => (
    entry.event_type === 'SCENE_DIFF' &&
    entry.payload.mode === 'import'
  ))
  const latestImportPayload = importEntries[importEntries.length - 1]?.payload
  const importedCount = typeof latestImportPayload?.imported_count === 'number'
    ? String(latestImportPayload.imported_count)
    : 'none'
  const skippedCount = typeof latestImportPayload?.skipped_count === 'number'
    ? String(latestImportPayload.skipped_count)
    : 'none'

  return (
    <div>
      <span data-testid="scene-diff-duplicate-presets-count">{String(presets.length)}</span>
      <span data-testid="scene-diff-duplicate-presets-summary">{presetSummary}</span>
      <span data-testid="scene-diff-duplicate-imported-count">{importedCount}</span>
      <span data-testid="scene-diff-duplicate-skipped-count">{skippedCount}</span>

      <button
        data-testid="scene-diff-duplicate-import"
        type="button"
        onClick={() => dispatch({
          type: 'IMPORT_SCENE_DIFF_PRESETS',
          payload: {
            presets: [
              {
                name: 'Ops Pair',
                baseline_scene_id: 'scene-a',
                compare_scene_id: 'scene-b',
                preferred_conflict_action: 'rename',
              },
              {
                name: '  Ops Pair  ',
                baseline_scene_id: 'scene-a',
                compare_scene_id: 'scene-c',
                preferred_conflict_action: 'skip',
              },
            ],
          },
        })}
      >
        duplicate-import
      </button>
    </div>
  )
}

describe('RoutingContext API/reducer integration', () => {
  beforeEach(() => {
    mockEndpointsData = undefined
    mockConnectionsData = undefined
    mockNodesData = undefined
    mockPtpStatus = undefined
    mockLocalNodeId = 'local'
  })

  it('syncs cross-node route lifecycle from API payloads into reducer state', async () => {
    mockLocalNodeId = 'node-a'
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote' }),
    ]

    mockEndpointsData = {
      count: 2,
      endpoints: [
        makeEndpoint({
          endpoint_id: 'talker-1',
          direction: 'talker',
          unique_id: 1,
          device_name: 'Talker A',
        }),
        makeEndpoint({
          endpoint_id: 'listener-1',
          direction: 'listener',
          unique_id: 2,
          device_name: 'Listener B',
        }),
      ],
    }

    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'talker-1→listener-1',
          talker: {
            endpoint_id: 'talker-1',
            node_id: 'node-a',
          },
          listener: {
            endpoint_id: 'listener-1',
            node_id: 'node-b',
          },
          state: 'connecting',
          established_time: null,
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    const { rerender } = render(
      <RoutingProvider>
        <RoutingStateProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('route-summary').textContent).toBe('connecting:node-a:node-b:cross')
      expect(screen.getByTestId('node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('local-node-id').textContent).toBe('node-a')
    })

    mockConnectionsData = {
      ...mockConnectionsData,
      connections: [
        {
          ...mockConnectionsData.connections[0],
          state: 'connected',
          established_time: '2026-02-17T01:00:00Z',
        },
      ],
    }

    rerender(
      <RoutingProvider>
        <RoutingStateProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('route-summary').textContent).toBe('connected:node-a:node-b:cross')
    })
  })

  it('reconciles stale cross-node routes when a remote node goes offline', async () => {
    mockLocalNodeId = 'node-a'
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
    ]
    mockEndpointsData = {
      count: 2,
      endpoints: [
        makeEndpoint({
          endpoint_id: 'talker-1',
          direction: 'talker',
          unique_id: 1,
        }),
        makeEndpoint({
          endpoint_id: 'listener-1',
          direction: 'listener',
          unique_id: 2,
        }),
      ],
    }
    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'talker-1→listener-1',
          talker: { endpoint_id: 'talker-1', node_id: 'node-a' },
          listener: { endpoint_id: 'listener-1', node_id: 'node-b' },
          state: 'connected',
          established_time: '2026-02-17T01:00:00Z',
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    const { rerender } = render(
      <RoutingProvider>
        <RoutingStateProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('route-summary').textContent).toBe('connected:node-a:node-b:cross')
      expect(screen.getByTestId('node-b-status').textContent).toBe('online')
      expect(screen.getByTestId('cross-route-ids').textContent).toBe('talker-1→listener-1')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'offline' }),
    ]
    mockConnectionsData = {
      count: 0,
      connections: [],
    }

    rerender(
      <RoutingProvider>
        <RoutingStateProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('route-summary').textContent).toBe('none')
      expect(screen.getByTestId('node-b-status').textContent).toBe('offline')
      expect(screen.getByTestId('cross-route-ids').textContent).toBe('none')
    })
  })

  it('replaces stale cross-node route ids when API sync publishes a different route set', async () => {
    mockLocalNodeId = 'node-a'
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
    ]
    mockEndpointsData = {
      count: 4,
      endpoints: [
        makeEndpoint({ endpoint_id: 'talker-1', direction: 'talker', unique_id: 1 }),
        makeEndpoint({ endpoint_id: 'listener-1', direction: 'listener', unique_id: 2 }),
        makeEndpoint({ endpoint_id: 'talker-2', direction: 'talker', unique_id: 3 }),
        makeEndpoint({ endpoint_id: 'listener-2', direction: 'listener', unique_id: 4 }),
      ],
    }
    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'talker-2→listener-2',
          talker: { endpoint_id: 'talker-2', node_id: 'node-a' },
          listener: { endpoint_id: 'listener-2', node_id: 'node-b' },
          state: 'connected',
          established_time: '2026-02-17T01:30:00Z',
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    const initialState = {
      ...initialRoutingState,
      network: {
        ...initialRoutingState.network,
        crossNodeRoutes: {
          staleRoute: {
            route_id: 'staleRoute',
            source_node_id: 'node-a',
            dest_node_id: 'node-b',
            talker_id: 'talker-1',
            listener_id: 'listener-1',
            status: 'active' as const,
            network_path: ['node-a', 'node-b'],
            latency_ms: 0.9,
            bandwidth_mbps: 8.8,
          },
        },
      },
    }

    render(
      <RoutingProvider initialState={initialState}>
        <RoutingStateProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('cross-route-ids').textContent).toBe('talker-2→listener-2')
    })
  })

  it('retains multi-select node set and filtered endpoint results across node status churn', async () => {
    mockLocalNodeId = 'node-a'
    mockEndpointsData = undefined
    mockConnectionsData = undefined
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]

    const endpointA = makeEndpoint({
      endpoint_id: 'endpoint-a',
      node_id: 'node-a',
      direction: 'talker',
      unique_id: 1,
    })
    const endpointB = makeEndpoint({
      endpoint_id: 'endpoint-b',
      node_id: 'node-b',
      direction: 'listener',
      unique_id: 2,
    })
    const endpointC = makeEndpoint({
      endpoint_id: 'endpoint-c',
      node_id: 'node-c',
      direction: 'talker',
      unique_id: 3,
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

    const { rerender } = render(
      <RoutingProvider initialState={initialState}>
        <MultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('multi-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('multi-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b')
      expect(screen.getByTestId('multi-node-ids').textContent).toBe('node-a|node-b|node-c')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'offline' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'degraded' }),
    ]

    rerender(
      <RoutingProvider initialState={initialState}>
        <MultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('multi-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('multi-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b')
      expect(screen.getByTestId('multi-node-ids').textContent).toBe('node-a|node-b|node-c')
    })
  })

  it('retains multi-select state while nodes are removed and re-joined', async () => {
    mockLocalNodeId = 'node-a'
    mockEndpointsData = undefined
    mockConnectionsData = undefined
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]

    const endpointA = makeEndpoint({
      endpoint_id: 'endpoint-a',
      node_id: 'node-a',
      direction: 'talker',
      unique_id: 1,
    })
    const endpointB = makeEndpoint({
      endpoint_id: 'endpoint-b',
      node_id: 'node-b',
      direction: 'listener',
      unique_id: 2,
    })
    const endpointC = makeEndpoint({
      endpoint_id: 'endpoint-c',
      node_id: 'node-c',
      direction: 'talker',
      unique_id: 3,
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

    const { rerender } = render(
      <RoutingProvider initialState={initialState}>
        <MultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('multi-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('multi-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b')
      expect(screen.getByTestId('multi-node-ids').textContent).toBe('node-a|node-b|node-c')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]

    rerender(
      <RoutingProvider initialState={initialState}>
        <MultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('multi-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('multi-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b')
      expect(screen.getByTestId('multi-node-ids').textContent).toBe('node-a|node-c')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]

    rerender(
      <RoutingProvider initialState={initialState}>
        <MultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('multi-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('multi-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b')
      expect(screen.getByTestId('multi-node-ids').textContent).toBe('node-a|node-b|node-c')
    })
  })

  it('retains multi-select endpoint context during rapid API connection refresh churn', async () => {
    mockLocalNodeId = 'node-a'
    mockEndpointsData = undefined
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'endpoint-a→endpoint-b',
          talker: { endpoint_id: 'endpoint-a', node_id: 'node-a' },
          listener: { endpoint_id: 'endpoint-b', node_id: 'node-b' },
          state: 'connecting',
          established_time: null,
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    const endpointA = makeEndpoint({
      endpoint_id: 'endpoint-a',
      node_id: 'node-a',
      direction: 'talker',
      unique_id: 1,
    })
    const endpointB = makeEndpoint({
      endpoint_id: 'endpoint-b',
      node_id: 'node-b',
      direction: 'listener',
      unique_id: 2,
    })
    const endpointC = makeEndpoint({
      endpoint_id: 'endpoint-c',
      node_id: 'node-c',
      direction: 'talker',
      unique_id: 3,
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

    const { rerender } = render(
      <RoutingProvider initialState={initialState}>
        <MultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('multi-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('multi-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b')
      expect(screen.getByTestId('multi-live-route-ids').textContent).toBe('endpoint-a→endpoint-b')
      expect(screen.getByTestId('multi-cross-route-ids').textContent).toBe('endpoint-a→endpoint-b')
    })

    mockConnectionsData = {
      count: 0,
      connections: [],
    }

    rerender(
      <RoutingProvider initialState={initialState}>
        <MultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('multi-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('multi-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b')
      expect(screen.getByTestId('multi-live-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('multi-cross-route-ids').textContent).toBe('none')
    })

    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'endpoint-a→endpoint-b',
          talker: { endpoint_id: 'endpoint-a', node_id: 'node-a' },
          listener: { endpoint_id: 'endpoint-b', node_id: 'node-b' },
          state: 'connected',
          established_time: '2026-02-17T02:10:00Z',
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    rerender(
      <RoutingProvider initialState={initialState}>
        <MultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('multi-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('multi-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b')
      expect(screen.getByTestId('multi-live-route-ids').textContent).toBe('endpoint-a→endpoint-b')
      expect(screen.getByTestId('multi-cross-route-ids').textContent).toBe('endpoint-a→endpoint-b')
    })
  })

  it('retains multi-select endpoint context during concurrent node-status and connection refresh churn', async () => {
    mockLocalNodeId = 'node-a'
    mockEndpointsData = undefined
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'endpoint-a→endpoint-b',
          talker: { endpoint_id: 'endpoint-a', node_id: 'node-a' },
          listener: { endpoint_id: 'endpoint-b', node_id: 'node-b' },
          state: 'connected',
          established_time: '2026-02-17T02:00:00Z',
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    const endpointA = makeEndpoint({
      endpoint_id: 'endpoint-a',
      node_id: 'node-a',
      direction: 'talker',
      unique_id: 1,
    })
    const endpointB = makeEndpoint({
      endpoint_id: 'endpoint-b',
      node_id: 'node-b',
      direction: 'listener',
      unique_id: 2,
    })
    const endpointC = makeEndpoint({
      endpoint_id: 'endpoint-c',
      node_id: 'node-c',
      direction: 'talker',
      unique_id: 3,
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

    const { rerender } = render(
      <RoutingProvider initialState={initialState}>
        <MultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('multi-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('multi-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b')
      expect(screen.getByTestId('multi-live-route-ids').textContent).toBe('endpoint-a→endpoint-b')
      expect(screen.getByTestId('multi-cross-route-ids').textContent).toBe('endpoint-a→endpoint-b')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'offline' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'degraded' }),
    ]
    mockConnectionsData = {
      count: 0,
      connections: [],
    }

    rerender(
      <RoutingProvider initialState={initialState}>
        <MultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('multi-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('multi-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b')
      expect(screen.getByTestId('multi-live-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('multi-cross-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('multi-node-ids').textContent).toBe('node-a|node-b|node-c')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'endpoint-c→endpoint-b',
          talker: { endpoint_id: 'endpoint-c', node_id: 'node-c' },
          listener: { endpoint_id: 'endpoint-b', node_id: 'node-b' },
          state: 'connecting',
          established_time: null,
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    rerender(
      <RoutingProvider initialState={initialState}>
        <MultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('multi-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('multi-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b')
      expect(screen.getByTestId('multi-live-route-ids').textContent).toBe('endpoint-c→endpoint-b')
      expect(screen.getByTestId('multi-cross-route-ids').textContent).toBe('endpoint-c→endpoint-b')
    })
  })

  it('supports mixed NodeSelector + NodeTree edits during multi-select workflow', async () => {
    mockLocalNodeId = 'node-a'
    mockEndpointsData = undefined
    mockConnectionsData = undefined
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]

    const endpointA = makeEndpoint({
      endpoint_id: 'endpoint-a',
      node_id: 'node-a',
      direction: 'talker',
      unique_id: 1,
    })
    const endpointB = makeEndpoint({
      endpoint_id: 'endpoint-b',
      node_id: 'node-b',
      direction: 'listener',
      unique_id: 2,
    })
    const endpointC = makeEndpoint({
      endpoint_id: 'endpoint-c',
      node_id: 'node-c',
      direction: 'talker',
      unique_id: 3,
    })

    const initialState = {
      ...initialRoutingState,
      network: {
        ...initialRoutingState.network,
        nodeSelection: {
          ...initialRoutingState.network.nodeSelection,
          view_mode: 'single_node' as const,
          current_node_id: 'node-a',
          selected_node_ids: [],
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
        <NodeSelector />
        <NodeTree />
        <MultiSelectProbe />
      </RoutingProvider>
    )

    fireEvent.click(screen.getByTestId('node-selector-multi-select-toggle'))

    await waitFor(() => {
      expect(screen.getByTestId('multi-view-mode').textContent).toBe('multi_select')
      expect(screen.getByTestId('multi-selected-node-ids').textContent).toBe('node-a')
      expect(screen.getByTestId('multi-endpoint-ids').textContent).toBe('endpoint-a')
    })

    fireEvent.click(screen.getByTestId('node-selector-tab-node-b'))

    await waitFor(() => {
      expect(screen.getByTestId('multi-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('multi-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b')
    })

    fireEvent.click(screen.getByTestId('node-tree-item-node-c'))

    await waitFor(() => {
      expect(screen.getByTestId('multi-selected-node-ids').textContent).toBe('node-a|node-b|node-c')
      expect(screen.getByTestId('multi-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b|endpoint-c')
    })

    fireEvent.click(screen.getByTestId('node-tree-item-node-b'))

    await waitFor(() => {
      expect(screen.getByTestId('multi-selected-node-ids').textContent).toBe('node-a|node-c')
      expect(screen.getByTestId('multi-endpoint-ids').textContent).toBe('endpoint-a|endpoint-c')
    })

    fireEvent.click(screen.getByTestId('node-selector-multi-select-toggle'))

    await waitFor(() => {
      expect(screen.getByTestId('multi-view-mode').textContent).toBe('all_nodes')
      expect(screen.getByTestId('multi-endpoint-ids').textContent).toBe('endpoint-a|endpoint-b|endpoint-c')
    })
  })

  it('preserves multi-select node context through safe-patch apply and discard cycles', async () => {
    mockLocalNodeId = 'node-a'
    mockEndpointsData = undefined
    mockConnectionsData = undefined
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
    ]

    const talker = makeEndpoint({
      endpoint_id: 'talker-1',
      node_id: 'node-a',
      direction: 'talker',
      unique_id: 1,
    })
    const listener = makeEndpoint({
      endpoint_id: 'listener-1',
      node_id: 'node-b',
      direction: 'listener',
      unique_id: 2,
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
        [talker.endpoint_id]: talker,
        [listener.endpoint_id]: listener,
      },
    }

    render(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-view-mode').textContent).toBe('multi_select')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('none')
    })

    fireEvent.click(screen.getByTestId('safe-enter'))
    fireEvent.click(screen.getByTestId('safe-stage-connect'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-view-mode').textContent).toBe('multi_select')
    })

    fireEvent.click(screen.getByTestId('safe-apply'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-view-mode').textContent).toBe('multi_select')
    })

    fireEvent.click(screen.getByTestId('safe-enter'))
    fireEvent.click(screen.getByTestId('safe-stage-disconnect'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
    })

    fireEvent.click(screen.getByTestId('safe-discard'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-view-mode').textContent).toBe('multi_select')
    })
  })

  it('retains multi-select safe-patch context while API connection refresh overlaps staged disconnects', async () => {
    mockLocalNodeId = 'node-a'
    mockEndpointsData = undefined
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'talker-1→listener-1',
          talker: { endpoint_id: 'talker-1', node_id: 'node-a' },
          listener: { endpoint_id: 'listener-1', node_id: 'node-b' },
          state: 'connected',
          established_time: '2026-02-17T03:00:00Z',
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    const talker = makeEndpoint({
      endpoint_id: 'talker-1',
      node_id: 'node-a',
      direction: 'talker',
      unique_id: 1,
    })
    const listener = makeEndpoint({
      endpoint_id: 'listener-1',
      node_id: 'node-b',
      direction: 'listener',
      unique_id: 2,
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
        [talker.endpoint_id]: talker,
        [listener.endpoint_id]: listener,
      },
    }

    const { rerender } = render(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
    })

    fireEvent.click(screen.getByTestId('safe-enter'))
    fireEvent.click(screen.getByTestId('safe-stage-disconnect'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
    })

    mockConnectionsData = {
      count: 0,
      connections: [],
    }

    rerender(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-view-mode').textContent).toBe('multi_select')
    })

    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'talker-1→listener-1',
          talker: { endpoint_id: 'talker-1', node_id: 'node-a' },
          listener: { endpoint_id: 'listener-1', node_id: 'node-b' },
          state: 'connecting',
          established_time: null,
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    rerender(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
    })

    fireEvent.click(screen.getByTestId('safe-discard'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-view-mode').textContent).toBe('multi_select')
    })
  })

  it('retains multi-select safe-patch context during concurrent node-status and API refresh overlap', async () => {
    mockLocalNodeId = 'node-a'
    mockEndpointsData = undefined
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'talker-1→listener-1',
          talker: { endpoint_id: 'talker-1', node_id: 'node-a' },
          listener: { endpoint_id: 'listener-1', node_id: 'node-b' },
          state: 'connected',
          established_time: '2026-02-17T03:10:00Z',
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    const talker = makeEndpoint({
      endpoint_id: 'talker-1',
      node_id: 'node-a',
      direction: 'talker',
      unique_id: 1,
    })
    const listener = makeEndpoint({
      endpoint_id: 'listener-1',
      node_id: 'node-b',
      direction: 'listener',
      unique_id: 2,
    })
    const endpointC = makeEndpoint({
      endpoint_id: 'endpoint-c',
      node_id: 'node-c',
      direction: 'talker',
      unique_id: 3,
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
        [talker.endpoint_id]: talker,
        [listener.endpoint_id]: listener,
        [endpointC.endpoint_id]: endpointC,
      },
    }

    const { rerender } = render(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('online')
      expect(screen.getByTestId('safe-node-c-status').textContent).toBe('online')
    })

    fireEvent.click(screen.getByTestId('safe-enter'))
    fireEvent.click(screen.getByTestId('safe-stage-disconnect'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'offline' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'degraded' }),
    ]
    mockConnectionsData = {
      count: 0,
      connections: [],
    }

    rerender(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('offline')
      expect(screen.getByTestId('safe-node-c-status').textContent).toBe('degraded')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'talker-1→listener-1',
          talker: { endpoint_id: 'talker-1', node_id: 'node-a' },
          listener: { endpoint_id: 'listener-1', node_id: 'node-b' },
          state: 'connecting',
          established_time: null,
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    rerender(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('online')
      expect(screen.getByTestId('safe-node-c-status').textContent).toBe('online')
    })

    fireEvent.click(screen.getByTestId('safe-apply'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-view-mode').textContent).toBe('multi_select')
    })
  })

  it('retains safe-patch apply/discard behavior while selected-node inventories remove and rejoin', async () => {
    mockLocalNodeId = 'node-a'
    mockEndpointsData = undefined
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = {
      count: 0,
      connections: [],
    }

    const talker = makeEndpoint({
      endpoint_id: 'talker-1',
      node_id: 'node-a',
      direction: 'talker',
      unique_id: 1,
    })
    const listener = makeEndpoint({
      endpoint_id: 'listener-1',
      node_id: 'node-b',
      direction: 'listener',
      unique_id: 2,
    })
    const endpointC = makeEndpoint({
      endpoint_id: 'endpoint-c',
      node_id: 'node-c',
      direction: 'talker',
      unique_id: 3,
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
        [talker.endpoint_id]: talker,
        [listener.endpoint_id]: listener,
        [endpointC.endpoint_id]: endpointC,
      },
    }

    const { rerender } = render(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('online')
    })

    fireEvent.click(screen.getByTestId('safe-enter'))
    fireEvent.click(screen.getByTestId('safe-stage-connect'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]

    rerender(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('missing')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]

    rerender(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('online')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
    })

    fireEvent.click(screen.getByTestId('safe-apply'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
    })

    fireEvent.click(screen.getByTestId('safe-enter'))
    fireEvent.click(screen.getByTestId('safe-stage-disconnect'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'degraded' }),
    ]
    mockConnectionsData = {
      count: 0,
      connections: [],
    }

    rerender(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('missing')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'talker-1→listener-1',
          talker: { endpoint_id: 'talker-1', node_id: 'node-a' },
          listener: { endpoint_id: 'listener-1', node_id: 'node-b' },
          state: 'connected',
          established_time: '2026-02-17T03:20:00Z',
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    rerender(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('online')
    })

    fireEvent.click(screen.getByTestId('safe-discard'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-view-mode').textContent).toBe('multi_select')
    })
  })

  it('handles mixed safe-patch apply/discard windows during node remove/rejoin and connection re-sync races', async () => {
    mockLocalNodeId = 'node-a'
    mockEndpointsData = undefined
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = {
      count: 0,
      connections: [],
    }

    const talker = makeEndpoint({
      endpoint_id: 'talker-1',
      node_id: 'node-a',
      direction: 'talker',
      unique_id: 1,
    })
    const listener = makeEndpoint({
      endpoint_id: 'listener-1',
      node_id: 'node-b',
      direction: 'listener',
      unique_id: 2,
    })
    const endpointC = makeEndpoint({
      endpoint_id: 'endpoint-c',
      node_id: 'node-c',
      direction: 'talker',
      unique_id: 3,
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
        [talker.endpoint_id]: talker,
        [listener.endpoint_id]: listener,
        [endpointC.endpoint_id]: endpointC,
      },
    }

    const { rerender } = render(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('online')
    })

    fireEvent.click(screen.getByTestId('safe-enter'))
    fireEvent.click(screen.getByTestId('safe-stage-connect'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('none')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'talker-1→listener-1',
          talker: { endpoint_id: 'talker-1', node_id: 'node-a' },
          listener: { endpoint_id: 'listener-1', node_id: 'node-b' },
          state: 'connecting',
          established_time: null,
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    rerender(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('missing')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = {
      count: 0,
      connections: [],
    }

    rerender(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('online')
    })

    fireEvent.click(screen.getByTestId('safe-apply'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
    })

    fireEvent.click(screen.getByTestId('safe-enter'))
    fireEvent.click(screen.getByTestId('safe-stage-disconnect'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'degraded' }),
    ]
    mockConnectionsData = {
      count: 0,
      connections: [],
    }

    rerender(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('missing')
      expect(screen.getByTestId('safe-node-c-status').textContent).toBe('degraded')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'talker-1→listener-1',
          talker: { endpoint_id: 'talker-1', node_id: 'node-a' },
          listener: { endpoint_id: 'listener-1', node_id: 'node-b' },
          state: 'connected',
          established_time: '2026-02-17T03:25:00Z',
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    rerender(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('online')
      expect(screen.getByTestId('safe-node-c-status').textContent).toBe('online')
    })

    fireEvent.click(screen.getByTestId('safe-discard'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-view-mode').textContent).toBe('multi_select')
    })
  })

  it('retains multi-select context when safe mode exits during selected-node status transitions in the same sync window', async () => {
    mockLocalNodeId = 'node-a'
    mockEndpointsData = undefined
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'talker-1→listener-1',
          talker: { endpoint_id: 'talker-1', node_id: 'node-a' },
          listener: { endpoint_id: 'listener-1', node_id: 'node-b' },
          state: 'connected',
          established_time: '2026-02-17T03:35:00Z',
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    const talker = makeEndpoint({
      endpoint_id: 'talker-1',
      node_id: 'node-a',
      direction: 'talker',
      unique_id: 1,
    })
    const listener = makeEndpoint({
      endpoint_id: 'listener-1',
      node_id: 'node-b',
      direction: 'listener',
      unique_id: 2,
    })
    const endpointC = makeEndpoint({
      endpoint_id: 'endpoint-c',
      node_id: 'node-c',
      direction: 'talker',
      unique_id: 3,
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
        [talker.endpoint_id]: talker,
        [listener.endpoint_id]: listener,
        [endpointC.endpoint_id]: endpointC,
      },
    }

    const { rerender } = render(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('online')
      expect(screen.getByTestId('safe-node-c-status').textContent).toBe('online')
    })

    fireEvent.click(screen.getByTestId('safe-enter'))
    fireEvent.click(screen.getByTestId('safe-stage-disconnect'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'degraded' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'offline' }),
    ]
    mockConnectionsData = {
      count: 0,
      connections: [],
    }

    fireEvent.click(screen.getByTestId('safe-apply'))
    rerender(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('degraded')
      expect(screen.getByTestId('safe-node-c-status').textContent).toBe('offline')
      expect(screen.getByTestId('safe-view-mode').textContent).toBe('multi_select')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'offline' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'degraded' }),
    ]

    rerender(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('offline')
      expect(screen.getByTestId('safe-node-c-status').textContent).toBe('degraded')
    })
  })

  it('retains multi-select context when safe-mode exit overlaps node remove/rejoin and route-id replacement sync', async () => {
    mockLocalNodeId = 'node-a'
    mockEndpointsData = undefined
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'talker-1→listener-1',
          talker: { endpoint_id: 'talker-1', node_id: 'node-a' },
          listener: { endpoint_id: 'listener-1', node_id: 'node-b' },
          state: 'connected',
          established_time: '2026-02-17T03:45:00Z',
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    const talker = makeEndpoint({
      endpoint_id: 'talker-1',
      node_id: 'node-a',
      direction: 'talker',
      unique_id: 1,
    })
    const listener = makeEndpoint({
      endpoint_id: 'listener-1',
      node_id: 'node-b',
      direction: 'listener',
      unique_id: 2,
    })
    const endpointC = makeEndpoint({
      endpoint_id: 'endpoint-c',
      node_id: 'node-c',
      direction: 'talker',
      unique_id: 3,
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
        [talker.endpoint_id]: talker,
        [listener.endpoint_id]: listener,
        [endpointC.endpoint_id]: endpointC,
      },
    }

    const { rerender } = render(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('online')
    })

    fireEvent.click(screen.getByTestId('safe-enter'))
    fireEvent.click(screen.getByTestId('safe-stage-disconnect'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'endpoint-c→listener-1',
          talker: { endpoint_id: 'endpoint-c', node_id: 'node-c' },
          listener: { endpoint_id: 'listener-1', node_id: 'node-b' },
          state: 'connecting',
          established_time: null,
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    fireEvent.click(screen.getByTestId('safe-apply'))
    rerender(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('endpoint-c→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('missing')
      expect(screen.getByTestId('safe-node-c-status').textContent).toBe('online')
      expect(screen.getByTestId('safe-view-mode').textContent).toBe('multi_select')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'degraded' }),
    ]
    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'talker-1→listener-1',
          talker: { endpoint_id: 'talker-1', node_id: 'node-a' },
          listener: { endpoint_id: 'listener-1', node_id: 'node-b' },
          state: 'connected',
          established_time: '2026-02-17T03:46:00Z',
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    rerender(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('online')
      expect(screen.getByTestId('safe-node-c-status').textContent).toBe('degraded')
    })
  })

  it('preserves undo/redo consistency when safe-mode exit overlaps route-id replacement and node-status churn', async () => {
    mockLocalNodeId = 'node-a'
    mockEndpointsData = undefined
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'talker-1→listener-1',
          talker: { endpoint_id: 'talker-1', node_id: 'node-a' },
          listener: { endpoint_id: 'listener-1', node_id: 'node-b' },
          state: 'connected',
          established_time: '2026-02-17T03:55:00Z',
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    const talker = makeEndpoint({
      endpoint_id: 'talker-1',
      node_id: 'node-a',
      direction: 'talker',
      unique_id: 1,
    })
    const listener = makeEndpoint({
      endpoint_id: 'listener-1',
      node_id: 'node-b',
      direction: 'listener',
      unique_id: 2,
    })
    const endpointC = makeEndpoint({
      endpoint_id: 'endpoint-c',
      node_id: 'node-c',
      direction: 'talker',
      unique_id: 3,
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
        [talker.endpoint_id]: talker,
        [listener.endpoint_id]: listener,
        [endpointC.endpoint_id]: endpointC,
      },
    }

    const { rerender } = render(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
    })

    fireEvent.click(screen.getByTestId('safe-enter'))
    fireEvent.click(screen.getByTestId('safe-stage-disconnect'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('talker-1→listener-1')
    })

    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'degraded' }),
      makeNode({ node_id: 'node-c', name: 'Node C', type: 'map2_remote', status: 'offline' }),
    ]
    mockConnectionsData = {
      count: 1,
      connections: [
        {
          connection_id: 'endpoint-c→listener-1',
          talker: { endpoint_id: 'endpoint-c', node_id: 'node-c' },
          listener: { endpoint_id: 'listener-1', node_id: 'node-b' },
          state: 'connecting',
          established_time: null,
          error_message: null,
          srp_reservation_id: null,
          srp_admission_id: null,
        },
      ],
    }

    rerender(
      <RoutingProvider initialState={initialState}>
        <SafePatchMultiSelectProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('endpoint-c→listener-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('degraded')
      expect(screen.getByTestId('safe-node-c-status').textContent).toBe('offline')
    })

    fireEvent.click(screen.getByTestId('safe-apply'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('endpoint-c→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('degraded')
      expect(screen.getByTestId('safe-node-c-status').textContent).toBe('offline')
    })

    fireEvent.click(screen.getByTestId('safe-undo'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('on')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('talker-1→listener-1')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('endpoint-c→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('degraded')
      expect(screen.getByTestId('safe-node-c-status').textContent).toBe('offline')
    })

    fireEvent.click(screen.getByTestId('safe-redo'))

    await waitFor(() => {
      expect(screen.getByTestId('safe-mode').textContent).toBe('off')
      expect(screen.getByTestId('safe-pending-route-ids').textContent).toBe('none')
      expect(screen.getByTestId('safe-live-route-ids').textContent).toBe('endpoint-c→listener-1')
      expect(screen.getByTestId('safe-selected-node-ids').textContent).toBe('node-a|node-b')
      expect(screen.getByTestId('safe-endpoint-ids').textContent).toBe('listener-1|talker-1')
      expect(screen.getByTestId('safe-node-b-status').textContent).toBe('degraded')
      expect(screen.getByTestId('safe-node-c-status').textContent).toBe('offline')
    })
  })

  it('supports scene-diff baseline/compare flow through save, recall, and delete churn', async () => {
    mockLocalNodeId = 'node-a'
    mockEndpointsData = undefined
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = undefined

    const talker1 = makeEndpoint({
      endpoint_id: 'talker-1',
      node_id: 'node-a',
      direction: 'talker',
      unique_id: 1,
    })
    const listener1 = makeEndpoint({
      endpoint_id: 'listener-1',
      node_id: 'node-b',
      direction: 'listener',
      unique_id: 2,
    })
    const talker2 = makeEndpoint({
      endpoint_id: 'talker-2',
      node_id: 'node-a',
      direction: 'talker',
      unique_id: 3,
    })
    const listener2 = makeEndpoint({
      endpoint_id: 'listener-2',
      node_id: 'node-b',
      direction: 'listener',
      unique_id: 4,
    })

    const initialState = {
      ...initialRoutingState,
      endpoints: {
        [talker1.endpoint_id]: talker1,
        [listener1.endpoint_id]: listener1,
        [talker2.endpoint_id]: talker2,
        [listener2.endpoint_id]: listener2,
      },
      liveRoutes: {
        'talker-1→listener-1': {
          id: 'talker-1→listener-1',
          talker_id: 'talker-1',
          listener_id: 'listener-1',
          state: 'connected' as const,
          established_time: '2026-02-17T04:10:00Z',
          error_message: null,
          connection_count: 1,
          srp_reservation_id: null,
          srp_admission_id: null,
          locked: false,
          valid: true,
          messages: [],
          talker_node_id: 'node-a',
          listener_node_id: 'node-b',
          cross_node: true,
        },
      },
    }

    render(
      <RoutingProvider initialState={initialState}>
        <SceneDiffProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('scene-diff-scenes').textContent).toBe('none')
      expect(screen.getByTestId('scene-diff-live-route-ids').textContent).toBe('talker-1→listener-1')
    })

    fireEvent.click(screen.getByTestId('scene-diff-save-baseline'))

    await waitFor(() => {
      expect(screen.getByTestId('scene-diff-scenes').textContent).toContain('Baseline Scene:')
    })

    fireEvent.click(screen.getByTestId('scene-diff-add-route'))

    await waitFor(() => {
      expect(screen.getByTestId('scene-diff-live-route-ids').textContent).toBe('talker-1→listener-1|talker-2→listener-2')
    })

    fireEvent.click(screen.getByTestId('scene-diff-save-compare'))

    await waitFor(() => {
      expect(screen.getByTestId('scene-diff-scenes').textContent).toContain('Compare Scene:')
    })

    fireEvent.click(screen.getByTestId('scene-diff-set-baseline'))
    fireEvent.click(screen.getByTestId('scene-diff-set-compare'))
    fireEvent.click(screen.getByTestId('scene-diff-generate'))

    await waitFor(() => {
      expect(screen.getByTestId('scene-diff-baseline').textContent).toBe('Baseline Scene')
      expect(screen.getByTestId('scene-diff-compare').textContent).toBe('Compare Scene')
      expect(screen.getByTestId('scene-diff-preview-summary').textContent).toBe('1:1:0:1')
      expect(screen.getByTestId('scene-diff-preview-add-routes').textContent).toBe('talker-2→listener-2')
    })

    fireEvent.click(screen.getByTestId('scene-diff-recall-baseline'))

    await waitFor(() => {
      expect(screen.getByTestId('scene-diff-live-route-ids').textContent).toBe('talker-1→listener-1')
    })

    fireEvent.click(screen.getByTestId('scene-diff-delete-compare'))

    await waitFor(() => {
      expect(screen.getByTestId('scene-diff-scenes').textContent).not.toContain('Compare Scene:')
      expect(screen.getByTestId('scene-diff-compare').textContent).toBe('none')
      expect(screen.getByTestId('scene-diff-preview-summary').textContent).toBe('none')
    })
  })

  it('handles scene-diff missing/invalid selection errors and reset paths after preview generation', async () => {
    mockLocalNodeId = 'node-a'
    mockEndpointsData = undefined
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = undefined

    const talker1 = makeEndpoint({
      endpoint_id: 'talker-1',
      node_id: 'node-a',
      direction: 'talker',
      unique_id: 1,
    })
    const listener1 = makeEndpoint({
      endpoint_id: 'listener-1',
      node_id: 'node-b',
      direction: 'listener',
      unique_id: 2,
    })
    const talker2 = makeEndpoint({
      endpoint_id: 'talker-2',
      node_id: 'node-a',
      direction: 'talker',
      unique_id: 3,
    })
    const listener2 = makeEndpoint({
      endpoint_id: 'listener-2',
      node_id: 'node-b',
      direction: 'listener',
      unique_id: 4,
    })

    const initialState = {
      ...initialRoutingState,
      endpoints: {
        [talker1.endpoint_id]: talker1,
        [listener1.endpoint_id]: listener1,
        [talker2.endpoint_id]: talker2,
        [listener2.endpoint_id]: listener2,
      },
      liveRoutes: {
        'talker-1→listener-1': {
          id: 'talker-1→listener-1',
          talker_id: 'talker-1',
          listener_id: 'listener-1',
          state: 'connected' as const,
          established_time: '2026-02-17T04:20:00Z',
          error_message: null,
          connection_count: 1,
          srp_reservation_id: null,
          srp_admission_id: null,
          locked: false,
          valid: true,
          messages: [],
          talker_node_id: 'node-a',
          listener_node_id: 'node-b',
          cross_node: true,
        },
      },
    }

    render(
      <RoutingProvider initialState={initialState}>
        <SceneDiffProbe />
      </RoutingProvider>
    )

    fireEvent.click(screen.getByTestId('scene-diff-generate'))

    await waitFor(() => {
      expect(screen.getByTestId('scene-diff-error').textContent).toBe(
        'Scene diff requires both baseline and compare scene selections'
      )
    })

    fireEvent.click(screen.getByTestId('scene-diff-save-baseline'))
    fireEvent.click(screen.getByTestId('scene-diff-add-route'))
    fireEvent.click(screen.getByTestId('scene-diff-save-compare'))

    await waitFor(() => {
      expect(screen.getByTestId('scene-diff-scenes').textContent).toContain('Baseline Scene:')
      expect(screen.getByTestId('scene-diff-scenes').textContent).toContain('Compare Scene:')
    })

    fireEvent.click(screen.getByTestId('scene-diff-set-baseline'))
    fireEvent.click(screen.getByTestId('scene-diff-set-compare-invalid'))
    fireEvent.click(screen.getByTestId('scene-diff-generate'))

    await waitFor(() => {
      expect(screen.getByTestId('scene-diff-error').textContent).toBe('Scene diff scene selection is invalid')
    })

    fireEvent.click(screen.getByTestId('scene-diff-set-compare'))
    fireEvent.click(screen.getByTestId('scene-diff-generate'))

    await waitFor(() => {
      expect(screen.getByTestId('scene-diff-error').textContent).toBe('none')
      expect(screen.getByTestId('scene-diff-preview-summary').textContent).toBe('1:1:0:1')
    })

    fireEvent.click(screen.getByTestId('scene-diff-delete-compare'))

    await waitFor(() => {
      expect(screen.getByTestId('scene-diff-compare').textContent).toBe('none')
      expect(screen.getByTestId('scene-diff-preview-summary').textContent).toBe('none')
    })

    fireEvent.click(screen.getByTestId('scene-diff-clear'))

    await waitFor(() => {
      expect(screen.getByTestId('scene-diff-baseline').textContent).toBe('none')
      expect(screen.getByTestId('scene-diff-compare').textContent).toBe('none')
      expect(screen.getByTestId('scene-diff-preview-summary').textContent).toBe('none')
    })
  })

  it('preserves deterministic scene-diff validity and scene-audit counters during remote scene add/update/delete sync churn', async () => {
    mockLocalNodeId = 'node-a'
    mockEndpointsData = undefined
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = undefined

    const routeA = {
      id: 'talker-1→listener-1',
      talker_id: 'talker-1',
      listener_id: 'listener-1',
      state: 'connected' as const,
      established_time: '2026-02-17T05:00:00Z',
      error_message: null,
      connection_count: 1,
      srp_reservation_id: null,
      srp_admission_id: null,
      locked: false,
      valid: true,
      messages: [],
      talker_node_id: 'node-a',
      listener_node_id: 'node-b',
      cross_node: true,
    }
    const routeB = {
      id: 'talker-2→listener-2',
      talker_id: 'talker-2',
      listener_id: 'listener-2',
      state: 'connected' as const,
      established_time: '2026-02-17T05:01:00Z',
      error_message: null,
      connection_count: 1,
      srp_reservation_id: null,
      srp_admission_id: null,
      locked: false,
      valid: true,
      messages: [],
      talker_node_id: 'node-a',
      listener_node_id: 'node-b',
      cross_node: true,
    }

    const initialState = {
      ...initialRoutingState,
      scenes: {
        'scene-a': {
          id: 'scene-a',
          name: 'Baseline Scene',
          description: '',
          routes: [routeA],
          timestamp: '2026-02-17T05:02:00Z',
          tags: ['baseline'],
        },
        'scene-b': {
          id: 'scene-b',
          name: 'Compare Scene',
          description: '',
          routes: [routeA, routeB],
          timestamp: '2026-02-17T05:03:00Z',
          tags: ['compare'],
        },
      },
      endpoints: {
        'talker-1': makeEndpoint({
          endpoint_id: 'talker-1',
          node_id: 'node-a',
          direction: 'talker',
          unique_id: 1,
        }),
        'listener-1': makeEndpoint({
          endpoint_id: 'listener-1',
          node_id: 'node-b',
          direction: 'listener',
          unique_id: 2,
        }),
        'talker-2': makeEndpoint({
          endpoint_id: 'talker-2',
          node_id: 'node-a',
          direction: 'talker',
          unique_id: 3,
        }),
        'listener-2': makeEndpoint({
          endpoint_id: 'listener-2',
          node_id: 'node-b',
          direction: 'listener',
          unique_id: 4,
        }),
      },
      liveRoutes: {
        [routeA.id]: routeA,
      },
    }

    render(
      <RoutingProvider initialState={initialState}>
        <SceneSyncAuditProbe />
      </RoutingProvider>
    )

    fireEvent.click(screen.getByTestId('scene-sync-set-baseline'))
    fireEvent.click(screen.getByTestId('scene-sync-set-compare'))
    fireEvent.click(screen.getByTestId('scene-sync-generate'))

    await waitFor(() => {
      expect(screen.getByTestId('scene-sync-baseline').textContent).toBe('Baseline Scene')
      expect(screen.getByTestId('scene-sync-compare').textContent).toBe('Compare Scene')
      expect(screen.getByTestId('scene-sync-selection-validity').textContent).toBe('ready')
      expect(screen.getByTestId('scene-sync-preview-summary').textContent).toBe('1')
      expect(screen.getByTestId('scene-sync-preset-summary').textContent).toBe('none')
      expect(screen.getByTestId('scene-sync-active-preset').textContent).toBe('none')
      expect(screen.getByTestId('scene-sync-audit-sequence').textContent).toBe('none')
      expect(screen.getByTestId('scene-sync-audit-warnings').textContent).toBe('0')
      expect(screen.getByTestId('scene-sync-audit-errors').textContent).toBe('0')
      expect(screen.getByTestId('scene-sync-audit-deletes').textContent).toBe('0')
    })

    fireEvent.click(screen.getByTestId('scene-sync-remote-save'))
    fireEvent.click(screen.getByTestId('scene-sync-remote-update-compare'))
    fireEvent.click(screen.getByTestId('scene-sync-remote-delete-baseline'))

    await waitFor(() => {
      expect(screen.getByTestId('scene-sync-scenes').textContent).toContain('Compare Scene Remote:scene-b')
      expect(screen.getByTestId('scene-sync-scenes').textContent).toContain('Remote Sync Scene:')
      expect(screen.getByTestId('scene-sync-scenes').textContent).not.toContain('Baseline Scene:scene-a')
      expect(screen.getByTestId('scene-sync-baseline').textContent).toBe('none')
      expect(screen.getByTestId('scene-sync-compare').textContent).toBe('Compare Scene Remote')
      expect(screen.getByTestId('scene-sync-selection-validity').textContent).toBe('incomplete')
      expect(screen.getByTestId('scene-sync-preview-summary').textContent).toBe('none')
      expect(screen.getByTestId('scene-sync-preset-summary').textContent).toBe('none')
      expect(screen.getByTestId('scene-sync-active-preset').textContent).toBe('none')
      expect(screen.getByTestId('scene-sync-audit-sequence').textContent).toBe('SAVE_SCENE|UPDATE_SCENE|DELETE_SCENE')
      expect(screen.getByTestId('scene-sync-audit-warnings').textContent).toBe('0')
      expect(screen.getByTestId('scene-sync-audit-errors').textContent).toBe('0')
      expect(screen.getByTestId('scene-sync-audit-deletes').textContent).toBe('1')
    })
  })

  it('remediates active stale presets deterministically during remote compare-update plus baseline-delete sync windows', async () => {
    mockLocalNodeId = 'node-a'
    mockEndpointsData = undefined
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = undefined

    const routeA = {
      id: 'talker-1→listener-1',
      talker_id: 'talker-1',
      listener_id: 'listener-1',
      state: 'connected' as const,
      established_time: '2026-02-17T05:00:00Z',
      error_message: null,
      connection_count: 1,
      srp_reservation_id: null,
      srp_admission_id: null,
      locked: false,
      valid: true,
      messages: [],
      talker_node_id: 'node-a',
      listener_node_id: 'node-b',
      cross_node: true,
    }
    const routeB = {
      id: 'talker-2→listener-2',
      talker_id: 'talker-2',
      listener_id: 'listener-2',
      state: 'connected' as const,
      established_time: '2026-02-17T05:01:00Z',
      error_message: null,
      connection_count: 1,
      srp_reservation_id: null,
      srp_admission_id: null,
      locked: false,
      valid: true,
      messages: [],
      talker_node_id: 'node-a',
      listener_node_id: 'node-b',
      cross_node: true,
    }

    const initialState = {
      ...initialRoutingState,
      scenes: {
        'scene-a': {
          id: 'scene-a',
          name: 'Baseline Scene',
          description: '',
          routes: [routeA],
          timestamp: '2026-02-17T05:02:00Z',
          tags: ['baseline'],
        },
        'scene-b': {
          id: 'scene-b',
          name: 'Compare Scene',
          description: '',
          routes: [routeA, routeB],
          timestamp: '2026-02-17T05:03:00Z',
          tags: ['compare'],
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
            updated_at: '2026-02-17T05:04:00Z',
          },
          {
            id: 'preset-stale-active',
            name: 'Stale Pair',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-missing',
            updated_at: '2026-02-17T05:05:00Z',
          },
        ],
        active_preset_id: 'preset-stale-active',
      },
      endpoints: {
        'talker-1': makeEndpoint({
          endpoint_id: 'talker-1',
          node_id: 'node-a',
          direction: 'talker',
          unique_id: 1,
        }),
        'listener-1': makeEndpoint({
          endpoint_id: 'listener-1',
          node_id: 'node-b',
          direction: 'listener',
          unique_id: 2,
        }),
        'talker-2': makeEndpoint({
          endpoint_id: 'talker-2',
          node_id: 'node-a',
          direction: 'talker',
          unique_id: 3,
        }),
        'listener-2': makeEndpoint({
          endpoint_id: 'listener-2',
          node_id: 'node-b',
          direction: 'listener',
          unique_id: 4,
        }),
      },
      liveRoutes: {
        [routeA.id]: routeA,
      },
    }

    render(
      <RoutingProvider initialState={initialState}>
        <SceneSyncAuditProbe />
      </RoutingProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('scene-sync-baseline').textContent).toBe('Baseline Scene')
      expect(screen.getByTestId('scene-sync-compare').textContent).toBe('Compare Scene')
      expect(screen.getByTestId('scene-sync-selection-validity').textContent).toBe('ready')
      expect(screen.getByTestId('scene-sync-preview-summary').textContent).toBe('1')
      expect(screen.getByTestId('scene-sync-preset-summary').textContent).toContain('Live Pair:scene-a->scene-b')
      expect(screen.getByTestId('scene-sync-preset-summary').textContent).toContain('Stale Pair:scene-a->scene-missing')
      expect(screen.getByTestId('scene-sync-active-preset').textContent).toBe('preset-stale-active')
      expect(screen.getByTestId('scene-sync-audit-sequence').textContent).toBe('none')
    })

    fireEvent.click(screen.getByTestId('scene-sync-remote-update-compare'))
    fireEvent.click(screen.getByTestId('scene-sync-remote-delete-baseline'))

    await waitFor(() => {
      expect(screen.getByTestId('scene-sync-scenes').textContent).toContain('Compare Scene Remote:scene-b')
      expect(screen.getByTestId('scene-sync-scenes').textContent).not.toContain('Baseline Scene:scene-a')
      expect(screen.getByTestId('scene-sync-baseline').textContent).toBe('none')
      expect(screen.getByTestId('scene-sync-compare').textContent).toBe('Compare Scene Remote')
      expect(screen.getByTestId('scene-sync-selection-validity').textContent).toBe('incomplete')
      expect(screen.getByTestId('scene-sync-preview-summary').textContent).toBe('none')
      expect(screen.getByTestId('scene-sync-preset-summary').textContent).toBe('none')
      expect(screen.getByTestId('scene-sync-active-preset').textContent).toBe('none')
      expect(screen.getByTestId('scene-sync-audit-sequence').textContent).toBe('UPDATE_SCENE|DELETE_SCENE')
      expect(screen.getByTestId('scene-sync-audit-warnings').textContent).toBe('0')
      expect(screen.getByTestId('scene-sync-audit-errors').textContent).toBe('0')
      expect(screen.getByTestId('scene-sync-audit-deletes').textContent).toBe('1')
    })
  })

  it('keeps preview cancellation sequencing deterministic when remote stale-preset remediation happens in the same sync window', async () => {
    mockLocalNodeId = 'node-a'
    mockEndpointsData = undefined
    mockNodesData = [
      makeNode({ node_id: 'node-a', name: 'Node A', type: 'map2_local', status: 'online' }),
      makeNode({ node_id: 'node-b', name: 'Node B', type: 'map2_remote', status: 'online' }),
    ]
    mockConnectionsData = undefined

    const routeA = {
      id: 'talker-1→listener-1',
      talker_id: 'talker-1',
      listener_id: 'listener-1',
      state: 'connected' as const,
      established_time: '2026-02-17T05:00:00Z',
      error_message: null,
      connection_count: 1,
      srp_reservation_id: null,
      srp_admission_id: null,
      locked: false,
      valid: true,
      messages: [],
      talker_node_id: 'node-a',
      listener_node_id: 'node-b',
      cross_node: true,
    }
    const routeB = {
      id: 'talker-2→listener-2',
      talker_id: 'talker-2',
      listener_id: 'listener-2',
      state: 'connected' as const,
      established_time: '2026-02-17T05:01:00Z',
      error_message: null,
      connection_count: 1,
      srp_reservation_id: null,
      srp_admission_id: null,
      locked: false,
      valid: true,
      messages: [],
      talker_node_id: 'node-a',
      listener_node_id: 'node-b',
      cross_node: true,
    }

    const initialState = {
      ...initialRoutingState,
      scenes: {
        'scene-a': {
          id: 'scene-a',
          name: 'Baseline Scene',
          description: '',
          routes: [routeA],
          timestamp: '2026-02-17T05:02:00Z',
          tags: ['baseline'],
        },
        'scene-b': {
          id: 'scene-b',
          name: 'Compare Scene',
          description: '',
          routes: [routeA, routeB],
          timestamp: '2026-02-17T05:03:00Z',
          tags: ['compare'],
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
            updated_at: '2026-02-17T05:04:00Z',
          },
          {
            id: 'preset-stale-active',
            name: 'Stale Pair',
            baseline_scene_id: 'scene-a',
            compare_scene_id: 'scene-missing',
            updated_at: '2026-02-17T05:05:00Z',
          },
        ],
        active_preset_id: 'preset-stale-active',
      },
      endpoints: {
        'talker-1': makeEndpoint({
          endpoint_id: 'talker-1',
          node_id: 'node-a',
          direction: 'talker',
          unique_id: 1,
        }),
        'listener-1': makeEndpoint({
          endpoint_id: 'listener-1',
          node_id: 'node-b',
          direction: 'listener',
          unique_id: 2,
        }),
        'talker-2': makeEndpoint({
          endpoint_id: 'talker-2',
          node_id: 'node-a',
          direction: 'talker',
          unique_id: 3,
        }),
        'listener-2': makeEndpoint({
          endpoint_id: 'listener-2',
          node_id: 'node-b',
          direction: 'listener',
          unique_id: 4,
        }),
      },
      liveRoutes: {
        [routeA.id]: routeA,
      },
    }

    render(
      <RoutingProvider initialState={initialState}>
        <SceneSyncAuditProbe />
        <SceneDiffPreviewLifecycleProbe />
      </RoutingProvider>
    )

    fireEvent.click(screen.getByTestId('scene-diff-preview-opened'))
    fireEvent.click(screen.getByTestId('scene-sync-remote-update-compare'))
    fireEvent.click(screen.getByTestId('scene-sync-remote-delete-baseline'))
    fireEvent.click(screen.getByTestId('scene-diff-preview-cancel-popover'))

    await waitFor(() => {
      expect(screen.getByTestId('scene-sync-scenes').textContent).toContain('Compare Scene Remote:scene-b')
      expect(screen.getByTestId('scene-sync-scenes').textContent).not.toContain('Baseline Scene:scene-a')
      expect(screen.getByTestId('scene-sync-baseline').textContent).toBe('none')
      expect(screen.getByTestId('scene-sync-compare').textContent).toBe('Compare Scene Remote')
      expect(screen.getByTestId('scene-sync-selection-validity').textContent).toBe('incomplete')
      expect(screen.getByTestId('scene-sync-preview-summary').textContent).toBe('none')
      expect(screen.getByTestId('scene-sync-preset-summary').textContent).toBe('none')
      expect(screen.getByTestId('scene-sync-active-preset').textContent).toBe('none')
      expect(screen.getByTestId('scene-sync-audit-sequence').textContent).toBe('UPDATE_SCENE|DELETE_SCENE')
      expect(screen.getByTestId('scene-sync-audit-warnings').textContent).toBe('0')
      expect(screen.getByTestId('scene-sync-audit-errors').textContent).toBe('0')
      expect(screen.getByTestId('scene-sync-audit-deletes').textContent).toBe('1')

      expect(screen.getByTestId('scene-diff-preview-lifecycle-count').textContent).toBe('2')
      expect(screen.getByTestId('scene-diff-preview-lifecycle-summary').textContent).toBe(
        'opened:none:5:success|cancelled:popover_closed:4:warning'
      )
      expect(screen.getByTestId('scene-diff-preview-history-past').textContent).toBe('1')
      expect(screen.getByTestId('scene-diff-preview-history-future').textContent).toBe('0')
    })
  })

  it('sequences scene-diff preview cancellation reasons without mutating provider history', async () => {
    render(
      <RoutingProvider initialState={initialRoutingState}>
        <SceneDiffPreviewLifecycleProbe />
      </RoutingProvider>
    )

    expect(screen.getByTestId('scene-diff-preview-lifecycle-count').textContent).toBe('0')
    expect(screen.getByTestId('scene-diff-preview-history-past').textContent).toBe('0')
    expect(screen.getByTestId('scene-diff-preview-history-future').textContent).toBe('0')

    fireEvent.click(screen.getByTestId('scene-diff-preview-opened'))
    fireEvent.click(screen.getByTestId('scene-diff-preview-refreshed'))
    fireEvent.click(screen.getByTestId('scene-diff-preview-cancel-draft'))
    fireEvent.click(screen.getByTestId('scene-diff-preview-cancel-export'))
    fireEvent.click(screen.getByTestId('scene-diff-preview-cancel-popover'))

    await waitFor(() => {
      expect(screen.getByTestId('scene-diff-preview-lifecycle-count').textContent).toBe('5')
      expect(screen.getByTestId('scene-diff-preview-lifecycle-summary').textContent).toBe(
        'opened:none:5:success|refreshed:none:4:success|cancelled:transfer_draft_changed:4:warning|cancelled:exported_payload_reset:4:warning|cancelled:popover_closed:4:warning'
      )
      expect(screen.getByTestId('scene-diff-preview-history-past').textContent).toBe('0')
      expect(screen.getByTestId('scene-diff-preview-history-future').textContent).toBe('0')
    })
  })

  it('applies duplicate-name valid conflict-policy hints with deterministic last-row precedence', async () => {
    const initialState = {
      ...initialRoutingState,
      scenes: {
        'scene-a': {
          id: 'scene-a',
          name: 'Scene A',
          description: '',
          routes: [],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
        'scene-b': {
          id: 'scene-b',
          name: 'Scene B',
          description: '',
          routes: [],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
        'scene-c': {
          id: 'scene-c',
          name: 'Scene C',
          description: '',
          routes: [],
          timestamp: '2026-02-17T00:00:00Z',
          tags: [],
        },
      },
    }

    render(
      <RoutingProvider initialState={initialState}>
        <SceneDiffDuplicateHintPrecedenceProbe />
      </RoutingProvider>
    )

    expect(screen.getByTestId('scene-diff-duplicate-presets-count').textContent).toBe('0')
    expect(screen.getByTestId('scene-diff-duplicate-presets-summary').textContent).toBe('none')

    fireEvent.click(screen.getByTestId('scene-diff-duplicate-import'))

    await waitFor(() => {
      expect(screen.getByTestId('scene-diff-duplicate-presets-count').textContent).toBe('1')
      expect(screen.getByTestId('scene-diff-duplicate-presets-summary').textContent).toBe('Ops Pair:scene-c:skip')
      expect(screen.getByTestId('scene-diff-duplicate-imported-count').textContent).toBe('2')
      expect(screen.getByTestId('scene-diff-duplicate-skipped-count').textContent).toBe('0')
    })
  })
})
