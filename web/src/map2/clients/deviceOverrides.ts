/**
 * Per-device YAML overrides client (T2499 Phase 0.3).
 *
 * The Configurator framework writes non-MIDI bindings (HID, AVDECC)
 * + per-installation device config (firmware mode, calibration,
 * routing) into per-pack YAML override files at
 * `~/.map2/devices/<pack_id>-<slug>.yaml`.
 *
 * Each pack registers an `OverrideStore` against the framework
 * registry. This client is the frontend half of that contract:
 *
 *   GET    /api/devices/configurator/{pack_id}/overrides   → load
 *   PUT    /api/devices/configurator/{pack_id}/overrides   → save
 *   DELETE /api/devices/configurator/{pack_id}/overrides   → delete
 *
 * The backend route validates schema_version and atomic-writes via
 * the existing `YamlOverrideStore`. See
 * `app/services/devices/_shared/override_store.py`.
 */
import { fetchJson } from '../http'
import { API_BASE } from '../transport'

export type DeviceOverridesPayload = Record<string, unknown>

export interface DeviceOverridesResponse {
  pack_id: string
  /** Absolute path on the backend host where the YAML lives. */
  path: string
  /** Decoded YAML payload; null when the file does not exist yet. */
  payload: DeviceOverridesPayload | null
}

export interface DeviceOverridesWriteResponse {
  pack_id: string
  path: string
}

const base = (packId: string) =>
  `${API_BASE}/devices/configurator/${encodeURIComponent(packId)}/overrides`

export const deviceOverridesApi = {
  get: (packId: string) =>
    fetchJson<DeviceOverridesResponse>(base(packId), { cache: 'no-store' }),

  put: (packId: string, payload: DeviceOverridesPayload) =>
    fetchJson<DeviceOverridesWriteResponse>(base(packId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload }),
    }),

  delete: (packId: string) =>
    fetchJson<{ pack_id: string; deleted: boolean }>(base(packId), {
      method: 'DELETE',
    }),
}
