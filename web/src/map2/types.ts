// ============================================================================
// MAP2 Audio Platform - TypeScript Type Definitions
// Extended types for MAP2-specific features beyond PiPedal compatibility
// ============================================================================

// ==================== Audio Types ====================

export interface AudioStatus {
  running: boolean;
  sample_rate: number;
  buffer_size: number;
  cpu_load: number;
  engine: string;
  version?: string;
  plugin_count?: number;
  active_pedalboard?: string;
  available: boolean;
  error?: string;
}

export interface AudioLevels {
  input_left: number;
  input_right: number;
  output_left: number;
  output_right: number;
}

export interface PluginLevels {
  uri: string;
  name: string;
  input: number;
  output: number;
}

// ==================== Chain Types ====================

export interface Chain {
  id: number;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  plugins: ChainPlugin[];
}

export interface ChainPlugin {
  uri: string;
  name: string;
  plugin_display_type?: string;
  position: number;
  bypassed: boolean;
  parameters: Record<string, number>;
  in_ports?: number;
  out_ports?: number;
  // Multi-format plugin support (JUCE)
  format?: PluginFormat;
  instance_id?: number;
  latency_samples?: number;
  latency_compensated?: boolean;
  sidechain_source?: string;
  sidechain_bus?: number;
  cpu_percent?: number;
}

export interface ChainTemplate {
  name: string;
  description: string;
  plugin_count: number;
  category?: string;
}

// ==================== Plugin Types ====================

/** Supported plugin formats (JUCE multi-format support) */
export type PluginFormat = 'VST3' | 'AudioUnit' | 'LV2' | 'LADSPA' | 'Unknown';

export interface PluginParameter {
  index: number;
  name: string;
  symbol: string;
  min: number;
  max: number;
  default: number;
  value?: number;
  is_toggled: boolean;
  is_log: boolean;
}

export interface Plugin {
  uri: string;
  name: string;
  author: string;
  category: string;
  class_label: string;
  version: string;
  license: string;
  has_ui: boolean;
  in_ports: number;
  out_ports: number;
  parameters: PluginParameter[];
  bypassed?: boolean;
  ui_info?: PluginUIInfo;
  // Multi-format plugin support (JUCE)
  format?: PluginFormat;
  format_name?: string;
  file_path?: string;
  brand?: string;
  latency_samples?: number;
  has_midi_input?: boolean;
  has_midi_output?: boolean;
  supports_double_precision?: boolean;
  sidechain_buses?: number;
  sidechain_bus_names?: string[];
}

// ==================== Preset Types ====================

export interface Preset {
  id: number;
  name: string;
  chain_id: number;
  tags: string[];
  category: string;
  description: string;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
}

export interface PresetCategory {
  name: string;
  count: number;
}

export interface CreatePresetRequest {
  name: string;
  chain_id: number;
  plugin_states: Record<string, unknown>;
  tags?: string[];
  category?: string;
  description?: string;
  is_favorite?: boolean;
}

// ==================== MIDI Types ====================

export interface MIDIDevice {
  id: string;
  name: string;
  type: 'input' | 'output';
  connected: boolean;
}

export interface MIDIMapping {
  id: number;
  channel: number;
  cc: number;
  target_uri: string;
  param_index: number;
  param_name?: string;
}

// Enhanced MIDI types for v2 API
export type MIDICurveType = 'linear' | 'logarithmic' | 'exponential' | 's_curve';

export type MIDIActionType =
  | 'activate_chain'
  | 'toggle_chain'
  | 'toggle_plugin'
  | 'set_routing'
  | 'next_preset'
  | 'previous_preset';

export type MIDITriggerType =
  | 'program_change'
  | 'note_on'
  | 'note_off'
  | 'control_change';

export interface MIDIMappingV2 {
  id: number;
  channel: number;  // 0 = omni, 1-16 = specific
  cc: number;
  chain_id: number | null;
  target_plugin_uri: string | null;
  target_param_index: number | null;
  target_param_symbol: string | null;
  min_val: number;
  max_val: number;
  curve_type: MIDICurveType;
  invert: boolean;
  feedback_enabled: boolean;
  feedback_cc: number | null;
  name: string | null;
  group_id: number | null;
  is_learned: boolean;
  is_enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface MIDIMappingGroup {
  id: number;
  name: string;
  color: string | null;
  sort_order: number;
  mappings?: MIDIMappingV2[];
}

export interface MIDICommand {
  id: number;
  name: string | null;
  trigger_type: MIDITriggerType;
  channel: number;
  data1: number;  // PC number, Note, or CC
  data2_threshold: number | null;  // For velocity/value gates
  action: MIDIActionType;
  target_chain_id: number | null;
  target_plugin_uri: string | null;
  action_params: Record<string, unknown> | null;
  is_enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface MIDIRoutingRule {
  id: number;
  chain_id: number;
  name: string | null;
  trigger_type: MIDITriggerType;
  channel: number;
  data1: number;
  from_flow_index: number;
  to_flow_index: number;
  is_enabled: boolean;
}

export interface MIDIDeviceConfig {
  id: number;
  device_name: string;
  device_type: 'input' | 'output';
  is_enabled: boolean;
  auto_connect: boolean;
  channel_filter: number | null;  // null = all channels
  last_seen?: string;
}

export interface MIDIPreset {
  id: number;
  name: string;
  description: string | null;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ChainMIDIConfig {
  id: number;
  chain_id: number;
  program_number: number;
  bank_msb: number;
  bank_lsb: number;
  send_pc_on_activate: boolean;
}

export interface MIDIStatus {
  enabled: boolean;
  input_open: boolean;
  output_open: boolean;
  input_device: string | null;
  output_device: string | null;
  mappings_count: number;
  commands_count: number;
  learning: boolean;
  last_channel: number;
  last_cc: number;
  last_value: number;
}

export interface MIDILearnTarget {
  chain_id: number;
  plugin_id: number;
  parameter_symbol: string;
  parameter_index: number;
  min_value: number;
  max_value: number;
  curve: MIDICurveType;
  is_active: boolean;
}

// WebSocket event types for MIDI
export interface MIDIActivityEvent {
  type: 'midi_message' | 'midi_cc' | 'midi_note' | 'midi_program_change';
  data: {
    type: string;
    channel: number;
    data1: number;
    data2: number;
    timestamp: string;
  };
}

export interface MIDIMappingTriggeredEvent {
  type: 'midi_mapping_triggered';
  data: {
    plugin_id: number;
    parameter_symbol: string;
    parameter_index: number;
    value: number;
  };
}

export interface MIDICommandTriggeredEvent {
  type: 'midi_command_triggered';
  data: MIDICommand;
}

export interface MIDILearnEvent {
  type: 'midi_learn_started' | 'midi_learn_completed' | 'midi_learn_stopped';
  data: {
    channel?: number;
    cc?: number;
  } | MIDILearnTarget;
}

// ==================== MIDI Device Profile Types ====================

export type MIDISwitchMode = 'momentary' | 'toggle' | 'timed';
export type MIDIMessageType = 'pc' | 'cc' | 'note';
export type MIDIExpressionCurve = 'linear' | 'logarithmic' | 'exponential' | 's_curve';

export interface FootswitchConfig {
  switch_id: string;
  label: string;
  midi_type: MIDIMessageType;
  channel: number;
  number: number;
  mode: MIDISwitchMode;
  default_action: string | null;
}

export interface ExpressionPedalConfig {
  pedal_id: string;
  label: string;
  cc_number: number;
  channel: number;
  curve: MIDIExpressionCurve;
  invert: boolean;
  default_target: string | null;
  deadzone_low: number;
  deadzone_high: number;
}

export interface BankConfig {
  enabled: boolean;
  items_per_bank: number;
  max_banks: number;
  current_bank: number;
}

export interface MIDIDeviceProfile {
  profile_id: string;
  name: string;
  manufacturer: string;
  description: string;
  icon: string;
  is_recommended: boolean;
  name_patterns: string[];
  footswitches: FootswitchConfig[];
  expression_pedals: ExpressionPedalConfig[];
  bank_config: BankConfig | null;
  supports_firmware_update: boolean;
  current_firmware_version: string | null;
}

export interface ExpressionCalibration {
  cc_number?: number;
  channel?: number;
  min_raw: number;
  max_raw: number;
  deadzone_low: number;
  deadzone_high: number;
  curve: MIDIExpressionCurve;
  invert: boolean;
  target?: string;
}

export interface DFUStatus {
  dfu_available: boolean;
  devices_in_dfu_mode: Array<{ raw: string; in_dfu_mode: boolean }>;
  install_hint: string | null;
}

export interface DFUInstructions {
  device: string;
  steps: string[];
  exit_dfu: string;
  notes: string[];
}

export interface ProfileApplyResult {
  profile_id: string;
  profile_name: string;
  commands_created: number;
  mappings_created: number;
  expression_configs: number;
}

// ==================== IR Types ====================

export interface IRFile {
  name: string;
  path: string;
  type: 'cabinet' | 'reverb';
  size?: number;
  sample_rate?: number;
  duration?: number;
}

export interface IRStatus {
  available: boolean;
  loaded_cabinet?: string;
  loaded_reverb?: string;
  error?: string;
}

// ==================== NAM Types ====================

export interface NAMModel {
  name: string;
  type: string;
  path?: string;
  size?: number;      // Size in bytes (from some endpoints)
  size_mb?: number;   // Size in MB (from list/scan endpoints)
}

export interface NAMStatus {
  available: boolean;
  activeModel: string | null;
  mix: number;
  bypass: boolean;
  inputLevel: number;
  outputLevel: number;
  peakInput: number;
  peakOutput: number;
  latency: number;
  availableModels: string[];
}

// ==================== Automation Types ====================

export type CurveType = 'linear' | 'exponential' | 'logarithmic' | 's_curve' | 'step';
export type ModulationSource = 'timeline' | 'lfo' | 'envelope' | 'midi' | 'audio_follower';
export type LFOWaveform = 'sine' | 'triangle' | 'square' | 'saw';

export interface AutomationPoint {
  time: number;
  value: number;
  curve: CurveType;
}

export interface AutomationLane {
  parameter_id: string;
  points: AutomationPoint[];
  enabled: boolean;
  modulation_source: ModulationSource;
  loop_start?: number;
  loop_end?: number;
}

export interface LFOConfig {
  parameter_id: string;
  rate_hz: number;
  depth: number;
  waveform: LFOWaveform;
}

export interface AutomationStatus {
  is_playing: boolean;
  current_time: number;
  loop_enabled: boolean;
  loop_start: number;
  loop_end: number;
  automated_parameters: number;
  sample_rate: number;
}

// ==================== History Types ====================

export interface HistoryEntry {
  id: string;
  description: string;
  timestamp: string;
  type: string;
}

export interface HistoryStatus {
  can_undo: boolean;
  can_redo: boolean;
  next_undo?: string;
  next_redo?: string;
  undo_stack_size: number;
  redo_stack_size: number;
}

// ==================== Session Types ====================

export interface SessionMetadata {
  name: string;
  description: string;
  author: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface Session {
  metadata: SessionMetadata;
  chains: Chain[];
  presets: Preset[];
  midi_mappings: MIDIMapping[];
  automation: AutomationLane[];
}

export interface SessionListItem {
  path: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

// ==================== Metrics Types ====================

export interface SystemMetrics {
  cpu_percent: number;
  memory_percent: number;
  memory_used_mb: number;
  memory_total_mb: number;
  disk_percent: number;
  uptime_seconds: number;
  audio_xruns: number;
  audio_latency_ms: number;
}

export interface MetricsSummary {
  uptime_seconds: number;
  cpu: {
    avg: number;
    min: number;
    max: number;
    latest: number;
  };
  memory: {
    avg: number;
    min: number;
    max: number;
    latest: number;
  };
  latency: {
    avg: number;
    min: number;
    max: number;
    latest: number;
  };
  audio_samples: number;
}

export interface MetricsHistory {
  timestamp: string;
  value: number;
}

export interface JackMetrics {
  connected: boolean;
  sample_rate: number;
  buffer_size: number;
  latency_frames: number;
  latency_ms: number;
}

// ==================== System Types ====================

export interface RealtimeCheck {
  name: string;
  ok: boolean;
  message: string;
  fix: string;
}

export interface RealtimeStatus {
  checks: RealtimeCheck[];
  summary: {
    passed: number;
    warnings: number;
    failed: number;
    total: number;
    grade: string;
  };
  recommendations: string[];
}

export interface BrandingStatus {
  installed: boolean;
  checks: Array<{
    name: string;
    installed: boolean;
    path?: string;
    current?: string;
  }>;
  source_available: boolean;
  branding_dir: string;
}

// ==================== API Response Types ====================

export interface ApiResponse<T = unknown> {
  status?: string;
  message?: string;
  error?: string;
  data?: T;
}

export interface ListResponse<T> {
  items?: T[];
  count: number;
}

export interface ChainsResponse {
  chains: Chain[];
  count: number;
}

export interface PluginsResponse {
  plugins: Plugin[];
  count: number;
  error?: string;
}

export interface PresetsResponse {
  presets: Preset[];
  count: number;
}

export interface IRsResponse {
  irs: IRFile[];
  count: number;
}

export interface NAMModelsResponse {
  models: NAMModel[];
  total: number;
  limit: number;
  offset: number;
}

export interface SessionsResponse {
  sessions: SessionListItem[];
  count: number;
}

// ==================== WebSocket Types ====================

export interface WSMessage {
  type: string;
  data: unknown;
  timestamp?: number;
}

export interface WSMeterData {
  input_left: number;
  input_right: number;
  output_left: number;
  output_right: number;
  plugins?: PluginLevels[];
}

export interface WSStateUpdate {
  type: 'chain_update' | 'preset_loaded' | 'parameter_change' | 'bypass_toggle';
  chain_id?: number;
  plugin_uri?: string;
  param_index?: number;
  value?: number;
}

// ==================== Network Types ====================

export interface EthernetInterface {
  name: string;
  enabled: boolean;
  connected: boolean;
  ip_address: string | null;
  netmask: string | null;
  gateway: string | null;
  mac_address: string | null;
  speed: string | null;
  dhcp: boolean;
}

export interface WiFiInterface {
  name: string;
  enabled: boolean;
  connected: boolean;
  ssid: string | null;
  ip_address: string | null;
  signal_strength: number;
  security: string | null;
}

export interface WiFiNetwork {
  ssid: string;
  signal_strength: number;
  security: string;
  bssid: string;
  channel: number;
}

export interface IPConfiguration {
  ip_address: string;
  netmask: string;
  gateway: string;
  dhcp: boolean;
}

export interface DNSConfiguration {
  servers: string[];
}

export interface NetworkRoute {
  destination: string;
  gateway: string;
  interface: string;
  metric: number;
}

export interface NetworkService {
  name: string;
  display_name: string;
  running: boolean;
  enabled: boolean;
  description: string;
}

export interface FirewallZone {
  name: string;
  default: boolean;
  description: string;
  services: string[];
}

export interface NetworkStatus {
  ethernet: EthernetInterface[];
  wifi: WiFiInterface[];
  dns_servers: string[];
  hostname: string | null;
  domain: string | null;
  internet_connected: boolean;
  routes: NetworkRoute[];
  services: NetworkService[];
  firewall_zones: FirewallZone[];
}

// ==================== WWW Types ====================

export interface WebServerConfig {
  host: string;
  port: number;
  workers: number;
  debug: boolean;
}

export interface APIConfig {
  host: string;
  port: number;
  workers: number;
  debug: boolean;
}

export interface SSLConfig {
  enabled: boolean;
  cert_path: string | null;
  key_path: string | null;
  expires: string | null;
}

export interface CORSConfig {
  enabled: boolean;
  origins: string[];
  credentials: boolean;
}

export interface AccessLog {
  timestamp: string;
  method: string;
  path: string;
  status_code: number;
  response_time: number;
  client_ip: string;
}

export interface APIEndpoint {
  method: string;
  path: string;
  description: string;
  request_count: number;
  avg_response_time: number | null;
}

export interface WebSocketSubscription {
  topic: string;
  count: number;
}

export interface WebSocketStats {
  active_connections: number;
  total_messages: number;
  messages_per_second: number;
  subscriptions: WebSocketSubscription[];
}

export interface WWWStatus {
  backend_running: boolean;
  backend_host: string;
  backend_port: number;
  workers: number;
  debug: boolean;
  uptime: string | null;
  frontend_running: boolean;
  frontend_port: number;
  frontend_mode: string;
  cpu_percent: number;
  memory_percent: number;
  memory_mb: number;
  total_requests: number;
  requests_per_minute: number;
  cors_enabled: boolean;
  cors_origins: string[];
  cors_credentials: boolean;
  ssl_enabled: boolean;
  ssl_cert: string | null;
  ssl_expires: string | null;
  api_key: string | null;
  api_key_required: boolean;
  rate_limit_enabled: boolean;
  rate_limit_rpm: number | null;
  rate_limit_burst: number | null;
  web_root: string;
  upload_dir: string;
  max_upload_size: number;
}

// ==================== Plugin UI & Output Types ====================

/** LV2 Native UI Types supported by the specification */
export type LV2UIType = 'X11UI' | 'Gtk3UI' | 'GtkUI' | 'Qt4UI' | 'Qt5UI' | 'CocoaUI' | 'WindowsUI' | 'ModGUI';

/** VST3/AU/JUCE UI Types */
export type JuceUIType = 'VST3Editor' | 'AUView' | 'GenericEditor' | 'NoEditor';

/** Combined Plugin UI Type for all formats */
export type PluginUIType = LV2UIType | JuceUIType;

/** Port notification protocols for UI communication */
export type PortProtocol = 'floatProtocol' | 'peakProtocol' | 'atomTransfer' | 'eventTransfer';

/** Output port designation types */
export type OutputDesignation = 
  | 'meter' 
  | 'gain_reduction' 
  | 'latency' 
  | 'tuner_frequency' 
  | 'tuner_note' 
  | 'spectrum' 
  | 'envelope'
  | 'generic';

/** Output port metadata for visualization */
export interface OutputPort {
  index: number;
  symbol: string;
  name: string;
  min_value: number;
  max_value: number;
  designation: OutputDesignation;
  unit?: string;
  is_logarithmic?: boolean;
}

/** Plugin UI capabilities and metadata */
export interface PluginUIInfo {
  has_native_ui: boolean;
  ui_types: LV2UIType[];
  has_mod_gui: boolean;
  mod_gui_url?: string;
  output_ports: OutputPort[];
  has_tuner: boolean;
  has_spectrum: boolean;
  has_meters: boolean;
  port_notifications: PortNotification[];
}

/** Port notification subscription */
export interface PortNotification {
  port_index: number;
  symbol: string;
  protocol: PortProtocol;
}

/** Real-time peak meter data */
export interface PeakData {
  uri: string;
  port_symbol: string;
  peak: number;
  rms: number;
  hold_peak: number;
  is_clipping: boolean;
  timestamp: number;
}

/** Real-time output port values */
export interface OutputPortValue {
  uri: string;
  port_index: number;
  symbol: string;
  value: number;
  timestamp: number;
}

/** Tuner data from analyser plugins */
export interface TunerData {
  uri: string;
  frequency_hz: number;
  note_name: string;
  octave: number;
  cents_deviation: number;
  confidence: number;
  timestamp: number;
}

/** Spectrum analyzer data */
export interface SpectrumData {
  uri: string;
  frequencies: number[];
  magnitudes: number[];
  bin_count: number;
  sample_rate: number;
  timestamp: number;
}

/** Extended plugin metadata with UI info */
export interface PluginExtended extends Plugin {
  ui_info: PluginUIInfo;
  description?: string;
  homepage?: string;
  project?: string;
}

/** WebSocket message types for real-time updates */
export type PluginDataMessageType = 
  | 'peak_update' 
  | 'output_port_update' 
  | 'tuner_update' 
  | 'spectrum_update';

export interface PluginDataMessage {
  type: PluginDataMessageType;
  data: PeakData | OutputPortValue | TunerData | SpectrumData;
}

// ==================== Flow Snapshot Types ====================

/** Flow slot state snapshot */
export interface FlowSlotSnapshot {
  id: string;
  chainId: number | null;
  label: string;
  color: string;
  muted: boolean;
  solo: boolean;
  dryWetMix: number;
}

/** Routing configuration snapshot */
export interface RoutingConfigSnapshot {
  mode: 'parallel_blend' | 'ab_switch' | 'series' | 'parameter_morph' | 'sidechain';
  activeSlotId: string | null;
  blendPositions: Record<string, number>;
  morphProgress: number;
  morphSourceSlotId: string | null;
  morphTargetSlotId: string | null;
  seriesOrder: string[];
}

/** Plugin state within a chain snapshot */
export interface PluginSnapshot {
  uri: string;
  position: number;
  bypass: boolean;
  parameters: Record<string, number>;
}

/** Chain state snapshot */
export interface ChainSnapshot {
  name: string;
  plugins: PluginSnapshot[];
}

/** Complete flow snapshot data payload */
export interface FlowSnapshotData {
  flowSlots: FlowSlotSnapshot[];
  routing: RoutingConfigSnapshot;
  activeFlowIndex: number;
  chains: Record<string, ChainSnapshot>;  // chainId -> ChainSnapshot
}

/** Flow slot summary for list view */
export interface FlowSlotSummary {
  id: string;
  label: string;
  color: string;
  chainId: number | null;
}

/** Flow snapshot metadata (list view) */
export interface FlowSnapshot {
  id: number;
  name: string;
  description: string;
  tags: string[];
  program_number: number | null;
  is_active: boolean;
  is_favorite: boolean;
  display_order: number;
  flow_slots: FlowSlotSummary[];
  created_at: string;
  updated_at: string;
}

/** Flow snapshot with full data (detail view) */
export interface FlowSnapshotDetail extends FlowSnapshot {
  snapshot_data: FlowSnapshotData;
}

/** WebSocket event for flow snapshot loaded */
export interface FlowSnapshotLoadedEvent {
  type: 'flow_snapshot_loaded';
  topic: 'flow_snapshots';
  data: {
    snapshot_id: number;
    snapshot_name: string;
    snapshot_data: FlowSnapshotData;
    triggered_by?: 'midi_pc' | 'ui';
    program_number?: number;
  };
  timestamp: string;
}
