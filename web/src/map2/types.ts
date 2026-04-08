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
  input_device?: string | null;
  output_device?: string | null;
  available_input_devices?: string[];
  available_output_devices?: string[];
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
  position?: number;
  instance_id?: number;
}

export type AudioSourceTruthSeverity = 'info' | 'warning' | 'error';
export type AudioSourceTruthStatus = 'aligned' | 'warning' | 'error';

export interface AudioSourceTruthIssue {
  id: string;
  severity: AudioSourceTruthSeverity;
  message: string;
  expected?: string | number | boolean | string[] | number[];
  actual?: string | number | boolean | string[] | number[];
}

export interface AudioSourceTruthPayload {
  timestamp: string;
  status: AudioSourceTruthStatus;
  profile: {
    selected_profile: string;
    profile_version: string;
    clock_master: string;
    remarks: string[];
  };
  configured: {
    engine_rate_hz: number;
    avb_stream_rate_hz: number;
    spdif_rate_hz: number;
    buffer_size_samples: number;
    bits_per_sample: number;
    allowed_rates_hz: number[];
    require_hard_lock: boolean;
    allow_resampler: boolean;
    spdif: {
      enabled: boolean;
      device: string;
      transport_mode: string;
      allow_resampler: boolean;
      require_hard_lock: boolean;
      remarks: string[];
    };
    avb: {
      enabled: boolean;
      interface: string;
      auto_connect: boolean;
      ptp_domain: number;
      max_streams: number;
    };
  };
  runtime: {
    engine: {
      available: boolean;
      running: boolean;
      sample_rate_hz: number;
      buffer_size_samples: number;
      cpu_load_percent: number;
      audio_device: string;
    };
    pipewire: {
      available: boolean;
      clock_rate_hz: number;
      clock_force_rate_hz: number;
      clock_quantum_samples: number;
      clock_force_quantum_samples: number;
      clock_allowed_rates_hz: number[];
      effective_rate_hz: number;
      effective_quantum_samples: number;
      error?: string;
    };
    avb: {
      enabled: boolean;
      interface: string;
      auto_connect: boolean;
      available: boolean;
      state: string;
      reason?: string | null;
      ptp: {
        available: boolean;
        state?: string;
        offset_ns?: number;
        error?: string;
      };
    };
  };
  consistency: {
    checks: Record<string, boolean>;
    issues: AudioSourceTruthIssue[];
    issue_count: number;
  };
}

// ==================== Chain Types ====================

export interface EffectsLoop {
  loop_id: string;
  name: string;
  channels: number;
  topology: string;
  tesira_device_id?: string | null;
  template_id?: string | null;
  send_endpoint_id?: string | null;
  return_endpoint_id?: string | null;
  state_desired: string;
  state_actual: string;
  health_status: string;
  health_reason?: string | null;
  target_added_latency_ms: number;
  measured_added_latency_ms?: number | null;
  compensation_samples: number;
  calibration_status: string;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface LoopInsertion {
  insertion_id: string;
  chain_id: number;
  loop_id: string;
  slot_index: number;
  enabled: boolean;
  mode: string;
  blend_pct: number;
  send_gain_db: number;
  return_gain_db: number;
  crossfade_ms: number;
  band_split_hz: number[];
  created_at?: string | null;
  updated_at?: string | null;
}

export type ChainRuntimeSyncStatus = 'active' | 'partial' | 'capability_gap' | (string & {});

export interface ChainRuntimeSync {
  enabled: boolean;
  status: ChainRuntimeSyncStatus;
  reason?: string;
  warnings: string[];
  runtime_items: number;
  restored_positions: number[];
  missing_positions: number[];
}

export interface Chain {
  id: number;
  name: string;
  is_active?: boolean;
  created_at: string;
  updated_at: string;
  plugins: ChainPlugin[];
  loop_insertions?: LoopInsertion[];
  effects_loops?: EffectsLoop[];
  runtime_sync?: ChainRuntimeSync | null;
}

export interface ChainPlugin {
  uri: string;
  name: string;
  plugin_display_type?: string;
  position: number;
  bypassed: boolean;
  parameters: Record<string, number>;
  loader_state?: PluginLoaderState;
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

export interface PluginOrderRef {
  uri: string;
  position: number;
}

export interface ChainTemplate {
  name: string;
  description: string;
  plugin_count: number;
  category?: string;
}

export interface MaschineLcdBitmap {
  width: number;
  height: number;
  format: string;
  data: string;
  source?: string;
  updated_at?: string;
}

export interface MaschinePadLedState {
  index: number;
  state: string;
  color: string;
  selected: boolean;
}

export interface MaschineLedState {
  pads: MaschinePadLedState[];
  updated_at?: string | null;
}

export interface MaschineAudioGridParameter {
  param_id: string;
  value: unknown;
}

export interface MaschineAudioGridBlock {
  block_id: string;
  pad_index: number;
  path_id?: string | null;
  path_label?: string | null;
  chain_name?: string | null;
  snapshot_chain_id?: number | null;
  runtime_chain_id?: number | null;
  plugin_uri?: string | null;
  plugin_name?: string | null;
  plugin_position?: number;
  bypassed?: boolean;
  page_index?: number;
  page_count?: number;
  top_parameters?: MaschineAudioGridParameter[];
}

export interface MaschineAudioGridProjection {
  blocks: MaschineAudioGridBlock[];
  selected_block_id: string | null;
  page_index: number;
  updated_at?: string | null;
  snapshot_id?: number | null;
  snapshot_name?: string | null;
}

export interface MaschineEncoderMapEntry {
  block_id?: string | null;
  param_id?: string | null;
  label?: string | null;
  fixed?: boolean;
}

export type MaschineEncoderMap = Record<string, MaschineEncoderMapEntry | null>;

export interface MaschineHidEvent {
  timestamp: string;
  direction: string;
  report_id?: number | string | null;
  decoded_type: string;
  raw_hex: string;
  payload?: Record<string, unknown>;
}

export interface MaschineDaemonStatus {
  connected: boolean;
  status: string;
  daemon_version?: string | null;
  websocket_connected: boolean;
  virtual_port_name: string;
  hid_device: Record<string, unknown>;
  transport: MaschineTransportStatus;
  transport_candidates: MaschineTransportCandidate[];
  firmware_info: Record<string, unknown>;
  capabilities: Record<string, unknown>;
  last_seen_at?: string | null;
  registered_at?: string | null;
  heartbeat_at?: string | null;
  last_event_type?: string | null;
  lcd: {
    left: MaschineLcdBitmap;
    right: MaschineLcdBitmap;
  };
  led_state: MaschineLedState;
  audio_grid: MaschineAudioGridProjection;
}

export interface MaschineTransportCandidate {
  transport_id?: string;
  module_available?: boolean;
  device_visible?: boolean;
  connectable?: boolean;
  note?: string;
  error?: string;
  [key: string]: unknown;
}

export interface MaschineTransportStatus {
  transport_id?: string;
  preference?: string;
  allow_kernel_detach?: boolean;
  connected?: boolean;
  selected_transport?: Record<string, unknown>;
  candidates?: MaschineTransportCandidate[];
  [key: string]: unknown;
}

export type EnrichedPhysicalSurfaceStatus = 'online' | 'detected' | 'attention' | 'planned';

export interface EnrichedPhysicalSurfaceTransportLayer {
  layer_id: string;
  label: string;
  kind: string;
  status: EnrichedPhysicalSurfaceStatus;
  detail: string;
}

export interface EnrichedPhysicalSurfaceMatch {
  sys_name?: string | null;
  device_id?: string | null;
  profile_id?: string | null;
  profile_name?: string | null;
  vendor_id?: string | null;
  product_id?: string | null;
  manufacturer?: string | null;
  product?: string | null;
  serial?: string | null;
  busnum?: string | null;
  devnum?: string | null;
  speed?: string | null;
  card_index?: number | null;
  alsa_id?: string | null;
  device_path?: string | null;
  has_midi?: boolean;
  connected?: boolean;
  responding?: boolean;
  health?: string | null;
  latency_ms?: number | null;
  node_id?: string | null;
  remote?: boolean;
  manual_assignment?: string | null;
  port_names?: string[];
  midi_nodes?: Array<{
    node: string;
    name: string;
  }>;
}

export interface EnrichedPhysicalSurfaceViewZone {
  zone_id: string;
  label: string;
  role: string;
  controls: string[];
}

export interface EnrichedPhysicalSurfaceRecentTarget {
  target_id: string;
  label: string;
  kind: string;
  source: string;
  updated_at?: string;
}

export interface EnrichedPhysicalSurfaceViewDefinition {
  view_id: string;
  label: string;
  category: string;
  note?: string;
  replaces_view_id?: string;
  presentation?: Record<string, string>;
  zones: EnrichedPhysicalSurfaceViewZone[];
}

export interface EnrichedPhysicalSurfaceViewState {
  page_layout_mode: string;
  view_sync: string;
  target_follow_policy: string;
  current_view_id: string;
  current_view_label: string;
  current_view_source: string;
  recent_target?: EnrichedPhysicalSurfaceRecentTarget | null;
  is_override_active?: boolean;
  views: EnrichedPhysicalSurfaceViewDefinition[];
}

export interface EnrichedPhysicalSurfaceLab {
  enabled: boolean;
  access: string;
  features: string[];
  snapshot?: Record<string, unknown>;
}

export interface EnrichedPhysicalSurfaceOperatorSession {
  current_view_id: string;
  current_view_source: string;
  is_override_active: boolean;
  recent_target?: EnrichedPhysicalSurfaceRecentTarget | null;
  updated_at?: string | null;
}

export interface EnrichedPhysicalSurfaceUnit {
  unit_id: string;
  display_name: string;
  family: string;
  device_type: string;
  specialized_route?: string | null;
  host_detected: boolean;
  status: EnrichedPhysicalSurfaceStatus;
  status_reason: string;
  capabilities: string[];
  integration_notes: string[];
  transport_layers: EnrichedPhysicalSurfaceTransportLayer[];
  matched_usb_devices: EnrichedPhysicalSurfaceMatch[];
  matched_sound_cards: EnrichedPhysicalSurfaceMatch[];
  matched_midi_devices: EnrichedPhysicalSurfaceMatch[];
  service_state: Record<string, unknown>;
  firmware_posture: {
    status: string;
    detail: string;
  };
  view_state: EnrichedPhysicalSurfaceViewState;
  surface_lab: EnrichedPhysicalSurfaceLab;
  operator_session?: EnrichedPhysicalSurfaceOperatorSession;
}

export interface EnrichedPhysicalSurfaceSharedOperatorContract {
  primary_role: string;
  sub_menu_policy: string;
  multi_synth_mode: string;
  page_layout_mode: string;
  view_sync: string;
  target_follow_policy: string;
  snapshot_strategy: string;
  community_firmware_support: string;
  surface_lab_mode: string;
}

export interface EnrichedPhysicalSurfacesSummary {
  stack_name: string;
  summary_generated_at: string;
  shared_operator_contract: EnrichedPhysicalSurfaceSharedOperatorContract;
  host_observations: {
    usb_devices: EnrichedPhysicalSurfaceMatch[];
    sound_cards: EnrichedPhysicalSurfaceMatch[];
    midi_hub_devices: EnrichedPhysicalSurfaceMatch[];
    python_modules: Record<string, boolean>;
    maschinen_mk1_host_note?: string;
  };
  units: EnrichedPhysicalSurfaceUnit[];
}

// ==================== Plugin Types ====================

/** Supported plugin formats (JUCE multi-format support) */
export type PluginFormat = 'VST3' | 'AudioUnit' | 'LV2' | 'LADSPA' | 'Hardware' | 'Unknown';

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
  instance_id?: number;
  latency_samples?: number;
  has_midi_input?: boolean;
  has_midi_output?: boolean;
  supports_double_precision?: boolean;
  sidechain_buses?: number;
  sidechain_bus_names?: string[];
  is_hardware?: boolean;
  loader_state?: PluginLoaderState;
}

export interface PluginLoaderState {
  selected_model?: string | null;
  selected_ir?: string | null;
  selected_asset_name?: string | null;
  selected_asset_path?: string | null;
  input_gain?: number;
  output_gain?: number;
  normalize?: boolean;
  mix?: number;
  bypass?: boolean;
  ir_type?: 'cabinet' | 'reverb';
  system_block_role?: string | null;
  system_block_locked?: boolean;
  system_block_label?: string | null;
}

export interface PluginAppearanceOverride {
  uri: string;
  accent_color?: string | null;
  dark_variant?: string | null;
  light_variant?: string | null;
  icon_identifier?: string | null;
  custom_svg?: string | null;
  description?: string | null;
}

export interface PluginAppearanceListResponse {
  items: PluginAppearanceOverride[];
  count: number;
}

// ==================== Snapshot Types ====================

export interface Snapshot {
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

export interface SnapshotCategory {
  name: string;
  count: number;
}

export interface CreateSnapshotRequest {
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

export interface MIDIMappingTestResult {
  mapping_id: number;
  channel: number;
  cc: number;
  normalized_value: number;
  cc_value: number;
  source: 'current' | 'manual';
  message: string;
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
  plugin_id?: number;
  plugin_uri?: string;
  parameter_symbol: string;
  parameter_index: number;
  min_value: number;
  max_value: number;
  curve: MIDICurveType;
  is_active?: boolean;
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
  loaded?: string | null;
  loaded_cabinet?: string;
  loaded_reverb?: string;
  active_cabinet?: string;
  active_reverb?: string;
  mix?: number;
  bypass?: boolean;
  currentDecay?: number;
  availableIRs?: Array<{ name: string; size?: string; length?: number; type?: string; decay?: number }>;
  configuredIR?: string | null;
  configuredAssetPath?: string | null;
  configuredMix?: number;
  configuredBypass?: boolean;
  runtimeWarning?: string;
  error?: string;
}

export interface IRWaveformPreview {
  assetPath: string;
  fileName: string;
  sampleRate: number;
  sampleCount: number;
  durationMs: number;
  points: number[];
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
  loading?: boolean;
  mix: number;
  bypass: boolean;
  inputLevel: number;
  outputLevel: number;
  peakInput: number;
  peakOutput: number;
  latency: number;
  availableModels: string[];
  input_gain?: number;
  output_gain?: number;
  normalize?: boolean;
  configuredModel?: string | null;
  configuredAssetPath?: string | null;
  configuredInputGain?: number;
  configuredOutputGain?: number;
  configuredNormalize?: boolean;
  configuredBypass?: boolean;
  runtimeWarning?: string;
  error?: string;
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
  undo_stack?: string[];
  redo_stack?: string[];
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
  snapshots: Snapshot[];
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

export interface SnapshotsResponse {
  snapshots: Snapshot[];
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
  instance_id?: number;
  plugin_position?: number;
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
  instance_id?: number;
  plugin_position?: number;
  port_index: number;
  symbol: string;
  value: number;
  timestamp: number;
}

/** Tuner data from analyser plugins */
export interface TunerData {
  uri: string;
  instance_id?: number;
  plugin_position?: number;
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
  instance_id?: number;
  plugin_position?: number;
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

// ==================== Native Engine Types ====================

/** JUCE Audio Engine status */
export interface EngineStatus {
  running: boolean;
  available: boolean;
  sample_rate: number;
  buffer_size: number;
  cpu_load: number;
  plugin_count: number;
  latency_ms: number;
  error?: string;
}

/** JUCE Audio Engine version info */
export interface EngineVersion {
  version: string;
}

// ==================== Dynamics Processor Types ====================

export interface DynamicsMetering {
  inputLevel: number;
  outputLevel: number;
  gainReduction: number;
  inputRms: number;
  outputRms: number;
}

export interface CompressorState {
  threshold: number;
  ratio: number;
  attack: number;
  release: number;
  knee: number;
  makeupGain: number;
  autoMakeup: boolean;
  bypass: boolean;
}

export interface LimiterState {
  threshold: number;
  release: number;
  bypass: boolean;
}

export interface GateState {
  threshold: number;
  ratio: number;
  attack: number;
  release: number;
  bypass: boolean;
}

// ==================== EQ Processor Types ====================

export interface EQBand {
  index: number;
  frequency: number;
  gain: number;
  q: number;
  type: 'lowpass' | 'highpass' | 'bandpass' | 'notch' | 'peak' | 'lowshelf' | 'highshelf';
  enabled: boolean;
}

export interface EQState {
  bands: EQBand[];
  bypass: boolean;
  outputGain: number;
}

export interface FrequencyResponse {
  frequencies: number[];
  magnitudes: number[];
}

// ==================== Delay Processor Types ====================

export interface DelayState {
  delayTimeMs: number;
  feedback: number;
  mix: number;
  sync: boolean;
  pingPong: boolean;
  highCut: number;
  lowCut: number;
  bypass: boolean;
}

export interface TempoDivision {
  name: string;
  multiplier: number;
}

// ==================== Modulation Processor Types ====================

export interface ChorusState {
  rate: number;
  depth: number;
  mix: number;
  voices: number;
  bypass: boolean;
}

export interface PhaserState {
  rate: number;
  depth: number;
  feedback: number;
  stages: number;
  mix: number;
  bypass: boolean;
}

export interface PitchShifterState {
  semitones: number;
  cents: number;
  mix: number;
  bypass: boolean;
}

// ==================== Boss XS-1 Pitch Types ====================

export interface BossXS1State {
  voice1_semitones: number;
  voice1_cents: number;
  voice2_semitones: number;
  voice2_cents: number;
  mix: number;
  bypass: boolean;
}

export interface BossXS1Preset {
  id: string;
  name: string;
  parameters: Record<string, number>;
}

// ==================== Shoegaze Multi-Effect Types ====================

export interface ShoegazeState {
  reverb_mix: number;
  delay_mix: number;
  modulation_depth: number;
  distortion: number;
  shimmer: number;
  mix: number;
  bypass: boolean;
}

export interface ShoegazePreset {
  id: string;
  name: string;
  parameters: Record<string, number>;
}

// ==================== Lexi Love Reverb Types ====================

export interface LexiLoveState {
  algorithm: string;
  decay: number;
  damping: number;
  pre_delay: number;
  mix: number;
  bypass: boolean;
}

export interface LexiLoveAlgorithm {
  id: string;
  name: string;
  description: string;
}

// ==================== Ultra-Harmonizer Types ====================

export interface H3000State {
  algorithm: string;
  pitch_a: number;
  pitch_b: number;
  delay_a: number;
  delay_b: number;
  feedback: number;
  mix: number;
  bypass: boolean;
}

export interface H3000Algorithm {
  id: string;
  name: string;
  description: string;
}

// ==================== Amp Model Types ====================

export interface Peavey5150State {
  gain: number;
  bass: number;
  mid: number;
  treble: number;
  presence: number;
  volume: number;
  channel: string;
  bypass: boolean;
}

export interface TweedBassmanState {
  volume: number;
  bass: number;
  middle: number;
  treble: number;
  presence: number;
  bright: boolean;
  bypass: boolean;
}

export interface PassionFXState {
  preset: string;
  mix: number;
  level: number;
  bypass: boolean;
}

export interface AmpPreset {
  id: string;
  name: string;
  parameters: Record<string, number>;
}

// ==================== Parallel Routing Types ====================

export interface ParallelGroup {
  id: number;
  name: string;
  branches: ParallelBranch[];
  blend: number;
  bypass: boolean;
}

export interface ParallelBranch {
  id: number;
  name: string;
  plugins: string[];
  level: number;
  muted: boolean;
}

// ==================== Drum Machine Types ====================

export type DrumPadSoundSource = 'sample' | 'synth' | 'hybrid';
export type DrumSynthOscillatorType = 'sine' | 'triangle' | 'saw' | 'square' | 'metallic';

export interface DrumSynthParams {
  oscillator_type: DrumSynthOscillatorType;
  pitch_envelope_start_hz: number;
  pitch_envelope_end_hz: number;
  pitch_envelope_decay_ms: number;
  noise_level: number;
  noise_decay_ms: number;
  body_decay_ms: number;
  tone_amount: number;
}

export type DrumPadFilterType = 'lowpass' | 'highpass' | 'bandpass' | 'notch';

export interface DrumPadFilter {
  type: DrumPadFilterType;
  cutoff_hz: number;
  resonance: number;
  env_amount: number;
  env_decay_ms: number;
}

export interface DrumCvGateConfig {
  enabled: boolean;
  output_pair: number;
  gate_length_ms: number;
  note_min: number;
  note_max: number;
  pitch_min_volts: number;
  pitch_max_volts: number;
}

export interface DrumMachineState {
  ui_mode: 'practice' | 'advanced' | 'backing_tracks';
  bpm: number;
  volume: number;
  pattern: number;
  variation: number;
  transport: boolean;
  swing: number;
  active_pack: string | null;
  practice_style_id: string | null;
  practice_variation: number;
  practice_change_quantization: number;
  practice_count_in_bars: number;
  practice_auto_fill: boolean;
  midi_output_enabled: boolean;
  midi_clock_output_enabled: boolean;
  midi_output_channel: number;
  program_change_enabled: boolean;
  track_swing: number[];
  pad_sound_sources: DrumPadSoundSource[];
  pad_synth_params: DrumSynthParams[];
  pad_filters: DrumPadFilter[];
  pad_cv_gate_configs: DrumCvGateConfig[];
}

export interface DrumMachineStateUpdate {
  ui_mode?: 'practice' | 'advanced' | 'backing_tracks';
  bpm?: number;
  volume?: number;
  pattern?: number;
  variation?: number;
  transport?: boolean;
  swing?: number;
  active_pack?: string | null;
  practice_style_id?: string | null;
  practice_variation?: number;
  practice_change_quantization?: number;
  practice_count_in_bars?: number;
  practice_auto_fill?: boolean;
  midi_output_enabled?: boolean;
  midi_clock_output_enabled?: boolean;
  midi_output_channel?: number;
  program_change_enabled?: boolean;
  track_swing?: number[];
  pad_sound_sources?: DrumPadSoundSource[];
  pad_synth_params?: DrumSynthParams[];
  pad_filters?: DrumPadFilter[];
  pad_cv_gate_configs?: DrumCvGateConfig[];
}

export type DrumVelocityCurveType = 0 | 1 | 2 | 3 | 4;
export type DrumZoneType = 'head' | 'rim' | 'edge';

export interface DrumPack {
  pack_id: string;
  name: string;
  description: string;
  source: string;
  filename: string;
}

export interface DrumInstrument {
  pad_id: number;
  name: string;
  sfz_path: string;
  default_note: number;
  bus_assignment: number;
  volume: number;
  pan: number;
  tune: number;
  mute: boolean;
  solo: boolean;
}

export interface DrumKitInstrumentPatch {
  name?: string;
  sfz_path?: string;
  default_note?: number;
  bus_assignment?: number;
  default_volume?: number;
  default_pan?: number;
  default_tune?: number;
}

export interface DrumKit {
  kit_id: string;
  name: string;
  description: string;
  author: string;
  category: string;
  source?: 'factory' | 'user';
  root_path?: string;
  instruments: DrumInstrument[];
}

export interface DrumPadSampleWaveform {
  pad: number;
  kit_id: string;
  kit_source: 'factory' | 'user';
  root_path: string;
  sfz_path: string;
  sample_path: string;
  sample_rate: number;
  channel_count: number;
  sample_count: number;
  duration_seconds: number;
  points: number;
  peaks: number[];
}

export interface DrumPadRecordingState {
  pad: number;
  active: boolean;
  max_duration_seconds: number;
}

export interface DrumTransportState {
  is_playing: boolean;
  bpm: number;
  pattern: number;
  variation: number;
  swing: number;
  pending_pattern: number;
  switch_quantization_beats: number;
  midi_output_enabled: boolean;
  midi_clock_output_enabled: boolean;
  midi_output_channel: number;
  program_change_enabled: boolean;
  track_swing: number[];
}

export interface DrumBackingTrackSummary {
  track_id: string;
  name: string;
  genre: string;
  key: string;
  tempo: number;
  duration_seconds: number;
  duration_label: string;
}

export interface DrumBackingTrackTransportState {
  track_id: string;
  track_name: string;
  genre: string;
  key: string;
  tempo: number;
  duration_seconds: number;
  duration_label: string;
  position_seconds: number;
  position_label: string;
  is_playing: boolean;
  loop_enabled: boolean;
  tempo_shift: number;
  pitch_shift: number;
  runtime_source: 'drum_machine_service';
}

export interface DrumBackingTrackTransportUpdate {
  track_id?: string;
  is_playing?: boolean;
  loop_enabled?: boolean;
  tempo_shift?: number;
  pitch_shift?: number;
  position_seconds?: number;
}

export interface DrumTransportUpdate {
  is_playing?: boolean;
  bpm?: number;
  pattern?: number;
  variation?: number;
  swing?: number;
  switch_quantization_beats?: number;
  midi_output_enabled?: boolean;
  midi_clock_output_enabled?: boolean;
  midi_output_channel?: number;
  program_change_enabled?: boolean;
}

export interface DrumMidiOutputConfig {
  midi_output_enabled: boolean;
  midi_clock_output_enabled: boolean;
  midi_output_channel: number;
  program_change_enabled: boolean;
}

export interface DrumPatternStep {
  active: boolean;
  velocity: number;
  accent: boolean;
  micro_timing?: number;
  probability?: number;
  ratchet_count?: number;
  ratchet_decay?: number;
  lock_pitch?: number | null;
  lock_filter_cutoff?: number | null;
  lock_decay?: number | null;
  lock_pan?: number | null;
  lock_volume?: number | null;
}

export interface DrumPattern {
  pattern_id: number;
  steps: DrumPatternStep[][];
  length: number;
  variation: number;
  track_lengths: number[];
}

export interface DrumSongEntry {
  pattern_id: number;
  repeat_count: number;
}

export interface DrumSong {
  entries: DrumSongEntry[];
  loop: boolean;
}

export interface DrumSequencerPosition {
  step: number;
  bar: number;
  beat: number;
  pattern: number;
  pattern_id: number;
  variation: number;
  is_playing: boolean;
  pending_pattern: number;
  switch_quantization_beats: number;
  updated_at: string | null;
}

export interface DrumSongTransportState {
  is_playing: boolean;
  current_entry_index: number;
  current_repeat: number;
  total_entries: number;
  loop: boolean;
  active_pattern: number;
}

export interface DrumEqState {
  low_gain: number;
  mid_gain: number;
  mid_freq: number;
  high_gain: number;
}

export interface DrumCompressorState {
  threshold: number;
  ratio: number;
  attack: number;
  release: number;
  makeup: number;
}

export interface DrumBusMixer {
  bus_id: number;
  name: string;
  eq: DrumEqState;
  comp: DrumCompressorState;
  level: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  output_pair: number;
  reverb_send: number;
  output_channel_count: number;
  available_output_pairs: number[];
}

export interface DrumPadControlUpdate {
  volume?: number;
  pan?: number;
  tune?: number;
  mute?: boolean;
  solo?: boolean;
  bus_assignment?: number;
}

export interface DrumPadControl extends DrumPadControlUpdate {
  pad_id: number;
  volume: number;
  pan: number;
  tune: number;
  mute: boolean;
  solo: boolean;
  bus_assignment: number;
}

export interface DrumBusMixerUpdate {
  eq?: Partial<DrumEqState>;
  comp?: Partial<DrumCompressorState>;
  level?: number;
  pan?: number;
  mute?: boolean;
  solo?: boolean;
  output_pair?: number;
  reverb_send?: number;
}

export interface DrumMasterVolumeState {
  volume: number;
}

export interface DrumMasterFxState {
  drive_db: number;
  compressor_threshold: number;
  compressor_ratio: number;
  compressor_attack: number;
  compressor_release: number;
  compressor_makeup: number;
  reverb_mix: number;
  reverb_size: number;
  reverb_damping: number;
  reverb_width: number;
  limiter_threshold: number;
  limiter_release: number;
}

export interface DrumMetering {
  per_pad_peak: number[];
  per_pad_rms: number[];
  per_bus_peak: number[];
  per_bus_rms: number[];
  master_peak_left: number;
  master_peak_right: number;
  master_rms_left: number;
  master_rms_right: number;
}

export interface DrumZone {
  zone_type: DrumZoneType;
  midi_note: number;
  articulation: string;
}

export interface DrumVelocityCurve {
  pad: number;
  curve_type: DrumVelocityCurveType;
  fixed_velocity: number;
  input_floor: number;
  output_floor: number;
  output_ceiling: number;
  preview: number[];
  last_velocity: number;
}

export interface DrumMidiPadMapping {
  pad: number;
  notes: number[];
  midi_channel: number;
}

export interface DrumMidiMapping {
  global_midi_channel: number;
  pads: DrumMidiPadMapping[];
}

export interface DrumPadZone {
  kind: number;
  trigger_note: number;
  key_switch_note: number;
  velocity_scale: number;
  enabled: boolean;
}

export interface DrumPadZones {
  pad: number;
  zones: DrumPadZone[];
}

export interface DrumMidiZones {
  pads: DrumPadZones[];
}

export interface DrumMidiVelocityCurves {
  pads: DrumVelocityCurve[];
}

export interface DrumMidiLearnStatus {
  active: boolean;
  learn_all: boolean;
  active_pad_index: number;
  next_pad_index: number;
  last_received_note: number;
  last_received_channel: number;
  timeout_seconds: number;
}

export interface DrumMidiPresetList {
  presets: string[];
}

export type DrumCcTarget =
  | 'pad_volume'
  | 'pad_pan'
  | 'pad_tune'
  | 'pad_filter_cutoff'
  | 'bus_level'
  | 'bus_pan'
  | 'master_volume'
  | 'tempo'
  | 'swing'
  | 'synth_pitch_start_hz'
  | 'synth_pitch_end_hz'
  | 'synth_pitch_decay_ms'
  | 'synth_noise_level'
  | 'synth_noise_decay_ms'
  | 'synth_body_decay_ms'
  | 'synth_tone_amount'

export interface DrumCcMappingEntry {
  slot: number;
  cc_number: number;
  midi_channel: number;
  target: DrumCcTarget;
  target_index: number;
  active: boolean;
}

export interface DrumCcMapping {
  mappings: DrumCcMappingEntry[];
}

export interface DrumCcLearnStatus {
  active: boolean;
  slot: number;
  last_cc: number;
  last_channel: number;
  timeout_seconds: number;
}

// ==================== Sidechain Types ====================

export interface SidechainConnection {
  id: number;
  source_plugin: string;
  target_plugin: string;
  bus: number;
  enabled: boolean;
}

// ==================== Core Plugins Types ====================

export interface CorePluginInfo {
  uri: string;
  name: string;
  category: string;
  description: string;
  priority: string;
}

export interface CorePluginsStatus {
  total: number;
  installed: number;
  missing: number;
  plugins: Record<string, CorePluginInfo & { installed: boolean }>;
}

// ==================== CPU Metrics Types ====================

export interface CPUMetricsData {
  totalCpuPercent: number;
  audioCallbackPercent: number;
  peakCpuPercent: number;
  averageCpuPercent: number;
  xrunCount: number;
  budgetMs: number;
  currentCallbackMs: number;
  headroomPercent: number;
  perPluginPercent: Record<string, number>;
  running: boolean;
}

// ==================== Loudness Metering Types ====================

export interface LoudnessLUFS {
  momentary: number;
  short_term: number;
  integrated: number;
  range: number;
  true_peak: number;
}

// ==================== Spectrum Types ====================

export interface SpectrumAnalysis {
  frequencies: number[];
  magnitudes: number[];
  peak_frequency: number;
  peak_magnitude: number;
  centroid: number;
}

// ==================== Backup Types ====================

export interface BackupInfo {
  backup_id: string;
  description: string;
  created_at: string;
  size_bytes: number;
  database: boolean;
  user_data: boolean;
  config: boolean;
}

export interface BackupSettings {
  max_backups: number;
  retention_days: number;
  auto_cleanup: boolean;
}

// ==================== Unified Snapshot Types ====================

export type RoutingMode = 'parallel_blend' | 'series' | 'morph' | 'sidechain';

export interface SnapshotPlugin {
  id?: number | null;
  uri: string;
  name?: string | null;
  position: number;
  bypass: boolean;
  parameters: Record<string, number>;
  loader_state?: PluginLoaderState;
  is_placeholder?: boolean;
}

export interface SnapshotChain {
  id?: number | null;
  name: string;
  plugins: SnapshotPlugin[];
  loop_insertions?: LoopInsertion[];
  effects_loops?: EffectsLoop[];
}

export interface SnapshotChannel {
  id?: number | null;
  snapshot_id?: number | null;
  channel_key: string;
  label: string;
  color: string;
  muted: boolean;
  solo: boolean;
  dry_wet_mix: number;
  order_index?: number;
  chain_id: number | null;
}

export interface SnapshotRouting {
  mode: RoutingMode;
  active_channel_key: string | null;
  blend_positions: Record<string, number>;
  morph_position: number;
  morph_source_channel_key: string | null;
  morph_target_channel_key: string | null;
  series_order: string[];
}

export interface SnapshotMidiMapEntry {
  [key: string]: unknown;
  action?: string;
  program_number?: number;
}

export interface SnapshotPath {
  id: string;
  name: string;
  label: string;
  color: string;
  muted: boolean;
  solo: boolean;
  dry_wet_mix: number;
  order_index: number;
  snapshot_chain_id: number | null;
  runtime_chain_id: number | null;
  plugins: SnapshotPlugin[];
  loop_insertions?: LoopInsertion[];
  effects_loops?: EffectsLoop[];
}

export interface SnapshotIOBindings {
  input_device: string | null;
  output_device: string | null;
  monitoring_output_index?: number | null;
  remap_required: boolean;
}

export interface SnapshotControls {
  midi_map: SnapshotMidiMapEntry[];
  automation_lanes: Array<Record<string, unknown>>;
  expression_mappings: Array<Record<string, unknown>>;
  monitoring_output_index?: number | null;
  maschine_encoder_map: SnapshotMaschineEncoderMap;
}

export type SnapshotMaschineEncoderAssignment = Record<string, unknown> | null;

export interface SnapshotMaschineEncoderMap {
  enc1: SnapshotMaschineEncoderAssignment;
  enc2: SnapshotMaschineEncoderAssignment;
  enc3: SnapshotMaschineEncoderAssignment;
  enc4: SnapshotMaschineEncoderAssignment;
  enc5: SnapshotMaschineEncoderAssignment;
  enc6: SnapshotMaschineEncoderAssignment;
  enc7: SnapshotMaschineEncoderAssignment;
  enc8: SnapshotMaschineEncoderAssignment;
  vol: Record<string, unknown>;
  tempo: Record<string, unknown>;
  swing: SnapshotMaschineEncoderAssignment | Record<string, unknown>;
}

export interface SnapshotLineage {
  derived_from_snapshot_id: number | null;
}

export interface SnapshotLivePathState {
  path_id: string;
  label?: string | null;
  color?: string | null;
  snapshot_chain_id: number | null;
  runtime_chain_id: number | null;
  runtime_chain_name?: string | null;
  activation_status?: string | null;
}

export interface SnapshotLiveState {
  is_live: boolean;
  activated_at?: string | null;
  paths: SnapshotLivePathState[];
  runtime_chains: Chain[];
  display_state?: 'live' | 'live_warning' | 'stopped' | 'offline';
  display_label?: string;
  is_warning?: boolean;
  is_offline?: boolean;
  last_runtime_event_at?: string | null;
  node_id?: string | null;
}

export type SnapshotRuntimeDisplayState = 'live' | 'live_warning' | 'stopped' | 'offline';

export interface SnapshotRuntimeLiveState {
  node_id: string;
  seq: number;
  emitted_at: string | null;
  state: 'live' | 'stopped';
  snapshot_id: number | null;
  snapshot_revision: string | null;
  snapshot_name?: string | null;
  triggered_by?: string | null;
  live_snapshot_payload?: SnapshotDetail | null;
  last_successful_request_id?: string | null;
  failure_reason?: string | null;
  runtime_metrics: Record<string, unknown>;
  warning_threshold_seconds: number;
  offline_threshold_seconds: number;
  age_seconds: number | null;
  is_warning: boolean;
  is_offline: boolean;
  display_state: SnapshotRuntimeDisplayState;
  display_label: string;
}

export interface SnapshotRuntimeClusterLiveStateResponse {
  local_node_id: string;
  generated_at: string;
  count: number;
  nodes: SnapshotRuntimeLiveState[];
}

export type AudioStatePathStatus = 'pending' | 'active' | 'not_loaded' | 'offline' | 'degraded';
export type AudioStateEngineStatus = 'live' | 'live_warning' | 'stopped' | 'offline';

export interface AudioStateSnapshotRef {
  snapshot_id: number;
  snapshot_revision_id?: number | null;
  name: string;
}

export interface AudioStateDesiredIO {
  requested_input_device?: string | null;
  requested_output_device?: string | null;
  monitoring_output_index?: number | null;
}

export interface AudioStateRouting {
  mode: string;
  active_path_ids: string[];
  path_order: string[];
}

export interface AudioStateDeployment {
  placement_mode: string;
  preferred_nodes: string[];
}

export interface CompiledSnapshotIntent {
  snapshot_id: number;
  snapshot_revision_id?: number | null;
  compiled_at: string;
  intent_version: number;
  io: AudioStateDesiredIO;
  routing: AudioStateRouting;
  deployment: AudioStateDeployment;
  chains: Array<Record<string, unknown>>;
}

export interface AudioStateObservedIOSummary {
  effective_input_device?: string | null;
  effective_output_device?: string | null;
}

export interface AudioStateClusterStatus {
  sync_status: string;
  applied_node_ids: string[];
  degraded_node_ids: string[];
}

export interface AudioStateEngineSummary {
  display_state: AudioStateEngineStatus;
  is_warning: boolean;
  is_offline: boolean;
}

export interface AudioStatePathRecord {
  path_id: string;
  label: string;
  snapshot_chain_id?: number | null;
  runtime_chain_id?: number | null;
  owner_node_id?: string | null;
  status: AudioStatePathStatus;
  status_reason?: string | null;
}

export interface AudioStateDerivedStatus {
  active_channel_count: number;
  total_channel_count: number;
  inactive_messages: string[];
}

export interface AuthoritativeAudioState {
  schema_version: number;
  state_version: number;
  leader_epoch: number;
  committed_at: string;
  origin_node_id: string;
  source_snapshot?: AudioStateSnapshotRef | null;
  desired: CompiledSnapshotIntent;
  observed_summary: AudioStateObservedIOSummary;
  cluster: AudioStateClusterStatus;
  engine: AudioStateEngineSummary;
  paths: AudioStatePathRecord[];
  derived: AudioStateDerivedStatus;
}

export interface AuthoritativeAudioStateEnvelope {
  namespace: string;
  key: string;
  revision?: number | null;
  value: AuthoritativeAudioState;
}

export interface DesiredAudioStateEnvelope {
  namespace: string;
  key: string;
  revision?: number | null;
  value: CompiledSnapshotIntent;
}

export interface SubmitDesiredAudioStateRequest {
  requested_by?: string;
  leader_epoch: number;
  state_version: number;
  committed_at: string;
  origin_node_id: string;
  source_snapshot?: AudioStateSnapshotRef | null;
  desired: CompiledSnapshotIntent;
  observed_summary?: AudioStateObservedIOSummary;
  cluster?: AudioStateClusterStatus;
  engine?: AudioStateEngineSummary;
  paths?: AudioStatePathRecord[];
  derived?: AudioStateDerivedStatus;
}

export interface AudioStateObservation {
  node_id: string;
  observed_state_version: number;
  applied: boolean;
  effective_input_device?: string | null;
  effective_output_device?: string | null;
  runtime_paths: AudioStatePathRecord[];
  engine: AudioStateEngineSummary;
  runtime_metrics: Record<string, unknown>;
  observed_at: string;
}

export interface AudioStateObservationEnvelope {
  namespace: string;
  key: string;
  revision?: number | null;
  ttl_seconds?: number | null;
  value: AudioStateObservation;
}

export interface AudioStateObservationListResponse {
  namespace: string;
  count: number;
  observations: AudioStateObservationEnvelope[];
}

export interface AudioStateRouteStatus {
  status: 'ok';
  namespace: string;
  authority_backend: string;
}

export interface ActivateSnapshotIntoAudioStateRequest {
  triggered_by?: string;
  leader_epoch?: number;
}

export interface SnapshotActivationAuditEvent {
  id: number;
  node_id: string;
  request_id: string;
  snapshot_id: number | null;
  snapshot_name?: string | null;
  snapshot_revision?: string | null;
  triggered_by?: string | null;
  requested_at: string | null;
  confirmed_live_at?: string | null;
  outcome: string;
  failure_reason?: string | null;
  activation_latency_ms?: number | null;
  runtime_metrics: Record<string, unknown>;
}

export interface SnapshotActivationEventsResponse {
  node_id: string;
  count: number;
  events: SnapshotActivationAuditEvent[];
}

export interface SnapshotActivationIntent {
  request_id: string;
  node_id: string;
  snapshot_id: number;
  snapshot_revision: string;
  triggered_by: string;
  requested_at: string;
  normalized_snapshot_payload: Record<string, unknown>;
}

export interface SnapshotAssetRef {
  kind: string;
  chain_id?: number | null;
  plugin_uri?: string | null;
  plugin_position?: number | null;
  asset_name?: string | null;
  asset_path?: string | null;
  filename?: string | null;
  checksum?: string | null;
  bundle_path?: string | null;
  available: boolean;
}

export interface SnapshotDeploymentHistory {
  id: number;
  snapshot_deployment_id: number;
  snapshot_id: number;
  from_node_id?: string | null;
  to_node_id: string;
  action: string;
  notes?: string | null;
  created_at?: string | null;
}

export interface SnapshotDeployment {
  id: number;
  snapshot_id: number;
  primary_node_id: string;
  standby_node_ids: string[];
  deployment_status: string;
  assignment_strategy: string;
  redundancy_enabled: boolean;
  deployed_at?: string | null;
  last_failover_time?: string | null;
  error_message?: string | null;
  history: SnapshotDeploymentHistory[];
}

export interface SnapshotTempoStatus {
  snapshot_id: number | null;
  stored_tempo_bpm: number;
  live_tempo_bpm?: number | null;
  active_tempo_bpm: number;
  tempo_source: string;
  is_live_override_active?: boolean;
  updated_at?: string | null;
  tap_count?: number;
}

export interface SnapshotRevisionSummary {
  id: number;
  snapshot_id: number;
  revision_number: number;
  snapshot_revision?: string | null;
  summary: string;
  saved_at?: string | null;
}

export interface SnapshotSummary {
  id: number;
  name: string;
  description: string;
  tags: string[];
  program_number: number | null;
  tempo_bpm?: number;
  live_tempo_bpm?: number | null;
  active_tempo_bpm?: number;
  tempo_source?: string;
  tempo_updated_at?: string | null;
  output_level_reference_dbfs?: number | null;
  output_level_warning_threshold_db?: number;
  input_device: string | null;
  output_device: string | null;
  is_active?: boolean;
  is_favorite: boolean;
  is_locked?: boolean;
  display_order: number;
  channels: Array<Pick<SnapshotChannel, 'id' | 'channel_key' | 'label' | 'color' | 'chain_id'>>;
  channel_count: number;
  chain_count: number;
  community_uuid?: string | null;
  community_shared: boolean;
  community_author?: string | null;
  community_download_count: number;
  community_rating: number | null;
  community_rating_count: number;
  io_bindings?: SnapshotIOBindings;
  lineage?: SnapshotLineage;
  snapshot_revision?: string;
  activated_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface SnapshotDetail extends SnapshotSummary {
  channels: SnapshotChannel[];
  chains: SnapshotChain[];
  routing: SnapshotRouting;
  midi_map: SnapshotMidiMapEntry[];
  paths: SnapshotPath[];
  io_bindings: SnapshotIOBindings;
  controls: SnapshotControls;
  assets: SnapshotAssetRef[];
  live_state: SnapshotLiveState;
  lineage: SnapshotLineage;
  active_channel_index: number;
  deployments: SnapshotDeployment[];
  snapshot_revision?: string;
}

export interface SnapshotExport {
  version: number;
  exported_at: string;
  snapshot: SnapshotDetail;
  asset_manifest: SnapshotAssetRef[];
  community_uuid?: string;
}

export interface SnapshotLoadedEvent {
  type: 'snapshot_loaded';
  topic: 'snapshots';
  data: {
    snapshot_id: number;
    snapshot_name: string;
    snapshot_data: SnapshotDetail;
    triggered_by?: 'midi_pc' | 'ui';
    program_number?: number | null;
  };
  timestamp: string;
}

export type CommunitySnapshot = SnapshotSummary

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
  loader_state?: PluginLoaderState;
}

/** Chain state snapshot */
export interface ChainSnapshot {
  name: string;
  plugins: PluginSnapshot[];
}

/** Editable snapshot draft payload used by the snapshot library and editor */
export interface SnapshotDraftData {
  flowSlots: FlowSlotSnapshot[];
  routing: RoutingConfigSnapshot;
  activeFlowIndex: number;
  chains: Record<string, ChainSnapshot>;  // chainId -> ChainSnapshot
}

/** @deprecated Use SnapshotDraftData */
export type FlowSnapshotData = SnapshotDraftData;

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
  is_active?: boolean;
  is_favorite: boolean;
  is_locked?: boolean;
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

// ==================== PipeWire Audio Server ====================

export interface PipeWireDaemonInfo {
  running: boolean;
  version: string;
  name: string;
  hostname: string;
  cookie: string;
  uptime_seconds: number;
}

export interface PipeWireDeviceInfo {
  id: number;
  name: string;
  nick: string;
  driver: string;
  bus: string;
  media_class: string;
  is_default: boolean;
  properties: Record<string, any>;
}

export interface PipeWireNodeInfo {
  id: number;
  name: string;
  nick: string;
  description: string;
  media_class: string;
  device_id: number | null;
  sample_rate: number | null;
  channels: number;
  format: string;
  volume: number;
  muted: boolean;
  is_driver: boolean;
  is_default: boolean;
  state: string;
  properties: Record<string, any>;
}

export interface PipeWireStreamInfo {
  id: number;
  client_name: string;
  client_pid: number;
  media_name: string;
  direction: string;
  state: string;
  channels: number;
  sample_rate: number | null;
}

export interface PipeWireLinkInfo {
  id: number;
  output_node: number;
  output_port: string;
  input_node: number;
  input_port: string;
  state: string;
}

export interface PipeWireSettings {
  clock_rate: number;
  clock_force_rate: number;
  clock_quantum: number;
  clock_force_quantum: number;
  clock_min_quantum: number;
  clock_max_quantum: number;
  clock_allowed_rates: number[];
}

export interface PipeWireAlert {
  type: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface PipeWireMetrics {
  daemon: PipeWireDaemonInfo;
  settings: PipeWireSettings;
  default_sink: PipeWireNodeInfo | null;
  default_source: PipeWireNodeInfo | null;
  devices: PipeWireDeviceInfo[];
  nodes: PipeWireNodeInfo[];
  streams: PipeWireStreamInfo[];
  links: PipeWireLinkInfo[];
  client_count: number;
  xruns: number;
  graph_latency_ms: number;
  driver_latency_ms: number;
  total_latency_ms: number;
  alerts: PipeWireAlert[];
  timestamp: string;
}
// ==================== Host Machine Page Types ====================

export interface HostMachineInfo {
  manufacturer: string;
  product_name: string;
  system_uuid: string;
  bios_version: string;
  bios_date: string;
  chassis_type: string;
  cpu_model: string;
  cpu_cores: number;
  cpu_threads: number;
  cpu_frequency_mhz: number;
  total_memory_mb: number;
  kernel_version: string;
  hostname: string;
  os_version?: string;
}

export interface DiskInfo {
  name: string;
  model: string;
  size_gb: number;
  health_status: string;
  temperature_c: number | null;
  used_percent: number;
  smart_status: string;
  reallocated_sectors: number;
  uncorrectable_errors: number;
  power_on_hours: number;
  estimated_lifespan_percent: number;
  /** @deprecated alias kept for backwards compat */
  device?: string;
  mount_point?: string;
  total_gb?: number;
  used_gb?: number;
  available_gb?: number;
  use_percent?: number;
}

export interface SMARTData {
  device: string;
  model: string;
  serial: string;
  status: 'passing' | 'failing' | 'unknown';
  temperature_celsius: number;
  power_on_hours: number;
  estimated_lifespan_percent: number;
  last_test_date?: string;
  warnings?: string[];
}

export interface DiskHealthData {
  disks: DiskInfo[];
  last_updated?: string;
  smart_data?: SMARTData[];
  total_storage_gb?: number;
  total_used_gb?: number;
  overall_health?: 'excellent' | 'good' | 'warning' | 'critical';
  use_percent?: number;
}

export interface Fan {
  name: string;
  rpm?: number;
  status: 'ok' | 'normal' | 'slow' | 'stopped' | 'unknown';
}

export interface PowerInfo {
  input_voltage?: number;
  current_load_percent?: number;
  power_status: 'connected' | 'battery' | 'unknown';
}

export interface SystemHealthOverview {
  cpu_temp_celsius: number;
  max_temp_celsius: number;
  cpu_usage_percent: number;
  memory_usage_percent: number;
  fans: Fan[];
  power: PowerInfo;
  overall_health: 'excellent' | 'good' | 'warning' | 'critical';
  last_updated?: string;
  health_details?: {
    temperature_status: string;
    fan_status: string;
    power_status: string;
  };
  temperature?: {
    cpu_c: number;
    max_c: number;
    throttling?: boolean;
  };
}

export interface BrandingAssets {
  manufacturer: string;
  logo_url: string;
  logo_fallback: string;
  product_image_url: string;
  marketing_name: string;
  product_name: string;
  support_url: string;
  warranty_status: string;
  brand_color: string;
  sff_optimized: boolean;
  error?: string;
}
