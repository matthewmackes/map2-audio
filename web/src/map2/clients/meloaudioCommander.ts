/**
 * T2459-H3-CFG Phase 5 slice 2 — MeloAudio Commander Configurator API client.
 *
 * Wire shape mirrors `app/routes/devices_meloaudio_commander.py`. The
 * Configurator surface is intentionally separate from the operator runtime
 * surface (`midiCommander.ts`): operators only see Configurator when they
 * navigate to the in-platform tool that provisions the device.
 */

import { fetchJson } from '../http'
import { API_BASE } from '../transport'

const MELOAUDIO_COMMANDER_API_BASE = `${API_BASE}/devices/meloaudio/commander`

export type CommanderFirmwareKind =
  | 'stock'
  | 'custom'
  | 'dfu_bootloader'
  | 'unknown'
  | 'not_present'

export interface CommanderStatusResponse {
  firmware_kind: CommanderFirmwareKind
  is_present: boolean
  supports_discovery_wizard: boolean
  supports_canonical_config_push: boolean
  vendor_id: number | null
  product_id: number | null
  product_string: string | null
  manufacturer_string: string | null
  serial: string | null
  sysfs_path: string | null
  bcd_device: string | null
}

export interface CommanderBindingResponse {
  control: string
  status: string
  midino: number
  channel: number
  raw_value: number | null
}

export interface CommanderOverrideResponse {
  has_override: boolean
  captured_at_utc: string | null
  device_serial: string | null
  notes: string | null
  bindings: CommanderBindingResponse[]
  file_path: string | null
}

export interface BundledFirmwareEntry {
  name: string
  path: string
  size_bytes: number
}

export interface BundledFirmwareResponse {
  has_bundled_firmware: boolean
  firmwares: BundledFirmwareEntry[]
  bundle_dir: string
}

const meloaudioCommanderApi = {
  getStatus: () =>
    fetchJson<CommanderStatusResponse>(`${MELOAUDIO_COMMANDER_API_BASE}/status`, {
      cache: 'no-store',
    }),
  getOverride: () =>
    fetchJson<CommanderOverrideResponse>(
      `${MELOAUDIO_COMMANDER_API_BASE}/override`,
      { cache: 'no-store' },
    ),
  deleteOverride: () =>
    fetch(`${MELOAUDIO_COMMANDER_API_BASE}/override`, { method: 'DELETE' }).then(
      (r) => {
        if (!r.ok && r.status !== 204) {
          throw new Error(`Override delete failed: ${r.status}`)
        }
      },
    ),
  getBundledFirmware: () =>
    fetchJson<BundledFirmwareResponse>(
      `${MELOAUDIO_COMMANDER_API_BASE}/firmware/bundled`,
      { cache: 'no-store' },
    ),
}

export default meloaudioCommanderApi
