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
  /** T2461-A7 — capability strings declared by the profile YAML. */
  capabilities?: string[]
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

// T2459-G6 — history of prior IR loopback measurements for one device.
export interface MeasureLatencyHistoryRow {
  evidence_path: string
  timestamp: string | null
  method: 'jack' | 'synthetic' | null
  mean_rtt_ms: number | null
  p95_rtt_ms: number | null
  jitter_p95_ms: number | null
  trial_count: number
}

export async function listMeasureLatencyHistory(
  packId: string,
  model: string,
  limit = 20,
): Promise<{ history: MeasureLatencyHistoryRow[]; count: number }> {
  const url = new URL(`${API_BASE}/api/devices/measure-latency/history`)
  url.searchParams.set('pack_id', packId)
  url.searchParams.set('model', model)
  url.searchParams.set('limit', String(limit))
  return fetchJson(url.toString())
}

// ---------------------------------------------------------------------------
// T2459-G1 / G2 — Hardware Store endpoints
// ---------------------------------------------------------------------------

export interface ConnectionRecord {
  pack_id: string
  model: string
  kind: 'audio' | 'midi' | 'hid'
  profile_key: string
  matched_sources: string[]
  evidence: Record<string, unknown>
  detected_at: number
}

export interface DetectionSnapshot {
  records: ConnectionRecord[]
  sources_attempted: string[]
  sources_failed: string[]
  snapshot_at: number
}

export interface ConnectedResponse {
  snapshot: DetectionSnapshot
  count: number
}

export interface KnownDeviceRow {
  profile_key: string
  is_pinned: boolean
  last_seen_at: number | null
  /** T2461-A3 — timestamp of the most recent binding save through the
   *  bindings_writer or the MIDI Assignments wizard. */
  last_bound_at?: number | null
}

export interface RecentlyDisconnectedRow {
  profile_key: string
  last_seen_at: number | null
}

export interface DiagnosticEntry {
  severity: 'info' | 'warning' | 'error'
  source: string
  code: string
  detail: string
  pack_id?: string
  file?: string
  ts: number
  pid?: number | null
  restart_count?: number
  crashes_in_window?: number
}

export interface DiagnosticsResponse {
  diagnostics: DiagnosticEntry[]
  count: number
  counts_by_severity: { info: number; warning: number; error: number }
}

export interface PackSourceRow {
  pack_id: string
  vendor: string
  source: 'shipped' | 'user' | 'imported'
  path: string
  is_degraded: boolean
  degraded_files: string[]
  model_count: number
  profile_count: number
}

export async function listConnectedDevices(): Promise<ConnectedResponse> {
  return fetchJson(`${API_BASE}/api/devices/connected`)
}

export async function listRecentlyDisconnected(): Promise<{
  recently_disconnected: RecentlyDisconnectedRow[]
  count: number
}> {
  return fetchJson(`${API_BASE}/api/devices/recently-disconnected`)
}

export async function listKnownDevices(): Promise<{
  known: KnownDeviceRow[]
  count: number
}> {
  return fetchJson(`${API_BASE}/api/devices/known`)
}

export async function pinDeviceProfile(profileKey: string): Promise<{
  profile_key: string
  pinned: boolean
  newly_added: boolean
}> {
  return fetchJson(`${API_BASE}/api/devices/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile_key: profileKey }),
  })
}

export async function unpinDeviceProfile(profileKey: string): Promise<{
  profile_key: string
  pinned: boolean
  newly_removed: boolean
}> {
  return fetchJson(`${API_BASE}/api/devices/unpin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile_key: profileKey }),
  })
}

export async function listDeviceDiagnostics(opts?: {
  severity?: 'info' | 'warning' | 'error'
  source?: string
}): Promise<DiagnosticsResponse> {
  const url = new URL(`${API_BASE}/api/devices/diagnostics`)
  if (opts?.severity) url.searchParams.set('severity', opts.severity)
  if (opts?.source) url.searchParams.set('source', opts.source)
  return fetchJson(url.toString())
}

export async function listPackSources(): Promise<{
  sources: PackSourceRow[]
  count: number
}> {
  return fetchJson(`${API_BASE}/api/devices/packs/sources`)
}

// T2461-A9 — snapshot of bench device state at save time
export interface DeviceSnapshotKeys {
  connected: string[]
  recently_disconnected: string[]
  pinned: string[]
  snapshot_at: number
}

export async function getDeviceSnapshotKeys(): Promise<DeviceSnapshotKeys> {
  return fetchJson(`${API_BASE}/api/devices/snapshot-keys`)
}

// T2461-A5 — Brain monitor candidates: connected devices that declare
// loopback_ports + their most-recent measure-latency stats.
export interface BrainMonitorMeasurement {
  timestamp: string | null
  method: 'jack' | 'synthetic' | null
  mean_rtt_ms: number | null
  p95_rtt_ms: number | null
  jitter_p95_ms: number | null
}

export interface BrainMonitorCandidate {
  profile_key: string
  pack_id: string
  model: string
  vendor: string | null
  loopback_ports: { playback: string; capture: string }
  latest_measurement: BrainMonitorMeasurement | null
}

export async function listBrainMonitorCandidates(): Promise<{
  candidates: BrainMonitorCandidate[]
  count: number
}> {
  return fetchJson(`${API_BASE}/api/devices/brain-monitor-candidates`)
}

// T2459-G7 — bindings write + Undo
export interface BindingControlRow {
  status?: number | string
  midino?: number | string
  channel?: number | string
  target?: string
  action?: string
  script?: string
  fast_path?: boolean
  description?: string
  [key: string]: unknown
}

export interface BindingsWriteResponse {
  revision: string
  undo_token: string
  profile_key: string
  bytes_written: number
}

export interface BindingsUndoResponse {
  revision: string
  profile_key?: string
  profile_key_from_token?: string
  expected?: string
  bytes_written: number
}

export async function postBindings(
  packId: string, model: string, kind: 'midi' | 'hid',
  payload: { controls?: BindingControlRow[]; outputs?: BindingControlRow[] },
): Promise<BindingsWriteResponse> {
  return fetchJson(
    `${API_BASE}/api/devices/profiles/${encodeURIComponent(packId)}/${encodeURIComponent(model)}/${kind}/bindings`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  )
}

export async function undoBindings(
  packId: string, model: string, kind: 'midi' | 'hid',
  undoToken: string,
): Promise<BindingsUndoResponse> {
  return fetchJson(
    `${API_BASE}/api/devices/profiles/${encodeURIComponent(packId)}/${encodeURIComponent(model)}/${kind}/bindings/undo`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ undo_token: undoToken }),
    },
  )
}

// T2459-G9 — Pack Sources admin: Mixxx imports checksum integrity
export interface MixxxChecksumDriftRow {
  path: string
  kind: 'modified' | 'missing' | 'untracked'
  expected_sha256?: string
  actual_sha256?: string
}

export interface MixxxChecksumStatus {
  present: boolean
  files_checked: number
  drift: MixxxChecksumDriftRow[]
  checksums_path?: string
  note?: string
}

export async function getMixxxChecksumStatus(): Promise<MixxxChecksumStatus> {
  return fetchJson(`${API_BASE}/api/devices/sources/mixxx-checksums`)
}

// SSE-friendly URL builder; the EventSource consumer in the admin
// tab opens it directly.
export function syncMixxxStreamUrl(): string {
  return `${API_BASE}/api/devices/sources/sync-mixxx`
}

// T2461-A8 — Mixxx alias resolver. Wizard target step posts a
// (group, key) shorthand and gets back the MAP2 target string.
export interface MixxxAliasResolveResult {
  resolved: boolean
  target?: string
  alias_table_used?: boolean
  reason?: string
}

export async function resolveMixxxAlias(
  packId: string, model: string, kind: 'midi' | 'hid',
  group: string, key: string,
): Promise<MixxxAliasResolveResult> {
  return fetchJson(
    `${API_BASE}/api/devices/profiles/${encodeURIComponent(packId)}/${encodeURIComponent(model)}/${kind}/resolve-alias`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group, key }),
    },
  )
}
