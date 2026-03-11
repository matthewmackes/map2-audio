/**
 * Tesira Forte AVB — TypeScript type definitions.
 * Matches the Pydantic models in app/routes/tesira.py.
 */

export interface TesiraStreamInfo {
  stream_index: number;
  direction: 'talker' | 'listener';
  name: string;
  channels: number;
  entity_id: string;
}

export interface TesiraPresetInfo {
  index: number;
  name: string;
}

export interface TesiraPTPStatus {
  state: string;
  offset_ns: number | null;
  grandmaster_id: string | null;
}

export interface TesiraDeviceSummary {
  device_id: string;
  host: string;
  port: number;
  name: string;
  connected: boolean;
  transport?: string | null;
  transport_port?: number | null;
  serial_number: string | null;
  firmware_version: string | null;
  fault_count: number;
  avb_stream_count: number;
  ptp_state: string | null;
  source_node_id?: string | null;
  source_hostname?: string | null;
  discovered_by_node_ids?: string[];
  discovered_by_hosts?: string[];
}

export interface TesiraDeviceDetail extends TesiraDeviceSummary {
  hostname: string | null;
  avb_streams: TesiraStreamInfo[];
  ptp_status: TesiraPTPStatus;
  faults: string[];
  presets: TesiraPresetInfo[];
}

export interface TesiraFleetHealth {
  status: string;
  total_devices: number;
  connected_devices: number;
  offline_devices: number;
  connected_ratio: number;
}

export interface TesiraPtpTopologyNode {
  device_id: string;
  name: string;
  host: string;
  connected: boolean;
  ptp_state: string;
  offset_ns: number | null;
  grandmaster_id: string | null;
  source_node_id?: string | null;
}

export interface TesiraPtpTopologyResponse {
  nodes: TesiraPtpTopologyNode[];
  grandmaster_ids: string[];
  node_count: number;
}

export interface TesiraCapabilities {
  analog_inputs: number;
  analog_outputs: number;
  usb_channels: number;
  avb_max_channels: number;
  aec_channels: number;
  gpio_count: number;
  rs232: boolean;
  dsp_partitions: number;
}

export interface TesiraCapabilityEnvelope {
  device_id: string;
  model: string | null;
  capabilities: TesiraCapabilities;
}

export interface TesiraDspBlock {
  instance_tag: string;
  block_type: string;
  channel_count: number;
  parameter_map: Record<string, Record<string, unknown>>;
  title?: string;
  category?: string;
  editor?: Record<string, unknown>;
  is_probed: boolean;
  last_probed_at: string | null;
}

export interface TesiraDspProbeResult {
  device_id: string;
  discovered_count: number;
  blocks: TesiraDspBlock[];
  errors: string[];
  started_at: string;
  completed_at: string;
}

export interface TesiraDspBlockListResponse {
  device_id: string;
  count: number;
  blocks: TesiraDspBlock[];
}

export interface TesiraDspParamsResponse {
  device_id: string;
  instance_tag: string;
  values: Record<string, unknown>;
  errors: Record<string, string>;
}

export interface TesiraDspBulkOperation {
  id?: string;
  instance_tag: string;
  attribute: string;
  args?: unknown[];
  value?: unknown;
}

export interface TesiraDspBulkResult {
  id?: string;
  ok: boolean;
  instance_tag: string;
  attribute: string;
  value?: unknown;
  error?: string;
}

export interface TesiraCrosspointCell {
  row: number;
  col: number;
  gain_db: number | null;
  muted: boolean | null;
}

export interface TesiraCrosspointMatrix {
  device_id: string;
  instance_tag: string;
  rows: number;
  cols: number;
  matrix: TesiraCrosspointCell[][];
}

export interface TesiraGpioPinState {
  pin: number;
  ok: boolean;
  state: boolean | null;
}

export interface TesiraGpioListResponse {
  device_id: string;
  gpio_count: number;
  pins: TesiraGpioPinState[];
}

export interface TesiraSceneSummary {
  scene_id: string;
  name: string;
  created_at: string | null;
}

export interface TesiraSceneListResponse {
  device_id: string;
  count: number;
  scenes: TesiraSceneSummary[];
}

export interface TesiraSceneDetail {
  device_id: string;
  scene_id: string;
  name: string;
  block_states: Record<string, Record<string, unknown>>;
  created_at: string | null;
}

export interface TesiraLayoutArtifact {
  layout_id: string;
  version: string;
  name: string;
  device_family: string;
  channel_profile: string | null;
  required_firmware: string | null;
  checksum: string;
  artifact_uri: string | null;
  instance_tag_map: Record<string, unknown>;
  feature_flags: string[];
  notes: string | null;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface TesiraLayoutListResponse {
  count: number;
  layouts: TesiraLayoutArtifact[];
}

export interface TesiraSageVueStatus {
  enabled: boolean;
  configured: boolean;
  base_url: string;
  healthy: boolean;
  has_token?: boolean;
  detail?: string;
  health?: Record<string, unknown>;
  manual_upload_required?: boolean;
}

export interface TesiraDeploymentJobEvent {
  sequence: number;
  stage: string;
  status: string;
  message: string;
  payload: Record<string, unknown>;
  created_at: string | null;
}

export interface TesiraDeploymentJob {
  job_id: string;
  device_id: string;
  layout_id: string;
  layout_version: string;
  rollback_layout_id: string | null;
  rollback_layout_version: string | null;
  requested_by: string | null;
  dry_run: boolean;
  status: string;
  stage: string;
  sagevue_job_id: string | null;
  error_detail: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  events: TesiraDeploymentJobEvent[];
}

export interface TesiraDesignPort {
  name: string;
  domain: string;
  channels: number;
}

export interface TesiraDesignIo {
  inputs: TesiraDesignPort[];
  outputs: TesiraDesignPort[];
}

export interface TesiraDesignNode {
  id: string;
  block_type: string;
  instance_tag?: string;
  label?: string;
  position?: { x: number; y: number };
  io?: TesiraDesignIo;
  config?: Record<string, unknown>;
}

export interface TesiraDesignEdge {
  id: string;
  source: string;
  target: string;
  source_port?: string;
  target_port?: string;
}

export interface TesiraDesignGroup {
  id: string;
  name: string;
  node_ids: string[];
}

export interface TesiraDesignGraph {
  nodes: TesiraDesignNode[];
  edges: TesiraDesignEdge[];
  groups: TesiraDesignGroup[];
}

export interface TesiraDesignWorkspace {
  design_id: string;
  device_id: string;
  name: string;
  description: string | null;
  graph: TesiraDesignGraph;
  is_template?: boolean;
  is_active?: boolean;
  compile_status?: string;
  compile_revision?: number;
  compiled_graph_hash?: string | null;
  compile_diagnostics?: Record<string, unknown>;
  last_compiled_at?: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface TesiraDesignWorkspaceListResponse {
  device_id: string;
  count: number;
  designs: TesiraDesignWorkspace[];
}

export interface TesiraDesignWorkspaceDetailResponse {
  device_id: string;
  design: TesiraDesignWorkspace;
}

export interface TesiraDesignValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  counts: {
    nodes: number;
    edges: number;
    groups: number;
  };
}

export interface TesiraDesignMutationResponse {
  device_id: string;
  design: TesiraDesignWorkspace;
  validation: TesiraDesignValidationResult;
}

export interface TesiraDesignValidateResponse {
  device_id: string;
  design_id: string;
  validation: TesiraDesignValidationResult;
}

export interface TesiraDesignCompileArtifact {
  artifact_id: string;
  partition_count: number;
  node_count: number;
  edge_count: number;
  estimated_dsp_load: number;
  estimated_latency_ms: number;
  optimized: boolean;
}

export interface TesiraDesignCompileResponse {
  device_id: string;
  design_id: string;
  status: string;
  compile_status: string;
  compile_revision: number;
  graph_hash: string | null;
  compiled_at: string | null;
  diagnostics: Record<string, unknown>;
  artifact: TesiraDesignCompileArtifact | null;
}

export interface TesiraDesignCompileBatchResponse {
  device_id: string;
  count: number;
  results: TesiraDesignCompileResponse[];
}

export interface TesiraDesignDiagnosticsResponse {
  device_id: string;
  design_id: string;
  compile_status: string;
  compile_revision: number;
  compiled_at: string | null;
  graph_hash: string | null;
  diagnostics: Record<string, unknown>;
}

export interface TesiraDesignLibraryBlock {
  block_type: string;
  title: string;
  category?: string;
  io?: TesiraDesignIo;
  parameter_map?: Record<string, unknown>;
  editor?: Record<string, unknown>;
}

export interface TesiraDesignLibraryResponse {
  device_id: string;
  profile?: string;
  available_profiles?: string[];
  count: number;
  blocks: TesiraDesignLibraryBlock[];
}

export interface TesiraMeterHistorySample {
  levels_dbu: number[];
  timestamp: string;
}

export interface TesiraMeterHistoryResponse {
  device_id: string;
  instance_tag: string;
  count: number;
  history: TesiraMeterHistorySample[];
}

export interface TesiraMeterPeakResponse {
  device_id: string;
  instance_tag: string;
  peak_dbu: number | null;
}

export interface PresetInterlockRule {
  id: number;
  map2_preset_id: number;
  tesira_device_id: string;
  tesira_preset_index: number;
  created_at: string;
}

/** WebSocket push payloads */
export interface TesiraMeterPush {
  device_id: string;
  instance_tag: string;
  levels_dbu: number[];
  timestamp: string;
}

export interface TesiraDeviceStateEvent {
  device_id: string;
  event: 'connected' | 'disconnected' | 'fault' | 'preset_changed' | 'adopted' | 'reconnecting';
  detail?: string;
  /** Only present on 'reconnecting' events */
  next_retry_s?: number;
}

export interface TesiraFirmwareStatus {
  device_id: string;
  host: string;
  name: string;
  connected: boolean;
  current_version: string | null;
  latest_version: string | null;
  update_available: boolean;
  update_path_url: string;
  download_url: string;
  release_notes_url: string;
}

export interface TesiraLatestFirmware {
  version: string | null;
  fetched_at: string | null;
  download_url: string;
  release_notes_url: string;
  update_path_url: string;
}

export interface TesiraMutationResponse {
  ok: boolean;
  message: string;
}

export interface TesiraPTPEvent {
  device_id: string;
  state: string;
  offset_ns: number | null;
  grandmaster_id: string | null;
  timestamp: string;
}

export interface TesiraPresetChangeEvent {
  device_id: string;
  preset_index: number;
  map2_preset_id: number;
  timestamp: string;
}

export interface TesiraReversePresetSyncEvent {
  device_id: string;
  preset_index: number;
  matched: boolean;
  map2_preset_ids: number[];
  rule_ids: number[];
  timestamp: string;
}

/** Auto-discovery types */
export interface DiscoveredTesiraDevice {
  host: string;
  port: number;
  mdns_name: string;
  hostname: string | null;
  serial_number: string | null;
  firmware_version: string | null;
  /** "TesiraFORTE CI" | "TesiraFORTE VI" | ... */
  model: string | null;
  part_number: string | null;
  mac_address: string | null;
  already_configured: boolean;
  /**
   * true  → TTP port 23 is open (factory-reset, or TTP explicitly enabled)
   * false → found via port 61451 (configured unit; TTP/SSH currently disabled)
   */
  ttp_enabled: boolean;
}

export interface TesiraDiscoveryEvent {
  event: 'device_found' | 'scan_complete' | 'scan_error';
  device?: DiscoveredTesiraDevice;
  total_found?: number;
  error?: string;
}

export interface DiscoveryScanStatus {
  is_scanning: boolean;
  devices: DiscoveredTesiraDevice[];
  error: string | null;
}
