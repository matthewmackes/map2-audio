/**
 * MAP2 Audio Platform - LCD Display API
 * 
 * Comprehensive API for managing dual LCD screens:
 * - Real-time display simulation
 * - Page management
 * - Alert routing configuration
 * - Hardware control & testing
 */

// ============================================================================
// LCD Types
// ============================================================================

export interface LCDStatus {
  running: boolean;
  simulation_mode: boolean;
  current_page: string | null;
  uptime_seconds: number | null;
  hardware: LCDHardware | null;
  statistics: LCDStatistics;
}

export interface LCDHardware {
  displays: LCDDisplayInfo[];
  bus: number;
}

export interface LCDDisplayInfo {
  id: number;
  address: number;
  address_hex: string;
  connected: boolean;
  width: number;
  height: number;
}

export interface LCDStatistics {
  updates: number;
  page_changes: number;
  input_events: number;
  errors: number;
  start_time: string | null;
}

export interface LCDPage {
  id: string;
  name: string;
  description: string;
  icon?: string;
}

export interface LCDSimulation {
  output: string;
  lines: string[];
}

export interface DualLCDSimulation {
  lcd_1: {
    output: string;
    lines: string[];
    address: string;
  };
  lcd_2: {
    output: string;
    lines: string[];
    address: string;
  };
}

export interface I2CDevice {
  address: number;
  address_hex: string;
  device_type: string;
}

export interface I2CScanResult {
  bus: number;
  devices: I2CDevice[];
  lcd_count: number;
}

// FT232H Types
export interface FT232HStatus {
  connected: boolean;
  url: string;
  frequency: number;
  vendor_id: string;
  product_id: string;
  error?: string;
}

export interface FT232HScanResult {
  status: FT232HStatus;
  devices: I2CDevice[];
  lcd_count: number;
}

export interface FT232HWriteRequest {
  address: number;
  line1?: string;
  line2?: string;
  line3?: string;
  line4?: string;
  clear?: boolean;
}

// Alert Types
export type AlertSeverity = 'info' | 'warning' | 'critical' | 'user';

export interface AlertRoutingConfig {
  alert_type: string;
  target_lcd: number;
  duration_seconds: number;
  enabled: boolean;
  priority: number;
  severity: AlertSeverity;
}

export interface LCDPageConfig {
  lcd_id: number;
  default_page: string;
  allow_alert_interrupt: boolean;
  auto_cycle: boolean;
  cycle_interval_seconds: number;
}

export interface AlertConfig {
  routing: Record<string, AlertRoutingConfig>;
  pages: Record<number, LCDPageConfig>;
}

export interface QueuedAlert {
  alert_type: string;
  message: string;
  target_lcd: number;
  duration: number;
  priority: number;
  timestamp: number;
  displayed: boolean;
}

export interface AlertQueueStatus {
  queue_length: number;
  alerts: QueuedAlert[];
}

export interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration_ms: number;
}

export interface TestSuiteResult {
  success: boolean;
  passed: number;
  total: number;
  results: TestResult[];
  simulation_mode: boolean;
}

// Input Actions
export type LCDInputAction = 
  | 'up' | 'down' | 'left' | 'right'
  | 'select' | 'menu' | 'back'
  | 'next_page' | 'prev_page'
  | 'encoder_cw' | 'encoder_ccw' | 'encoder_press';

// ============================================================================
// API Base URL
// ============================================================================

const API_BASE = (() => {
  const envBase = import.meta.env.VITE_API_BASE as string | undefined;
  if (envBase) return envBase.endsWith('/') ? envBase.slice(0, -1) : envBase;

  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const isFrontendPort = window.location.port === '3000';

  if (isLocalhost || isFrontendPort) {
    return '/api';
  }

  return `http://${window.location.hostname}:8080/api`;
})();

// ============================================================================
// Fetch Helpers
// ============================================================================

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API Error ${response.status}: ${response.statusText} - ${body}`);
  }

  return response.json();
}

// ============================================================================
// LCD API
// ============================================================================

export const lcdApi = {
  // Status & Info
  getStatus: () => fetchJson<LCDStatus>(`${API_BASE}/lcd/status`),
  
  getPages: () => fetchJson<{ pages: LCDPage[] }>(`${API_BASE}/lcd/pages`),
  
  getSimulation: () => fetchJson<LCDSimulation>(`${API_BASE}/lcd/simulation`),
  
  getDualSimulation: () => fetchJson<DualLCDSimulation>(`${API_BASE}/lcd/simulation/both`),
  
  // Page Control
  setPage: (page: string) => 
    fetchJson<{ success: boolean; page: string; message: string }>(
      `${API_BASE}/lcd/page`,
      { method: 'POST', body: JSON.stringify({ page }) }
    ),
  
  setLCDPage: (lcdId: number, page: string) =>
    fetchJson<{ success: boolean; lcd_id: number; page: string; message: string }>(
      `${API_BASE}/lcd/${lcdId}/page?page=${page}`,
      { method: 'POST' }
    ),
  
  // Input Simulation
  simulateInput: (action: LCDInputAction) =>
    fetchJson<{ success: boolean; action: string; message: string }>(
      `${API_BASE}/lcd/input/${action}`,
      { method: 'POST' }
    ),
  
  // Hardware Control
  scanI2C: (bus: number = 1) =>
    fetchJson<I2CScanResult>(`${API_BASE}/lcd/scan?bus=${bus}`, { method: 'POST' }),
  
  testDisplay: (lcdId: number) =>
    fetchJson<{ success: boolean; lcd_id: number; message: string; simulation: string }>(
      `${API_BASE}/lcd/test/${lcdId}`,
      { method: 'POST' }
    ),
  
  toggleBacklight: (lcdId: number, enabled: boolean) =>
    fetchJson<{ success: boolean; lcd_id: number; backlight: boolean; message: string }>(
      `${API_BASE}/lcd/backlight/${lcdId}?enabled=${enabled}`,
      { method: 'POST' }
    ),
  
  resetDisplay: (lcdId: number) =>
    fetchJson<{ success: boolean; lcd_id: number; message: string }>(
      `${API_BASE}/lcd/reset/${lcdId}`,
      { method: 'POST' }
    ),
  
  // Custom Messages
  displayMessage: (lcdId: number, line1: string, line2: string = '', duration: number = 5) =>
    fetchJson<{ success: boolean; message: string; lcd_id: number; duration: number }>(
      `${API_BASE}/lcd/message`,
      { method: 'POST', body: JSON.stringify({ lcd_id: lcdId, line1, line2, duration }) }
    ),
  
  // Individual LCD Status
  getLCDStatus: (lcdId: number) =>
    fetchJson<{
      lcd_id: number;
      address: number;
      connected: boolean;
      current_page: string | null;
      statistics: LCDStatistics;
    }>(`${API_BASE}/lcd/${lcdId}/status`),
  
  // Alert Configuration
  getAlertConfig: () => fetchJson<AlertConfig>(`${API_BASE}/lcd/alerts/config`),
  
  updateAlertConfig: (config: Partial<{ routing: Record<string, Partial<AlertRoutingConfig>>; pages: Record<number, Partial<LCDPageConfig>> }>) =>
    fetchJson<{ success: boolean; message: string; config: AlertConfig }>(
      `${API_BASE}/lcd/alerts/config`,
      { method: 'PUT', body: JSON.stringify(config) }
    ),
  
  getActiveAlerts: () => fetchJson<AlertQueueStatus>(`${API_BASE}/lcd/alerts/active`),
  
  // Test Suite
  runTests: (categories?: string[], simulation: boolean = true) =>
    fetchJson<TestSuiteResult>(
      `${API_BASE}/lcd/tests/run`,
      { method: 'POST', body: JSON.stringify({ categories, simulation }) }
    ),
  
  getTestResults: () => 
    fetchJson<{ available: boolean; message?: string; results?: TestResult[] }>(
      `${API_BASE}/lcd/tests/results`
    ),
  
  // Event Triggers
  triggerEvent: (eventType: string, eventData?: Record<string, any>, targetLcd: number = -1) =>
    fetchJson<{ success: boolean; event_type: string; message: string; target_lcd: number }>(
      `${API_BASE}/lcd/events/trigger`,
      { method: 'POST', body: JSON.stringify({ event_type: eventType, event_data: eventData, target_lcd: targetLcd }) }
    ),
  
  // Page Configuration
  getPageConfig: (lcdId: number) =>
    fetchJson<{ lcd_id: number; config: LCDPageConfig }>(`${API_BASE}/lcd/pages/${lcdId}/config`),
  
  updatePageConfig: (lcdId: number, config: Partial<LCDPageConfig>) =>
    fetchJson<{ success: boolean; lcd_id: number; message: string; updates: Partial<LCDPageConfig> }>(
      `${API_BASE}/lcd/pages/${lcdId}/config`,
      { method: 'PUT', body: JSON.stringify(config) }
    ),
  
  // Presets
  getPresets: () =>
    fetchJson<{ presets: Array<{ name: string; description: string; created_at: string }>; count: number }>(
      `${API_BASE}/lcd/presets`
    ),
  
  savePreset: (name: string, description?: string) =>
    fetchJson<{ success: boolean; name: string; message: string }>(
      `${API_BASE}/lcd/presets`,
      { method: 'POST', body: JSON.stringify({ name, description: description || '' }) }
    ),
  
  // FT232H USB-to-I2C
  scanFT232H: () =>
    fetchJson<FT232HScanResult>(`${API_BASE}/lcd/ft232h/scan`, { method: 'POST' }),
  
  writeFT232H: (request: FT232HWriteRequest) =>
    fetchJson<{ success: boolean; message: string }>(
      `${API_BASE}/lcd/ft232h/write`,
      { method: 'POST', body: JSON.stringify(request) }
    ),
  
  testFT232H: (address: number = 0x27) =>
    fetchJson<{ success: boolean; address: string; message: string }>(
      `${API_BASE}/lcd/ft232h/test/${address}`,
      { method: 'POST' }
    ),

  // T2430-G: per-LCD config (Settings sub-view)
  getDisplaysConfig: () =>
    fetchJson<{ displays: LCDDisplayConfig[] }>(`${API_BASE}/lcd/displays-config`),

  updateDisplaysConfig: (displays: LCDDisplayConfig[]) =>
    fetchJson<{ success: boolean; displays: LCDDisplayConfig[] }>(
      `${API_BASE}/lcd/displays-config`,
      { method: 'PUT', body: JSON.stringify({ displays }) },
    ),

  // T2430-F: driver health + reconnect + native raw write
  getDriverHealth: () =>
    fetchJson<{ drivers: DriverHealth[] }>(`${API_BASE}/lcd/health`),

  reconnectDriver: (lcdId: number) =>
    fetchJson<{ success: boolean; lcd_id: number }>(
      `${API_BASE}/lcd/reconnect/${lcdId}`,
      { method: 'POST' },
    ),

  writeNative: (request: { line1: string; line2?: string; line3?: string; line4?: string }) =>
    fetchJson<{ success: boolean; lines: string[] }>(
      `${API_BASE}/lcd/native/write`,
      { method: 'POST', body: JSON.stringify(request) },
    ),
};

export interface LCDDisplayConfig {
  id: number
  address: number
  enabled: boolean
  adapter: 'native-i2c' | 'ft232h' | string
  brightness: number            // 0-255
  contrast: number              // 0-63
  auto_scroll: boolean
  scroll_delay_ms: number
  alert_sound: boolean
  alert_sound_freq_hz: number
  alert_sound_duration_ms: number
  idle_dim_timeout_s: number
  idle_dim_brightness: number
  auto_cycle_enabled: boolean
  auto_cycle_interval_s: number
  default_page: string
}

export const LCD_SNAPSHOT_AWARE_FIELDS: readonly (keyof LCDDisplayConfig)[] = [
  'default_page',
  'auto_cycle_enabled',
  'auto_cycle_interval_s',
  'alert_sound',
  'idle_dim_timeout_s',
] as const

export interface DriverHealth {
  lcd_id: number;
  driver_class: string;
  connected: boolean;
  adapter: 'native-i2c' | 'ft232h' | 'mock' | string;
  address: number | null;
  backlight_level: number | null;
  last_write_ago_s: number | null;
  write_error_count: number;
  is_mock: boolean;
}

export default lcdApi;
