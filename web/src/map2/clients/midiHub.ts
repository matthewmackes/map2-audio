import type * as Api from '../api'
import { appendNodeQuery, fetchJson } from '../http'
import { API_BASE } from '../transport'

type MidiClusterNode = Api.MidiClusterNode
type MidiClusterEndpoint = Api.MidiClusterEndpoint
type MidiClusterConnection = Api.MidiClusterConnection
type MidiClusterClock = Api.MidiClusterClock
type MidiClusterSummary = Api.MidiClusterSummary
type MidiClusterHealth = Api.MidiClusterHealth
type MidiHubRoute = Api.MidiHubRoute
type MidiHubRouteRequest = Api.MidiHubRouteRequest
type MidiHubPresetSummary = Api.MidiHubPresetSummary
type MidiHubPresetPayload = Api.MidiHubPresetPayload
type MidiHubProgramSlotMap = Api.MidiHubProgramSlotMap
type MidiHubEventList = Api.MidiHubEventList
type MidiHubEventListEvent = Api.MidiHubEventListEvent
type MidiHubMscMessage = Api.MidiHubMscMessage
type MidiHubScriptSummary = Api.MidiHubScriptSummary
type MidiHubClockStatus = Api.MidiHubClockStatus
type MidiHubNetworkSession = Api.MidiHubNetworkSession
type OscNamespaceEntry = Api.OscNamespaceEntry
type OscNamespaceEvent = Api.OscNamespaceEvent
type Midi2Status = Api.Midi2Status
type Midi2TransportResult = Api.Midi2TransportResult
type Midi2DeviceState = Api.Midi2DeviceState
type Midi2UmpInspectionMessage = Api.Midi2UmpInspectionMessage
type TesiraStatus = Api.TesiraStatus
type TesiraAliasState = Api.TesiraAliasState
type TesiraSubscriptionState = Api.TesiraSubscriptionState
type VirtualGpioSnapshot = Api.VirtualGpioSnapshot
type VirtualGpioChannel = Api.VirtualGpioChannel
type StringInterfaceStatus = Api.StringInterfaceStatus
type StringInterfaceLog = Api.StringInterfaceLog
type MidiHubLearnSuggestion = Api.MidiHubLearnSuggestion
type MidiHubMessageMapperSlot = Api.MidiHubMessageMapperSlot
type MidiHubMacro = Api.MidiHubMacro
type MidiHubRecordingSession = Api.MidiHubRecordingSession
type MidiHubScheduledEntry = Api.MidiHubScheduledEntry
type MidiHubDeviceInventory = Api.MidiHubDeviceInventory
type MidiHubDeviceProfile = Api.MidiHubDeviceProfile
type MidiHubTrafficSnapshot = Api.MidiHubTrafficSnapshot

export const midiClusterApi = {
  listNodes: () => fetchJson<MidiClusterNode[]>(`${API_BASE}/midi/cluster/nodes`),

  getNode: (nodeId: string) =>
    fetchJson<MidiClusterNode>(`${API_BASE}/midi/cluster/nodes/${encodeURIComponent(nodeId)}`),

  listEndpoints: () => fetchJson<MidiClusterEndpoint[]>(`${API_BASE}/midi/cluster/endpoints`),

  getSummary: () => fetchJson<MidiClusterSummary>(`${API_BASE}/midi/cluster/summary`),

  listConnections: () =>
    fetchJson<MidiClusterConnection[]>(`${API_BASE}/midi/cluster/connections`),

  createConnection: (payload: { source_endpoint_id: string; destination_endpoint_id: string; transport?: string }) =>
    fetchJson<MidiClusterConnection>(`${API_BASE}/midi/cluster/connections`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteConnection: (connectionId: string) =>
    fetchJson<{ ok: boolean; message: string }>(
      `${API_BASE}/midi/cluster/connections/${encodeURIComponent(connectionId)}`,
      { method: 'DELETE' },
    ),

  triggerAutoConnect: () =>
    fetchJson(`${API_BASE}/midi/cluster/connections/auto-connect`, { method: 'POST' }),

  getAutoConnectStatus: () =>
    fetchJson(`${API_BASE}/midi/cluster/connections/auto-connect/status`),

  getClock: () => fetchJson<MidiClusterClock>(`${API_BASE}/midi/cluster/clock`),

  setClockStrategy: (strategy: string, manualNodeId?: string) =>
    fetchJson<MidiClusterClock>(`${API_BASE}/midi/cluster/clock/strategy`, {
      method: 'PUT',
      body: JSON.stringify({ strategy, manual_node_id: manualNodeId ?? null }),
    }),

  forceClockSync: () => fetchJson(`${API_BASE}/midi/cluster/clock/sync`, { method: 'POST' }),

  getHealth: () => fetchJson<MidiClusterHealth>(`${API_BASE}/midi/cluster/health`),
}

export const midiHubApi = {
  getStatus: (nodeId?: string | null) =>
    fetchJson<Record<string, unknown>>(appendNodeQuery(`${API_BASE}/midi/hub/status`, nodeId)),
  getStatusForNode: (nodeId?: string | null) =>
    fetchJson<Record<string, unknown>>(appendNodeQuery(`${API_BASE}/midi/hub/status`, nodeId)),

  getRoutes: (nodeId?: string | null) =>
    fetchJson<{ routes: MidiHubRoute[]; match_mode: string }>(appendNodeQuery(`${API_BASE}/midi/hub/routes`, nodeId)),
  getRoutesForNode: (nodeId?: string | null) =>
    fetchJson<{ routes: MidiHubRoute[]; match_mode: string }>(appendNodeQuery(`${API_BASE}/midi/hub/routes`, nodeId)),

  createRoute: (payload: MidiHubRouteRequest, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; route: MidiHubRoute }>(appendNodeQuery(`${API_BASE}/midi/hub/routes`, nodeId), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateRoute: (routeId: string, payload: MidiHubRouteRequest, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; route?: MidiHubRoute; error?: string }>(
      appendNodeQuery(`${API_BASE}/midi/hub/routes/${encodeURIComponent(routeId)}`, nodeId),
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    ),

  deleteRoute: (routeId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean }>(appendNodeQuery(`${API_BASE}/midi/hub/routes/${encodeURIComponent(routeId)}`, nodeId), {
      method: 'DELETE',
    }),

  enableRoute: (routeId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; route?: MidiHubRoute }>(
      appendNodeQuery(`${API_BASE}/midi/hub/routes/${encodeURIComponent(routeId)}/enable`, nodeId),
      { method: 'POST' },
    ),

  disableRoute: (routeId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; route?: MidiHubRoute }>(
      appendNodeQuery(`${API_BASE}/midi/hub/routes/${encodeURIComponent(routeId)}/disable`, nodeId),
      { method: 'POST' },
    ),

  getTopology: (nodeId?: string | null) =>
    fetchJson<Record<string, unknown>>(appendNodeQuery(`${API_BASE}/midi/hub/topology`, nodeId)),
  getTransformTypes: (nodeId?: string | null) =>
    fetchJson<{ types: Array<Record<string, unknown>> }>(appendNodeQuery(`${API_BASE}/midi/hub/transforms/types`, nodeId)),

  listPresets: (nodeId?: string | null) =>
    fetchJson<{ presets: MidiHubPresetSummary[]; default: Record<string, unknown> }>(
      appendNodeQuery(`${API_BASE}/midi/hub/presets`, nodeId),
    ),
  listPresetsForNode: (nodeId?: string | null) =>
    fetchJson<{ presets: MidiHubPresetSummary[]; default: Record<string, unknown> }>(appendNodeQuery(`${API_BASE}/midi/hub/presets`, nodeId)),

  getPreset: (presetId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; preset?: MidiHubPresetPayload | null }>(
      appendNodeQuery(`${API_BASE}/midi/hub/presets/${encodeURIComponent(presetId)}`, nodeId),
    ),

  savePreset: (payload: {
    preset_id: string;
    name: string;
    description?: string;
    conditions?: Record<string, unknown>;
  }, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; preset: MidiHubPresetPayload }>(appendNodeQuery(`${API_BASE}/midi/hub/presets`, nodeId), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  recallPreset: (presetId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; preset?: MidiHubPresetPayload | null }>(
      appendNodeQuery(`${API_BASE}/midi/hub/presets/${encodeURIComponent(presetId)}/recall`, nodeId),
      { method: 'POST' },
    ),
  recallPresetForNode: (presetId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; preset?: MidiHubPresetPayload | null }>(
      appendNodeQuery(`${API_BASE}/midi/hub/presets/${encodeURIComponent(presetId)}/recall`, nodeId),
      { method: 'POST' },
    ),

  deletePreset: (presetId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean }>(appendNodeQuery(`${API_BASE}/midi/hub/presets/${encodeURIComponent(presetId)}`, nodeId), {
      method: 'DELETE',
    }),

  comparePresets: (leftPresetId: string, rightPresetId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; diff: Record<string, unknown> }>(appendNodeQuery(`${API_BASE}/midi/hub/presets/compare`, nodeId), {
      method: 'POST',
      body: JSON.stringify({ left_preset_id: leftPresetId, right_preset_id: rightPresetId }),
    }),

  exportPreset: (presetId: string, exportPath?: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; path: string; preset_id: string }>(
      appendNodeQuery(`${API_BASE}/midi/hub/presets/${encodeURIComponent(presetId)}/export`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify({ export_path: exportPath ?? null }),
      },
    ),

  importPreset: (filePath: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; preset: MidiHubPresetPayload }>(appendNodeQuery(`${API_BASE}/midi/hub/presets/import`, nodeId), {
      method: 'POST',
      body: JSON.stringify({ file_path: filePath }),
    }),

  getDefaultPreset: (nodeId?: string | null) =>
    fetchJson<Record<string, unknown>>(appendNodeQuery(`${API_BASE}/midi/hub/presets/default`, nodeId)),
  setDefaultPreset: (presetId?: string | null, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; default_preset_id?: string | null }>(appendNodeQuery(`${API_BASE}/midi/hub/presets/default`, nodeId), {
      method: 'PUT',
      body: JSON.stringify({ preset_id: presetId ?? null }),
    }),
  recallDefaultPreset: (nodeId?: string | null) =>
    fetchJson<{ ok: boolean; preset?: MidiHubPresetPayload | null }>(appendNodeQuery(`${API_BASE}/midi/hub/presets/default/recall`, nodeId), {
      method: 'POST',
    }),

  getPresetChains: (nodeId?: string | null) =>
    fetchJson<{ count: number; chains: Record<string, string[]> }>(appendNodeQuery(`${API_BASE}/midi/hub/presets/chains`, nodeId)),
  setPresetChain: (chainId: string, presetIds: string[], nodeId?: string | null) =>
    fetchJson<{ ok: boolean; chain_id: string; preset_ids: string[] }>(
      appendNodeQuery(`${API_BASE}/midi/hub/presets/chains/${encodeURIComponent(chainId)}`, nodeId),
      {
        method: 'PUT',
        body: JSON.stringify({ preset_ids: presetIds }),
      },
    ),
  recallPresetChainStep: (chainId: string, stepIndex: number, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; preset?: MidiHubPresetPayload | null }>(
      appendNodeQuery(`${API_BASE}/midi/hub/presets/chains/${encodeURIComponent(chainId)}/recall/${stepIndex}`, nodeId),
      { method: 'POST' },
    ),
  runPresetChain: (
    chainId: string,
    payload: { interval_ms: number; cycles?: number | null; start_immediately?: boolean },
    nodeId?: string | null,
  ) =>
    fetchJson<{ chain_id: string; running: boolean; interval_ms: number; cycles?: number | null }>(
      appendNodeQuery(`${API_BASE}/midi/hub/presets/chains/${encodeURIComponent(chainId)}/run`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),
  stopPresetChain: (chainId: string, nodeId?: string | null) =>
    fetchJson<{ chain_id: string; running: boolean }>(
      appendNodeQuery(`${API_BASE}/midi/hub/presets/chains/${encodeURIComponent(chainId)}/stop`, nodeId),
      {
        method: 'POST',
      },
    ),

  getProgramSlots: (nodeId?: string | null) =>
    fetchJson<MidiHubProgramSlotMap>(appendNodeQuery(`${API_BASE}/midi/hub/presets/slots`, nodeId)),
  setProgramSlot: (programNumber: number, targetId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; program_number: number; target_id: string }>(
      appendNodeQuery(`${API_BASE}/midi/hub/presets/slots/${programNumber}`, nodeId),
      {
        method: 'PUT',
        body: JSON.stringify({ target_id: targetId }),
      },
    ),
  deleteProgramSlot: (programNumber: number, nodeId?: string | null) =>
    fetchJson<{ ok: boolean }>(appendNodeQuery(`${API_BASE}/midi/hub/presets/slots/${programNumber}`, nodeId), {
      method: 'DELETE',
    }),

  evaluatePresetContext: (context: Record<string, unknown>, nodeId?: string | null) =>
    fetchJson<{ count: number; recalled_preset_ids: string[] }>(appendNodeQuery(`${API_BASE}/midi/hub/presets/context/evaluate`, nodeId), {
      method: 'POST',
      body: JSON.stringify({ context }),
    }),

  listEventLists: (nodeId?: string | null) =>
    fetchJson<{ count: number; event_lists: MidiHubEventList[] }>(appendNodeQuery(`${API_BASE}/midi/hub/events/lists`, nodeId)),
  getEventList: (eventListId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; event_list?: MidiHubEventList | null }>(
      appendNodeQuery(`${API_BASE}/midi/hub/events/lists/${encodeURIComponent(eventListId)}`, nodeId),
    ),
  upsertEventList: (
    payload: {
      event_list_id: string;
      name: string;
      list_type: 'mtc' | 'rtc';
      source_id: string;
      internal_clock_enabled: boolean;
      first_time: string;
      last_time: string;
      fps: number;
      timezone: string;
      enabled?: boolean;
    },
    nodeId?: string | null,
  ) =>
    fetchJson<{ ok: boolean; event_list: MidiHubEventList }>(appendNodeQuery(`${API_BASE}/midi/hub/events/lists`, nodeId), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteEventList: (eventListId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean }>(appendNodeQuery(`${API_BASE}/midi/hub/events/lists/${encodeURIComponent(eventListId)}`, nodeId), {
      method: 'DELETE',
    }),
  startEventList: (eventListId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; event_list: MidiHubEventList }>(
      appendNodeQuery(`${API_BASE}/midi/hub/events/lists/${encodeURIComponent(eventListId)}/start`, nodeId),
      { method: 'POST' },
    ),
  stopEventList: (eventListId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; event_list: MidiHubEventList }>(
      appendNodeQuery(`${API_BASE}/midi/hub/events/lists/${encodeURIComponent(eventListId)}/stop`, nodeId),
      { method: 'POST' },
    ),
  getEventListStatus: (eventListId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; status: MidiHubEventList }>(
      appendNodeQuery(`${API_BASE}/midi/hub/events/lists/${encodeURIComponent(eventListId)}/status`, nodeId),
    ),
  listEventListEvents: (eventListId: string, nodeId?: string | null) =>
    fetchJson<{ count: number; events: MidiHubEventListEvent[] }>(
      appendNodeQuery(`${API_BASE}/midi/hub/events/lists/${encodeURIComponent(eventListId)}/events`, nodeId),
    ),
  upsertEventListEvent: (
    eventListId: string,
    payload: {
      event_id: string;
      order: number;
      time_address: string;
      action_type: string;
      label: string;
      payload?: Record<string, unknown>;
      enabled?: boolean;
    },
    nodeId?: string | null,
  ) =>
    fetchJson<{ ok: boolean; event: MidiHubEventListEvent }>(
      appendNodeQuery(`${API_BASE}/midi/hub/events/lists/${encodeURIComponent(eventListId)}/events`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),
  deleteEventListEvent: (eventListId: string, eventId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean }>(
      appendNodeQuery(`${API_BASE}/midi/hub/events/lists/${encodeURIComponent(eventListId)}/events/${encodeURIComponent(eventId)}`, nodeId),
      { method: 'DELETE' },
    ),
  setEventListLearnMode: (
    eventListId: string,
    payload: { enabled: boolean; action_type?: string; label?: string; payload?: Record<string, unknown> },
    nodeId?: string | null,
  ) =>
    fetchJson<{ ok: boolean; event_list: MidiHubEventList }>(
      appendNodeQuery(`${API_BASE}/midi/hub/events/lists/${encodeURIComponent(eventListId)}/learn`, nodeId),
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    ),
  captureEventListLearnMode: (eventListId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; event: MidiHubEventListEvent }>(
      appendNodeQuery(`${API_BASE}/midi/hub/events/lists/${encodeURIComponent(eventListId)}/learn/capture`, nodeId),
      { method: 'POST' },
    ),
  sendMscMessage: (
    payload: {
      destination_port: string;
      device_id: number;
      command_format: number;
      command: string;
      cue_number: string;
      list_number?: string | null;
    },
    nodeId?: string | null,
  ) =>
    fetchJson<{ ok: boolean } & MidiHubMscMessage>(appendNodeQuery(`${API_BASE}/midi/hub/events/msc/send`, nodeId), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getScriptExamples: (nodeId?: string | null) =>
    fetchJson<{ count: number; examples: Array<{ script_id: string; name: string; code: string }> }>(
      appendNodeQuery(`${API_BASE}/midi/hub/scripts/examples`, nodeId),
    ),
  listScripts: (nodeId?: string | null) =>
    fetchJson<{ count: number; scripts: MidiHubScriptSummary[] }>(appendNodeQuery(`${API_BASE}/midi/hub/scripts`, nodeId)),
  getScript: (scriptId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; script?: MidiHubScriptSummary | null }>(
      appendNodeQuery(`${API_BASE}/midi/hub/scripts/${encodeURIComponent(scriptId)}`, nodeId),
    ),
  upsertScript: (payload: { script_id: string; name: string; code: string; enabled?: boolean }, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; script: MidiHubScriptSummary }>(appendNodeQuery(`${API_BASE}/midi/hub/scripts`, nodeId), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteScript: (scriptId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean }>(appendNodeQuery(`${API_BASE}/midi/hub/scripts/${encodeURIComponent(scriptId)}`, nodeId), {
      method: 'DELETE',
    }),
  enableScript: (scriptId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; script?: MidiHubScriptSummary | null }>(
      appendNodeQuery(`${API_BASE}/midi/hub/scripts/${encodeURIComponent(scriptId)}/enable`, nodeId),
      { method: 'POST' },
    ),
  disableScript: (scriptId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; script?: MidiHubScriptSummary | null }>(
      appendNodeQuery(`${API_BASE}/midi/hub/scripts/${encodeURIComponent(scriptId)}/disable`, nodeId),
      { method: 'POST' },
    ),
  runScript: (scriptId: string, event: Record<string, unknown>, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; script_id: string; error?: string }>(
      appendNodeQuery(`${API_BASE}/midi/hub/scripts/${encodeURIComponent(scriptId)}/run`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify({ event }),
      },
    ),
  triggerScript: (scriptId: string, event: Record<string, unknown>, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; script_id: string; error?: string }>(
      appendNodeQuery(`${API_BASE}/midi/hub/scripts/${encodeURIComponent(scriptId)}/trigger`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify({ event }),
      },
    ),
  stopScript: (scriptId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean }>(appendNodeQuery(`${API_BASE}/midi/hub/scripts/${encodeURIComponent(scriptId)}/stop`, nodeId), {
      method: 'POST',
    }),
  getScriptConsole: (scriptId: string, limit = 200, nodeId?: string | null) =>
    fetchJson<{ script_id: string; count: number; lines: string[] }>(
      appendNodeQuery(
        `${API_BASE}/midi/hub/scripts/${encodeURIComponent(scriptId)}/console?limit=${Math.max(1, Math.min(2000, limit))}`,
        nodeId,
      ),
    ),

  getClockStatus: (nodeId?: string | null) => fetchJson<MidiHubClockStatus>(appendNodeQuery(`${API_BASE}/midi/hub/clock`, nodeId)),
  getClockStatusForNode: (nodeId?: string | null) => fetchJson<MidiHubClockStatus>(appendNodeQuery(`${API_BASE}/midi/hub/clock`, nodeId)),
  updateClockConfig: (payload: Partial<MidiHubClockStatus>, nodeId?: string | null) =>
    fetchJson<MidiHubClockStatus>(appendNodeQuery(`${API_BASE}/midi/hub/clock`, nodeId), {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  tapClock: (nodeId?: string | null) =>
    fetchJson<MidiHubClockStatus>(appendNodeQuery(`${API_BASE}/midi/hub/clock/tap`, nodeId), {
      method: 'POST',
    }),
  startClock: (nodeId?: string | null) =>
    fetchJson<MidiHubClockStatus>(appendNodeQuery(`${API_BASE}/midi/hub/clock/start`, nodeId), {
      method: 'POST',
    }),
  stopClock: (nodeId?: string | null) =>
    fetchJson<MidiHubClockStatus>(appendNodeQuery(`${API_BASE}/midi/hub/clock/stop`, nodeId), {
      method: 'POST',
    }),
  continueClock: (nodeId?: string | null) =>
    fetchJson<MidiHubClockStatus>(appendNodeQuery(`${API_BASE}/midi/hub/clock/continue`, nodeId), {
      method: 'POST',
    }),

  listNetworkSessions: (nodeId?: string | null) =>
    fetchJson<{ count: number; sessions: MidiHubNetworkSession[] }>(appendNodeQuery(`${API_BASE}/midi/hub/network/sessions`, nodeId)),
  listNetworkSessionsForNode: (nodeId?: string | null) =>
    fetchJson<{ count: number; sessions: MidiHubNetworkSession[] }>(appendNodeQuery(`${API_BASE}/midi/hub/network/sessions`, nodeId)),
  createNetworkSession: (payload: { session_id: string; host: string; port: number; mode?: 'send' | 'listen' }, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; session: MidiHubNetworkSession }>(appendNodeQuery(`${API_BASE}/midi/hub/network/sessions`, nodeId), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteNetworkSession: (sessionId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean }>(appendNodeQuery(`${API_BASE}/midi/hub/network/sessions/${encodeURIComponent(sessionId)}`, nodeId), {
      method: 'DELETE',
    }),
  sendNetworkMidi: (sessionId: string, message: number[], nodeId?: string | null) =>
    fetchJson<{ ok: boolean }>(appendNodeQuery(`${API_BASE}/midi/hub/network/sessions/${encodeURIComponent(sessionId)}/send`, nodeId), {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  listOscMappings: (nodeId?: string | null) =>
    fetchJson<{ count: number; mappings: Array<Record<string, unknown>> }>(appendNodeQuery(`${API_BASE}/midi/hub/network/osc/mappings`, nodeId)),
  setOscMappings: (mappings: Array<Record<string, unknown>>, nodeId?: string | null) =>
    fetchJson<{ count: number; mappings: Array<Record<string, unknown>> }>(appendNodeQuery(`${API_BASE}/midi/hub/network/osc/mappings`, nodeId), {
      method: 'PUT',
      body: JSON.stringify({ mappings }),
    }),
  startOscServer: (listenPort: number, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; listen_port: number }>(appendNodeQuery(`${API_BASE}/midi/hub/network/osc/server`, nodeId), {
      method: 'POST',
      body: JSON.stringify({ listen_port: listenPort }),
    }),
  stopOscServer: (nodeId?: string | null) =>
    fetchJson<{ ok: boolean; listen_port?: number | null }>(appendNodeQuery(`${API_BASE}/midi/hub/network/osc/server`, nodeId), {
      method: 'DELETE',
    }),
  sendOsc: (payload: { host: string; port: number; address: string; value: number }, nodeId?: string | null) =>
    fetchJson<{ ok: boolean }>(appendNodeQuery(`${API_BASE}/midi/hub/network/osc/send`, nodeId), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getOscNamespace: (nodeId?: string | null) =>
    fetchJson<{ count: number; entries: OscNamespaceEntry[]; recent_events: OscNamespaceEvent[] }>(
      appendNodeQuery(`${API_BASE}/midi/hub/network/osc/namespace`, nodeId),
    ),
  dispatchOscNamespace: (payload: { address: string; value?: unknown }, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; address: string; value?: unknown; events?: OscNamespaceEvent[] }>(
      appendNodeQuery(`${API_BASE}/midi/hub/network/osc/namespace/dispatch`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),

  getMidi2Status: (nodeId?: string | null) =>
    fetchJson<Midi2Status>(
      appendNodeQuery(`${API_BASE}/midi/hub/midi2`, nodeId),
    ),
  getMidi2StatusForNode: (nodeId?: string | null) =>
    fetchJson<Midi2Status>(
      appendNodeQuery(`${API_BASE}/midi/hub/midi2`, nodeId),
    ),
  updateMidi2Config: (
    payload: {
      enabled?: boolean;
      default_protocol?: 'midi1' | 'midi2';
      binding_transport?: 'none' | 'port' | 'network_session';
      binding_target_id?: string;
      binding_response_port?: string;
    },
    nodeId?: string | null,
  ) =>
    fetchJson<Midi2Status>(
      appendNodeQuery(`${API_BASE}/midi/hub/midi2`, nodeId),
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    ),
  discoverMidi2Device: (deviceId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; probe_id: string; discovery_sysex: number[]; transport: Midi2TransportResult }>(appendNodeQuery(`${API_BASE}/midi/hub/midi2/discover`, nodeId), {
      method: 'POST',
      body: JSON.stringify(deviceId ? { device_id: deviceId } : {}),
    }),
  inquireMidi2Profiles: (deviceId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; device: Midi2DeviceState; transport?: Midi2TransportResult }>(
      appendNodeQuery(`${API_BASE}/midi/hub/midi2/${encodeURIComponent(deviceId)}/profiles/inquiry`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
    ),
  inquireMidi2ProfileDetails: (deviceId: string, profileId: string, inquiryTarget = 0, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; device: Midi2DeviceState; transport?: Midi2TransportResult }>(
      appendNodeQuery(`${API_BASE}/midi/hub/midi2/${encodeURIComponent(deviceId)}/profiles/details`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify({ profile_id: profileId, inquiry_target: inquiryTarget }),
      },
    ),
  setMidi2Profile: (deviceId: string, profileId: string, enabled = true, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; device: Midi2DeviceState; transport?: Midi2TransportResult }>(
      appendNodeQuery(`${API_BASE}/midi/hub/midi2/${encodeURIComponent(deviceId)}/profiles`, nodeId),
      {
        method: 'PUT',
        body: JSON.stringify({ profile_id: profileId, enabled }),
      },
    ),
  inquireMidi2PropertyExchangeCapabilities: (deviceId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; device: Midi2DeviceState; transport?: Midi2TransportResult }>(
      appendNodeQuery(`${API_BASE}/midi/hub/midi2/${encodeURIComponent(deviceId)}/property-exchange/capabilities`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
    ),
  invalidateMidi2Device: (deviceId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; device_id: string; target_muid: string; removed_device_ids: string[]; transport?: Midi2TransportResult }>(
      appendNodeQuery(`${API_BASE}/midi/hub/midi2/${encodeURIComponent(deviceId)}/invalidate`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
    ),
  subscribeMidi2Property: (deviceId: string, resource: string, resId?: string | null, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; device: Midi2DeviceState; transport?: Midi2TransportResult }>(
      appendNodeQuery(`${API_BASE}/midi/hub/midi2/${encodeURIComponent(deviceId)}/subscriptions`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify({ resource, res_id: resId ?? undefined }),
      },
    ),
  endMidi2Subscription: (deviceId: string, subscribeId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; device: Midi2DeviceState; transport?: Midi2TransportResult }>(
      appendNodeQuery(`${API_BASE}/midi/hub/midi2/${encodeURIComponent(deviceId)}/subscriptions/${encodeURIComponent(subscribeId)}/end`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
    ),
  readMidi2Property: (deviceId: string, resource: string, resId?: string | null, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; device: Midi2DeviceState; transport?: Midi2TransportResult }>(
      appendNodeQuery(`${API_BASE}/midi/hub/midi2/${encodeURIComponent(deviceId)}/properties/read`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify({ resource, res_id: resId ?? undefined }),
      },
    ),
  setMidi2Property: (deviceId: string, resource: string, value: unknown, resId?: string | null, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; device: Midi2DeviceState; transport?: Midi2TransportResult }>(
      appendNodeQuery(`${API_BASE}/midi/hub/midi2/${encodeURIComponent(deviceId)}/properties`, nodeId),
      {
        method: 'PUT',
        body: JSON.stringify({ resource, res_id: resId ?? undefined, value }),
      },
    ),
  getMidi2Property: (deviceId: string, key: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; device_id: string; key: string; value: unknown }>(
      appendNodeQuery(`${API_BASE}/midi/hub/midi2/${encodeURIComponent(deviceId)}/properties/${encodeURIComponent(key)}`, nodeId),
    ),
  translateMidi1ToUmp: (message: number[], nodeId?: string | null) =>
    fetchJson<{ words: number[] }>(appendNodeQuery(`${API_BASE}/midi/hub/midi2/translate/midi1-to-ump`, nodeId), {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  translateUmpToMidi1: (words: number[], nodeId?: string | null) =>
    fetchJson<{ message: number[] }>(appendNodeQuery(`${API_BASE}/midi/hub/midi2/translate/ump-to-midi1`, nodeId), {
      method: 'POST',
      body: JSON.stringify({ words }),
    }),
  inspectMidi2Ump: (words: number[], nodeId?: string | null) =>
    fetchJson<{ messages: Midi2UmpInspectionMessage[] }>(appendNodeQuery(`${API_BASE}/midi/hub/midi2/translate/inspect-ump`, nodeId), {
      method: 'POST',
      body: JSON.stringify({ words }),
    }),

  getTesiraStatus: (nodeId?: string | null) => fetchJson<TesiraStatus>(appendNodeQuery(`${API_BASE}/midi/hub/tesira`, nodeId)),
  connectTesira: (payload: {
    host: string
    port?: number
    username?: string
    password?: string
    secured?: boolean
    auto_reconnect?: boolean
  }, nodeId?: string | null) =>
    fetchJson<TesiraStatus>(appendNodeQuery(`${API_BASE}/midi/hub/tesira/connect`, nodeId), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  disconnectTesira: (nodeId?: string | null) =>
    fetchJson<TesiraStatus>(appendNodeQuery(`${API_BASE}/midi/hub/tesira/disconnect`, nodeId), {
      method: 'POST',
    }),
  sendTesiraCommand: (command: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; response: string; aliases?: TesiraAliasState[] }>(appendNodeQuery(`${API_BASE}/midi/hub/tesira/command`, nodeId), {
      method: 'POST',
      body: JSON.stringify({ command }),
    }),
  listTesiraAliases: (nodeId?: string | null) =>
    fetchJson<{ count: number; aliases: TesiraAliasState[] }>(appendNodeQuery(`${API_BASE}/midi/hub/tesira/aliases`, nodeId)),
  setTesiraLevel: (instanceTag: string, level: number, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; value: number }>(appendNodeQuery(`${API_BASE}/midi/hub/tesira/controls/level`, nodeId), {
      method: 'PUT',
      body: JSON.stringify({ instance_tag: instanceTag, level }),
    }),
  setTesiraMute: (instanceTag: string, muted: boolean, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; value: boolean }>(appendNodeQuery(`${API_BASE}/midi/hub/tesira/controls/mute`, nodeId), {
      method: 'PUT',
      body: JSON.stringify({ instance_tag: instanceTag, muted }),
    }),
  listTesiraSubscriptions: (nodeId?: string | null) =>
    fetchJson<{ count: number; subscriptions: TesiraSubscriptionState[] }>(
      appendNodeQuery(`${API_BASE}/midi/hub/tesira/subscriptions`, nodeId),
    ),
  subscribeTesira: (instanceTag: string, attribute: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; subscription: TesiraSubscriptionState }>(appendNodeQuery(`${API_BASE}/midi/hub/tesira/subscriptions`, nodeId), {
      method: 'POST',
      body: JSON.stringify({ instance_tag: instanceTag, attribute }),
    }),
  unsubscribeTesira: (token: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean }>(appendNodeQuery(`${API_BASE}/midi/hub/tesira/subscriptions/${encodeURIComponent(token)}`, nodeId), {
      method: 'DELETE',
    }),
  recallTesiraPreset: (presetId: number, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; preset: { preset_id: number; name: string; active: boolean } }>(
      appendNodeQuery(`${API_BASE}/midi/hub/tesira/presets/recall`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify({ preset_id: presetId }),
      },
    ),
  saveTesiraPreset: (presetId: number, name?: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; preset: { preset_id: number; name: string; active: boolean } }>(
      appendNodeQuery(`${API_BASE}/midi/hub/tesira/presets/save`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify({ preset_id: presetId, name }),
      },
    ),
  getTesiraMatrix: (nodeId?: string | null) =>
    fetchJson<{ count: number; crosspoints: Array<{ input: number; output: number; level: number; mute: boolean }> }>(
      appendNodeQuery(`${API_BASE}/midi/hub/tesira/matrix`, nodeId),
    ),

  getVirtualGpio: (nodeId?: string | null) => fetchJson<VirtualGpioSnapshot>(appendNodeQuery(`${API_BASE}/midi/hub/gpio`, nodeId)),
  setVirtualGpioLabel: (channelId: string, label: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; channel: VirtualGpioChannel }>(
      appendNodeQuery(`${API_BASE}/midi/hub/gpio/${encodeURIComponent(channelId)}/label`, nodeId),
      {
        method: 'PUT',
        body: JSON.stringify({ label }),
      },
    ),
  setVirtualGpioState: (channelId: string, state: boolean, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; channel: VirtualGpioChannel }>(
      appendNodeQuery(`${API_BASE}/midi/hub/gpio/${encodeURIComponent(channelId)}/state`, nodeId),
      {
        method: 'PUT',
        body: JSON.stringify({ state }),
      },
    ),
  toggleVirtualGpio: (channelId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; channel: VirtualGpioChannel }>(
      appendNodeQuery(`${API_BASE}/midi/hub/gpio/${encodeURIComponent(channelId)}/toggle`, nodeId),
      {
        method: 'POST',
      },
    ),

  getStringInterfaceStatus: (nodeId?: string | null) =>
    fetchJson<StringInterfaceStatus>(appendNodeQuery(`${API_BASE}/midi/hub/string-interface`, nodeId)),
  updateStringInterfaceConfig: (payload: {
    enabled?: boolean
    listen_host?: string
    listen_port?: number
    target_host?: string
    target_port?: number
  }, nodeId?: string | null) =>
    fetchJson<StringInterfaceStatus>(appendNodeQuery(`${API_BASE}/midi/hub/string-interface`, nodeId), {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  sendStringInterfaceCommand: (command: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; entry: StringInterfaceLog }>(appendNodeQuery(`${API_BASE}/midi/hub/string-interface/send`, nodeId), {
      method: 'POST',
      body: JSON.stringify({ command }),
    }),
  receiveStringInterfaceCommand: (command: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; entry: StringInterfaceLog }>(
      appendNodeQuery(`${API_BASE}/midi/hub/string-interface/receive`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify({ command }),
      },
    ),
  clearStringInterfaceLogs: (nodeId?: string | null) =>
    fetchJson<{ ok: boolean; cleared: number }>(appendNodeQuery(`${API_BASE}/midi/hub/string-interface/clear`, nodeId), {
      method: 'POST',
    }),

  getLearnSuggestions: (payload: { parameter_id: string; chain_context?: Record<string, unknown> }, nodeId?: string | null) =>
    fetchJson<{
      ok: boolean;
      parameter_id: string;
      suggestions: MidiHubLearnSuggestion[];
      plugin_context: Record<string, unknown>;
      split_suggestions: Array<Record<string, unknown>>;
    }>(appendNodeQuery(`${API_BASE}/midi/hub/learn/suggestions`, nodeId), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  listMessageMapperSlots: (nodeId?: string | null) =>
    fetchJson<{ count: number; slots: MidiHubMessageMapperSlot[] }>(
      appendNodeQuery(`${API_BASE}/midi/hub/processing/mappers`, nodeId),
    ),
  updateMessageMapperSlot: (
    slotId: string,
    payload: {
      enabled?: boolean;
      source_port?: string;
      message_type?: string;
      channel_min?: number;
      channel_max?: number;
      value_min?: number;
      value_max?: number;
      target?: string;
      curve?: string;
    },
    nodeId?: string | null,
  ) =>
    fetchJson<{ ok: boolean; slot: MidiHubMessageMapperSlot }>(
      appendNodeQuery(`${API_BASE}/midi/hub/processing/mappers/${encodeURIComponent(slotId)}`, nodeId),
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    ),
  clearMessageMapperSlot: (slotId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; slot: MidiHubMessageMapperSlot }>(
      appendNodeQuery(`${API_BASE}/midi/hub/processing/mappers/${encodeURIComponent(slotId)}/clear`, nodeId),
      {
        method: 'POST',
      },
    ),
  resetMessageMapperSlots: (nodeId?: string | null) =>
    fetchJson<{ ok: boolean; count: number; slots: MidiHubMessageMapperSlot[] }>(
      appendNodeQuery(`${API_BASE}/midi/hub/processing/mappers/reset`, nodeId),
      {
        method: 'POST',
      },
    ),

  listMacros: (nodeId?: string | null) =>
    fetchJson<{ count: number; macros: MidiHubMacro[] }>(appendNodeQuery(`${API_BASE}/midi/hub/macros`, nodeId)),
  getMacro: (macroId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; macro?: MidiHubMacro | null }>(
      appendNodeQuery(`${API_BASE}/midi/hub/macros/${encodeURIComponent(macroId)}`, nodeId),
    ),
  upsertMacro: (payload: {
    macro_id: string;
    name: string;
    trigger?: Record<string, unknown>;
    actions?: Array<Record<string, unknown>>;
    enabled?: boolean;
  }, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; macro: MidiHubMacro }>(appendNodeQuery(`${API_BASE}/midi/hub/macros`, nodeId), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteMacro: (macroId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean }>(appendNodeQuery(`${API_BASE}/midi/hub/macros/${encodeURIComponent(macroId)}`, nodeId), {
      method: 'DELETE',
    }),
  triggerMacro: (macroId: string, payload?: Record<string, unknown>, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; macro_id: string }>(appendNodeQuery(`${API_BASE}/midi/hub/macros/${encodeURIComponent(macroId)}/trigger`, nodeId), {
      method: 'POST',
      body: JSON.stringify({ payload: payload ?? {} }),
    }),
  matchMacros: (payload: Record<string, unknown>, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; count: number; triggered_macro_ids: string[] }>(appendNodeQuery(`${API_BASE}/midi/hub/macros/match`, nodeId), {
      method: 'POST',
      body: JSON.stringify({ payload }),
    }),

  listRecordingSessions: (nodeId?: string | null) =>
    fetchJson<{ count: number; sessions: MidiHubRecordingSession[] }>(appendNodeQuery(`${API_BASE}/midi/hub/recorder/sessions`, nodeId)),
  getRecordingSession: (sessionId: string, includeEvents = false, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; session?: MidiHubRecordingSession | Record<string, unknown> | null }>(
      appendNodeQuery(
        `${API_BASE}/midi/hub/recorder/sessions/${encodeURIComponent(sessionId)}?include_events=${includeEvents ? 'true' : 'false'}`,
        nodeId,
      ),
    ),
  startRecording: (payload: { session_id: string; name?: string }, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; session: MidiHubRecordingSession }>(appendNodeQuery(`${API_BASE}/midi/hub/recorder/start`, nodeId), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  stopRecording: (nodeId?: string | null) =>
    fetchJson<{ ok: boolean; session?: MidiHubRecordingSession | null }>(appendNodeQuery(`${API_BASE}/midi/hub/recorder/stop`, nodeId), {
      method: 'POST',
    }),
  playbackRecording: (
    sessionId: string,
    payload?: { destination_override?: string; loop?: boolean; speed?: number },
    nodeId?: string | null,
  ) =>
    fetchJson<{ ok: boolean; session_id: string; loop: boolean; speed: number }>(
      appendNodeQuery(`${API_BASE}/midi/hub/recorder/sessions/${encodeURIComponent(sessionId)}/playback`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify(payload ?? {}),
      },
    ),
  stopRecordingPlayback: (sessionId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean }>(appendNodeQuery(`${API_BASE}/midi/hub/recorder/sessions/${encodeURIComponent(sessionId)}/stop`, nodeId), {
      method: 'POST',
    }),
  exportRecording: (
    sessionId: string,
    payload?: { export_path?: string; bpm?: number; ticks_per_quarter?: number },
    nodeId?: string | null,
  ) =>
    fetchJson<{ ok: boolean; path: string; session_id: string; event_count: number }>(
      appendNodeQuery(`${API_BASE}/midi/hub/recorder/sessions/${encodeURIComponent(sessionId)}/export`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify(payload ?? {}),
      },
    ),
  deleteRecording: (sessionId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean }>(appendNodeQuery(`${API_BASE}/midi/hub/recorder/sessions/${encodeURIComponent(sessionId)}`, nodeId), {
      method: 'DELETE',
    }),

  listSchedulerEntries: (includeFinished = true, nodeId?: string | null) =>
    fetchJson<{ count: number; entries: MidiHubScheduledEntry[] }>(
      appendNodeQuery(`${API_BASE}/midi/hub/scheduler?include_finished=${includeFinished ? 'true' : 'false'}`, nodeId),
    ),
  getSchedulerEntry: (scheduleId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; entry?: MidiHubScheduledEntry | null }>(
      appendNodeQuery(`${API_BASE}/midi/hub/scheduler/${encodeURIComponent(scheduleId)}`, nodeId),
    ),
  createSchedulerEntry: (payload: {
    schedule_id: string;
    destination_port: string;
    message: number[];
    delay_ms?: number;
    run_at_ns?: number;
    metadata?: Record<string, unknown>;
  }, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; entry: MidiHubScheduledEntry }>(appendNodeQuery(`${API_BASE}/midi/hub/scheduler`, nodeId), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateSchedulerEntry: (
    scheduleId: string,
    payload: {
      destination_port?: string;
      message?: number[];
      delay_ms?: number;
      run_at_ns?: number;
      metadata?: Record<string, unknown>;
    },
    nodeId?: string | null,
  ) =>
    fetchJson<{ ok: boolean; entry: MidiHubScheduledEntry }>(
      appendNodeQuery(`${API_BASE}/midi/hub/scheduler/${encodeURIComponent(scheduleId)}`, nodeId),
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    ),
  cancelSchedulerEntry: (scheduleId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean }>(appendNodeQuery(`${API_BASE}/midi/hub/scheduler/${encodeURIComponent(scheduleId)}`, nodeId), {
      method: 'DELETE',
    }),
  clearFinishedSchedulerEntries: (nodeId?: string | null) =>
    fetchJson<{ ok: boolean; removed: number }>(appendNodeQuery(`${API_BASE}/midi/hub/scheduler/clear-finished`, nodeId), {
      method: 'POST',
    }),

  getMeshStatus: (nodeId?: string | null) =>
    fetchJson<Record<string, unknown>>(appendNodeQuery(`${API_BASE}/midi/hub/network/mesh`, nodeId)),
  upsertMeshPeer: (payload: { peer_id: string; base_url: string; active?: boolean }, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; peer: Record<string, unknown> }>(appendNodeQuery(`${API_BASE}/midi/hub/network/mesh/peers`, nodeId), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteMeshPeer: (peerId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean }>(appendNodeQuery(`${API_BASE}/midi/hub/network/mesh/peers/${encodeURIComponent(peerId)}`, nodeId), {
      method: 'DELETE',
    }),
  setMeshForwarding: (forwardingEnabled: boolean, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; forwarding_enabled: boolean }>(appendNodeQuery(`${API_BASE}/midi/hub/network/mesh/forwarding`, nodeId), {
      method: 'PUT',
      body: JSON.stringify({ forwarding_enabled: forwardingEnabled }),
    }),
  publishMeshRoutes: (
    payload: { source_instance?: string; routes: Array<Record<string, unknown>>; fanout?: boolean },
    nodeId?: string | null,
  ) =>
    fetchJson<{ ok: boolean; route_count: number }>(appendNodeQuery(`${API_BASE}/midi/hub/network/mesh/routes`, nodeId), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getDevices: (refresh = true, nodeId?: string | null) =>
    fetchJson<MidiHubDeviceInventory>(
      appendNodeQuery(`${API_BASE}/midi/hub/devices?refresh=${refresh ? 'true' : 'false'}`, nodeId),
    ),
  getDeviceProfiles: (nodeId?: string | null) =>
    fetchJson<{ count: number; profiles: MidiHubDeviceProfile[] }>(
      appendNodeQuery(`${API_BASE}/midi/hub/devices/profiles`, nodeId),
    ),
  getDeviceProfile: (profileId: string, nodeId?: string | null) =>
    fetchJson<MidiHubDeviceProfile>(
      appendNodeQuery(`${API_BASE}/midi/hub/devices/profiles/${encodeURIComponent(profileId)}`, nodeId),
    ),
  upsertDeviceProfile: (
    payload: {
      profile_id: string;
      name: string;
      match_patterns?: string[];
      default_channel?: number;
      supports_sysex?: boolean;
      usb_vid_pid?: string[];
      metadata?: Record<string, unknown>;
    },
    nodeId?: string | null,
  ) =>
    fetchJson<{ ok: boolean; profile: MidiHubDeviceProfile }>(
      appendNodeQuery(`${API_BASE}/midi/hub/devices/profiles`, nodeId),
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),
  deleteDeviceProfile: (profileId: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; profile_id: string }>(
      appendNodeQuery(`${API_BASE}/midi/hub/devices/profiles/${encodeURIComponent(profileId)}`, nodeId),
      {
        method: 'DELETE',
      },
    ),
  assignDevicePort: (payload: { port_name: string; device_id: string }, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; port_name: string; device_id: string }>(
      appendNodeQuery(`${API_BASE}/midi/hub/devices/assignments`, nodeId),
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    ),
  clearDeviceAssignment: (portName: string, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; port_name: string }>(
      appendNodeQuery(`${API_BASE}/midi/hub/devices/assignments/${encodeURIComponent(portName)}`, nodeId),
      {
        method: 'DELETE',
      },
    ),

  getDeviceShadow: (limit = 200, nodeId?: string | null) =>
    fetchJson<{ count: number; events: Array<Record<string, unknown>>; shadow_state: Record<string, unknown> }>(
      appendNodeQuery(`${API_BASE}/midi/hub/devices/shadow?limit=${Math.max(1, Math.min(5000, limit))}`, nodeId),
    ),
  upsertDeviceShadow: (
    deviceId: string,
    payload: { expected_state: Record<string, unknown>; source?: string },
    nodeId?: string | null,
  ) =>
    fetchJson<{ device_id: string; drift_detected: boolean; drift: Record<string, unknown> | null }>(
      appendNodeQuery(`${API_BASE}/midi/hub/devices/${encodeURIComponent(deviceId)}/shadow`, nodeId),
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    ),
  clearDeviceShadowEvents: (nodeId?: string | null) =>
    fetchJson<{ ok: boolean; cleared: number }>(appendNodeQuery(`${API_BASE}/midi/hub/devices/shadow/clear`, nodeId), {
      method: 'POST',
    }),

  getTrafficSnapshot: (params?: {
    limit?: number;
    source_port?: string;
    destination_port?: string;
    message_type?: string;
    direction?: string;
  }, nodeId?: string | null) => {
    const search = new URLSearchParams()
    if (params?.limit !== undefined) search.set('limit', String(params.limit))
    if (params?.source_port) search.set('source_port', params.source_port)
    if (params?.destination_port) search.set('destination_port', params.destination_port)
    if (params?.message_type) search.set('message_type', params.message_type)
    if (params?.direction) search.set('direction', params.direction)
    const query = search.toString()
    return fetchJson<MidiHubTrafficSnapshot>(appendNodeQuery(`${API_BASE}/midi/hub/traffic/snapshot${query ? `?${query}` : ''}`, nodeId))
  },

  getTrafficStats: (nodeId?: string | null) =>
    fetchJson<Record<string, unknown>>(appendNodeQuery(`${API_BASE}/midi/hub/traffic/stats`, nodeId)),

  exportTraffic: (format: 'json' | 'csv' = 'json', limit = 5000, nodeId?: string | null) =>
    fetchJson<{ ok: boolean; format: string; path: string; count: number }>(
      appendNodeQuery(`${API_BASE}/midi/hub/traffic/export`, nodeId),
      { method: 'POST', body: JSON.stringify({ format, limit }) },
    ),

  clearTraffic: (nodeId?: string | null) =>
    fetchJson<{ ok: boolean }>(appendNodeQuery(`${API_BASE}/midi/hub/traffic/clear`, nodeId), { method: 'POST' }),
}
