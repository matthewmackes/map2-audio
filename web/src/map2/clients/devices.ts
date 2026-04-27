// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// API client for the controller / mapping / device-pack subsystem.
// Worklist: T2459-C1
// Backend routes: app/routes/devices.py (T2459-A3).

import { fetchJson } from '../http'
import { API_BASE } from '../transport'

// ---------------------------------------------------------------------------
// Schema types — mirror app/services/controllers/profile_registry.py and
// app/services/controllers/controller_service.py
// ---------------------------------------------------------------------------

export interface DevicePackSummary {
  pack_id: string
  vendor_name: string
  models: string[]
  profile_count: number
  is_degraded: boolean
  degraded_files: string[]
  path: string
  manifest: Record<string, unknown>
}

export interface DeviceProfileSummary {
  pack_id: string
  model: string
  kind: 'audio' | 'midi' | 'hid'
  path: string
  hardware_id: string | null
  alsa_card_regex?: string | null
  alsa_client_pattern?: string | null
}

export interface DeviceProfileDetail extends DeviceProfileSummary {
  document: Record<string, unknown>
}

export interface ActiveMappingSummary {
  controller_key: string
  pack_id: string
  model: string
  kind: string
  control_count: number
  output_count: number
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export async function listDevicePacks(): Promise<{ packs: DevicePackSummary[]; count: number }> {
  return fetchJson(`${API_BASE}/api/devices/packs`)
}

export async function listDeviceProfiles(
  kind?: 'audio' | 'midi' | 'hid',
): Promise<{ profiles: DeviceProfileSummary[]; count: number }> {
  const url = new URL(`${API_BASE}/api/devices/profiles`)
  if (kind) url.searchParams.set('kind', kind)
  return fetchJson(url.toString())
}

export async function getDeviceProfile(
  packId: string,
  model: string,
  kind: 'audio' | 'midi' | 'hid',
): Promise<{ profile: DeviceProfileDetail }> {
  return fetchJson(
    `${API_BASE}/api/devices/profiles/${encodeURIComponent(packId)}/${encodeURIComponent(model)}/${kind}`,
  )
}

export async function reloadDevicePack(packId: string): Promise<{ reloaded: string }> {
  return fetchJson(`${API_BASE}/api/devices/profiles/reload/${encodeURIComponent(packId)}`, {
    method: 'POST',
  })
}

export async function listActiveMappings(): Promise<{
  active_mappings: ActiveMappingSummary[]
  count: number
}> {
  return fetchJson(`${API_BASE}/api/devices/mappings`)
}

export async function assignMapping(req: {
  controller_key: string
  pack_id: string
  model: string
  kind: 'midi' | 'hid'
}): Promise<{
  assigned: boolean
  controller_key: string
  pack_id: string
  model: string
  kind: string
  control_count: number
}> {
  return fetchJson(`${API_BASE}/api/devices/mappings/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
}

export async function clearMapping(controllerKey: string): Promise<{ cleared: string }> {
  return fetchJson(`${API_BASE}/api/devices/mappings/clear`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ controller_key: controllerKey }),
  })
}
