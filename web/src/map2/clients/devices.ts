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

// ---------------------------------------------------------------------------
// T2459-C4 — Mixxx XML import + export.
// ---------------------------------------------------------------------------

export interface MixxxParseStats {
  total_controls: number
  resolved_controls: number
  skipped_controls: number
  skip_reasons: string[]
}

export interface MixxxImportResponse {
  pack_id: string
  model: string
  kind: 'midi'
  controls: Array<{
    status: number | null
    midino: number | null
    channel: number | null
    target: string | null
    action: string | null
    script: string | null
    fast_path: boolean
    description: string
    mixxx_group?: string
    mixxx_key?: string
  }>
  outputs: Array<Record<string, unknown>>
  scripts: string[]
  mixxx_alias_table: Record<string, string>
  stats: MixxxParseStats
}

export async function importMixxxXml(req: {
  pack_id: string
  xml_body: string
  alias_table?: Record<string, string>
}): Promise<MixxxImportResponse> {
  return fetchJson(`${API_BASE}/api/devices/mixxx/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
}

export async function exportMixxxXml(req: {
  pack_id: string
  model: string
}): Promise<{ xml_body: string }> {
  return fetchJson(
    `${API_BASE}/api/devices/mixxx/export/${encodeURIComponent(req.pack_id)}/${encodeURIComponent(req.model)}`,
  )
}

// ---------------------------------------------------------------------------
// T2459-D4 — MIDI learn wizard
// ---------------------------------------------------------------------------

export interface LearnClassification {
  session_id: string
  kind: 'unknown' | 'button' | 'knob_absolute' | 'knob_relative' | 'encoder_14bit' | 'pitch_bend'
  confidence: number
  status: number | null
  midino: number | null
  channel: number | null
  notes: string
}

export async function learnStart(req: {
  controller_key: string
  pack_id: string
  model: string
}): Promise<{ session_id: string }> {
  return fetchJson(`${API_BASE}/api/devices/learn/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
}

export async function learnCapture(req: {
  session_id: string
  bytes: number[]
  timestamp_ns?: number
}): Promise<LearnClassification> {
  return fetchJson(`${API_BASE}/api/devices/learn/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...req, timestamp_ns: req.timestamp_ns ?? 0 }),
  })
}

export async function learnAssign(req: {
  session_id: string
  target?: string
  script?: string
  action?: string
  fast_path?: boolean
}): Promise<{ session_id: string; row: Record<string, unknown> }> {
  return fetchJson(`${API_BASE}/api/devices/learn/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
}

export async function learnCancel(sessionId: string): Promise<{
  session_id: string
  cancelled: boolean
}> {
  return fetchJson(
    `${API_BASE}/api/devices/learn/cancel/${encodeURIComponent(sessionId)}`,
    { method: 'POST' },
  )
}

// ---------------------------------------------------------------------------
// T2459-E4 — Measure latency
// ---------------------------------------------------------------------------

export interface MeasureLatencyTrial {
  rtt_ms: number
  peak_correlation: number
  secondary_peak_ratio: number
}

export interface MeasureLatencyResult {
  timestamp: string
  pack_id: string
  model: string
  method: 'jack' | 'synthetic'
  sample_rate: number
  duration_ms: number
  tail_ms: number
  trials: MeasureLatencyTrial[]
  mean_rtt_ms: number
  p95_rtt_ms: number
  jitter_p95_ms: number
  notes: string
  loopback_ports: { playback: string; capture: string }
  evidence_path: string
}

export async function measureLatency(req: {
  pack_id: string
  model: string
  trials?: number
  duration_ms?: number
  tail_ms?: number
}): Promise<MeasureLatencyResult> {
  return fetchJson(`${API_BASE}/api/devices/measure-latency`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
}
