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
  serial_number: string | null;
  firmware_version: string | null;
  fault_count: number;
  avb_stream_count: number;
  ptp_state: string | null;
}

export interface TesiraDeviceDetail extends TesiraDeviceSummary {
  hostname: string | null;
  avb_streams: TesiraStreamInfo[];
  ptp_status: TesiraPTPStatus;
  faults: string[];
  presets: TesiraPresetInfo[];
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
  event: 'connected' | 'disconnected' | 'fault' | 'preset_changed';
  detail?: string;
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
