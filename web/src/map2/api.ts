// ============================================================================
// MAP2 Audio Platform - REST API Client
// Provides type-safe access to all MAP2 FastAPI endpoints
// ============================================================================

import type {
  AudioStatus,
  AudioLevels,
  PluginLevels,
  Chain,
  ChainTemplate,
  Plugin,
  Preset,
  PresetCategory,
  CreatePresetRequest,
  MIDIDevice,
  MIDIMapping,
  MIDIMappingV2,
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
  PresetsResponse,
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
} from './types';

const RAW_API_BASE = (() => {
  // Check for explicit environment variable
  const envBase = import.meta.env.VITE_API_BASE as string | undefined
  if (envBase) return envBase

  // If running on localhost, use /api proxy
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return '/api'
  }

  // For remote access (e.g., 172.20.234.234:3000), construct API URL to port 8080
  return `http://${window.location.hostname}:8080/api`
})()
const API_BASE = RAW_API_BASE.endsWith('/') ? RAW_API_BASE.slice(0, -1) : RAW_API_BASE

// Batching configuration
const BATCH_DELAY_MS = 50;
const MAX_BATCH_SIZE = 20;

class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body?: unknown
  ) {
    super(`API Error ${status}: ${statusText}`);
    this.name = 'ApiError';
  }
}

// Parameter update batching queue
interface ParameterUpdate {
  plugin_uri: string;
  param_index: number;
  value: number;
}

class ParameterBatcher {
  private queue: ParameterUpdate[] = [];
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private pendingPromises: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];

  /**
   * Queue a parameter update for batched sending
   */
  async queueUpdate(pluginUri: string, paramIndex: number, value: number): Promise<void> {
    return new Promise((resolve, reject) => {
      // Replace any existing update for the same parameter
      const existingIndex = this.queue.findIndex(
        (u) => u.plugin_uri === pluginUri && u.param_index === paramIndex
      );
      if (existingIndex >= 0) {
        this.queue[existingIndex].value = value;
      } else {
        this.queue.push({
          plugin_uri: pluginUri,
          param_index: paramIndex,
          value,
        });
      }

      this.pendingPromises.push({ resolve, reject });

      // Schedule batch send
      if (!this.timeout) {
        this.timeout = setTimeout(() => this.flush(), BATCH_DELAY_MS);
      }

      // Force flush if batch is full
      if (this.queue.length >= MAX_BATCH_SIZE) {
        this.flush();
      }
    });
  }

  /**
   * Immediately send all queued updates
   */
  async flush(): Promise<void> {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }

    if (this.queue.length === 0) {
      return;
    }

    const updates = [...this.queue];
    const promises = [...this.pendingPromises];
    this.queue = [];
    this.pendingPromises = [];

    try {
      await fetchJson(`${API_BASE}/plugins/batch/parameters`, {
        method: 'POST',
        body: JSON.stringify({ updates }),
      });
      promises.forEach((p) => p.resolve());
    } catch (error) {
      promises.forEach((p) => p.reject(error as Error));
    }
  }

  /**
   * Get current queue size
   */
  get size(): number {
    return this.queue.length;
  }
}

// Global parameter batcher instance
const parameterBatcher = new ParameterBatcher();

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = await response.text();
    }
    throw new ApiError(response.status, response.statusText, body);
  }

  return response.json();
}

// ==================== Audio API ====================

export const audioApi = {
  getStatus: () => fetchJson<AudioStatus>(`${API_BASE}/audio/status`),

  start: () => fetchJson<{ success: boolean; message: string }>(`${API_BASE}/audio/start`, { method: 'POST' }),

  stop: () => fetchJson<{ success: boolean; message: string }>(`${API_BASE}/audio/stop`, { method: 'POST' }),

  getLatency: () => fetchJson<{ latency_ms: number }>(`${API_BASE}/audio/latency`),

  getLevels: () => fetchJson<AudioLevels>(`${API_BASE}/audio/levels`),

  getPluginLevels: () => fetchJson<{ plugins: PluginLevels[] }>(`${API_BASE}/audio/levels/plugins`),

  getPipedalMetrics: () => fetchJson<Record<string, unknown>>(`${API_BASE}/audio/pipedal`),

  configure: (config: { sampleRate?: number; bufferSize?: number }) => {
    const params = new URLSearchParams();
    if (config.sampleRate) params.append('sample_rate', config.sampleRate.toString());
    if (config.bufferSize) params.append('buffer_size', config.bufferSize.toString());
    return fetchJson<{
      success: boolean;
      message: string;
      updated_settings: Record<string, number>;
      current_config: { sample_rate: number; buffer_size: number; cpu_load: number };
    }>(`${API_BASE}/audio/config?${params.toString()}`, { method: 'POST' });
  },

  restart: () => fetchJson<{ success: boolean; message: string }>(`${API_BASE}/audio/restart`, { method: 'POST' }),

  getHealth: () => fetchJson<AudioHealth>(`${API_BASE}/audio/health`),

  getXruns: () => fetchJson<XrunStats>(`${API_BASE}/audio/health/xruns`),

  getSignalStatus: () => fetchJson<SignalStatus>(`${API_BASE}/audio/health/signal`),

  getBufferPresets: () => fetchJson<BufferPreset[]>(`${API_BASE}/audio/buffer-presets`),

  getJuceMetrics: () => fetchJson<JuceMetrics>(`${API_BASE}/audio/juce`),

  unmute: () => fetchJson<{ success: boolean }>(`${API_BASE}/audio/health/unmute`, { method: 'POST' }),
};

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

// Diagnostics API
export const diagnosticsApi = {
  // Run audio loopback test
  runLoopbackTest: () =>
    fetchJson<DiagnosticResult>(`${API_BASE}/audio/test`, { method: 'POST' }),

  // Get ALSA device info
  getAlsaInfo: () => fetchJson<AlsaDeviceInfo>(`${API_BASE}/audio/alsa/info`),

  // Reset ALSA state
  resetAlsaState: () =>
    fetchJson<{ success: boolean; message: string }>(`${API_BASE}/audio/alsa/reset`, { method: 'POST' }),

  // Enumerate USB devices
  getUsbDevices: () => fetchJson<UsbDevice[]>(`${API_BASE}/usb/devices/list`),

  // Reset USB device
  resetUsbDevice: (deviceId: string) =>
    fetchJson<{ success: boolean; message: string }>(`${API_BASE}/usb/reset/${deviceId}`, { method: 'POST' }),

  // Run full diagnostic suite
  runFullDiagnostic: () =>
    fetchJson<FullDiagnosticResult>(`${API_BASE}/audio/diagnostics/full`, { method: 'POST' }),

  // Clear XRun counter
  clearXruns: () =>
    fetchJson<{ success: boolean }>(`${API_BASE}/audio/health/xruns/clear`, { method: 'POST' }),

  // Test specific sample rate
  testSampleRate: (rate: number) =>
    fetchJson<DiagnosticResult>(`${API_BASE}/audio/test/sample-rate?rate=${rate}`, { method: 'POST' }),

  // Test buffer stability
  testBufferStability: (bufferSize: number, duration: number) =>
    fetchJson<BufferStabilityResult>(
      `${API_BASE}/audio/test/buffer-stability?buffer_size=${bufferSize}&duration=${duration}`,
      { method: 'POST' }
    ),
};

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

export const usbApi = {
  getPrimaryHotoneDevice: () =>
    fetchJson<{
      name: string;
      model?: string;
      alsa_card?: string;
      alsa_device?: string;
      channels_in?: number;
      channels_out?: number;
    }>(`${API_BASE}/usb/hotone/primary`),
};

// ==================== Chains API ====================

export const chainsApi = {
  list: () => fetchJson<ChainsResponse>(`${API_BASE}/chains/`),

  get: (chainId: number) => fetchJson<Chain>(`${API_BASE}/chains/${chainId}`),

  create: (name: string) =>
    fetchJson<Chain>(`${API_BASE}/chains/`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  delete: (chainId: number) =>
    fetchJson<{ status: string; chain_id: number }>(`${API_BASE}/chains/${chainId}`, {
      method: 'DELETE',
    }),

  rename: (chainId: number, newName: string) =>
    fetchJson<{ status: string; chain_id: number; name: string }>(
      `${API_BASE}/chains/${chainId}/rename?new_name=${encodeURIComponent(newName)}`,
      { method: 'PUT' }
    ),

  activate: (chainId: number) =>
    fetchJson<{ status: string; chain_id: number }>(`${API_BASE}/chains/${chainId}/activate`, {
      method: 'POST',
    }),

  deactivate: (chainId: number) =>
    fetchJson<{ status: string; chain_id: number }>(`${API_BASE}/chains/${chainId}/deactivate`, {
      method: 'POST',
    }),

  addPlugin: (chainId: number, pluginUri: string) =>
    fetchJson<{ status: string; chain_id: number; plugin: string; plugins_count: number }>(
      `${API_BASE}/chains/${chainId}/plugins?plugin_uri=${encodeURIComponent(pluginUri)}`,
      { method: 'POST' }
    ),

  removePlugin: (chainId: number, pluginUri: string) =>
    fetchJson<{ status: string; chain_id: number }>(
      `${API_BASE}/chains/${chainId}/plugins?plugin_uri=${encodeURIComponent(pluginUri)}`,
      { method: 'DELETE' }
    ),

  reorderPlugins: (chainId: number, pluginUris: string[]) =>
    fetchJson<{ status: string; chain_id: number; plugins: string[] }>(
      `${API_BASE}/chains/${chainId}/reorder`,
      {
        method: 'POST',
        body: JSON.stringify(pluginUris),
      }
    ),

  togglePluginBypass: (chainId: number, pluginUri: string, bypass: boolean) =>
    fetchJson<{ status: string; chain_id: number; plugin: string; bypass: boolean }>(
      `${API_BASE}/chains/${chainId}/plugins/${encodeURIComponent(pluginUri)}/bypass?bypass=${bypass}`,
      { method: 'POST' }
    ),

  savePreset: (chainId: number, presetName: string) =>
    fetchJson<{ status: string; preset_id: number; name: string }>(
      `${API_BASE}/chains/${chainId}/preset/save?preset_name=${encodeURIComponent(presetName)}`,
      { method: 'POST' }
    ),

  listPresets: () => fetchJson<{ presets: Preset[]; count: number }>(`${API_BASE}/chains/presets`),

  loadPreset: (presetId: number) =>
    fetchJson<{ status: string; chain_id: number }>(`${API_BASE}/chains/preset/${presetId}/load`, {
      method: 'POST',
    }),

  deletePreset: (presetId: number) =>
    fetchJson<{ status: string; preset_id: number }>(`${API_BASE}/chains/preset/${presetId}`, {
      method: 'DELETE',
    }),

  listTemplates: () => fetchJson<{ templates: ChainTemplate[]; count: number }>(`${API_BASE}/chains/templates/list`),

  loadTemplate: (templateName: string) =>
    fetchJson<{ status: string; chain: Chain }>(
      `${API_BASE}/chains/templates/load?template_name=${encodeURIComponent(templateName)}`,
      { method: 'POST' }
    ),
};

// ==================== Plugins API ====================

export interface PluginDiscoverResponse extends PluginsResponse {
  cached?: boolean;
  warning?: string;
  error?: string;
}

export const pluginsApi = {
  discover: (refresh = false) =>
    fetchJson<PluginDiscoverResponse>(`${API_BASE}/plugins/discover${refresh ? '?refresh=true' : ''}`),

  refresh: () =>
    fetchJson<PluginDiscoverResponse>(`${API_BASE}/plugins/refresh`, { method: 'POST' }),

  clearCache: () =>
    fetchJson<{ status: string; plugins_cleared: number }>(`${API_BASE}/plugins/cache`, { method: 'DELETE' }),

  list: () => fetchJson<{ loaded: Plugin[]; count: number }>(`${API_BASE}/plugins/list`),

  load: (uri: string) =>
    fetchJson<{ status: string; plugin: Plugin }>(`${API_BASE}/plugins/load?uri=${encodeURIComponent(uri)}`, {
      method: 'POST',
    }),

  unload: (uri: string) =>
    fetchJson<{ status: string; uri: string }>(`${API_BASE}/plugins/unload?uri=${encodeURIComponent(uri)}`, {
      method: 'POST',
    }),

  getParameters: (uri: string) =>
    fetchJson<{ uri: string; parameters: unknown[] }>(`${API_BASE}/plugins/${encodeURIComponent(uri)}/parameters`),

  setParameter: (uri: string, paramIndex: number, value: number) =>
    fetchJson<{ uri: string; param: number; value: number }>(
      `${API_BASE}/plugins/${encodeURIComponent(uri)}/parameters/${paramIndex}?value=${value}`,
      { method: 'POST' }
    ),

  /**
   * Queue a parameter update for batched sending.
   * Multiple rapid parameter updates are combined into a single API call.
   * Ideal for real-time knob/slider adjustments.
   */
  setParameterBatched: (uri: string, paramIndex: number, value: number) =>
    parameterBatcher.queueUpdate(uri, paramIndex, value),

  /**
   * Immediately flush any pending batched parameter updates.
   * Call this when user finishes adjusting a parameter (e.g., on mouse up).
   */
  flushParameterBatch: () => parameterBatcher.flush(),

  /**
   * Get the number of pending batched updates.
   */
  getPendingBatchSize: () => parameterBatcher.size,

  /**
   * Send multiple parameter updates in a single request.
   * Use this for programmatic bulk updates (e.g., loading a preset).
   */
  batchSetParameters: (updates: Array<{ uri: string; paramIndex: number; value: number }>) =>
    fetchJson<{
      status: string;
      applied: number;
      errors: number;
      results: Array<{ plugin_uri: string; param_index: number; value: number }>;
      error_details?: Array<{ plugin_uri: string; param_index: number; error: string }>;
    }>(`${API_BASE}/plugins/batch/parameters`, {
      method: 'POST',
      body: JSON.stringify({
        updates: updates.map((u) => ({
          plugin_uri: u.uri,
          param_index: u.paramIndex,
          value: u.value,
        })),
      }),
    }),
};

// ==================== Presets API ====================

export const presetsApi = {
  list: (options?: { category?: string; tags?: string; favorites_only?: boolean; search?: string }) => {
    const params = new URLSearchParams();
    if (options?.category) params.set('category', options.category);
    if (options?.tags) params.set('tags', options.tags);
    if (options?.favorites_only) params.set('favorites_only', 'true');
    if (options?.search) params.set('search', options.search);
    const query = params.toString();
    return fetchJson<PresetsResponse>(`${API_BASE}/presets/${query ? `?${query}` : ''}`);
  },

  create: (request: CreatePresetRequest) =>
    fetchJson<{ status: string; preset_id: number; message: string }>(`${API_BASE}/presets/`, {
      method: 'POST',
      body: JSON.stringify(request),
    }),

  update: (
    presetId: number,
    updates: { name?: string; tags?: string[]; category?: string; description?: string; is_favorite?: boolean }
  ) =>
    fetchJson<{ status: string; message: string }>(`${API_BASE}/presets/${presetId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  delete: (presetId: number) =>
    fetchJson<{ status: string; message: string }>(`${API_BASE}/presets/${presetId}`, {
      method: 'DELETE',
    }),

  toggleFavorite: (presetId: number) =>
    fetchJson<{ status: string; is_favorite: boolean; message: string }>(
      `${API_BASE}/presets/${presetId}/favorite`,
      { method: 'POST' }
    ),

  getCategories: () => fetchJson<{ categories: PresetCategory[]; count: number }>(`${API_BASE}/presets/categories`),

  getTags: () => fetchJson<{ tags: string[]; count: number }>(`${API_BASE}/presets/tags`),
};

// ==================== MIDI API ====================

export const midiApi = {
  getDevices: () => fetchJson<{ inputs: MIDIDevice[]; outputs: MIDIDevice[] }>(`${API_BASE}/midi/devices`),

  start: () => fetchJson<{ message: string }>(`${API_BASE}/midi/start`, { method: 'POST' }),

  stop: () => fetchJson<{ message: string }>(`${API_BASE}/midi/stop`, { method: 'POST' }),

  getMappings: () => fetchJson<{ mappings: MIDIMapping[]; count: number }>(`${API_BASE}/midi/mappings`),

  addMapping: (channel: number, cc: number, targetUri: string, paramIndex: number) =>
    fetchJson<{ status: string; channel: number; cc: number; target: string; param: number }>(
      `${API_BASE}/midi/mappings?channel=${channel}&cc=${cc}&target_uri=${encodeURIComponent(targetUri)}&param_index=${paramIndex}`,
      { method: 'POST' }
    ),

  startLearn: (targetUri: string, paramIndex: number) =>
    fetchJson<{ status: string; target: string; param: number }>(
      `${API_BASE}/midi/learn?target_uri=${encodeURIComponent(targetUri)}&param_index=${paramIndex}`,
      { method: 'POST' }
    ),

  deleteMapping: (mappingId: number) =>
    fetchJson<{ status: string; mapping_id: number }>(
      `${API_BASE}/midi/mappings/${mappingId}`,
      { method: 'DELETE' }
    ),
};

// ==================== MIDI API V2 (Enhanced) ====================

export const midiApiV2 = {
  // ========== Status ==========
  getStatus: () => fetchJson<MIDIStatus>(`${API_BASE}/v2/midi/status`),

  // ========== Devices ==========
  getDevices: () => fetchJson<{
    input_devices: string[];
    output_devices: string[];
    current_input: string | null;
    current_output: string | null;
  }>(`${API_BASE}/v2/midi/devices`),

  openInputDevice: (deviceName: string) =>
    fetchJson<{ success: boolean; device: string }>(
      `${API_BASE}/v2/midi/devices/input`,
      { method: 'POST', body: JSON.stringify({ device_name: deviceName }) }
    ),

  openOutputDevice: (deviceName: string) =>
    fetchJson<{ success: boolean; device: string }>(
      `${API_BASE}/v2/midi/devices/output`,
      { method: 'POST', body: JSON.stringify({ device_name: deviceName }) }
    ),

  closeInputDevice: () =>
    fetchJson<{ success: boolean }>(`${API_BASE}/v2/midi/devices/input`, { method: 'DELETE' }),

  closeOutputDevice: () =>
    fetchJson<{ success: boolean }>(`${API_BASE}/v2/midi/devices/output`, { method: 'DELETE' }),

  // ========== CC Mappings ==========
  getMappings: (options?: { chain_id?: number; plugin_uri?: string }) => {
    const params = new URLSearchParams();
    if (options?.chain_id !== undefined) params.append('chain_id', options.chain_id.toString());
    if (options?.plugin_uri) params.append('plugin_uri', options.plugin_uri);
    const query = params.toString();
    return fetchJson<{ mappings: MIDIMappingV2[]; count: number }>(
      `${API_BASE}/v2/midi/mappings${query ? `?${query}` : ''}`
    );
  },

  createMapping: (mapping: Partial<MIDIMappingV2>) =>
    fetchJson<{ mapping: MIDIMappingV2; message: string }>(
      `${API_BASE}/v2/midi/mappings`,
      { method: 'POST', body: JSON.stringify(mapping) }
    ),

  updateMapping: (mappingId: number, updates: Partial<MIDIMappingV2>) =>
    fetchJson<{ mapping: MIDIMappingV2; message: string }>(
      `${API_BASE}/v2/midi/mappings/${mappingId}`,
      { method: 'PATCH', body: JSON.stringify(updates) }
    ),

  deleteMapping: (mappingId: number) =>
    fetchJson<{ success: boolean; message: string }>(
      `${API_BASE}/v2/midi/mappings/${mappingId}`,
      { method: 'DELETE' }
    ),

  // ========== Commands ==========
  getCommands: () =>
    fetchJson<{ commands: MIDICommand[]; count: number }>(`${API_BASE}/v2/midi/commands`),

  createCommand: (command: Partial<MIDICommand>) =>
    fetchJson<{ command: MIDICommand; message: string }>(
      `${API_BASE}/v2/midi/commands`,
      { method: 'POST', body: JSON.stringify(command) }
    ),

  updateCommand: (commandId: number, updates: Partial<MIDICommand>) =>
    fetchJson<{ command: MIDICommand; message: string }>(
      `${API_BASE}/v2/midi/commands/${commandId}`,
      { method: 'PATCH', body: JSON.stringify(updates) }
    ),

  deleteCommand: (commandId: number) =>
    fetchJson<{ success: boolean; message: string }>(
      `${API_BASE}/v2/midi/commands/${commandId}`,
      { method: 'DELETE' }
    ),

  // ========== Routing Rules ==========
  getRoutingRules: (chainId?: number) => {
    const query = chainId !== undefined ? `?chain_id=${chainId}` : '';
    return fetchJson<{ routing_rules: MIDIRoutingRule[]; count: number }>(
      `${API_BASE}/v2/midi/routing-rules${query}`
    );
  },

  createRoutingRule: (rule: Partial<MIDIRoutingRule>) =>
    fetchJson<{ routing_rule: MIDIRoutingRule; message: string }>(
      `${API_BASE}/v2/midi/routing-rules`,
      { method: 'POST', body: JSON.stringify(rule) }
    ),

  deleteRoutingRule: (ruleId: number) =>
    fetchJson<{ success: boolean; message: string }>(
      `${API_BASE}/v2/midi/routing-rules/${ruleId}`,
      { method: 'DELETE' }
    ),

  // ========== MIDI Learn ==========
  startLearn: (params: {
    chain_id: number;
    plugin_uri: string;
    param_symbol: string;
    param_index: number;
    min_val?: number;
    max_val?: number;
    curve_type?: MIDICurveType;
  }) =>
    fetchJson<{ success: boolean; target: MIDILearnTarget }>(
      `${API_BASE}/v2/midi/learn/start`,
      { method: 'POST', body: JSON.stringify(params) }
    ),

  stopLearn: () =>
    fetchJson<{ success: boolean }>(`${API_BASE}/v2/midi/learn/stop`, { method: 'POST' }),

  getLearnStatus: () =>
    fetchJson<{ learning: boolean; target: MIDILearnTarget | null }>(`${API_BASE}/v2/midi/learn/status`),

  // ========== Presets ==========
  getPresets: () =>
    fetchJson<{ presets: MIDIPreset[]; count: number }>(`${API_BASE}/v2/midi/presets`),

  savePreset: (name: string, description?: string) =>
    fetchJson<{ preset: MIDIPreset; message: string }>(
      `${API_BASE}/v2/midi/presets`,
      { method: 'POST', body: JSON.stringify({ name, description }) }
    ),

  loadPreset: (presetId: number) =>
    fetchJson<{ success: boolean; message: string }>(
      `${API_BASE}/v2/midi/presets/${presetId}/load`,
      { method: 'POST' }
    ),

  deletePreset: (presetId: number) =>
    fetchJson<{ success: boolean; message: string }>(
      `${API_BASE}/v2/midi/presets/${presetId}`,
      { method: 'DELETE' }
    ),

  // ========== Mapping Groups ==========
  getGroups: () =>
    fetchJson<{ groups: MIDIMappingGroup[]; count: number }>(`${API_BASE}/v2/midi/groups`),

  createGroup: (name: string, color?: string) =>
    fetchJson<{ group: MIDIMappingGroup; message: string }>(
      `${API_BASE}/v2/midi/groups`,
      { method: 'POST', body: JSON.stringify({ name, color }) }
    ),

  updateGroup: (groupId: number, updates: { name?: string; color?: string; sort_order?: number }) =>
    fetchJson<{ group: MIDIMappingGroup; message: string }>(
      `${API_BASE}/v2/midi/groups/${groupId}`,
      { method: 'PATCH', body: JSON.stringify(updates) }
    ),

  deleteGroup: (groupId: number) =>
    fetchJson<{ success: boolean; message: string }>(
      `${API_BASE}/v2/midi/groups/${groupId}`,
      { method: 'DELETE' }
    ),

  // ========== Chain MIDI Config ==========
  getChainConfigs: () =>
    fetchJson<{ configs: ChainMIDIConfig[]; count: number }>(`${API_BASE}/v2/midi/chain-configs`),

  setChainConfig: (chainId: number, programNumber: number, options?: {
    bank_msb?: number;
    bank_lsb?: number;
    send_pc_on_activate?: boolean;
  }) =>
    fetchJson<{ config: ChainMIDIConfig; message: string }>(
      `${API_BASE}/v2/midi/chain-configs/${chainId}`,
      { method: 'PUT', body: JSON.stringify({ program_number: programNumber, ...options }) }
    ),

  deleteChainConfig: (chainId: number) =>
    fetchJson<{ success: boolean; message: string }>(
      `${API_BASE}/v2/midi/chain-configs/${chainId}`,
      { method: 'DELETE' }
    ),

  // ========== Device Configs ==========
  getDeviceConfigs: () =>
    fetchJson<{ configs: MIDIDeviceConfig[]; count: number }>(`${API_BASE}/v2/midi/device-configs`),

  saveDeviceConfig: (config: Partial<MIDIDeviceConfig>) =>
    fetchJson<{ config: MIDIDeviceConfig; message: string }>(
      `${API_BASE}/v2/midi/device-configs`,
      { method: 'POST', body: JSON.stringify(config) }
    ),

  // ========== MIDI Output ==========
  sendCC: (channel: number, cc: number, value: number) =>
    fetchJson<{ success: boolean }>(
      `${API_BASE}/v2/midi/send/cc`,
      { method: 'POST', body: JSON.stringify({ channel, cc, value }) }
    ),

  sendProgramChange: (channel: number, program: number) =>
    fetchJson<{ success: boolean }>(
      `${API_BASE}/v2/midi/send/program-change`,
      { method: 'POST', body: JSON.stringify({ channel, program }) }
    ),

  sendNote: (channel: number, note: number, velocity: number, on: boolean) =>
    fetchJson<{ success: boolean }>(
      `${API_BASE}/v2/midi/send/note`,
      { method: 'POST', body: JSON.stringify({ channel, note, velocity, on }) }
    ),

  syncToController: () =>
    fetchJson<{ success: boolean; mappings_synced: number }>(
      `${API_BASE}/v2/midi/sync`,
      { method: 'POST' }
    ),

  // ========== Device Profiles ==========
  getDeviceProfiles: () =>
    fetchJson<{ profiles: MIDIDeviceProfile[]; count: number; active_profile_id: string | null }>(
      `${API_BASE}/v2/midi/device-profiles`
    ),

  getDeviceProfile: (profileId: string) =>
    fetchJson<MIDIDeviceProfile>(`${API_BASE}/v2/midi/device-profiles/${profileId}`),

  applyDeviceProfile: (profileId: string, clearExisting = true) =>
    fetchJson<ProfileApplyResult>(
      `${API_BASE}/v2/midi/device-profiles/apply`,
      { method: 'POST', body: JSON.stringify({ profile_id: profileId, clear_existing: clearExisting }) }
    ),

  detectDeviceProfile: (deviceName: string) =>
    fetchJson<{ detected: boolean; profile_id: string | null; profile?: MIDIDeviceProfile; suggestion?: string }>(
      `${API_BASE}/v2/midi/device-profiles/detect?device_name=${encodeURIComponent(deviceName)}`
    ),

  getActiveProfile: () =>
    fetchJson<{ active: boolean; profile: MIDIDeviceProfile | null }>(
      `${API_BASE}/v2/midi/device-profiles/active`
    ),

  // ========== Bank Management ==========
  getCurrentBank: () =>
    fetchJson<{ current_bank: number; max_banks: number; items_per_bank: number; pc_offset: number }>(
      `${API_BASE}/v2/midi/banks/current`
    ),

  bankUp: () =>
    fetchJson<{ bank: number; max_bank: number; pc_offset: number }>(
      `${API_BASE}/v2/midi/banks/up`,
      { method: 'POST' }
    ),

  bankDown: () =>
    fetchJson<{ bank: number; max_bank: number; pc_offset: number }>(
      `${API_BASE}/v2/midi/banks/down`,
      { method: 'POST' }
    ),

  setBank: (bank: number) =>
    fetchJson<{ bank: number; max_bank: number; pc_offset: number }>(
      `${API_BASE}/v2/midi/banks/set?bank=${bank}`,
      { method: 'POST' }
    ),

  // ========== Expression Pedal Calibration ==========
  getExpressionCalibrations: () =>
    fetchJson<{ calibrations: Record<string, ExpressionCalibration> }>(
      `${API_BASE}/v2/midi/expression/calibration`
    ),

  getExpressionCalibration: (pedalId: string) =>
    fetchJson<ExpressionCalibration>(
      `${API_BASE}/v2/midi/expression/calibration/${pedalId}`
    ),

  updateExpressionCalibration: (params: {
    pedal_id: string;
    min_raw?: number;
    max_raw?: number;
    deadzone_low?: number;
    deadzone_high?: number;
    curve?: MIDIExpressionCurve;
    invert?: boolean;
  }) =>
    fetchJson<{ status: string; calibration: ExpressionCalibration }>(
      `${API_BASE}/v2/midi/expression/calibration`,
      { method: 'POST', body: JSON.stringify(params) }
    ),

  // ========== Firmware Update ==========
  getDFUStatus: () =>
    fetchJson<DFUStatus>(`${API_BASE}/v2/midi/firmware/dfu-status`),

  getDFUInstructions: (profileId: string) =>
    fetchJson<DFUInstructions>(`${API_BASE}/v2/midi/firmware/dfu-instructions/${profileId}`),

  flashFirmware: (profileId: string, firmwarePath: string) =>
    fetchJson<{ success: boolean; message?: string; error?: string; output?: string }>(
      `${API_BASE}/v2/midi/firmware/flash`,
      { method: 'POST', body: JSON.stringify({ profile_id: profileId, firmware_path: firmwarePath }) }
    ),
};

// ==================== IR API ====================

export const irApi = {
  getStatus: () => fetchJson<IRStatus>(`${API_BASE}/ir/`),

  listCabinets: () => fetchJson<IRsResponse>(`${API_BASE}/ir/cabinets`),

  listReverbs: () => fetchJson<IRsResponse>(`${API_BASE}/ir/reverbs`),

  loadCabinet: (irName: string) =>
    fetchJson<{ status: string; ir: string; type: string }>(
      `${API_BASE}/ir/cabinets/${encodeURIComponent(irName)}/load`,
      { method: 'POST' }
    ),

  loadReverb: (irName: string) =>
    fetchJson<{ status: string; ir: string; type: string }>(
      `${API_BASE}/ir/reverbs/${encodeURIComponent(irName)}/load`,
      { method: 'POST' }
    ),

  uploadCabinet: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${API_BASE}/ir/cabinets/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      throw new ApiError(response.status, response.statusText);
    }
    return response.json() as Promise<{ status: string; filename: string; type: string }>;
  },

  uploadReverb: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${API_BASE}/ir/reverbs/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      throw new ApiError(response.status, response.statusText);
    }
    return response.json() as Promise<{ status: string; filename: string; type: string }>;
  },
};

// ==================== IR Library Download API ====================

import type {
  DownloadProgress,
  DownloadRequest,
  IRCategoriesResponse,
  IRDatabaseItem,
  IRDetailedItem,
  IRLibrariesResponse,
  IRListResponse,
  IRSearchRequest,
  IRSearchResponse,
} from '../app/types/library'

export const irLibraryApi = {
  getLibraries: () =>
    fetchJson<IRLibrariesResponse>(`${API_BASE}/irs/libraries/`),

  getCategories: () =>
    fetchJson<IRCategoriesResponse>(`${API_BASE}/irs/categories/`),

  listIRs: (params?: { limit?: number; offset?: number; category?: string; library?: string }) => {
    const query = new URLSearchParams()
    if (params?.limit) query.set('limit', params.limit.toString())
    if (params?.offset) query.set('offset', params.offset.toString())
    if (params?.category) query.set('category', params.category)
    if (params?.library) query.set('library', params.library)
    const queryString = query.toString()
    return fetchJson<IRListResponse>(`${API_BASE}/irs/${queryString ? `?${queryString}` : ''}`)
  },

  getIR: (id: number) =>
    fetchJson<IRDetailedItem>(`${API_BASE}/irs/${id}`),

  search: (request: IRSearchRequest) =>
    fetchJson<IRSearchResponse>(`${API_BASE}/irs/search`, {
      method: 'POST',
      body: JSON.stringify(request),
    }),

  startDownload: (request: DownloadRequest) =>
    fetchJson<{ status: string; sources: string[]; parallel: number; skip_existing: boolean }>(
      `${API_BASE}/irs/download`,
      { method: 'POST', body: JSON.stringify(request) }
    ),

  getDownloadStatus: () =>
    fetchJson<DownloadProgress>(`${API_BASE}/irs/download/status`),

  cancelDownload: () =>
    fetchJson<{ status: string }>(`${API_BASE}/irs/download/cancel`, { method: 'POST' }),

  resetDownload: () =>
    fetchJson<{ status: string }>(`${API_BASE}/irs/download/reset`, { method: 'POST' }),

  retrySource: (source: string) =>
    fetchJson<{ status: string; source: string }>(`${API_BASE}/irs/download/retry/${source}`, { method: 'POST' }),

  toggleFavorite: (id: number) =>
    fetchJson<{ status: string; is_favorite: boolean }>(
      `${API_BASE}/irs/${id}/favorite`,
      { method: 'POST' }
    ),

  setRating: (id: number, rating: number) =>
    fetchJson<{ status: string; rating: number }>(
      `${API_BASE}/irs/${id}/rating`,
      { method: 'PUT', body: JSON.stringify({ rating }) }
    ),

  // TONE3000 API Key Management
  getTone3000Status: () =>
    fetchJson<{ configured: boolean; authenticated: boolean; auth_url: string; token_expires: string | null }>(
      `${API_BASE}/irs/tone3000/status`
    ),

  setTone3000ApiKey: (apiKey: string) =>
    fetchJson<{ status: string; configured: boolean }>(
      `${API_BASE}/irs/tone3000/api-key`,
      { method: 'POST', body: JSON.stringify({ api_key: apiKey }) }
    ),

  testTone3000Auth: () =>
    fetchJson<{ status: string; authenticated: boolean; message?: string; sample_models?: Array<{ name: string; author: string; category: string }> }>(
      `${API_BASE}/irs/tone3000/test`,
      { method: 'POST' }
    ),
}

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

export const namApi = {
  getStatus: () => fetchJson<NAMStatus>(`${API_BASE}/nam/status`),

  getCategories: () => fetchJson<NAMCategoriesResponse>(`${API_BASE}/nam/categories`),

  listModels: (params?: NAMListParams) => {
    const searchParams = new URLSearchParams()
    if (params?.limit) searchParams.set('limit', String(params.limit))
    if (params?.offset) searchParams.set('offset', String(params.offset))
    if (params?.category) searchParams.set('category', params.category)
    if (params?.amp_type) searchParams.set('amp_type', params.amp_type)
    if (params?.favorites_only) searchParams.set('favorites_only', 'true')
    const query = searchParams.toString()
    return fetchJson<NAMModelsResponse>(`${API_BASE}/nam/models${query ? `?${query}` : ''}`)
  },

  getModel: (modelId: number) =>
    fetchJson<NAMModelDetail>(`${API_BASE}/nam/models/${modelId}`),

  search: (request: NAMSearchRequest) =>
    fetchJson<{ results: NAMModelDetail[]; count: number }>(`${API_BASE}/nam/search`, {
      method: 'POST',
      body: JSON.stringify(request),
    }),

  loadModel: (modelName: string) =>
    fetchJson<{ status: string; model: string }>(`${API_BASE}/nam/models/${encodeURIComponent(modelName)}/load`, {
      method: 'POST',
    }),

  activateModel: (modelName: string) =>
    fetchJson<{ status: string; model: string }>(
      `${API_BASE}/nam/models/${encodeURIComponent(modelName)}/activate`,
      { method: 'POST' }
    ),

  toggleFavorite: (modelId: number) =>
    fetchJson<{ status: string; is_favorite: boolean }>(
      `${API_BASE}/nam/models/${modelId}/favorite`,
      { method: 'POST' }
    ),

  setRating: (modelId: number, rating: number) =>
    fetchJson<{ status: string; rating: number }>(
      `${API_BASE}/nam/models/${modelId}/rating`,
      {
        method: 'PUT',
        body: JSON.stringify({ rating }),
      }
    ),

  upload: async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await fetch(`${API_BASE}/nam/upload`, {
      method: 'POST',
      body: formData,
    })
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`)
    }
    return response.json() as Promise<{ status: string; model: { id: number; name: string; file_path: string } }>
  },
};

// ==================== SoundFont API ====================

import type {
  SoundFontListResponse,
  SoundFontLibrariesResponse,
  SoundFontCategoriesResponse,
} from '../app/types/library'

export const soundfontApi = {
  listSoundfonts: (params?: { limit?: number; offset?: number; category?: string; format?: string }) => {
    const query = new URLSearchParams()
    if (params?.limit) query.set('limit', params.limit.toString())
    if (params?.offset) query.set('offset', params.offset.toString())
    if (params?.category) query.set('category', params.category)
    if (params?.format) query.set('format', params.format)
    const queryString = query.toString()
    return fetchJson<SoundFontListResponse>(`${API_BASE}/soundfonts/${queryString ? `?${queryString}` : ''}`)
  },

  getLibraries: () =>
    fetchJson<SoundFontLibrariesResponse>(`${API_BASE}/soundfonts/libraries/`),

  getCategories: () =>
    fetchJson<SoundFontCategoriesResponse>(`${API_BASE}/soundfonts/categories/`),

  startDownload: (request: DownloadRequest) =>
    fetchJson<{ status: string; sources: string[]; parallel: number; skip_existing: boolean }>(
      `${API_BASE}/soundfonts/download`,
      { method: 'POST', body: JSON.stringify(request) }
    ),

  getDownloadStatus: () =>
    fetchJson<DownloadProgress>(`${API_BASE}/soundfonts/download/status`),

  cancelDownload: () =>
    fetchJson<{ status: string }>(`${API_BASE}/soundfonts/download/cancel`, { method: 'POST' }),

  resetDownload: () =>
    fetchJson<{ status: string }>(`${API_BASE}/soundfonts/download/reset`, { method: 'POST' }),

  retrySource: (source: string) =>
    fetchJson<{ status: string; source: string }>(
      `${API_BASE}/soundfonts/download/retry/${encodeURIComponent(source)}`,
      { method: 'POST' }
    ),

  upload: async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await fetch(`${API_BASE}/soundfonts/upload`, {
      method: 'POST',
      body: formData,
    })
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`)
    }
    return response.json() as Promise<{ status: string; filename: string; format: string; path: string }>
  },
};

// ==================== Automation API ====================

export const automationApi = {
  getStatus: () => fetchJson<AutomationStatus>(`${API_BASE}/automation/status`),

  listLanes: () => fetchJson<{ parameters: string[]; count: number }>(`${API_BASE}/automation/lanes`),

  getLane: (parameterId: string) =>
    fetchJson<AutomationLane>(`${API_BASE}/automation/lanes/${encodeURIComponent(parameterId)}`),

  createLane: (lane: {
    parameter_id: string;
    points?: AutomationPoint[];
    enabled?: boolean;
    modulation_source?: string;
    loop_start?: number;
    loop_end?: number;
  }) =>
    fetchJson<{ status: string; message: string }>(`${API_BASE}/automation/lanes`, {
      method: 'POST',
      body: JSON.stringify(lane),
    }),

  deleteLane: (parameterId: string) =>
    fetchJson<{ status: string; message: string }>(
      `${API_BASE}/automation/lanes/${encodeURIComponent(parameterId)}`,
      { method: 'DELETE' }
    ),

  addPoint: (parameterId: string, time: number, value: number, curve: CurveType = 'linear') =>
    fetchJson<{ status: string; message: string }>(`${API_BASE}/automation/points`, {
      method: 'POST',
      body: JSON.stringify({ parameter_id: parameterId, time, value, curve }),
    }),

  removePoint: (parameterId: string, time: number) =>
    fetchJson<{ status: string; message: string }>(`${API_BASE}/automation/points`, {
      method: 'DELETE',
      body: JSON.stringify({ parameter_id: parameterId, time }),
    }),

  configureLFO: (config: LFOConfig) =>
    fetchJson<{ status: string; message: string }>(`${API_BASE}/automation/lfo`, {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  getValue: (parameterId: string, time?: number) => {
    const query = time !== undefined ? `?time=${time}` : '';
    return fetchJson<{ parameter_id: string; value: number; time: number }>(
      `${API_BASE}/automation/value/${encodeURIComponent(parameterId)}${query}`
    );
  },

  controlPlayback: (action: 'start' | 'stop' | 'seek', time?: number) =>
    fetchJson<{ status: string; action: string; is_playing: boolean; current_time: number }>(
      `${API_BASE}/automation/playback`,
      {
        method: 'POST',
        body: JSON.stringify({ action, time }),
      }
    ),

  importAutomation: (data: Record<string, unknown>) =>
    fetchJson<{ status: string; message: string }>(`${API_BASE}/automation/import`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  clearAll: () =>
    fetchJson<{ status: string; message: string }>(`${API_BASE}/automation/clear`, { method: 'POST' }),
};

// ==================== History API ====================

export const historyApi = {
  getStatus: () => fetchJson<HistoryStatus>(`${API_BASE}/history/status`),

  getList: () => fetchJson<{ history: HistoryEntry[]; count: number }>(`${API_BASE}/history/list`),

  undo: () =>
    fetchJson<{ status: string; message: string; can_undo: boolean; can_redo: boolean; next_undo?: string }>(
      `${API_BASE}/history/undo`,
      { method: 'POST' }
    ),

  redo: () =>
    fetchJson<{ status: string; message: string; can_undo: boolean; can_redo: boolean; next_redo?: string }>(
      `${API_BASE}/history/redo`,
      { method: 'POST' }
    ),

  clear: () => fetchJson<{ status: string; message: string }>(`${API_BASE}/history/clear`, { method: 'POST' }),

  getSnapshots: () => fetchJson<{ snapshots: unknown[]; count: number }>(`${API_BASE}/history/snapshots`),

  restoreSnapshot: (index: number) =>
    fetchJson<{ status: string; message: string; state: unknown }>(
      `${API_BASE}/history/snapshots/${index}/restore`,
      { method: 'POST' }
    ),
};

// ==================== Sessions API ====================

export const sessionsApi = {
  list: () => fetchJson<SessionsResponse>(`${API_BASE}/sessions/list`),

  getCurrent: () => fetchJson<Session>(`${API_BASE}/sessions/current`),

  create: (name: string, description?: string, author?: string, tags?: string[]) =>
    fetchJson<{ status: string; message: string; session: Session }>(`${API_BASE}/sessions/create`, {
      method: 'POST',
      body: JSON.stringify({ name, description, author, tags }),
    }),

  save: (sessionData: Record<string, unknown>, createBackup = true) =>
    fetchJson<{ status: string; message: string; path: string }>(`${API_BASE}/sessions/save`, {
      method: 'POST',
      body: JSON.stringify({ session_data: sessionData, create_backup: createBackup }),
    }),

  load: (path: string) =>
    fetchJson<{ status: string; message: string; session: Session }>(
      `${API_BASE}/sessions/load?path=${encodeURIComponent(path)}`
    ),

  delete: (path: string, createBackup = true) =>
    fetchJson<{ status: string; message: string }>(
      `${API_BASE}/sessions/delete?path=${encodeURIComponent(path)}&create_backup=${createBackup}`,
      { method: 'DELETE' }
    ),

  export: (exportPath?: string) => {
    const query = exportPath ? `?export_path=${encodeURIComponent(exportPath)}` : '';
    return fetchJson<{ status: string; message: string; path: string }>(`${API_BASE}/sessions/export${query}`, {
      method: 'POST',
    });
  },

  search: (query?: string, tags?: string[], author?: string) => {
    const params = new URLSearchParams();
    if (query) params.set('query', query);
    if (tags && tags.length > 0) params.set('tags', tags.join(','));
    if (author) params.set('author', author);
    const queryString = params.toString();
    return fetchJson<{ results: SessionListItem[]; count: number }>(
      `${API_BASE}/sessions/search${queryString ? `?${queryString}` : ''}`
    );
  },
};

// ==================== Metrics API ====================

export const metricsApi = {
  getCurrent: () => fetchJson<SystemMetrics>(`${API_BASE}/metrics/current`),

  getSummary: () => fetchJson<MetricsSummary>(`${API_BASE}/metrics/summary`),

  getCpuHistory: (limit = 60) =>
    fetchJson<{ history: MetricsHistory[] }>(`${API_BASE}/metrics/cpu?limit=${limit}`),

  getMemoryHistory: (limit = 60) =>
    fetchJson<{ history: MetricsHistory[] }>(`${API_BASE}/metrics/memory?limit=${limit}`),

  getLatencyHistory: (limit = 60) =>
    fetchJson<{ history: MetricsHistory[] }>(`${API_BASE}/metrics/latency?limit=${limit}`),

  getPrometheus: () => fetchJson<{ metrics: string }>(`${API_BASE}/metrics/prometheus`),

  exportJson: () =>
    fetchJson<{ timestamp: string; current: SystemMetrics; summary: MetricsSummary }>(`${API_BASE}/metrics/export`),

  getJack: () => fetchJson<JackMetrics>(`${API_BASE}/metrics/jack`),

  getJackLatency: () =>
    fetchJson<{ frames: number; milliseconds: number; sample_rate: number; buffer_size: number }>(
      `${API_BASE}/metrics/jack/latency`
    ),
};

// ==================== System API ====================

export const systemApi = {
  restartBackend: () =>
    fetchJson<{ status: string; message: string }>(`${API_BASE}/system/restart-backend`, { method: 'POST' }),

  restartSystem: () =>
    fetchJson<{ status: string; message: string }>(`${API_BASE}/system/restart`, { method: 'POST' }),

  getRealtimeStatus: () => fetchJson<RealtimeStatus>(`${API_BASE}/system/realtime-status`),

  getBrandingStatus: () => fetchJson<BrandingStatus>(`${API_BASE}/system/branding-status`),

  reinstallBranding: () =>
    fetchJson<{ success: boolean; message?: string; results: string[]; errors: string[]; note?: string }>(
      `${API_BASE}/system/reinstall-branding`,
      { method: 'POST' }
    ),
};

// ==================== Health API ====================

export const healthApi = {
  check: () => fetchJson<{ status: string }>(`${API_BASE}/health`),
};

// ==================== Network API ====================

export const networkApi = {
  getStatus: () => fetchJson<NetworkStatus>(`${API_BASE}/network/status`),

  scanWifi: () => fetchJson<{ networks: WiFiNetwork[] }>(`${API_BASE}/network/wifi/scan`),

  connectWifi: (ssid: string, password?: string) =>
    fetchJson<{ status: string; ssid: string }>(`${API_BASE}/network/wifi/connect`, {
      method: 'POST',
      body: JSON.stringify({ ssid, password }),
    }),

  disconnectWifi: (iface: string) =>
    fetchJson<{ status: string; interface: string }>(`${API_BASE}/network/wifi/disconnect/${iface}`, {
      method: 'POST',
    }),

  toggleInterface: (iface: string, enabled: boolean) =>
    fetchJson<{ status: string; interface: string; enabled: boolean }>(
      `${API_BASE}/network/interface/${iface}/toggle?enabled=${enabled}`,
      { method: 'POST' }
    ),

  setDHCP: (iface: string, enabled: boolean) =>
    fetchJson<{ status: string; interface: string; dhcp: boolean }>(
      `${API_BASE}/network/interface/${iface}/dhcp?enabled=${enabled}`,
      { method: 'POST' }
    ),

  setStaticIP: (iface: string, config: IPConfiguration) =>
    fetchJson<{ status: string; interface: string; config: IPConfiguration }>(
      `${API_BASE}/network/interface/${iface}/static`,
      { method: 'POST', body: JSON.stringify(config) }
    ),

  setDNS: (servers: string[]) =>
    fetchJson<{ status: string; dns_servers: string[] }>(`${API_BASE}/network/dns`, {
      method: 'POST',
      body: JSON.stringify({ servers }),
    }),

  serviceAction: (service: string, action: 'start' | 'stop' | 'restart' | 'enable' | 'disable') =>
    fetchJson<{ status: string; service: string; action: string }>(`${API_BASE}/network/service`, {
      method: 'POST',
      body: JSON.stringify({ service, action }),
    }),

  getHostname: () => fetchJson<{ hostname: string }>(`${API_BASE}/network/hostname`),

  setHostname: (hostname: string) =>
    fetchJson<{ status: string; hostname: string }>(`${API_BASE}/network/hostname`, {
      method: 'POST',
      body: JSON.stringify({ hostname }),
    }),
};

// ==================== WWW API ====================

export const wwwApi = {
  getStatus: () => fetchJson<WWWStatus>(`${API_BASE}/www/status`),

  getEndpoints: () => fetchJson<{ endpoints: APIEndpoint[] }>(`${API_BASE}/www/endpoints`),

  getAccessLogs: (limit = 50) => fetchJson<{ logs: AccessLog[] }>(`${API_BASE}/www/logs?limit=${limit}`),

  clearLogs: () => fetchJson<{ status: string }>(`${API_BASE}/www/logs`, { method: 'DELETE' }),

  getWebSocketStats: () => fetchJson<WebSocketStats>(`${API_BASE}/www/websocket/stats`),

  restartService: (service: 'backend' | 'frontend') =>
    fetchJson<{ status: string; service: string }>(`${API_BASE}/www/restart/${service}`, { method: 'POST' }),

  updateConfig: (type: string, config: Record<string, unknown>) =>
    fetchJson<{ status: string; type: string }>(`${API_BASE}/www/config`, {
      method: 'POST',
      body: JSON.stringify({ type, config }),
    }),

  generateApiKey: () => fetchJson<{ status: string; api_key: string }>(`${API_BASE}/www/api-key/generate`, { method: 'POST' }),

  healthCheck: () => fetchJson<{ status: string; backend: boolean; frontend: boolean; timestamp: string }>(`${API_BASE}/www/health`),
};

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

export const servicesApi = {
  getStatus: () => fetchJson<ServicesStatusResponse>(`${API_BASE}/services/status`),

  getServiceStatus: (serviceName: string) =>
    fetchJson<ServiceStatus>(`${API_BASE}/services/status/${serviceName}`),

  getSummary: () => fetchJson<ServicesSummaryResponse>(`${API_BASE}/services/summary`),

  getHealth: () =>
    fetchJson<{ healthy: boolean; orchestrator_running: boolean; uptime_seconds: number; unhealthy_services: unknown[] }>(
      `${API_BASE}/services/health`
    ),

  startAll: () => fetchJson<BulkActionResponse>(`${API_BASE}/services/start-all`, { method: 'POST' }),

  stopAll: () => fetchJson<BulkActionResponse>(`${API_BASE}/services/stop-all`, { method: 'POST' }),

  startService: (serviceName: string) =>
    fetchJson<ServiceActionResponse>(`${API_BASE}/services/start/${serviceName}`, { method: 'POST' }),

  stopService: (serviceName: string) =>
    fetchJson<ServiceActionResponse>(`${API_BASE}/services/stop/${serviceName}`, { method: 'POST' }),

  restartService: (serviceName: string) =>
    fetchJson<ServiceActionResponse>(`${API_BASE}/services/restart/${serviceName}`, { method: 'POST' }),

  listServices: (state?: string, priority?: number) => {
    const params = new URLSearchParams();
    if (state) params.set('state', state);
    if (priority) params.set('priority', priority.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return fetchJson<ServiceStatus[]>(`${API_BASE}/services/list${query}`);
  },

  getDependencies: (serviceName: string) =>
    fetchJson<{ service: string; dependencies: string[]; dependents: string[]; can_stop: boolean; can_start: boolean }>(
      `${API_BASE}/services/dependencies/${serviceName}`
    ),

  getMetrics: () =>
    fetchJson<{ orchestrator: { uptime_seconds: number; running: boolean }; services: Record<string, Record<string, unknown>> }>(
      `${API_BASE}/services/metrics`
    ),

  getStartupOrder: () =>
    fetchJson<{ startup_order: unknown[]; shutdown_order: string[] }>(`${API_BASE}/services/startup-order`),
};

// ==================== PLUGIN PRESETS API ====================

export const pluginPresetsApi = {
  list: (options?: {
    plugin_uri?: string;
    category?: string;
    tags?: string;
    favorites_only?: boolean;
    search?: string;
  }) => {
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
    }>(`${API_BASE}/plugin-presets/${query ? `?${query}` : ''}`);
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

export const foldersApi = {
  getDisplayPaths: () => fetchJson<DisplayPaths>(`${API_BASE}/folders/display-paths`),

  getStorageInfo: () => fetchJson<StorageInfo>(`${API_BASE}/folders/storage-info`),

  getPaths: () =>
    fetchJson<{ nams: string; irs: string; lv2: string }>(`${API_BASE}/folders/paths`),

  getStats: () =>
    fetchJson<{ nams: Record<string, unknown>; irs: Record<string, unknown>; lv2: Record<string, unknown> }>(
      `${API_BASE}/folders/stats`
    ),

  getCounts: () =>
    fetchJson<{
      nams: number;
      irs: { total: number; cabinets: number; reverbs: number; other: number };
      lv2: { system: number; user: number; total: number };
    }>(`${API_BASE}/folders/counts`),

  scan: (scanNams = true, scanIrs = true, scanLv2 = true) =>
    fetchJson<{ status: string; message: string; scan_types: string[] }>(`${API_BASE}/folders/scan`, {
      method: 'POST',
      body: JSON.stringify({ scan_nams: scanNams, scan_irs: scanIrs, scan_lv2: scanLv2 }),
    }),

  scanAll: () =>
    fetchJson<{ status: string; message: string; scan_types: string[] }>(`${API_BASE}/folders/scan/all`, {
      method: 'POST',
    }),

  getScanStatus: () =>
    fetchJson<{ scanning: boolean; message: string }>(`${API_BASE}/folders/scan/status`),

  getNetworkShares: () =>
    fetchJson<{
      smb_enabled: boolean;
      smb_port_445: boolean;
      smb_port_139: boolean;
      local_ip: string;
      shares: Array<{ name: string; path: string; description: string; accessible: boolean; writable: boolean }>;
      access_urls: { windows: string; linux: string; mac: string };
    }>(`${API_BASE}/folders/network-shares`),
};

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

export const uploadApi = {
  /**
   * Upload a single file with optional progress callback
   */
  upload: async (
    file: File,
    assetType?: string,
    onProgress?: (percent: number) => void
  ): Promise<UploadResult> => {
    const formData = new FormData()
    formData.append('file', file)
    if (assetType) {
      formData.append('asset_type', assetType)
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText))
        } else {
          try {
            const errorData = JSON.parse(xhr.responseText)
            reject(new Error(errorData.detail?.message || errorData.detail || 'Upload failed'))
          } catch {
            reject(new Error(xhr.statusText || 'Upload failed'))
          }
        }
      })

      xhr.addEventListener('error', () => reject(new Error('Network error')))
      xhr.addEventListener('abort', () => reject(new Error('Upload aborted')))

      xhr.open('POST', `${API_BASE}/upload/`)
      xhr.send(formData)
    })
  },

  /**
   * Upload multiple files as a batch
   */
  uploadBatch: async (files: File[], assetType?: string): Promise<BatchUploadResult> => {
    const formData = new FormData()
    files.forEach((file) => formData.append('files', file))
    if (assetType) {
      formData.append('asset_type', assetType)
    }

    const response = await fetch(`${API_BASE}/upload/batch`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      throw new ApiError(response.status, response.statusText)
    }

    return response.json()
  },

  /**
   * Validate a file before upload
   */
  validate: async (
    file: File,
    assetType?: string
  ): Promise<{
    valid: boolean
    asset_type: string | null
    message: string
    details: Record<string, unknown>
    requires_type: boolean
  }> => {
    const formData = new FormData()
    formData.append('file', file)
    if (assetType) {
      formData.append('asset_type', assetType)
    }

    const response = await fetch(`${API_BASE}/upload/validate`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      throw new ApiError(response.status, response.statusText)
    }

    return response.json()
  },

  /**
   * Get supported upload types
   */
  getTypes: () =>
    fetchJson<{ types: UploadTypeInfo[] }>(`${API_BASE}/upload/types`),
}

// ==================== Export all APIs ====================

export const map2Api = {
  audio: audioApi,
  chains: chainsApi,
  plugins: pluginsApi,
  presets: presetsApi,
  pluginPresets: pluginPresetsApi,
  midi: midiApi,
  midiV2: midiApiV2,
  ir: irApi,
  irLibrary: irLibraryApi,
  nam: namApi,
  soundfont: soundfontApi,
  automation: automationApi,
  history: historyApi,
  sessions: sessionsApi,
  metrics: metricsApi,
  system: systemApi,
  health: healthApi,
  network: networkApi,
  www: wwwApi,
  services: servicesApi,
  folders: foldersApi,
  upload: uploadApi,
};

export default map2Api;
