/**
 * T2492-1 — typed client for the device-pack auto-generation routes.
 *
 *   POST /api/midi/devices/auto-generate/lookup
 *   POST /api/midi/devices/auto-generate/synthesize
 *   POST /api/midi/devices/auto-generate/commit
 *   GET  /api/midi/devices/auto-generate/diagnostics
 *
 * See `docs/architecture/DEVICE_PACK_AUTO_GENERATION.md`.
 */

import { fetchJson } from '../http'
import { API_BASE } from '../transport'

export interface DevicePackLookupRequest {
  vid: string
  pid: string
}

export interface DevicePackMixxxMatch {
  vid: string
  pid: string
  device_name: string
  mapping_file: string
  script_files: string[]
  protocol: string
  upstream_commit: string
}

export interface DevicePackUsbIfMatch {
  vid: string
  pid: string | null
  vendor_name: string | null
  product_name: string | null
}

export interface DevicePackLookupResponse {
  vid: string
  pid: string
  mixxx_match: DevicePackMixxxMatch | null
  usbif_match: DevicePackUsbIfMatch | null
}

export type DevicePackOperatorChoice = 'auto' | 'use-mixxx-template' | 'from-scratch'

export interface DevicePackSynthesizeRequest {
  vid: string
  pid: string
  alsa_name?: string
  usb_manufacturer?: string
  usb_product?: string
  operator_choice?: DevicePackOperatorChoice
}

export interface DevicePackSynthesizeResponse {
  manifest_yaml: string
  mapping_xml: string
  scripts_js: string
  suggested_vendor: string
  suggested_model: string
  used_mixxx_template: boolean
  mixxx_template_path: string | null
  mixxx_upstream_commit: string | null
}

export interface DevicePackCommitRequest {
  vendor: string
  model: string
  manifest_yaml: string
  mapping_xml: string
  scripts_js?: string
  overwrite?: boolean
}

export interface DevicePackCommitResponse {
  profile_key: string
  pack_dir: string
  manifest_path: string
  mapping_path: string
  scripts_path: string
}

export interface DevicePackAutoGenDiagnostics {
  mixxx_lookup_entries: number
  usbif_lookup_vendors: number
}

export const devicePackAutoGenApi = {
  lookup: (payload: DevicePackLookupRequest) =>
    fetchJson<DevicePackLookupResponse>(
      `${API_BASE}/midi/devices/auto-generate/lookup`,
      { method: 'POST', body: JSON.stringify(payload) },
    ),

  synthesize: (payload: DevicePackSynthesizeRequest) =>
    fetchJson<DevicePackSynthesizeResponse>(
      `${API_BASE}/midi/devices/auto-generate/synthesize`,
      { method: 'POST', body: JSON.stringify(payload) },
    ),

  commit: (payload: DevicePackCommitRequest) =>
    fetchJson<DevicePackCommitResponse>(
      `${API_BASE}/midi/devices/auto-generate/commit`,
      { method: 'POST', body: JSON.stringify(payload) },
    ),

  diagnostics: () =>
    fetchJson<DevicePackAutoGenDiagnostics>(
      `${API_BASE}/midi/devices/auto-generate/diagnostics`,
    ),
}
