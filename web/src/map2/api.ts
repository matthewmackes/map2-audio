// ============================================================================
// MAP2 Audio Platform - REST API Client
// Provides type-safe access to all MAP2 FastAPI endpoints
// ============================================================================

import type {
  AudioStatus,
  AudioLevels,
  AudioSourceTruthPayload,
  PluginLevels,
  Chain,
  EffectsLoop,
  LoopInsertion,
  ChainTemplate,
  Plugin,
  PluginAppearanceListResponse,
  PluginAppearanceOverride,
  PluginOrderRef,
  Snapshot,
  SnapshotCategory,
  CreateSnapshotRequest,
  MIDIDevice,
  MIDIMapping,
  MIDIMappingV2,
  MIDIMappingTestResult,
  MIDIMappingGroup,
  MIDICommand,
  MIDIRoutingRule,
  MIDIDeviceConfig,
  MIDIPreset,
  MIDIStatus,
  MIDILearnTarget,
  MIDICurveType,
  MIDIActionType,
  MIDITriggerType,
  ChainMIDIConfig,
  MIDIDeviceProfile,
  ExpressionCalibration,
  DFUStatus,
  DFUInstructions,
  ProfileApplyResult,
  MIDIExpressionCurve,
  IRStatus,
  NAMStatus,
  AutomationLane,
  AutomationPoint,
  AutomationStatus,
  LFOConfig,
  HistoryStatus,
  HistoryEntry,
  Session,
  SessionListItem,
  SystemMetrics,
  MetricsSummary,
  MetricsHistory,
  JackMetrics,
  RealtimeStatus,
  BrandingStatus,
  ChainsResponse,
  PluginsResponse,
  SnapshotsResponse,
  IRsResponse,
  NAMModelsResponse,
  SessionsResponse,
  CurveType,
  NetworkStatus,
  WiFiNetwork,
  IPConfiguration,
  WWWStatus,
  APIEndpoint,
  AccessLog,
  WebSocketStats,
  HostMachineInfo,
  DiskHealthData,
  SystemHealthOverview,
  BrandingAssets,
} from './types';
import type {
  TesiraCapabilityEnvelope,
  TesiraCrosspointMatrix,
  DiscoveryScanStatus,
  PresetInterlockRule,
  TesiraDspBlock,
  TesiraDspBlockListResponse,
  TesiraDspBulkOperation,
  TesiraDspBulkResult,
  TesiraDspParamsResponse,
  TesiraDspProbeResult,
  TesiraDeviceDetail,
  TesiraDeviceSummary,
  TesiraDesignGraph,
  TesiraDesignCompileBatchResponse,
  TesiraDesignCompileResponse,
  TesiraDesignDiagnosticsResponse,
  TesiraDesignLibraryResponse,
  TesiraDesignMutationResponse,
  TesiraDesignValidateResponse,
  TesiraDesignWorkspaceDetailResponse,
  TesiraDesignWorkspaceListResponse,
  TesiraFleetHealth,
  TesiraFirmwareStatus,
  TesiraGpioListResponse,
  TesiraLatestFirmware,
  TesiraMeterHistoryResponse,
  TesiraMeterPeakResponse,
  TesiraMutationResponse,
  TesiraRawCommandResponse,
  TesiraLayoutArtifact,
  TesiraLayoutListResponse,
  TesiraSageVueStatus,
  TesiraDeploymentJob,
  TesiraPtpTopologyResponse,
  TesiraPTPStatus,
  TesiraPresetInfo,
  TesiraSceneDetail,
  TesiraSceneListResponse,
  TesiraStreamInfo,
} from '../app/components/Tesira/types';
import type {
  AvbAvdeccEntitiesResponse,
  AvbAvdeccEntity,
  AvbAvdeccStats,
  AvbChannelCapabilitiesResponse,
  AvbDevicesResponse,
  AvbNode,
  AvbReadinessContract,
  AvbStreamDiagnostics,
  AvbStreamPayload,
  AvbStreamsResponse,
  ConnectionsResponse,
  EndpointsResponse,
  RoutingMatrixResponse,
  StreamDirection,
} from '../app/components/AvbRouting/types';
import type { ParameterDescriptor, ParameterRegistry } from '../app/data/parameterSchema';
import type { NodeHealth, NodeIdentity, NodeTopology } from '../app/types/node';
import { sanitizeDisplayPayload } from './displayNames';
import {
  getChainReorderCompatibilityKey,
  getLegacyUriOnlyPluginOrder,
  isLegacyUriOnlyReorderValidationError,
  normalizeReorderPluginsResponse,
  type RawReorderPluginsResponse,
} from './reorderPluginsCompat';
import {
  dispatchRuntimeEvent,
  getRuntimeApiBaseOverride,
  getRuntimeEnvApiBase,
  getRuntimeLocation,
  getRuntimeStorage,
} from './runtime';
import { audioApi, diagnosticsApi, usbApi } from './clients/audio';
import { avbApi } from './clients/avb';
import { brainApi } from './clients/brain';
import {
  foldersApi,
  irApi,
  irLibraryApi,
  namApi,
  soundfontApi,
  uploadApi,
} from './clients/assets';
import { chainsApi } from './clients/chains';
import { drumsApi } from './clients/drums';
import { midiApi as splitMidiApi, midiApiV2 as splitMidiApiV2 } from './clients/midi';
import {
  midiClusterApi as splitMidiClusterApi,
  midiHubApi as splitMidiHubApi,
} from './clients/midiHub';
import { pushSurfaceApi } from './clients/pushSurface';
import {
  getNodeHealth,
  getNodeIdentity,
  getNodeTopology,
  metricsApi,
  networkApi,
  nodeApi,
  patchNodeLabel,
  servicesApi,
  systemApi,
} from './clients/platform';
import {
  PLUGIN_INVENTORY_CHANGED_EVENT,
  pluginAppearancesApi,
  pluginsApi,
} from './clients/plugins';
import { healthApi, wwwApi } from './clients/status';
import {
  automationApi,
  engineApi,
  latencyV2Api,
  pipewireApi,
  synthforgeApi,
} from './clients/utilities';
import {
  effectsLoopsApi,
  historyApi,
  sessionsApi,
  snapshotsApi,
} from './clients/workflows';
import {
  appendAvbNodeQuery,
  appendNodeQuery,
  appendPluginRuntimeQuery,
  appendQueryParams,
  ApiError,
  fetchBlob,
  fetchJson,
  scopedNodePath,
} from './http';
import { API_BASE, getWsBaseUrl, getWsUrl } from './transport';
import type { PluginRuntimeScopeOptions } from './http';

export { API_BASE, getWsBaseUrl, getWsUrl } from './transport';
export { audioApi, diagnosticsApi, usbApi } from './clients/audio';
export { avbApi } from './clients/avb';
export { brainApi } from './clients/brain';
export { chainsApi } from './clients/chains';
export { drumsApi } from './clients/drums';
export { midiApi, midiApiV2 } from './clients/midi';
export { midiClusterApi, midiHubApi } from './clients/midiHub';
export { pushSurfaceApi } from './clients/pushSurface';
export {
  foldersApi,
  irApi,
  irLibraryApi,
  namApi,
  soundfontApi,
  uploadApi,
} from './clients/assets';
export {
  getNodeHealth,
  getNodeIdentity,
  getNodeTopology,
  metricsApi,
  networkApi,
  nodeApi,
  patchNodeLabel,
  servicesApi,
  systemApi,
} from './clients/platform';
export {
  PLUGIN_INVENTORY_CHANGED_EVENT,
  pluginAppearancesApi,
  pluginsApi,
} from './clients/plugins';
export { healthApi, wwwApi } from './clients/status';
export {
  automationApi,
  engineApi,
  latencyV2Api,
  pipewireApi,
  synthforgeApi,
} from './clients/utilities';
export {
  effectsLoopsApi,
  historyApi,
  sessionsApi,
  snapshotsApi,
} from './clients/workflows';
export type { PluginRuntimeScopeOptions } from './http';
export { ApiError } from './http';
export type {
  PluginDiscoverResponse,
  PluginParameterSchemaEntry,
  PluginParameterSchemaPlugin,
  PluginParameterSchemaResponse,
} from './clients/plugins';
export type AvbClusterFanoutNodeResult<T> = {
  status_code?: number
  body?: T
}

export type AvbClusterFanoutResponse<T> = {
  nodes?: Record<string, AvbClusterFanoutNodeResult<T>>
}

export interface AvbDiscoveryNodePayload {
  node_id: string
  name?: string
  hostname?: string
  type?: string
  status?: string
  address?: string
  addresses?: string[]
  port?: number
  api_url?: string | null
  entity_id?: string | null
  talker_count?: number
  listener_count?: number
  discovered_at?: string
  last_seen: string
  capabilities?: Partial<AvbNode['capabilities']>
  avb_capabilities?: {
    talker_streams?: number
    listener_streams?: number
    ptp_synced?: boolean
    ptp_offset_ns?: number
    sample_rate?: number
    channels?: number
  }
  ptp?: Partial<NonNullable<AvbNode['ptp']>>
  health?: Partial<NonNullable<AvbNode['health']>>
  version?: string | null
  manufacturer?: string | null
  model?: string | null
}

export interface AvbDiscoverySummaryResponse {
  enabled: boolean
  total_discovered: number
  talker_nodes: number
  listener_nodes: number
  nodes: AvbDiscoveryNodePayload[]
  error?: string
}

export interface AvbDiscoveryNodesResponse {
  enabled: boolean
  nodes: AvbDiscoveryNodePayload[]
  error?: string
}

export interface AvbPtpStatusResponse {
  available?: boolean
  enabled?: boolean
  state: string
  domain: number
  is_master: boolean
  master_clock_id: string | null
  grandmaster_id?: string | null
  offset_ns: number | null
  mean_path_delay_ns?: number | null
  last_sync: string | null
  gptp_supported: boolean
  readiness?: AvbReadinessContract
  error?: string
}

export interface AvbStatusResponse {
  enabled: boolean
  configured: boolean
  operational: boolean
  degraded: boolean
  available: boolean
  interface: string
  interface_source: string
  state: string
  ptp: AvbPtpStatusResponse
  reason?: string | null
  readiness?: AvbReadinessContract
  compatibility?: Record<string, unknown>
  config?: Record<string, unknown>
}

export interface AvbConnectionEndpointPayload {
  endpoint_id?: string
  node_id?: string | null
  node_address?: string | null
  device_name?: string
}

export type AvbRouterConnectionPayload = Omit<ConnectionsResponse['connections'][number], 'talker' | 'listener'> & {
  talker: ConnectionsResponse['connections'][number]['talker'] & AvbConnectionEndpointPayload
  listener: ConnectionsResponse['connections'][number]['listener'] & AvbConnectionEndpointPayload
  bandwidth_mbps?: number
  connection_role?: string
  loop_id?: string | null
}

export interface AvbRouterConnectionsResponse {
  connections: AvbRouterConnectionPayload[]
  count: number
  error?: string
  source_node_id?: string
}

export type AvbRouterStatsResponse = Record<string, unknown>

export interface AvbRouterPatchRequest {
  talker_id: string
  listener_id: string
  connection_role?: string
  loop_id?: string | null
}

export interface AvbRouterPatchResponse {
  success: boolean
  connection_id: string
  message: string
  connection_role?: string
  loop_id?: string | null
  trace_id?: string
  stages?: unknown
  srp_admission?: unknown
  srp_release?: unknown
  srp_release_warning?: unknown
}

// ==================== Audio API ====================

// Audio health types
export interface AudioHealth {
  status: 'healthy' | 'warning' | 'critical';
  running: boolean;
  auto_muted: boolean;
  xruns_last_minute: number;
  signal_detected: boolean;
  cpu_load: number;
  latency_ms: number;
  alerts: string[];
}

export interface XrunStats {
  total: number;
  last_minute: number;
  last_hour: number;
  last_timestamp?: string;
}

export interface SignalStatus {
  input_detected: boolean;
  output_active: boolean;
  peak_input: number;
  peak_output: number;
}

export interface BufferPreset {
  size: number;
  latency_ms: number;
  label: string;
  recommended?: boolean;
}

export interface JuceMetrics {
  engine_version: string;
  audio_device: string;
  input_channels: number;
  output_channels: number;
  sample_rate: number;
  buffer_size: number;
  cpu_load: number;
  available_devices?: string[];
}

// Audio port routing types
export interface AudioPort {
  index: number;
  name: string;
  type: 'input' | 'output';
}

export interface AudioAvbEndpoint {
  endpoint_id: string;
  device_name: string;
  direction: 'talker' | 'listener';
  host?: string;
  channels: number;
  sample_rate: number;
  available: boolean;
  audio_format?: string;
  device_type?: string;
  node_address?: string;
}

export interface AudioRoutingSelectionBinding {
  selection_type: 'local_port' | 'avb_endpoint';
  available: boolean;
  missing?: boolean;
  index?: number;
  name?: string;
  source?: string;
  endpoint_id?: string;
  direction?: 'talker' | 'listener';
  device_name?: string;
  host?: string;
  channels?: number;
  sample_rate?: number;
}

export interface AudioPortsResponse {
  available: boolean;
  device?: string;
  inputs: AudioPort[];
  outputs: AudioPort[];
  input_count: number;
  output_count: number;
  avb_readiness?: Record<string, unknown>;
  avb_talkers?: AudioAvbEndpoint[];
  avb_listeners?: AudioAvbEndpoint[];
  capabilities?: Record<string, unknown>;
  error?: string;
}

export interface AudioRoutingResponse {
  available: boolean;
  input_ports: number[];
  output_ports: number[];
  input_avb_endpoints?: string[];
  output_avb_endpoints?: string[];
  input_bindings?: AudioRoutingSelectionBinding[];
  output_bindings?: AudioRoutingSelectionBinding[];
  is_override?: boolean;
  error?: string;
}

export interface AudioRoutingUpdateResponse {
  success: boolean;
  message: string;
  input_ports: number[];
  output_ports: number[];
  input_avb_endpoints?: string[];
  output_avb_endpoints?: string[];
  input_bindings?: AudioRoutingSelectionBinding[];
  output_bindings?: AudioRoutingSelectionBinding[];
  is_override?: boolean;
}

export interface ChainRoutingResponse {
  available: boolean;
  chain_id: number;
  input_ports: number[];
  output_ports: number[];
  input_avb_endpoints?: string[];
  output_avb_endpoints?: string[];
  input_bindings?: AudioRoutingSelectionBinding[];
  output_bindings?: AudioRoutingSelectionBinding[];
  is_override: boolean;
  chain_exists?: boolean;
}

export interface ChainRoutingUpdateResponse {
  success: boolean;
  message: string;
  chain_id: number;
  input_ports: number[];
  output_ports: number[];
  input_avb_endpoints?: string[];
  output_avb_endpoints?: string[];
  input_bindings?: AudioRoutingSelectionBinding[];
  output_bindings?: AudioRoutingSelectionBinding[];
  is_override: boolean;
}

export interface AudioPortPreset {
  id: string;
  name: string;
  description: string;
  input_ports: number[];
  output_ports: number[];
}

export interface AudioPortPresetsResponse {
  presets: AudioPortPreset[];
  current: {
    input_ports: number[];
    output_ports: number[];
    input_avb_endpoints: string[];
    output_avb_endpoints: string[];
  };
}

export interface DiagnosticResult {
  success: boolean;
  test_name: string;
  duration_ms: number;
  latency_ms?: number;
  quality_score?: number;
  xruns_detected: number;
  message: string;
  details?: Record<string, unknown>;
}

export interface AlsaDeviceInfo {
  cards: AlsaCard[];
  current_device: string;
  driver: string;
  state: 'running' | 'stopped' | 'error';
}

export interface AlsaCard {
  id: number;
  name: string;
  driver: string;
  devices: AlsaSubDevice[];
}

export interface AlsaSubDevice {
  id: number;
  name: string;
  type: 'playback' | 'capture';
  channels: number;
  sample_rates: number[];
  formats: string[];
}

export interface UsbDevice {
  bus: number;
  device: number;
  vendor_id: string;
  product_id: string;
  manufacturer: string;
  product: string;
  serial?: string;
  is_audio: boolean;
}

export interface FullDiagnosticResult {
  timestamp: string;
  overall_status: 'pass' | 'warning' | 'fail';
  tests: DiagnosticResult[];
  recommendations: string[];
}

export interface BufferStabilityResult {
  success: boolean;
  buffer_size: number;
  duration_seconds: number;
  xruns: number;
  avg_cpu_load: number;
  peak_cpu_load: number;
  stability_score: number;
  recommendation: string;
}

// ==================== USB / Device API ====================

// ==================== Chains API ====================

// ==================== Effects Loops API ====================

export interface TesiraLoopTemplate {
  template_id: string;
  tesira_device_id: string;
  stream_in_tags: string[];
  stream_out_tags: string[];
  crosspoint_tags: string[];
  input_router_tag?: string | null;
  output_router_tag?: string | null;
  meter_tags: string[];
  bypass_tags: string[];
  channel_map_policy: string;
  validation_status: string;
  validation_error?: string | null;
  runtime_status?: TesiraTemplateRuntimeStatus;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface TesiraTemplateRuntimeAlarm {
  code: string;
  severity: 'error' | 'warning' | 'info' | string;
  message: string;
  tag?: string;
  tag_type?: string;
  detail?: string;
}

export interface TesiraTemplateRuntimeStatus {
  drift_status: 'ok' | 'warning' | 'error' | 'unknown' | string;
  alarm_count: number;
  alarms: TesiraTemplateRuntimeAlarm[];
  checked_at: string;
  probed_tag_count?: number;
  failed_tag_count?: number;
}

export interface LoopMetrics {
  loop_id: string;
  state_actual?: string;
  target_added_latency_ms: number;
  measured_added_latency_ms?: number | null;
  compensation_samples: number;
  channels?: number;
  health_status?: string;
  health_reason?: string | null;
  updated_at?: string | null;
}

// ==================== Plugins API ====================

// ==================== Snapshots API ====================

const midiApi = splitMidiApi;
const midiApiV2 = splitMidiApiV2;
const midiClusterApi = splitMidiClusterApi;
const midiHubApi = splitMidiHubApi;

// ==================== MIDI API ====================

export interface MidiHubTrafficRow {
  timestamp_ns: number;
  source_port: string;
  destination_port: string;
  direction: string;
  raw_hex: string;
  route_id?: string | null;
   origin_node_id?: string;
   source_node_id?: string;
   destination_node_id?: string;
  decoded?: {
    message_type?: string;
    channel?: number | null;
    data1?: number | null;
    data2?: number | null;
  };
}

export interface MidiHubTrafficSnapshot {
  count: number;
  captured_total: number;
  capacity: number;
  records: MidiHubTrafficRow[];
}

export interface MidiHubRouteFilter {
  message_types: string[];
  channels: number[];
  cc_range?: [number, number] | null;
  note_range?: [number, number] | null;
  velocity_range?: [number, number] | null;
}

export interface MidiHubRoute {
  route_id: string;
  source_port: string;
  destination_ports: string[];
  enabled: boolean;
  priority: number;
  route_type: string;
  filter: MidiHubRouteFilter;
  transform_chain: Array<Record<string, unknown>>;
  latency_compensation_enabled?: boolean;
  destination_latency_ms?: Record<string, number>;
}

export interface MidiHubRouteRequest {
  route_id?: string;
  source_port: string;
  destination_ports: string[];
  enabled?: boolean;
  priority?: number;
  route_type?: string;
  filter?: Partial<MidiHubRouteFilter>;
  transform_chain?: Array<Record<string, unknown>>;
  latency_compensation_enabled?: boolean;
  destination_latency_ms?: Record<string, number>;
}

export interface MidiHubPresetSummary {
  preset_id: string;
  name: string;
  description: string;
  created_at: number;
  updated_at: number;
  conditions: Record<string, unknown>;
}

export interface MidiHubPresetPayload {
  preset_id: string;
  name: string;
  description: string;
  created_at: number;
  updated_at: number;
  snapshot: Record<string, unknown>;
  conditions: Record<string, unknown>;
}

export interface MidiHubProgramSlotMap {
  slots: Record<string, string>;
}

export interface MidiHubEventList {
  event_list_id: string;
  name: string;
  list_type: 'mtc' | 'rtc' | string;
  source_id: string;
  internal_clock_enabled: boolean;
  first_time: string;
  last_time: string;
  fps: number;
  timezone: string;
  enabled: boolean;
  running: boolean;
  current_timecode: string;
  current_frame: number;
  current_datetime?: string | null;
  clock_source: string;
  learn_mode_enabled: boolean;
  learn_action_type: string;
  learn_label: string;
  learn_payload: Record<string, unknown>;
  fired_event_ids: string[];
  event_count: number;
}

export interface MidiHubEventListEvent {
  event_id: string;
  order: number;
  time_address: string;
  action_type: string;
  label: string;
  payload: Record<string, unknown>;
  enabled: boolean;
  last_fired_at?: number | null;
}

export interface MidiHubMscMessage {
  device_id: number;
  command_format: number;
  command: string;
  cue_number: string;
  list_number?: string | null;
  message_hex: string;
  message: number[];
}

export interface MidiHubScriptSummary {
  script_id: string;
  name: string;
  code: string;
  enabled: boolean;
  created_at: number;
  updated_at: number;
}

export interface MidiHubClockStatus {
  bpm: number;
  running: boolean;
  source_mode: string;
  output_ports: string[];
  snapshot_sync_enabled?: boolean;
  divider: number;
  multiplier: number;
  offset_ms: number;
  detected_bpm?: number | null;
  song_position: number;
  tap_note?: number | null;
  tap_cc?: number | null;
}

export interface MidiHubNetworkSession {
  session_id: string;
  host: string;
  port: number;
  mode: string;
  active: boolean;
  created_at: number;
  latency_ms?: number | null;
  jitter_ms?: number | null;
}

export interface Midi2TransportBindingState {
  transport: string;
  target_id?: string | null;
  response_port?: string | null;
  bound_at?: number | null;
}

export interface Midi2TransportResult {
  ok: boolean;
  transport?: string | null;
  target_id?: string | null;
  response_port?: string | null;
  request_kind?: string | null;
  request_id?: number | null;
  awaiting_reply?: boolean;
  payload_hex?: string | null;
  reason?: string | null;
}

export interface Midi2ProfileDetailState {
  profile_id: string;
  inquiry_target: number;
  data_hex: string;
  data_text?: string | null;
  data?: unknown;
}

export interface Midi2SubscriptionState {
  resource?: string | null;
  res_id?: string | null;
  active: boolean;
  last_command?: string | null;
  last_request_id?: number | null;
  last_update_at?: number | null;
  pending_refresh?: boolean;
}

export interface Midi2UmpInspectionMessage {
  type: string;
  group: number;
  [key: string]: unknown;
}

export interface Midi2DeviceState {
  device_id: string;
  protocol: string;
  remote_muid?: string | null;
  manufacturer_id?: string | null;
  family_id?: string | null;
  model_id?: string | null;
  software_revision?: string | null;
  supports_profiles?: boolean;
  supports_property_exchange?: boolean;
  max_sysex_size?: number | null;
  discovery_state?: string | null;
  profile_state?: string | null;
  property_state?: string | null;
  profiles: Record<string, boolean>;
  profile_details?: Record<string, Midi2ProfileDetailState>;
  properties: Record<string, unknown>;
  resources?: string[];
  subscriptions?: Record<string, Midi2SubscriptionState>;
  property_exchange_capabilities?: Record<string, unknown>;
  last_discovery_at?: number | null;
  last_request_at?: number | null;
  last_request_kind?: string | null;
  last_request_id?: number | null;
  pending_request_kind?: string | null;
  pending_request_id?: number | null;
  pending_request_deadline?: number | null;
  last_request_hex?: string | null;
  last_response_at?: number | null;
  last_response_hex?: string | null;
  last_response_source?: string | null;
  last_response_summary?: string | null;
}

export interface Midi2Status {
  enabled: boolean;
  default_protocol: string;
  local_muid?: string | null;
  device_count: number;
  devices: Midi2DeviceState[];
  binding: Midi2TransportBindingState;
  last_error?: string | null;
  last_tx_at?: number | null;
  last_tx_hex?: string | null;
  last_tx_kind?: string | null;
  last_tx_device_id?: string | null;
  last_rx_at?: number | null;
  last_rx_hex?: string | null;
  last_rx_source?: string | null;
  last_rx_device_id?: string | null;
  discovery_pending_until?: number | null;
}

export interface TesiraAliasState {
  instance_tag: string;
  block_type: string;
  label?: string;
  level?: number;
  mute?: boolean;
  selection?: number;
  peak_db?: number;
}

export interface TesiraSubscriptionState {
  token: string;
  instance_tag: string;
  attribute: string;
  created_at: number;
  last_value?: unknown;
}

export interface TesiraStatus {
  connected: boolean;
  host: string;
  port: number;
  secured: boolean;
  username: string;
  auto_reconnect: boolean;
  connected_at?: number | null;
  last_error?: string | null;
  aliases: TesiraAliasState[];
  subscriptions: TesiraSubscriptionState[];
  history: Array<{ command: string; response: string; timestamp: number }>;
  device_info: Record<string, unknown>;
  presets: Array<{ preset_id: number; name: string; active: boolean }>;
  matrix: Array<{ input: number; output: number; level: number; mute: boolean }>;
}

export interface VirtualGpioChannel {
  channel_id: string;
  channel_type: 'input' | 'output' | string;
  index: number;
  label: string;
  state: boolean;
  last_changed_at: number;
}

export interface VirtualGpioSnapshot {
  input_count: number;
  output_count: number;
  inputs: VirtualGpioChannel[];
  outputs: VirtualGpioChannel[];
  events: Array<Record<string, unknown>>;
}

export interface StringInterfaceLog {
  direction: string;
  raw: string;
  parsed: Record<string, unknown>;
  timestamp: number;
}

export interface StringInterfaceStatus {
  enabled: boolean;
  listen_host: string;
  listen_port: number;
  target_host: string;
  target_port: number;
  log_count: number;
  logs: StringInterfaceLog[];
}

export interface OscNamespaceEntry {
  address: string;
  description: string;
  direction: string;
  current_value: unknown;
}

export interface OscNamespaceEvent {
  address: string;
  value: unknown;
  source: string;
  metadata: Record<string, unknown>;
  timestamp: number;
}

export interface MidiHubLearnSuggestion {
  cc_number: number;
  channel: number;
  confidence: number;
  reason: string;
  chain_context?: Record<string, unknown>;
}

export interface MidiHubMessageMapperSlot {
  slot_id: string;
  enabled: boolean;
  source_port: string;
  message_type: string;
  channel_min: number;
  channel_max: number;
  value_min: number;
  value_max: number;
  target: string;
  curve: string;
  created_at: number;
  updated_at: number;
  match_count: number;
  last_matched_at?: number | null;
  last_source_port?: string | null;
  last_event_hex?: string | null;
  last_output_hex?: string | null;
  last_error?: string | null;
}

export interface MidiHubMacro {
  macro_id: string;
  name: string;
  trigger: Record<string, unknown>;
  actions: Array<Record<string, unknown>>;
  enabled: boolean;
  created_at: number;
  updated_at: number;
}

export interface MidiHubRecordingSession {
  session_id: string;
  name: string;
  created_at: number;
  started_at?: number | null;
  stopped_at?: number | null;
  loop_enabled: boolean;
  event_count: number;
}

export interface MidiHubScheduledEntry {
  schedule_id: string;
  destination_port: string;
  message_hex: string;
  run_at_ns: number;
  created_at: number;
  metadata: Record<string, unknown>;
  status: string;
  sent_at?: number | null;
  error?: string | null;
}

export interface MidiHubDeviceProfile {
  profile_id: string;
  name: string;
  match_patterns: string[];
  default_channel: number;
  supports_sysex: boolean;
  usb_vid_pid: string[];
  metadata: Record<string, unknown>;
  is_custom: boolean;
}

export interface MidiHubDeviceState {
  device_id: string;
  profile_id: string;
  profile_name: string;
  port_ids: string[];
  port_names: string[];
  connected: boolean;
  responding: boolean;
  health: string;
  latency_ms?: number | null;
  last_seen: string;
  vendor_id?: string | null;
  product_id?: string | null;
  manual_assignment?: string | null;
  source: string;
  node_id: string;
  remote: boolean;
}

export interface MidiHubDeviceInventory {
  count: number;
  devices: MidiHubDeviceState[];
  remote_device_count: number;
  remote_devices: MidiHubDeviceState[];
  global_device_count: number;
  profiles: MidiHubDeviceProfile[];
  assignments: Record<string, string>;
  shadow_state: Record<string, unknown>;
  online_events?: string[];
  offline_events?: string[];
}

// =============================
// Cluster MIDI (T103)
// =============================
export interface MidiClusterCapabilities {
  input_ports: string[];
  output_ports: string[];
  virtual_ports: string[];
  hub_running: boolean;
  clock_source: string;
  clock_bpm: number;
  protocol_version: string;
  supports_midi2: boolean;
  sysex_enabled: boolean;
}

export interface MidiClusterEndpoint {
  endpoint_id: string;
  node_id: string;
  port_name: string;
  direction: 'input' | 'output' | string;
  device_name: string;
  node_address: string;
  available: boolean;
  last_seen?: string | null;
  port_ref?: string;
}

export interface MidiClusterNode {
  node_id: string;
  hostname: string;
  addresses: string[];
  port: number;
  online: boolean;
  last_seen?: string | null;
  capabilities?: MidiClusterCapabilities;
  ports: MidiClusterEndpoint[];
  devices: Array<Record<string, unknown>>;
}

export interface MidiClusterConnection {
  connection_id: string;
  state: string;
  transport: string;
  session_id?: string | null;
  established_at?: string | null;
  error_message?: string | null;
  latency_ms?: number | null;
  messages_forwarded: number;
  source: MidiClusterEndpoint;
  destination: MidiClusterEndpoint;
}

export interface MidiClusterClock {
  master_node_id?: string | null;
  master_bpm: number;
  strategy: string;
  is_master: boolean;
  sync_offset_ms: number;
  drift_ms: number;
  last_sync?: string | null;
  followers: string[];
}

export interface MidiClusterSummary {
  enabled: boolean;
  node_count: number;
  endpoint_count: number;
  connection_count: number;
  device_count: number;
  clock: MidiClusterClock;
  auto_connect: {
    reason: string;
    last_run_at?: string | null;
    pair_count: number;
    created_count: number;
    failed_count: number;
    created_connections: string[];
    failed_connections: Array<Record<string, unknown>>;
    transport: string;
  };
}

export interface MidiClusterHealth {
  enabled: boolean;
  status: string;
  node_count: number;
  connection_count: number;
  healthy_connection_count: number;
  degraded_connections: number;
  clock_status: string;
  clock_drift_ms: number;
  per_node: Array<{
    node_id: string;
    hostname: string;
    online: boolean;
    latency_ms?: number | null;
    input_port_count: number;
    output_port_count: number;
    device_count: number;
  }>;
  recent_events: Array<Record<string, unknown>>;
}


// ==================== IR API ====================

export interface LatencyJitterStats {
  p50_ms: number
  p95_ms: number
  p99_ms: number
  max_ms: number
  rtl_p95_ms?: number
  xrun_count: number
  window_seconds: number
  sample_count: number
  running?: boolean
}

// ==================== IR Library Download API ====================

// ==================== NAM API ====================

export interface NAMListParams {
  limit?: number
  offset?: number
  category?: string
  amp_type?: string
  favorites_only?: boolean
}

export interface NAMSearchRequest {
  query?: string
  category?: string
  amp_type?: string
  favorites_only?: boolean
}

export interface NAMModelDetail {
  id: number
  name: string
  file_path: string
  file_hash?: string
  file_size?: number
  model_type: string
  sample_rate?: number
  input_gain?: number
  output_gain?: number
  category: string
  amp_type?: string
  amp_name?: string
  author?: string
  description?: string
  tags: string[]
  license?: string
  source_url?: string
  is_favorite: boolean
  rating?: number
  created_at?: string
}

export interface NAMCategoriesResponse {
  categories: string[]
  amp_types: string[]
}


// ==================== SoundFont API ====================
// ==================== SynthForge API ====================

export interface SynthForgePartConfig {
  part_index: number
  midi_channel: number
  output_bus: string
  level: number
  pan: number
  mute: boolean
  solo: boolean
}

export interface SynthForgePatchInfo {
  bank: number
  program: number
  name: string
  category: string
  author: string
  description?: string
}

export interface SynthForgeVoiceMetrics {
  active_voices: number
  peak_voices: number
  voices_per_part: number[]
  cpu_percent: number
}

export interface SynthForgeSampleStatus {
  loaded: boolean
  sampler_mode: boolean
  part_index: number
  region_count: number
  loaded_sample_count: number
  sfz_path: string
  soundfont_path: string
  soundfont_format: string
  active_bank: number
  active_program: number
  active_preset_name: string
  engine: string
  engine_available: boolean
  last_error: string
  warnings: string[]
}

export interface SynthForgePerformanceConfig {
  master_transpose: number
  velocity_curve: number
  pitch_bend_range: number
  mono_mode: boolean
  legato: boolean
}

export interface SynthForgeStreamingConfig {
  enabled: boolean
  preload_size: number
  max_voices: number
  interpolation: 'linear' | 'hermite' | 'sinc'
  quality_live: number
  quality_freewheeling: number
  memory_limit_mb: number
}

export interface SynthForgeHotReloadStatus {
  enabled: boolean
  interval_ms: number
  pending_reload: boolean
  reloaded: boolean
  generation: number
  last_reload_iso: string
  last_error: string
}

export interface SynthForgeScalaTuning {
  enabled: boolean
  scala_path: string
  root_key: number
  reference_hz: number
}

export interface SynthForgeMpeConfig {
  enabled: boolean
  lower_zone_channels: number
  upper_zone_channels: number
  pitch_bend_range_semitones: number
}

export interface SynthForgeModMatrixRoute {
  source: string
  destination: string
  amount: number
  bipolar: boolean
  enabled: boolean
}

export interface SynthForgeFreezeStatus {
  freeze_enabled: boolean
  frozen_signal_ready: boolean
  freeze_samples: number
  render_path: string
  last_error: string
}

export interface SynthForgeAnalyzerFrame {
  peak_left: number
  peak_right: number
  rms_left: number
  rms_right: number
  midi_events: number
  active_voices: number
}

export interface SynthForgeBackendStatus {
  backend: string
  sfizz_available: boolean
  sfizz_loaded: boolean
  region_count: number
  group_count: number
  preloaded_samples: number
  unknown_opcodes: string[]
  unsupported_opcodes: string[]
}

// ==================== Performance Brain API ====================

export interface BrainTransportState {
  is_playing: boolean
  bpm: number
  swing: number
  pattern: number
  variation: number
  step: number
  bar: number
  beat: number
  pending_pattern: number
  switch_quantization_beats: number
}

export interface BrainSlot {
  slot_id: number
  name: string
  mode: 'chromatic' | 'drum' | 'hybrid'
  asset_type: 'soundfont' | 'sfz' | 'sample' | 'kit' | 'patch' | 'empty'
  asset_path: string
  source_label: string
  level: number
  pan: number
  mute: boolean
  solo: boolean
  tune: number
  transpose: number
  output_bus: number
  polyphony: number
  midi_channel: number
  trigger_note: number
  trigger_notes: number[]
  key_low: number
  key_high: number
  velocity_low: number
  velocity_high: number
  choke_group: number
  articulation_group: string
  velocity_curve: string
  status: string
}

export interface BrainLayer {
  layer_id: string
  name: string
  slot_indices: number[]
  key_low: number
  key_high: number
  velocity_low: number
  velocity_high: number
  polyphony: number
  scene_slot: number
  enabled: boolean
  purpose: string
}

export interface BrainPatternSummary {
  pattern_id: number
  name: string
  length: number
  active_lane_count: number
  fill_enabled: boolean
  variation_count: number
  summary: string
}

export interface BrainSequenceLaneSummary {
  slot_id: number
  name: string
  length: number
  swing: number
  active_steps: number
  step_lock_targets: string[]
}

export interface BrainSequence {
  pattern_bank_size: number
  max_steps: number
  current_pattern: number
  current_variation: number
  patterns: BrainPatternSummary[]
  lanes: BrainSequenceLaneSummary[]
  fill_mode: string
  song_entry_count: number
}

export interface BrainSongEntry {
  pattern_id: number
  variation: number
  repeat_count: number
  label: string
}

export interface BrainSongState {
  entries: BrainSongEntry[]
  loop: boolean
}

export interface BrainMixerBus {
  bus_id: number
  name: string
  level: number
  pan: number
  mute: boolean
  solo: boolean
  output_pair: number
  reverb_send: number
}

export interface BrainMasterSection {
  master_volume: number
  drive_db: number
  compressor_amount: number
  reverb_mix: number
  limiter_ceiling_db: number
}

export interface BrainMixerState {
  buses: BrainMixerBus[]
  master: BrainMasterSection
}

export interface BrainKeyboardZone {
  zone_id: string
  name: string
  midi_channel: number
  key_low: number
  key_high: number
  transpose: number
  enabled: boolean
  aftertouch_mode: string
}

export interface BrainTriggerProfile {
  profile_id: string
  name: string
  pad_range_start: number
  pad_range_end: number
  curve: string
  scan_time_ms: number
  mask_time_ms: number
  retrigger_cancel_ms: number
  crosstalk_guard: number
  velocity_floor: number
  velocity_ceiling: number
}

export interface BrainControllerAssignment {
  source: string
  target: string
  mode: string
  enabled: boolean
}

export interface BrainInputsState {
  keyboard_zones: BrainKeyboardZone[]
  trigger_profiles: BrainTriggerProfile[]
  controller_assignments: BrainControllerAssignment[]
}

export interface BrainLibraryAsset {
  asset_id: string
  name: string
  asset_type: 'soundfont' | 'sfz' | 'sample' | 'kit' | 'patch'
  source: string
  path: string
  description: string
  default_slot_mode: 'chromatic' | 'drum' | 'hybrid'
  tags: string[]
}

export interface BrainLibraryCollection {
  collection_id: string
  label: string
  asset_count: number
  assets: BrainLibraryAsset[]
}

export interface BrainLibraryState {
  collections: BrainLibraryCollection[]
  featured_assets: string[]
  last_scan_iso: string
}

export interface BrainSampleEditorState {
  slot_id: number
  asset_path: string
  waveform_available: boolean
  duration_seconds: number
  start_sample: number
  end_sample: number
  normalize_target: number
  reverse_enabled: boolean
  record_target_path: string
}

export interface BrainSnapshotIntegration {
  authority_model: 'snapshot-first'
  snapshot_id: number | null
  snapshot_name: string | null
  committed_state_id: string
  desired_state_id: string
  observed_state_id: string
}

export interface BrainKeyboardQualification {
  ready: boolean
  zone_count: number
  channel_count: number
  chromatic_slot_count: number
  polyphony_capacity: number
  max_key_span: number
  aftertouch_modes: string[]
  summary: string
  issues: string[]
}

export interface BrainTriggerQualification {
  ready: boolean
  profile_count: number
  covered_pad_count: number
  trigger_slot_count: number
  unique_trigger_notes: number
  fastest_scan_time_ms: number
  widest_mask_time_ms: number
  summary: string
  issues: string[]
}

export interface BrainSequenceQualification {
  ready: boolean
  pattern_count: number
  populated_pattern_count: number
  active_lane_count: number
  max_pattern_length: number
  swing_lane_count: number
  song_entry_count: number
  summary: string
  issues: string[]
}

export interface BrainRoutingQualification {
  ready: boolean
  used_bus_count: number
  output_pair_count: number
  reverb_bus_count: number
  controller_assignment_count: number
  summary: string
  issues: string[]
}

export interface BrainControllerQualification {
  scoped_instance_key: string
  scope_binding_ready: boolean
  tier_a_runtime_locked: boolean
  controller_ready: boolean
  ready_surface_count: number
  keyboard: BrainKeyboardQualification
  triggers: BrainTriggerQualification
  sequence: BrainSequenceQualification
  routing: BrainRoutingQualification
  summary: string
  issues: string[]
}

export interface BrainDiagnostics {
  sample_rate_hz: number
  buffer_size_samples: number
  cpu_load_percent: number
  active_voices: number
  peak_voices: number
  polyphony_headroom: number
  trigger_latency_ms: number
  roundtrip_latency_ms: number
  xruns: number
  backend_mode: string
  warnings: string[]
  last_import_source: string | null
  controller_qualification: BrainControllerQualification
  updated_at_iso: string
}

export interface BrainState {
  instance_id: string
  product_name: string
  set_name: string
  active_slot: number
  active_layer_id: string
  active_section: 'overview' | 'perform' | 'layers' | 'sequence' | 'routing' | 'inputs' | 'library' | 'diagnostics'
  transport: BrainTransportState
  slots: BrainSlot[]
  layers: BrainLayer[]
  sequence: BrainSequence
  song: BrainSongState
  mixer: BrainMixerState
  inputs: BrainInputsState
  library: BrainLibraryState
  sample_editor: BrainSampleEditorState
  diagnostics: BrainDiagnostics
  snapshot_integration: BrainSnapshotIntegration
}

export type BrainRuntimeResource =
  | 'state'
  | 'transport'
  | 'slot'
  | 'layers'
  | 'sequence'
  | 'song'
  | 'mixer'
  | 'inputs'
  | 'sample_editor'

export interface BrainRuntimeScope {
  runtime_instance_id: string
  instance_id: string | null
  plugin_position: number | null
}

export interface BrainRuntimeUpdate {
  resource: BrainRuntimeResource
  scope: BrainRuntimeScope
  state: BrainState
}

export interface BrainStateUpdate {
  set_name?: string
  active_slot?: number
  active_layer_id?: string
  active_section?: BrainState['active_section']
}

export interface BrainTransportUpdate {
  is_playing?: boolean
  bpm?: number
  swing?: number
  pattern?: number
  variation?: number
  pending_pattern?: number
  switch_quantization_beats?: number
}

export interface BrainSlotUpdate {
  name?: string
  mode?: BrainSlot['mode']
  asset_type?: BrainSlot['asset_type']
  asset_path?: string
  source_label?: string
  level?: number
  pan?: number
  mute?: boolean
  solo?: boolean
  tune?: number
  transpose?: number
  output_bus?: number
  polyphony?: number
  midi_channel?: number
  trigger_note?: number
  trigger_notes?: number[]
  key_low?: number
  key_high?: number
  velocity_low?: number
  velocity_high?: number
  choke_group?: number
  articulation_group?: string
  velocity_curve?: string
  status?: string
}

export interface BrainSampleEditorUpdate {
  slot_id: number
  start_sample?: number
  end_sample?: number
  normalize_target?: number
}

// ==================== Metrics API ====================
// ==================== Health API ====================

// ==================== Node API ====================

// ==================== AVB API ====================
// ==================== WWW API ====================

// ==================== Services API ====================

export interface ServiceHealth {
  healthy: boolean;
  message: string;
  last_check: string | null;
  response_time_ms: number;
  metrics: Record<string, unknown>;
}

export interface ServiceStatus {
  name: string;
  display_name: string;
  description: string;
  state: 'stopped' | 'starting' | 'running' | 'stopping' | 'failed' | 'degraded';
  priority: number;
  dependencies: string[];
  is_optional: boolean;
  auto_restart: boolean;
  health: ServiceHealth;
  started_at: string | null;
  stopped_at: string | null;
  restart_count: number;
  last_error: string | null;
  pid: number | null;
}

export interface OrchestratorStatus {
  running: boolean;
  startup_time: string | null;
  uptime_seconds: number;
}

export interface ServicesStatusResponse {
  orchestrator: OrchestratorStatus;
  services: Record<string, ServiceStatus>;
  startup_order: string[];
}

export interface ServicesSummaryResponse {
  total_services: number;
  healthy_services: number;
  health_percentage: number;
  by_state: Record<string, number>;
}

export interface ServiceActionResponse {
  success: boolean;
  service: string;
  state: string;
  message?: string;
}

export interface BulkActionResponse {
  success: boolean;
  results: Record<string, boolean>;
  message?: string;
}

// ==================== PLUGIN PRESETS API ====================

export const pluginPresetsApi = {
  list: (options?: {
    plugin_uri?: string;
    category?: string;
    tags?: string;
    favorites_only?: boolean;
    search?: string;
  }, nodeId?: string | null) => {
    const params = new URLSearchParams();
    if (options?.plugin_uri) params.set('plugin_uri', options.plugin_uri);
    if (options?.category) params.set('category', options.category);
    if (options?.tags) params.set('tags', options.tags);
    if (options?.favorites_only) params.set('favorites_only', 'true');
    if (options?.search) params.set('search', options.search);
    const query = params.toString();
    return fetchJson<{
      presets: Array<{
        id: number;
        name: string;
        plugin_uri: string;
        plugin_name: string;
        parameters: Record<string, any>;
        tags: string[];
        category: string;
        description: string;
        is_favorite: boolean;
        is_default: boolean;
        usage_count: number;
        created_at: string;
        updated_at: string;
      }>;
      count: number;
    }>(appendNodeQuery(`${API_BASE}/plugin-presets/${query ? `?${query}` : ''}`, nodeId));
  },

  get: (presetId: number) =>
    fetchJson<{
      id: number;
      name: string;
      plugin_uri: string;
      plugin_name: string;
      parameters: Record<string, any>;
      tags: string[];
      category: string;
      description: string;
      is_favorite: boolean;
      is_default: boolean;
      usage_count: number;
      created_at: string;
      updated_at: string;
    }>(`${API_BASE}/plugin-presets/${presetId}`),

  create: (request: {
    name: string;
    plugin_uri: string;
    plugin_name: string;
    parameters: Record<string, any>;
    tags?: string[];
    category?: string;
    description?: string;
    is_favorite?: boolean;
    is_default?: boolean;
  }) =>
    fetchJson<{ status: string; preset_id: number; message: string }>(`${API_BASE}/plugin-presets/`, {
      method: 'POST',
      body: JSON.stringify(request),
    }),

  update: (presetId: number, updates: {
    name?: string;
    parameters?: Record<string, any>;
    tags?: string[];
    category?: string;
    description?: string;
    is_favorite?: boolean;
    is_default?: boolean;
  }) =>
    fetchJson<{ status: string; preset_id: number; message: string }>(
      `${API_BASE}/plugin-presets/${presetId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }
    ),

  delete: (presetId: number) =>
    fetchJson<{ status: string; deleted_id: number; message: string }>(
      `${API_BASE}/plugin-presets/${presetId}`,
      { method: 'DELETE' }
    ),

  toggleFavorite: (presetId: number) =>
    fetchJson<{ status: string; preset_id: number; is_favorite: boolean; message: string }>(
      `${API_BASE}/plugin-presets/${presetId}/favorite`,
      { method: 'POST' }
    ),

  load: (presetId: number) =>
    fetchJson<{
      id: number;
      name: string;
      plugin_uri: string;
      plugin_name: string;
      parameters: Record<string, any>;
      usage_count: number;
    }>(`${API_BASE}/plugin-presets/${presetId}/load`, { method: 'POST' }),

  getByPluginUri: (pluginUri: string) =>
    fetchJson<{
      plugin_uri: string;
      presets: Array<{
        id: number;
        name: string;
        parameters: Record<string, any>;
        is_favorite: boolean;
        is_default: boolean;
        usage_count: number;
        description: string;
      }>;
      count: number;
      default_preset_id: number | null;
    }>(`${API_BASE}/plugin-presets/plugin/${encodeURIComponent(pluginUri)}`),

  getCategories: () =>
    fetchJson<{ categories: Array<{ name: string; count: number }>; count: number }>(
      `${API_BASE}/plugin-presets/categories/all`
    ),

  getTags: () =>
    fetchJson<{ tags: string[]; count: number }>(`${API_BASE}/plugin-presets/tags/all`),

  getPluginsWithFavorites: () =>
    fetchJson<{
      plugins: Array<{
        plugin_uri: string;
        plugin_name: string;
        favorite_preset_count: number;
      }>;
      count: number;
    }>(`${API_BASE}/plugin-presets/favorites/plugins`),
};

// ==================== Folders API ====================

export interface DisplayPaths {
  nam_models: string;
  ir_cabinets: string;
  ir_reverbs: string;
  ir_user_uploads: string;
  nam_models_display: string;
  ir_cabinets_display: string;
  ir_reverbs_display: string;
}

export interface StorageInfo {
  nam_user_dir: { path: string; exists: boolean };
  ir_user_dir: { path: string; exists: boolean };
  ir_cabinet_dir: { path: string; exists: boolean };
  ir_reverb_dir: { path: string; exists: boolean };
  ir_user_upload_dir: { path: string; exists: boolean };
  nam_system_dir: { path: string; exists: boolean };
  ir_system_dir: { path: string; exists: boolean };
  ir_download_dir: { path: string; exists: boolean };
  all_nam_paths: string[];
  all_ir_paths: string[];
}

// ==================== Unified Upload API ====================

export interface UploadResult {
  success: boolean
  asset_type: string
  filename: string
  file_path: string
  file_size: number
  file_hash: string
  message: string
  error?: string
  already_exists: boolean
}

export interface BatchUploadResult {
  total: number
  successful: number
  failed: number
  results: UploadResult[]
}

export interface UploadTypeInfo {
  type: string
  name: string
  extensions: string[]
  max_size_mb: number
  description: string
}

// ==================== PipeWire Audio Server ====================
// ==================== JUCE Audio Engine ====================
// ==================== Dynamics Processors ====================

export const dynamicsApi = {
  /** Get compressor state */
  getCompressor: () =>
    fetchJson<{ parameters: import('./types').CompressorState; bypass: boolean }>(`${API_BASE}/engine/dynamics/compressor`),

  /** Update compressor parameters */
  updateCompressor: (params: Partial<import('./types').CompressorState>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/dynamics/compressor`, {
      method: 'PATCH', body: JSON.stringify(params),
    }),

  /** Get compressor metering */
  getCompressorMetering: () =>
    fetchJson<import('./types').DynamicsMetering>(`${API_BASE}/engine/dynamics/compressor/metering`),

  /** Get limiter state */
  getLimiter: () =>
    fetchJson<{ parameters: import('./types').LimiterState; bypass: boolean }>(`${API_BASE}/engine/dynamics/limiter`),

  /** Update limiter parameters */
  updateLimiter: (params: Partial<import('./types').LimiterState>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/dynamics/limiter`, {
      method: 'PATCH', body: JSON.stringify(params),
    }),

  /** Get gate state */
  getGate: () =>
    fetchJson<{ parameters: import('./types').GateState; bypass: boolean }>(`${API_BASE}/engine/dynamics/gate`),

  /** Update gate parameters */
  updateGate: (params: Partial<import('./types').GateState>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/dynamics/gate`, {
      method: 'PATCH', body: JSON.stringify(params),
    }),
};

// ==================== EQ Processors ====================

export const filtersApi = {
  /** Get EQ state (all bands) */
  getEQ: () =>
    fetchJson<import('./types').EQState>(`${API_BASE}/engine/eq`),

  /** Get EQ bands */
  getBands: () =>
    fetchJson<{ bands: import('./types').EQBand[] }>(`${API_BASE}/engine/eq/bands`),

  /** Update an EQ band */
  updateBand: (index: number, band: Partial<import('./types').EQBand>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/eq/bands/${index}`, {
      method: 'PATCH', body: JSON.stringify(band),
    }),

  /** Get frequency response curve */
  getFrequencyResponse: () =>
    fetchJson<import('./types').FrequencyResponse>(`${API_BASE}/engine/eq/frequency-response`),

  /** Set bypass */
  setBypass: (bypass: boolean) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/eq/bypass`, {
      method: 'POST', body: JSON.stringify({ bypass }),
    }),
};

// ==================== Delay Processor ====================

export const delayApi = {
  /** Get delay state */
  getDelay: () =>
    fetchJson<import('./types').DelayState>(`${API_BASE}/engine/delay`),

  /** Update delay parameters */
  updateParameters: (params: Partial<import('./types').DelayState>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/delay/parameters`, {
      method: 'PATCH', body: JSON.stringify(params),
    }),

  /** Tap tempo */
  tapTempo: () =>
    fetchJson<{ bpm: number; delay_ms: number }>(`${API_BASE}/engine/delay/tap-tempo`, { method: 'POST' }),

  /** Get tempo divisions */
  getTempoDivisions: () =>
    fetchJson<{ divisions: import('./types').TempoDivision[] }>(`${API_BASE}/engine/delay/tempo-divisions`),

  /** Set bypass */
  setBypass: (bypass: boolean) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/delay/bypass`, {
      method: 'POST', body: JSON.stringify({ bypass }),
    }),
};

// ==================== Modulation Processors ====================

export const modulationApi = {
  /** Get chorus state */
  getChorus: () =>
    fetchJson<import('./types').ChorusState>(`${API_BASE}/engine/modulation/chorus`),

  /** Update chorus parameters */
  updateChorus: (params: Partial<import('./types').ChorusState>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/modulation/chorus/parameters`, {
      method: 'PATCH', body: JSON.stringify(params),
    }),

  /** Get phaser state */
  getPhaser: () =>
    fetchJson<import('./types').PhaserState>(`${API_BASE}/engine/modulation/phaser`),

  /** Update phaser parameters */
  updatePhaser: (params: Partial<import('./types').PhaserState>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/modulation/phaser/parameters`, {
      method: 'PATCH', body: JSON.stringify(params),
    }),

  /** Get pitch shifter state */
  getPitchShifter: () =>
    fetchJson<import('./types').PitchShifterState>(`${API_BASE}/engine/modulation/pitch-shifter`),

  /** Update pitch shifter parameters */
  updatePitchShifter: (params: Partial<import('./types').PitchShifterState>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/modulation/pitch-shifter/parameters`, {
      method: 'PATCH', body: JSON.stringify(params),
    }),
};

// ==================== Boss XS-1 Pitch ====================

export const pitchApi = {
  /** Get Boss XS-1 state */
  getBossXS1: () =>
    fetchJson<import('./types').BossXS1State>(`${API_BASE}/engine/pitch/boss-xs1`),

  /** Update Boss XS-1 parameters */
  updateBossXS1: (params: Partial<import('./types').BossXS1State>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/pitch/boss-xs1/parameters`, {
      method: 'PATCH', body: JSON.stringify(params),
    }),

  /** Get Boss XS-1 presets */
  getBossXS1Presets: () =>
    fetchJson<{ presets: import('./types').BossXS1Preset[] }>(`${API_BASE}/engine/pitch/boss-xs1/presets`),

  /** Set bypass */
  setBypass: (bypass: boolean) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/pitch/boss-xs1/bypass`, {
      method: 'POST', body: JSON.stringify({ bypass }),
    }),
};

// ==================== Shoegaze Multi-Effect ====================

export const shoegazeApi = {
  /** Get shoegaze state */
  getState: () =>
    fetchJson<import('./types').ShoegazeState>(`${API_BASE}/engine/shoegaze`),

  /** Update parameters */
  updateParameters: (params: Partial<import('./types').ShoegazeState>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/shoegaze/parameters`, {
      method: 'PATCH', body: JSON.stringify(params),
    }),

  /** Get presets */
  getPresets: () =>
    fetchJson<{ presets: import('./types').ShoegazePreset[] }>(`${API_BASE}/engine/shoegaze/presets`),

  /** Set bypass */
  setBypass: (bypass: boolean) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/shoegaze/bypass`, {
      method: 'POST', body: JSON.stringify({ bypass }),
    }),
};

// ==================== Lexi Love Reverb ====================

export const lexiLoveApi = {
  /** Get state */
  getState: () =>
    fetchJson<import('./types').LexiLoveState>(`${API_BASE}/engine/lexilove`),

  /** Update parameters */
  updateParameters: (params: Partial<import('./types').LexiLoveState>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/lexilove/parameters`, {
      method: 'PATCH', body: JSON.stringify(params),
    }),

  /** Get available algorithms */
  getAlgorithms: () =>
    fetchJson<{ algorithms: import('./types').LexiLoveAlgorithm[] }>(`${API_BASE}/engine/lexilove/algorithms`),

  /** Set algorithm */
  setAlgorithm: (algorithmId: string) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/lexilove/algorithm`, {
      method: 'POST', body: JSON.stringify({ algorithm: algorithmId }),
    }),

  /** Set bypass */
  setBypass: (bypass: boolean) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/lexilove/bypass`, {
      method: 'POST', body: JSON.stringify({ bypass }),
    }),
};

// ==================== Ultra-Harmonizer ====================

export const h3000Api = {
  /** Get state */
  getState: () =>
    fetchJson<import('./types').H3000State>(`${API_BASE}/engine/h3000`),

  /** Update parameters */
  updateParameters: (params: Partial<import('./types').H3000State>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/h3000/parameters`, {
      method: 'PATCH', body: JSON.stringify(params),
    }),

  /** Get available algorithms */
  getAlgorithms: () =>
    fetchJson<{ algorithms: import('./types').H3000Algorithm[] }>(`${API_BASE}/engine/h3000/algorithms`),

  /** Set bypass */
  setBypass: (bypass: boolean) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/h3000/bypass`, {
      method: 'POST', body: JSON.stringify({ bypass }),
    }),
};

// ==================== Amp Models ====================

export const peavey5150Api = {
  /** Get state */
  getState: () =>
    fetchJson<import('./types').Peavey5150State>(`${API_BASE}/engine/amp/peavey5150`),

  /** Update parameters */
  updateParameters: (params: Partial<import('./types').Peavey5150State>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/amp/peavey5150/parameters`, {
      method: 'PATCH', body: JSON.stringify(params),
    }),

  /** Get presets */
  getPresets: () =>
    fetchJson<{ presets: import('./types').AmpPreset[] }>(`${API_BASE}/engine/amp/peavey5150/presets`),

  /** Set bypass */
  setBypass: (bypass: boolean) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/amp/peavey5150/bypass`, {
      method: 'POST', body: JSON.stringify({ bypass }),
    }),
};

export const tweedBassmanApi = {
  /** Get state */
  getState: () =>
    fetchJson<import('./types').TweedBassmanState>(`${API_BASE}/engine/amp/tweedbassman`),

  /** Update parameters */
  updateParameters: (params: Partial<import('./types').TweedBassmanState>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/amp/tweedbassman/parameters`, {
      method: 'PATCH', body: JSON.stringify(params),
    }),

  /** Get presets */
  getPresets: () =>
    fetchJson<{ presets: import('./types').AmpPreset[] }>(`${API_BASE}/engine/amp/tweedbassman/presets`),

  /** Set bypass */
  setBypass: (bypass: boolean) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/amp/tweedbassman/bypass`, {
      method: 'POST', body: JSON.stringify({ bypass }),
    }),
};

export const passionfxApi = {
  /** Get state */
  getState: () =>
    fetchJson<import('./types').PassionFXState>(`${API_BASE}/engine/multieffect/passionfx`),

  /** Update parameters */
  updateParameters: (params: Partial<import('./types').PassionFXState>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/multieffect/passionfx/parameters`, {
      method: 'PATCH', body: JSON.stringify(params),
    }),

  /** Get presets */
  getPresets: () =>
    fetchJson<{ presets: import('./types').AmpPreset[] }>(`${API_BASE}/engine/multieffect/passionfx/presets`),

  /** Set bypass */
  setBypass: (bypass: boolean) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/multieffect/passionfx/bypass`, {
      method: 'POST', body: JSON.stringify({ bypass }),
    }),
};

// ==================== Drum Machine ====================

// ==================== Sidechain Routing ====================

export const sidechainApi = {
  /** Get sidechain connections */
  getConnections: () =>
    fetchJson<{ connections: import('./types').SidechainConnection[] }>(`${API_BASE}/sidechain`),

  /** Create sidechain connection */
  create: (source: string, target: string, bus?: number) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/sidechain`, {
      method: 'POST', body: JSON.stringify({ source_plugin: source, target_plugin: target, bus: bus ?? 0 }),
    }),

  /** Delete sidechain connection */
  delete: (connectionId: number) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/sidechain/${connectionId}`, { method: 'DELETE' }),

  /** Toggle sidechain */
  toggle: (connectionId: number) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/sidechain/${connectionId}/toggle`, { method: 'POST' }),

  /** Get sidechain-capable plugins */
  getCapablePlugins: () =>
    fetchJson<{ plugins: unknown[] }>(`${API_BASE}/sidechain/plugins`),
};

// ==================== Core Plugins ====================

export const corePluginsApi = {
  /** Get core plugins installation status */
  getStatus: () =>
    fetchJson<import('./types').CorePluginsStatus>(`${API_BASE}/core-plugins/status`),

  /** Verify core plugins */
  verify: () =>
    fetchJson<import('./types').CorePluginsStatus>(`${API_BASE}/core-plugins/verify`),

  /** Get categories */
  getCategories: () =>
    fetchJson<{ categories: string[] }>(`${API_BASE}/core-plugins/categories`),

  /** Install core plugins */
  install: () =>
    fetchJson<{ success: boolean; message: string }>(`${API_BASE}/core-plugins/install`, { method: 'POST' }),

  /** Refresh LV2 cache */
  refreshCache: () =>
    fetchJson<{ success: boolean }>(`${API_BASE}/core-plugins/refresh-cache`, { method: 'POST' }),
};

// ==================== Parallel Routing ====================

export const parallelApi = {
  /** Get parallel groups */
  getGroups: () =>
    fetchJson<{ groups: import('./types').ParallelGroup[] }>(`${API_BASE}/parallel/groups`),

  /** Create parallel group */
  createGroup: (name: string) =>
    fetchJson<{ success: boolean; group: import('./types').ParallelGroup }>(`${API_BASE}/parallel/groups`, {
      method: 'POST', body: JSON.stringify({ name }),
    }),

  /** Delete parallel group */
  deleteGroup: (groupId: number) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/parallel/groups/${groupId}`, { method: 'DELETE' }),

  /** Set blend */
  setBlend: (groupId: number, blend: number) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/parallel/groups/${groupId}/blend`, {
      method: 'POST', body: JSON.stringify({ blend }),
    }),
};

// ==================== Loudness Metering ====================

export const loudnessApi = {
  /** Get LUFS measurements */
  getLUFS: () =>
    fetchJson<import('./types').LoudnessLUFS>(`${API_BASE}/engine/loudness/lufs`),

  /** Get momentary loudness */
  getMomentary: () =>
    fetchJson<{ momentary: number }>(`${API_BASE}/engine/loudness/momentary`),

  /** Get short-term loudness */
  getShortTerm: () =>
    fetchJson<{ short_term: number }>(`${API_BASE}/engine/loudness/short-term`),

  /** Get integrated loudness */
  getIntegrated: () =>
    fetchJson<{ integrated: number }>(`${API_BASE}/engine/loudness/integrated`),

  /** Reset integrated loudness */
  reset: () =>
    fetchJson<{ success: boolean }>(`${API_BASE}/engine/loudness/reset`, { method: 'POST' }),

  /** Get true peak */
  getTruePeak: () =>
    fetchJson<{ true_peak: number }>(`${API_BASE}/engine/loudness/true-peak`),
};

// ==================== Spectrum Analysis ====================

export const spectrumApi = {
  /** Get spectrum data */
  getSpectrum: () =>
    fetchJson<import('./types').SpectrumAnalysis>(`${API_BASE}/engine/spectrum`),

  /** Get magnitude data */
  getMagnitudes: () =>
    fetchJson<{ magnitudes: number[] }>(`${API_BASE}/engine/spectrum/magnitudes`),

  /** Get frequency bins */
  getFrequencies: () =>
    fetchJson<{ frequencies: number[] }>(`${API_BASE}/engine/spectrum/frequencies`),

  /** Get peak frequency */
  getPeak: () =>
    fetchJson<{ frequency: number; magnitude: number }>(`${API_BASE}/engine/spectrum/peak`),
};

// ==================== CPU Metrics ====================

export const cpuMetricsApi = {
  /** Get CPU metrics */
  getMetrics: () =>
    fetchJson<import('./types').CPUMetricsData>(`${API_BASE}/engine/cpu`),

  /** Get total CPU usage */
  getTotal: () =>
    fetchJson<{ cpu_percent: number; running: boolean | number }>(`${API_BASE}/engine/cpu/total`),

  /** Get per-plugin CPU */
  getPluginCPU: (pluginId: string) =>
    fetchJson<{ instance_id: number; cpu_percent: number }>(`${API_BASE}/engine/cpu/plugin/${pluginId}`),

  /** Get all plugin CPU stats */
  getAllPluginCPU: () =>
    fetchJson<{ plugins: Record<string, number> }>(`${API_BASE}/engine/cpu/plugins`),

  /** Get xrun count */
  getXruns: () =>
    fetchJson<{ xrun_count: number }>(`${API_BASE}/engine/cpu/xruns`),

  /** Get headroom */
  getHeadroom: () =>
    fetchJson<{ headroom_percent: number }>(`${API_BASE}/engine/cpu/headroom`),
};

// ==================== Backup ====================

export const backupApi = {
  /** List all backups */
  list: () =>
    fetchJson<{ backups: import('./types').BackupInfo[] }>(`${API_BASE}/backup`),

  /** Create a backup */
  create: (description?: string) =>
    fetchJson<{ success: boolean; backup_id: string }>(`${API_BASE}/backup`, {
      method: 'POST', body: JSON.stringify({ description: description ?? '' }),
    }),

  /** Restore from backup */
  restore: (backupId: string, options?: { restore_database?: boolean; restore_user_data?: boolean; restore_config?: boolean }) =>
    fetchJson<{ success: boolean; message: string }>(`${API_BASE}/backup/${backupId}/restore`, {
      method: 'POST', body: JSON.stringify(options ?? {}),
    }),

  /** Delete a backup */
  delete: (backupId: string) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/backup/${backupId}`, { method: 'DELETE' }),

  /** Get backup settings */
  getSettings: () =>
    fetchJson<import('./types').BackupSettings>(`${API_BASE}/backup/settings`),

  /** Update backup settings */
  updateSettings: (settings: Partial<import('./types').BackupSettings>) =>
    fetchJson<{ success: boolean }>(`${API_BASE}/backup/settings`, {
      method: 'PATCH', body: JSON.stringify(settings),
    }),
};

// ==================== Shopping ====================

export const shoppingApi = {
  /** Search audio interfaces across marketplaces */
  search: (maxPrice: number = 150) =>
    fetchJson<{
      results: Array<{
        title: string;
        price: number;
        url: string;
        source: string;
        condition: string;
        shipping: number | null;
        matched_device: {
          model: string;
          io_count: string;
          latency_ms: number;
          tier: string;
          score: number;
          linux_support: string;
          notes: string;
        } | null;
        score: number;
      }>;
      total_count: number;
      max_price: number;
      search_time_seconds: number;
      recommendations?: Record<string, any>;
    }>(`${API_BASE}/shopping/search?max_price=${maxPrice}`),

  /** Get quick recommendations */
  getRecommendations: () =>
    fetchJson<{
      top_picks: Array<{
        rank: number;
        model: string;
        typical_price: string;
        tier: string;
        reason: string;
        search_url: string;
      }>;
    }>(`${API_BASE}/shopping/recommendations`),
};

// ==================== Export all APIs ====================

export const map2Api = {
  audio: audioApi,
  avb: avbApi,
  chains: chainsApi,
  plugins: pluginsApi,
  pluginAppearances: pluginAppearancesApi,
  snapshots: snapshotsApi,
  pluginPresets: pluginPresetsApi,
  midi: midiApi,
  midiV2: midiApiV2,
  midiHub: midiHubApi,
  pushSurface: pushSurfaceApi,
  ir: irApi,
  irLibrary: irLibraryApi,
  nam: namApi,
  brain: brainApi,
  soundfont: soundfontApi,
  synthforge: synthforgeApi,
  automation: automationApi,
  history: historyApi,
  sessions: sessionsApi,
  metrics: metricsApi,
  system: systemApi,
  health: healthApi,
  node: nodeApi,
  network: networkApi,
  www: wwwApi,
  services: servicesApi,
  folders: foldersApi,
  upload: uploadApi,
  pipewire: pipewireApi,
  // Native JUCE Engine APIs
  engine: engineApi,
  dynamics: dynamicsApi,
  filters: filtersApi,
  delay: delayApi,
  modulation: modulationApi,
  pitch: pitchApi,
  shoegaze: shoegazeApi,
  lexiLove: lexiLoveApi,
  h3000: h3000Api,
  peavey5150: peavey5150Api,
  tweedBassman: tweedBassmanApi,
  passionfx: passionfxApi,
  drums: drumsApi,
  sidechain: sidechainApi,
  corePlugins: corePluginsApi,
  parallel: parallelApi,
  loudness: loudnessApi,
  spectrum: spectrumApi,
  cpuMetrics: cpuMetricsApi,
  backup: backupApi,
  shopping: shoppingApi,
};

export default map2Api;

// ============================================================================
// Tesira Forte AVB API
// All calls target /api/tesira (registered in app/routes/tesira.py)
// ============================================================================

const BASE = '/api/tesira'

async function _json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      if (typeof body?.detail === 'string') detail = body.detail
      else if (typeof body?.error === 'string') detail = body.error
      else if (typeof body?.message === 'string') detail = body.message
    } catch { /* ignore parse errors, use statusText */ }
    throw new Error(`${detail}`)
  }
  return res.json()
}

function readActiveClusterNodeId(): string | null {
  try {
    const stored = getRuntimeStorage()?.getItem('map2_active_node')
    if (!stored || stored === 'null' || stored === 'all') {
      return null
    }
    return stored
  } catch {
    return null
  }
}

function tesiraFetch(input: string, init?: RequestInit): Promise<Response> {
  return globalThis.fetch(appendNodeQuery(input, readActiveClusterNodeId()), init)
}

// The Tesira surface follows the shell node selector, so default every request
// in this section through the cluster proxy when a peer is active.
const fetch = tesiraFetch

export const tesiraApi = {
  // Device management
  listDevices: (): Promise<TesiraDeviceSummary[]> =>
    fetch(`${BASE}/devices`).then((r) => _json<TesiraDeviceSummary[]>(r)),

  listDesigns: (deviceId: string, params?: { includeInactive?: boolean; includeTemplates?: boolean }): Promise<TesiraDesignWorkspaceListResponse> => {
    const search = new URLSearchParams()
    if (params?.includeInactive) search.set('include_inactive', 'true')
    if (params?.includeTemplates === false) search.set('include_templates', 'false')
    const query = search.toString()
    return fetch(`${BASE}/devices/${encodeURIComponent(deviceId)}/designs${query ? `?${query}` : ''}`)
      .then((r) => _json<TesiraDesignWorkspaceListResponse>(r))
  },

  getDesignLibrary: (deviceId: string, profile?: string): Promise<TesiraDesignLibraryResponse> => {
    const search = new URLSearchParams()
    if (profile) search.set('profile', profile)
    const query = search.toString()
    return fetch(`${BASE}/devices/${encodeURIComponent(deviceId)}/designs/library${query ? `?${query}` : ''}`)
      .then((r) => _json<TesiraDesignLibraryResponse>(r))
  },

  createDesign: (deviceId: string, body: {
    design_id?: string
    name: string
    description?: string | null
    graph?: TesiraDesignGraph
    is_template?: boolean
    is_active?: boolean
  }): Promise<TesiraDesignMutationResponse> =>
    fetch(`${BASE}/devices/${encodeURIComponent(deviceId)}/designs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => _json<TesiraDesignMutationResponse>(r)),

  getDesign: (deviceId: string, designId: string): Promise<TesiraDesignWorkspaceDetailResponse> =>
    fetch(`${BASE}/devices/${encodeURIComponent(deviceId)}/designs/${encodeURIComponent(designId)}`)
      .then((r) => _json<TesiraDesignWorkspaceDetailResponse>(r)),

  updateDesign: (deviceId: string, designId: string, body: {
    name?: string
    description?: string | null
    graph?: TesiraDesignGraph
    is_template?: boolean
    is_active?: boolean
  }): Promise<TesiraDesignMutationResponse> =>
    fetch(`${BASE}/devices/${encodeURIComponent(deviceId)}/designs/${encodeURIComponent(designId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => _json<TesiraDesignMutationResponse>(r)),

  deleteDesign: (deviceId: string, designId: string): Promise<{ ok: boolean; device_id: string; design_id: string }> =>
    fetch(`${BASE}/devices/${encodeURIComponent(deviceId)}/designs/${encodeURIComponent(designId)}`, {
      method: 'DELETE',
    }).then((r) => _json<{ ok: boolean; device_id: string; design_id: string }>(r)),

  validateDesign: (deviceId: string, designId: string, graph?: TesiraDesignGraph): Promise<TesiraDesignValidateResponse> =>
    fetch(`${BASE}/devices/${encodeURIComponent(deviceId)}/designs/${encodeURIComponent(designId)}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(graph ? { graph } : {}),
    }).then((r) => _json<TesiraDesignValidateResponse>(r)),

  compileDesign: (
    deviceId: string,
    designId: string,
    body?: { optimize?: boolean; recompile?: boolean }
  ): Promise<TesiraDesignCompileResponse> =>
    fetch(`${BASE}/devices/${encodeURIComponent(deviceId)}/designs/${encodeURIComponent(designId)}/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }).then((r) => _json<TesiraDesignCompileResponse>(r)),

  recompileDesign: (
    deviceId: string,
    designId: string,
    body?: { optimize?: boolean }
  ): Promise<TesiraDesignCompileResponse> =>
    fetch(`${BASE}/devices/${encodeURIComponent(deviceId)}/designs/${encodeURIComponent(designId)}/recompile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }).then((r) => _json<TesiraDesignCompileResponse>(r)),

  compileActiveDesign: (
    deviceId: string,
    body?: { optimize?: boolean; recompile?: boolean }
  ): Promise<TesiraDesignCompileBatchResponse> =>
    fetch(`${BASE}/devices/${encodeURIComponent(deviceId)}/designs/compile-active`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }).then((r) => _json<TesiraDesignCompileBatchResponse>(r)),

  compileAllDesigns: (
    deviceId: string,
    body?: { optimize?: boolean; recompile?: boolean; include_templates?: boolean }
  ): Promise<TesiraDesignCompileBatchResponse> =>
    fetch(`${BASE}/devices/${encodeURIComponent(deviceId)}/designs/compile-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }).then((r) => _json<TesiraDesignCompileBatchResponse>(r)),

  compileUncompiledDesigns: (
    deviceId: string,
    body?: { optimize?: boolean; recompile?: boolean; include_templates?: boolean }
  ): Promise<TesiraDesignCompileBatchResponse> =>
    fetch(`${BASE}/devices/${encodeURIComponent(deviceId)}/designs/compile-uncompiled`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }).then((r) => _json<TesiraDesignCompileBatchResponse>(r)),

  getDesignDiagnostics: (deviceId: string, designId: string): Promise<TesiraDesignDiagnosticsResponse> =>
    fetch(`${BASE}/devices/${encodeURIComponent(deviceId)}/designs/${encodeURIComponent(designId)}/diagnostics`)
      .then((r) => _json<TesiraDesignDiagnosticsResponse>(r)),

  listLayouts: (params?: { deviceFamily?: string; includeInactive?: boolean }): Promise<TesiraLayoutListResponse> => {
    const search = new URLSearchParams()
    if (params?.deviceFamily) search.set('device_family', params.deviceFamily)
    if (params?.includeInactive) search.set('include_inactive', 'true')
    const query = search.toString()
    return fetch(`${BASE}/layouts${query ? `?${query}` : ''}`).then((r) => _json<TesiraLayoutListResponse>(r))
  },

  getLayout: (layoutId: string, version?: string): Promise<TesiraLayoutArtifact> => {
    const query = version ? `?version=${encodeURIComponent(version)}` : ''
    return fetch(`${BASE}/layouts/${encodeURIComponent(layoutId)}${query}`)
      .then((r) => _json<TesiraLayoutArtifact>(r))
  },

  importLayout: (body: {
    layout_id: string
    version?: string
    name: string
    device_family: string
    channel_profile?: string | null
    required_firmware?: string | null
    checksum: string
    artifact_uri?: string | null
    instance_tag_map?: Record<string, unknown>
    feature_flags?: string[]
    notes?: string | null
    is_active?: boolean
  }): Promise<{ status: string; layout: TesiraLayoutArtifact }> =>
    fetch(`${BASE}/layouts/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => _json<{ status: string; layout: TesiraLayoutArtifact }>(r)),

  getSageVueStatus: (): Promise<TesiraSageVueStatus> =>
    fetch(`${BASE}/sagevue/status`).then((r) => _json<TesiraSageVueStatus>(r)),

  getLayoutManualPackageDownloadUrl: (layoutId: string, version?: string, deviceId?: string): string => {
    const query = new URLSearchParams()
    if (version) query.set('version', version)
    if (deviceId) query.set('device_id', deviceId)
    const suffix = query.toString()
    return `${BASE}/layouts/${encodeURIComponent(layoutId)}/manual-package${suffix ? `?${suffix}` : ''}`
  },

  startDeployment: (deviceId: string, body: {
    layout_id: string
    layout_version?: string
    dry_run?: boolean
    requested_by?: string | null
    rollback_layout_id?: string | null
    rollback_layout_version?: string | null
  }): Promise<TesiraDeploymentJob> =>
    fetch(`${BASE}/devices/${encodeURIComponent(deviceId)}/deploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => _json<TesiraDeploymentJob>(r)),

  getDeployment: (jobId: string): Promise<TesiraDeploymentJob> =>
    fetch(`${BASE}/deployments/${encodeURIComponent(jobId)}`)
      .then((r) => _json<TesiraDeploymentJob>(r)),

  rollbackDeployment: (jobId: string, body?: {
    requested_by?: string | null
    layout_id?: string | null
    layout_version?: string | null
  }): Promise<TesiraDeploymentJob> =>
    fetch(`${BASE}/deployments/${encodeURIComponent(jobId)}/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    }).then((r) => _json<TesiraDeploymentJob>(r)),

  getFleetHealth: (): Promise<TesiraFleetHealth> =>
    fetch(`${BASE}/fleet/health`).then((r) => _json<TesiraFleetHealth>(r)),

  getPtpTopology: (): Promise<TesiraPtpTopologyResponse> =>
    fetch(`${BASE}/fleet/ptp-topology`).then((r) => _json<TesiraPtpTopologyResponse>(r)),

  getDevice: (deviceId: string): Promise<TesiraDeviceDetail> =>
    fetch(`${BASE}/devices/${deviceId}`).then((r) => _json<TesiraDeviceDetail>(r)),

  getCapabilities: (deviceId: string): Promise<TesiraCapabilityEnvelope> =>
    fetch(`${BASE}/devices/${deviceId}/capabilities`).then((r) => _json<TesiraCapabilityEnvelope>(r)),

  connectDevice: (deviceId: string): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/connect`, { method: 'POST' }).then((r) => _json<TesiraMutationResponse>(r)),

  disconnectDevice: (deviceId: string): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/disconnect`, { method: 'POST' }).then((r) => _json<TesiraMutationResponse>(r)),

  sendCommand: (deviceId: string, command: string): Promise<TesiraRawCommandResponse> =>
    fetch(`${BASE}/devices/${deviceId}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    }).then((r) => _json<TesiraRawCommandResponse>(r)),

  getFaults: (deviceId: string): Promise<{ device_id: string; faults: string[] }> =>
    fetch(`${BASE}/devices/${deviceId}/faults`).then((r) => _json<{ device_id: string; faults: string[] }>(r)),

  // Level / mute
  getLevel: (deviceId: string, tag: string, channel: number): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/level/${tag}/${channel}`).then((r) => _json<TesiraMutationResponse>(r)),

  setLevel: (deviceId: string, tag: string, channel: number, levelDb: number): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/level/${tag}/${channel}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level_db: levelDb }),
    }).then((r) => _json<TesiraMutationResponse>(r)),

  getMute: (deviceId: string, tag: string, channel: number): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/mute/${tag}/${channel}`).then((r) => _json<TesiraMutationResponse>(r)),

  setMute: (deviceId: string, tag: string, channel: number, muted: boolean): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/mute/${tag}/${channel}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ muted }),
    }).then((r) => _json<TesiraMutationResponse>(r)),

  // Crosspoint
  setCrosspoint: (deviceId: string, tag: string, row: number, col: number, gainDb: number): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/crosspoint/${tag}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ row, col, gain_db: gainDb }),
    }).then((r) => _json<TesiraMutationResponse>(r)),

  getCrosspointMatrix: (deviceId: string, tag: string, rows: number, cols: number): Promise<TesiraCrosspointMatrix> =>
    fetch(`${BASE}/devices/${deviceId}/crosspoint/${tag}?rows=${rows}&cols=${cols}`)
      .then((r) => _json<TesiraCrosspointMatrix>(r)),

  setCrosspointMute: (deviceId: string, tag: string, row: number, col: number, muted: boolean): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/crosspoint/${tag}/mute`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ row, col, muted }),
    }).then((r) => _json<TesiraMutationResponse>(r)),

  // DSP model
  probeDspBlocks: (deviceId: string, maxInstances: number = 32): Promise<TesiraDspProbeResult> =>
    fetch(`${BASE}/devices/${deviceId}/dsp/probe?max_instances=${maxInstances}`, { method: 'POST' })
      .then((r) => _json<TesiraDspProbeResult>(r)),

  listDspBlocks: (deviceId: string): Promise<TesiraDspBlockListResponse> =>
    fetch(`${BASE}/devices/${deviceId}/dsp/blocks`).then((r) => _json<TesiraDspBlockListResponse>(r)),

  getDspBlock: (deviceId: string, instanceTag: string): Promise<{ device_id: string } & TesiraDspBlock> =>
    fetch(`${BASE}/devices/${deviceId}/dsp/blocks/${encodeURIComponent(instanceTag)}`)
      .then((r) => _json<{ device_id: string } & TesiraDspBlock>(r)),

  getDspParams: (deviceId: string, instanceTag: string): Promise<TesiraDspParamsResponse> =>
    fetch(`${BASE}/devices/${deviceId}/dsp/${encodeURIComponent(instanceTag)}/params`)
      .then((r) => _json<TesiraDspParamsResponse>(r)),

  setDspParam: (
    deviceId: string,
    instanceTag: string,
    attribute: string,
    value: unknown,
    args: unknown[] = [],
  ): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/dsp/${encodeURIComponent(instanceTag)}/params`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attribute, value, args }),
    }).then((r) => _json<TesiraMutationResponse>(r)),

  dspBulkGet: (deviceId: string, operations: TesiraDspBulkOperation[]): Promise<{ device_id: string; count: number; results: TesiraDspBulkResult[] }> =>
    fetch(`${BASE}/devices/${deviceId}/dsp/bulk-get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operations }),
    }).then((r) => _json<{ device_id: string; count: number; results: TesiraDspBulkResult[] }>(r)),

  dspBulkSet: (deviceId: string, operations: TesiraDspBulkOperation[]): Promise<{ device_id: string; count: number; results: TesiraDspBulkResult[] }> =>
    fetch(`${BASE}/devices/${deviceId}/dsp/bulk-set`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operations }),
    }).then((r) => _json<{ device_id: string; count: number; results: TesiraDspBulkResult[] }>(r)),

  // EQ
  setEQBandFreq: (deviceId: string, tag: string, band: number, freqHz: number): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/eq/${tag}/band/${band}/freq`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ freq_hz: freqHz }),
    }).then((r) => _json<TesiraMutationResponse>(r)),

  setEQBandGain: (deviceId: string, tag: string, band: number, gainDb: number): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/eq/${tag}/band/${band}/gain`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gain_db: gainDb }),
    }).then((r) => _json<TesiraMutationResponse>(r)),

  setEQBandQ: (deviceId: string, tag: string, band: number, q: number): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/eq/${tag}/band/${band}/q`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q }),
    }).then((r) => _json<TesiraMutationResponse>(r)),

  // Presets
  listPresets: (deviceId: string): Promise<TesiraPresetInfo[]> =>
    fetch(`${BASE}/devices/${deviceId}/presets`).then((r) => _json<TesiraPresetInfo[]>(r)),

  recallPreset: (deviceId: string, presetIndex: number): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/presets/${presetIndex}/recall`, { method: 'POST' })
      .then((r) => _json<TesiraMutationResponse>(r)),

  // AVB
  getAvbStreams: (deviceId: string): Promise<TesiraStreamInfo[]> =>
    fetch(`${BASE}/devices/${deviceId}/avb/streams`).then((r) => _json<TesiraStreamInfo[]>(r)),

  getPtp: (deviceId: string): Promise<TesiraPTPStatus> =>
    fetch(`${BASE}/devices/${deviceId}/avb/ptp`).then((r) => _json<TesiraPTPStatus>(r)),

  // Metering
  getMeters: (deviceId: string, tag: string): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/meters/${tag}`).then((r) => _json<TesiraMutationResponse>(r)),

  getMeterHistory: (deviceId: string, tag: string, limit: number = 300): Promise<TesiraMeterHistoryResponse> =>
    fetch(`${BASE}/devices/${deviceId}/meters/${encodeURIComponent(tag)}/history?limit=${limit}`)
      .then((r) => _json<TesiraMeterHistoryResponse>(r)),

  getMeterPeak: (deviceId: string, tag: string): Promise<TesiraMeterPeakResponse> =>
    fetch(`${BASE}/devices/${deviceId}/meters/${encodeURIComponent(tag)}/peak`)
      .then((r) => _json<TesiraMeterPeakResponse>(r)),

  startMetering: (deviceId: string, tag: string): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/meters/${tag}/start`, { method: 'POST' }).then((r) => _json<TesiraMutationResponse>(r)),

  stopMetering: (deviceId: string, tag: string): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/meters/${tag}/stop`, { method: 'POST' }).then((r) => _json<TesiraMutationResponse>(r)),

  // GPIO
  listGpio: (deviceId: string): Promise<TesiraGpioListResponse> =>
    fetch(`${BASE}/devices/${deviceId}/gpio`).then((r) => _json<TesiraGpioListResponse>(r)),

  getGpioPin: (deviceId: string, pin: number): Promise<{ device_id: string; pin: number; state: boolean }> =>
    fetch(`${BASE}/devices/${deviceId}/gpio/${pin}`).then((r) => _json<{ device_id: string; pin: number; state: boolean }>(r)),

  setGpioPin: (deviceId: string, pin: number, state: boolean): Promise<{ ok: boolean; device_id: string; pin: number; state: boolean }> =>
    fetch(`${BASE}/devices/${deviceId}/gpio/${pin}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state }),
    }).then((r) => _json<{ ok: boolean; device_id: string; pin: number; state: boolean }>(r)),

  // Scene snapshots
  captureScene: (deviceId: string, name: string): Promise<{ ok: boolean; device_id: string; scene_id: string; name: string; block_count: number }> =>
    fetch(`${BASE}/devices/${deviceId}/scenes/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }).then((r) => _json<{ ok: boolean; device_id: string; scene_id: string; name: string; block_count: number }>(r)),

  listScenes: (deviceId: string): Promise<TesiraSceneListResponse> =>
    fetch(`${BASE}/devices/${deviceId}/scenes`).then((r) => _json<TesiraSceneListResponse>(r)),

  getScene: (deviceId: string, sceneId: string): Promise<TesiraSceneDetail> =>
    fetch(`${BASE}/devices/${deviceId}/scenes/${encodeURIComponent(sceneId)}`).then((r) => _json<TesiraSceneDetail>(r)),

  recallScene: (deviceId: string, sceneId: string): Promise<{ ok: boolean; device_id: string; scene_id: string; applied: number; failed: string[] }> =>
    fetch(`${BASE}/devices/${deviceId}/scenes/${encodeURIComponent(sceneId)}/recall`, { method: 'POST' })
      .then((r) => _json<{ ok: boolean; device_id: string; scene_id: string; applied: number; failed: string[] }>(r)),

  deleteScene: (deviceId: string, sceneId: string): Promise<{ ok: boolean; device_id: string; scene_id: string }> =>
    fetch(`${BASE}/devices/${deviceId}/scenes/${encodeURIComponent(sceneId)}`, { method: 'DELETE' })
      .then((r) => _json<{ ok: boolean; device_id: string; scene_id: string }>(r)),

  // Preset interlock
  listInterlockRules: (): Promise<PresetInterlockRule[]> =>
    fetch(`${BASE}/preset_interlock`).then((r) => _json<PresetInterlockRule[]>(r)),

  addInterlockRule: (body: { map2_preset_id: number; tesira_device_id: string; tesira_preset_index: number }): Promise<PresetInterlockRule> =>
    fetch(`${BASE}/preset_interlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => _json<PresetInterlockRule>(r)),

  deleteInterlockRule: (ruleId: number): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/preset_interlock/${ruleId}`, { method: 'DELETE' }).then((r) => _json<TesiraMutationResponse>(r)),

  // Auto-discovery
  startDiscovery: (timeoutS: number = 8): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/discovery/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeout_s: timeoutS }),
    }).then((r) => _json<TesiraMutationResponse>(r)),

  getDiscoveryStatus: (): Promise<DiscoveryScanStatus> =>
    fetch(`${BASE}/discovery/status`).then((r) => _json<DiscoveryScanStatus>(r)),

  adoptDevice: (host: string, name?: string): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/discovery/adopt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, name }),
    }).then((r) => _json<TesiraMutationResponse>(r)),

  /**
   * Manually add a device by IP — no TTP probe required.
   * Device appears Offline until TTP is enabled in Tesira Software.
   */
  addDevice: (host: string, port: number = 23, name?: string): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, port, name }),
    }).then((r) => _json<TesiraMutationResponse>(r)),

  // Firmware management
  getLatestFirmware: (): Promise<TesiraLatestFirmware> =>
    fetch(`${BASE}/firmware/latest`).then((r) => _json<TesiraLatestFirmware>(r)),

  getDeviceFirmware: (deviceId: string): Promise<TesiraFirmwareStatus> =>
    fetch(`${BASE}/devices/${deviceId}/firmware`).then((r) => _json<TesiraFirmwareStatus>(r)),

  rebootDevice: (deviceId: string): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/reboot`, { method: 'POST' })
      .then((r) => _json<TesiraMutationResponse>(r)),

  reconnectDevice: (deviceId: string): Promise<TesiraMutationResponse> =>
    fetch(`${BASE}/devices/${deviceId}/reconnect`, { method: 'POST' })
      .then((r) => _json<TesiraMutationResponse>(r)),
}
