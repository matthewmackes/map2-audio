import { useCallback, useEffect, useRef, useState } from 'react'

import { API_BASE, getWsBaseUrl } from './transport'

const INTELFX_API_BASE = `${API_BASE}/intelfx`

export type IntelFXBlock =
  | 'hush'
  | 'compressor'
  | 'wah'
  | 'eq'
  | 'pitch'
  | 'chorus'
  | 'flanger'
  | 'phaser'
  | 'tremolo'
  | 'delay'
  | 'reverb'
  | 'program'
  | 'global'
  | string

export interface IntelFXRange {
  min: number
  max: number
}

export interface IntelFXRegistryParam {
  id: string
  address_bytes: [number, number, number, number] | number[]
  display_name: string
  block: IntelFXBlock
  algorithm: string
  type: string
  range: IntelFXRange
  default: number
  units: string
  log_taper: boolean
  widget: string
  page: string
  realtime_safe: boolean
  panel_control: string
  source_ref?: string
}

export interface IntelFXRegistryCoverage {
  status: string
  algorithm_slot_coverage: Record<string, string>
  known_gaps: string[]
}

export interface IntelFXRegistryDocument {
  title: string
  url?: string
  notes?: string
}

export interface IntelFXProgramManagement {
  program_slots: number
  name_length_chars: number
  supports_current_program_dump: boolean
  supports_compact_program_dump: boolean
}

export interface IntelFXRegistry {
  schema_version: string
  device: {
    manufacturer: string
    model: string
    transport: string
  }
  source_documents: IntelFXRegistryDocument[]
  coverage: IntelFXRegistryCoverage
  program_management: IntelFXProgramManagement
  params: IntelFXRegistryParam[]
}

export type IntelFXShadow = Record<string, number>

export interface IntelFXState {
  connected: boolean
  input_port_index: number | null
  output_port_index: number | null
  current_program: number
  shadow_state_count: number
  pending_realtime_updates: number
  rtmidi_available: boolean
  active_midi_map_id?: string | null
  midi_map_count?: number
  learn_target_param_id?: string | null
  drift_status?: string
  verify_pass?: number
  verify_fail?: number
  writer_client_id?: string | null
  pending_readbacks?: number
  simulator?: boolean
}

export interface IntelFXProgram {
  program: number
  name: string
  tags: string[]
  active: boolean
}

export interface IntelFXLibraryEntry {
  program: number
  name: string
  tags: string[]
  [key: string]: unknown
}

export type IntelFXTagAction = 'add' | 'remove'

export interface IntelFXMidiPort {
  index: number
  name: string
  connected: boolean
}

export interface IntelFXMidiPorts {
  rtmidi_available: boolean
  inputs: IntelFXMidiPort[]
  outputs: IntelFXMidiPort[]
  recommended_input_index?: number | null
  recommended_output_index?: number | null
}

export interface IntelFXMidiConnectRequest {
  input_port_index?: number
  output_port_index?: number
  name_hint?: string
}

export interface IntelFXHealth {
  status: string
  rtmidi_available: boolean
  connected: boolean
  ws_subscribers: number
  coalesce_window_ms: number
  shadow_path: string
  library_path: string
  registry_path: string
  active_dump_jobs?: Array<{
    job_id: string
    status: string
    progress: number
  }>
  packet_error_count?: number
  last_heartbeat?: number
  simulator?: boolean
}

export interface UseIntelFXOverviewStatusOptions {
  nodeId?: string | null
  enabled?: boolean
  pollIntervalMs?: number
}

export interface UseIntelFXOverviewStatusResult {
  state: IntelFXState | null
  error: string | null
  isLoading: boolean
  refresh: () => Promise<void>
}

export interface IntelFXTrafficEvent {
  timestamp: number
  type: string
  hex: string
  param_id?: string
  value?: number
  source?: string
  [key: string]: unknown
}

export interface IntelFXDiagnostics {
  traffic: IntelFXTrafficEvent[]
  count: number
  packet_error_count: number
  last_heartbeat: number
}

export interface IntelFXPingResponse {
  status: string
  latency_ms: number
  param_id: string
  timestamp: number
}

export interface IntelFXParamUpdateRequest {
  param_id: string
  value: number
}

export interface IntelFXParamUpdateResult {
  queued: boolean
  param_id: string
  value: number
}

export interface IntelFXParamUpdateResponse extends IntelFXParamUpdateResult {
  status: string
}

export interface IntelFXBulkParamUpdateResponse {
  status: string
  count: number
  results: IntelFXParamUpdateResult[]
}

export interface IntelFXProgramResponse {
  status: string
  program: number
}

export interface IntelFXProgramsResponse {
  programs: IntelFXProgram[]
  count: number
}

export interface IntelFXDumpResponse {
  job_id: string
  status: string
}

export interface IntelFXLibraryResponse {
  entries: IntelFXLibraryEntry[]
}

export interface IntelFXLibraryTagResponse {
  status: string
  program: number
  tags: string[]
}

export interface IntelFXLibraryImportSyxResponse {
  status: string
  imported?: number
  skipped_duplicates?: number
  total_frames?: number
  [key: string]: unknown
}

export interface IntelFXLibraryVersion {
  version: number
  note?: string
  created_at?: string
  source_program?: number
  [key: string]: unknown
}

export interface IntelFXLibraryVersionsResponse {
  status?: string
  program?: number
  versions: IntelFXLibraryVersion[]
  count?: number
  [key: string]: unknown
}

export interface IntelFXMidiConnectResponse {
  status: string
  connected: boolean
  detail?: string
  input_port_index?: number
  output_port_index?: number
}

export type IntelFXMidiCurve = 'linear' | 'log' | 'exp' | 's_curve' | 'reverse'
export type IntelFXMappingPolarity = 'normal' | 'inverted'
export type IntelFXMappingMode = 'continuous' | 'momentary' | 'toggle'

export interface IntelFXMidiMapping {
  id: string
  cc: number
  channel: number
  target_param_id: string
  source_min: number
  source_max: number
  target_min: number
  target_max: number
  curve: IntelFXMidiCurve
  smoothing_ms: number
  polarity: IntelFXMappingPolarity
  mode: IntelFXMappingMode
  enabled: boolean
  name?: string
  macro_group?: string
}

export interface IntelFXMidiMap {
  id: string
  name: string
  description?: string
  active?: boolean
  mappings: IntelFXMidiMapping[]
  created_at?: number
  updated_at?: number
}

export interface IntelFXMidiMapsResponse {
  active_map_id: string | null
  learn_target_param_id: string | null
  maps: IntelFXMidiMap[]
  count: number
}

export interface IntelFXMidiMapSaveResponse {
  status: string
  map: IntelFXMidiMap
  active_map_id: string | null
}

export interface IntelFXMidiMapDeleteResponse {
  status: string
  removed: number
  active_map_id: string | null
}

export interface IntelFXMidiMapActivateResponse {
  status: string
  active_map_id: string
}

export interface IntelFXMidiLearnTargetResponse {
  status: string
  learn_target_param_id: string | null
}

// ---------------------------------------------------------------------------
// Scenes, Morphing, Setlists
// ---------------------------------------------------------------------------

export interface IntelFXScene {
  id: string
  name: string
  program: number
  param_count: number
  created_at: string
  tags: string[]
}

export interface IntelFXSceneDiff {
  param_id: string
  scene_a: number | null
  scene_b: number | null
}

export interface IntelFXMorphRequest {
  scene_id_a: string
  scene_id_b: string
  duration_sec: number
  curve: 'linear' | 'ease_in' | 'ease_out' | 's_curve'
  beat_sync?: boolean
  bpm?: number
}

export interface IntelFXSong {
  name: string
  scenes: string[]
  footswitch_bindings: Record<string, number>
}

export interface IntelFXSetlist {
  id: string
  name: string
  songs: IntelFXSong[]
}

export type IntelFXWsMessageType =
  | 'intelfx:state'
  | 'intelfx:heartbeat'
  | 'intelfx:param_tx'
  | 'intelfx:param_rx'
  | 'intelfx:program_changed'
  | 'intelfx:dump_progress'
  | 'intelfx:dump_completed'
  | 'intelfx:dump_failed'
  | 'intelfx:library_tag'
  | 'intelfx:midi_connected'
  | 'intelfx:morph_progress'
  | string

export interface IntelFXWsMessage<T = unknown> {
  type: IntelFXWsMessageType
  data?: T
  timestamp?: number | string
}

export type IntelFXWsConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'

class IntelFXApiError extends Error {
  status: number
  statusText: string
  body?: unknown

  constructor(status: number, statusText: string, body?: unknown) {
    super(`IntelFX API Error ${status}: ${statusText}`)
    this.name = 'IntelFXApiError'
    this.status = status
    this.statusText = statusText
    this.body = body
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

function appendNodeQuery(path: string, nodeId?: string | null): string {
  if (!nodeId || nodeId === 'all') {
    return path
  }
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}node_id=${encodeURIComponent(nodeId)}`
}

async function fetchIntelFXJson<T>(path: string, options?: RequestInit, nodeId?: string | null): Promise<T> {
  const response = await fetch(appendNodeQuery(`${INTELFX_API_BASE}${path}`, nodeId), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const body = await readErrorBody(response)
    throw new IntelFXApiError(response.status, response.statusText, body)
  }

  return response.json() as Promise<T>
}

async function readErrorBody(response: Response): Promise<unknown> {
  try {
    const text = await response.text()
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  } catch {
    return response.statusText
  }
}

async function fetchIntelFXBlob(path: string, options?: RequestInit, nodeId?: string | null): Promise<Blob> {
  const response = await fetch(appendNodeQuery(`${INTELFX_API_BASE}${path}`, nodeId), options)
  if (!response.ok) {
    const body = await readErrorBody(response)
    throw new IntelFXApiError(response.status, response.statusText, body)
  }
  return response.blob()
}

function buildDefaultShadow(registry: IntelFXRegistry | null): IntelFXShadow {
  if (!registry) {
    return {}
  }
  const shadow: IntelFXShadow = {}
  for (const param of registry.params) {
    const fallback = typeof param.default === 'number' ? param.default : 0
    shadow[param.id] = fallback
  }
  return shadow
}

function buildWsUrl(nodeId?: string | null): string {
  const base = `${getWsBaseUrl()}/api/intelfx/ws`
  if (!nodeId || nodeId === 'all') {
    return base
  }
  return `${base}?node_id=${encodeURIComponent(nodeId)}`
}

export const intelfxApi = {
  wsUrl: buildWsUrl,

  getState: (nodeId?: string | null) => fetchIntelFXJson<IntelFXState>('/state', undefined, nodeId),

  getRegistry: (nodeId?: string | null) => fetchIntelFXJson<IntelFXRegistry>('/registry', undefined, nodeId),

  setParam: (paramId: string, value: number, nodeId?: string | null) =>
    fetchIntelFXJson<IntelFXParamUpdateResponse>(`/param/${encodeURIComponent(paramId)}`, {
      method: 'POST',
      body: JSON.stringify({ value }),
    }, nodeId),

  setParams: (updates: IntelFXParamUpdateRequest[], nodeId?: string | null) =>
    fetchIntelFXJson<IntelFXBulkParamUpdateResponse>('/params', {
      method: 'POST',
      body: JSON.stringify({ updates }),
    }, nodeId),

  setProgram: (program: number, nodeId?: string | null) =>
    fetchIntelFXJson<IntelFXProgramResponse>(`/program/${Math.max(0, Math.floor(program))}`, {
      method: 'POST',
    }, nodeId),

  getPrograms: (nodeId?: string | null) => fetchIntelFXJson<IntelFXProgramsResponse>('/programs', undefined, nodeId),

  dumpAll: (nodeId?: string | null) =>
    fetchIntelFXJson<IntelFXDumpResponse>('/dump/all', {
      method: 'POST',
    }, nodeId),

  getLibrary: (nodeId?: string | null) => fetchIntelFXJson<IntelFXLibraryResponse>('/library', undefined, nodeId),

  tagLibrary: (program: number, tag: string, action: IntelFXTagAction = 'add', nodeId?: string | null) =>
    fetchIntelFXJson<IntelFXLibraryTagResponse>('/library/tag', {
      method: 'POST',
      body: JSON.stringify({ program, tag, action }),
    }, nodeId),

  importLibrary: (entries: IntelFXLibraryEntry[], nodeId?: string | null) =>
    fetchIntelFXJson<{ status: string; entries: IntelFXLibraryEntry[]; count: number }>('/library/import', {
      method: 'POST',
      body: JSON.stringify({ entries }),
    }, nodeId),

  importSyx: async (file: File, skipDuplicates = true, nodeId?: string | null) => {
    const formData = new FormData()
    formData.append('file', file)
    const path = `/library/import-syx?skip_duplicates=${skipDuplicates ? 'true' : 'false'}`
    const response = await fetch(appendNodeQuery(`${INTELFX_API_BASE}${path}`, nodeId), {
      method: 'POST',
      body: formData,
    })
    if (!response.ok) {
      const body = await readErrorBody(response)
      throw new IntelFXApiError(response.status, response.statusText, body)
    }
    return response.json() as Promise<IntelFXLibraryImportSyxResponse>
  },

  exportBundle: (programs?: number[], nodeId?: string | null) => {
    const query = Array.isArray(programs) && programs.length > 0
      ? `?programs=${programs.map((program) => Math.max(0, Math.floor(program))).join(',')}`
      : ''
    return fetchIntelFXBlob(`/library/export-bundle${query}`, undefined, nodeId)
  },

  savePresetVersion: (program: number, note = '', nodeId?: string | null) =>
    fetchIntelFXJson<{ status?: string; version?: IntelFXLibraryVersion; [key: string]: unknown }>(
      `/library/${Math.max(0, Math.floor(program))}/version`,
      {
        method: 'POST',
        body: JSON.stringify({ note }),
      },
      nodeId
    ),

  listPresetVersions: (program: number, nodeId?: string | null) =>
    fetchIntelFXJson<IntelFXLibraryVersionsResponse>(
      `/library/${Math.max(0, Math.floor(program))}/versions`,
      undefined,
      nodeId
    ),

  revertPresetVersion: (program: number, version: number, nodeId?: string | null) =>
    fetchIntelFXJson<{ status?: string; [key: string]: unknown }>(
      `/library/${Math.max(0, Math.floor(program))}/revert/${Math.max(1, Math.floor(version))}`,
      {
        method: 'POST',
      },
      nodeId
    ),

  auditionProgram: (program: number, nodeId?: string | null) =>
    fetchIntelFXJson<{ status?: string; [key: string]: unknown }>(
      `/library/${Math.max(0, Math.floor(program))}/audition`,
      {
        method: 'POST',
      },
      nodeId
    ),

  auditionRevert: (nodeId?: string | null) =>
    fetchIntelFXJson<{ status?: string; [key: string]: unknown }>(
      '/library/audition/revert',
      {
        method: 'POST',
      },
      nodeId
    ),

  auditionConfirm: (nodeId?: string | null) =>
    fetchIntelFXJson<{ status?: string; [key: string]: unknown }>(
      '/library/audition/confirm',
      {
        method: 'POST',
      },
      nodeId
    ),

  getMidiPorts: (nodeId?: string | null) => fetchIntelFXJson<IntelFXMidiPorts>('/midi/ports', undefined, nodeId),

  connectMidi: (request: IntelFXMidiConnectRequest = {}, nodeId?: string | null) =>
    fetchIntelFXJson<IntelFXMidiConnectResponse>('/midi/connect', {
      method: 'POST',
      body: JSON.stringify(request),
    }, nodeId),

  disconnectMidi: (nodeId?: string | null) =>
    fetchIntelFXJson<{ status: string; connected: boolean }>('/midi/disconnect', {
      method: 'POST',
    }, nodeId),

  getMidiMaps: (nodeId?: string | null) => fetchIntelFXJson<IntelFXMidiMapsResponse>('/midi-maps', undefined, nodeId),

  saveMidiMap: (midiMap: IntelFXMidiMap, makeActive = false, nodeId?: string | null) =>
    fetchIntelFXJson<IntelFXMidiMapSaveResponse>('/midi-maps', {
      method: 'POST',
      body: JSON.stringify({ midi_map: midiMap, make_active: makeActive }),
    }, nodeId),

  deleteMidiMap: (mapId: string, nodeId?: string | null) =>
    fetchIntelFXJson<IntelFXMidiMapDeleteResponse>(`/midi-maps/${encodeURIComponent(mapId)}`, {
      method: 'DELETE',
    }, nodeId),

  activateMidiMap: (mapId: string, nodeId?: string | null) =>
    fetchIntelFXJson<IntelFXMidiMapActivateResponse>(`/midi-maps/${encodeURIComponent(mapId)}/activate`, {
      method: 'POST',
    }, nodeId),

  setMidiLearnTarget: (targetParamId: string | null, nodeId?: string | null) =>
    fetchIntelFXJson<IntelFXMidiLearnTargetResponse>('/midi-maps/learn-target', {
      method: 'POST',
      body: JSON.stringify({ target_param_id: targetParamId }),
    }, nodeId),

  getDiagnostics: (limit = 100, nodeId?: string | null) =>
    fetchIntelFXJson<IntelFXDiagnostics>(`/diagnostics?limit=${Math.max(1, Math.min(500, Math.floor(limit)))}`, undefined, nodeId),

  pingDiagnostics: (nodeId?: string | null) =>
    fetchIntelFXJson<IntelFXPingResponse>('/diagnostics/ping', {
      method: 'POST',
    }, nodeId),

  getHealth: (nodeId?: string | null) => fetchIntelFXJson<IntelFXHealth>('/health', undefined, nodeId),

  // Scenes
  captureScene: (name: string, tags: string[] = [], nodeId?: string | null) =>
    fetchIntelFXJson<IntelFXScene>('/scenes/capture', {
      method: 'POST',
      body: JSON.stringify({ name, tags }),
    }, nodeId),

  listScenes: (nodeId?: string | null) =>
    fetchIntelFXJson<{ scenes: IntelFXScene[]; count: number }>('/scenes', undefined, nodeId),

  updateScene: (id: string, updates: { name?: string; tags?: string[] }, nodeId?: string | null) =>
    fetchIntelFXJson<IntelFXScene>(`/scenes/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }, nodeId),

  deleteScene: (id: string, nodeId?: string | null) =>
    fetchIntelFXJson<{ deleted: string }>(`/scenes/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }, nodeId),

  recallScene: (id: string, nodeId?: string | null) =>
    fetchIntelFXJson<{ status: string; recalled: string; program: number }>(
      `/scenes/${encodeURIComponent(id)}/recall`,
      { method: 'POST' },
      nodeId
    ),

  diffScenes: (idA: string, idB: string, nodeId?: string | null) =>
    fetchIntelFXJson<{ diffs: IntelFXSceneDiff[]; count: number }>(
      `/scenes/${encodeURIComponent(idA)}/diff/${encodeURIComponent(idB)}`,
      undefined,
      nodeId
    ),

  // Morphing
  startMorph: (req: IntelFXMorphRequest, nodeId?: string | null) =>
    fetchIntelFXJson<{ status: string; job_id: string }>('/scenes/morph', {
      method: 'POST',
      body: JSON.stringify(req),
    }, nodeId),

  cancelMorph: (jobId: string, nodeId?: string | null) =>
    fetchIntelFXJson<{ cancelled: boolean; job_id: string }>(
      `/scenes/morph/${encodeURIComponent(jobId)}/cancel`,
      { method: 'POST' },
      nodeId
    ),

  momentaryPress: (sceneId: string, nodeId?: string | null) =>
    fetchIntelFXJson<{ pressed: string }>(`/scenes/${encodeURIComponent(sceneId)}/momentary/press`, {
      method: 'POST',
    }, nodeId),

  momentaryRelease: (sceneId: string, nodeId?: string | null) =>
    fetchIntelFXJson<{ released: string; restored: boolean }>(
      `/scenes/${encodeURIComponent(sceneId)}/momentary/release`,
      { method: 'POST' },
      nodeId
    ),

  // Setlists
  createSetlist: (name: string, nodeId?: string | null) =>
    fetchIntelFXJson<IntelFXSetlist>('/setlists', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }, nodeId),

  listSetlists: (nodeId?: string | null) =>
    fetchIntelFXJson<{ setlists: IntelFXSetlist[]; count: number }>('/setlists', undefined, nodeId),

  updateSetlist: (id: string, updates: { name?: string; songs?: IntelFXSong[] }, nodeId?: string | null) =>
    fetchIntelFXJson<IntelFXSetlist>(`/setlists/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }, nodeId),

  deleteSetlist: (id: string, nodeId?: string | null) =>
    fetchIntelFXJson<{ deleted: string }>(`/setlists/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }, nodeId),
}

export interface UseIntelFXStateOptions {
  autoConnectWs?: boolean
  reconnectDelayMs?: number
  maxReconnectAttempts?: number
  nodeId?: string | null
  pollIntervalMs?: number
}

export function useIntelFXOverviewStatus({
  nodeId,
  enabled = true,
  pollIntervalMs = 15_000,
}: UseIntelFXOverviewStatusOptions = {}): UseIntelFXOverviewStatusResult {
  const [state, setState] = useState<IntelFXState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(enabled)

  const refresh = useCallback(async () => {
    if (!enabled) {
      setState(null)
      setError(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    try {
      const nextState = await intelfxApi.getState(nodeId)
      setState(nextState)
      setError(null)
    } catch (err) {
      setState(null)
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }, [enabled, nodeId])

  useEffect(() => {
    void refresh()

    if (!enabled || pollIntervalMs <= 0) {
      return undefined
    }

    const timer = window.setInterval(() => {
      void refresh()
    }, pollIntervalMs)

    return () => {
      window.clearInterval(timer)
    }
  }, [enabled, pollIntervalMs, refresh])

  return { state, error, isLoading, refresh }
}

export interface UseIntelFXStateResult {
  state: IntelFXState | null
  shadow: IntelFXShadow
  registry: IntelFXRegistry | null
  programs: IntelFXProgram[]
  wsState: IntelFXWsConnectionState
  isConnected: boolean
  lastEvent: IntelFXWsMessage | null
  pendingParamIds: string[]
  error: string | null
  refresh: () => Promise<void>
  refreshPrograms: () => Promise<void>
  setParam: (paramId: string, value: number) => Promise<void>
  setParams: (updates: IntelFXParamUpdateRequest[]) => Promise<void>
  setProgram: (program: number) => Promise<void>
  clearError: () => void
}

export function useIntelFXState({
  autoConnectWs = true,
  reconnectDelayMs = 1500,
  maxReconnectAttempts = 20,
  nodeId,
  pollIntervalMs = 0,
}: UseIntelFXStateOptions = {}): UseIntelFXStateResult {
  const [state, setState] = useState<IntelFXState | null>(null)
  const [shadow, setShadow] = useState<IntelFXShadow>({})
  const [registry, setRegistry] = useState<IntelFXRegistry | null>(null)
  const [programs, setPrograms] = useState<IntelFXProgram[]>([])
  const [wsState, setWsState] = useState<IntelFXWsConnectionState>('disconnected')
  const [lastEvent, setLastEvent] = useState<IntelFXWsMessage | null>(null)
  const [pendingParamIds, setPendingParamIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const shadowRef = useRef<IntelFXShadow>({})
  const stateRef = useRef<IntelFXState | null>(null)

  const updateShadow = useCallback((updater: (prev: IntelFXShadow) => IntelFXShadow) => {
    setShadow((prev) => {
      const next = updater(prev)
      shadowRef.current = next
      return next
    })
  }, [])

  const updateState = useCallback((updater: (prev: IntelFXState | null) => IntelFXState | null) => {
    setState((prev) => {
      const next = updater(prev)
      stateRef.current = next
      return next
    })
  }, [])

  const removePendingParam = useCallback((paramId: string) => {
    setPendingParamIds((prev) => prev.filter((id) => id !== paramId))
  }, [])

  const refreshPrograms = useCallback(async () => {
    try {
      const payload = await intelfxApi.getPrograms(nodeId)
      setPrograms(payload.programs)
      setError(null)
    } catch (err) {
      setError(getErrorMessage(err))
      throw err
    }
  }, [nodeId])

  const refresh = useCallback(async () => {
    try {
      const [nextState, nextPrograms] = await Promise.all([
        intelfxApi.getState(nodeId),
        intelfxApi.getPrograms(nodeId),
      ])
      updateState(() => nextState)
      setPrograms(nextPrograms.programs)
      setError(null)
    } catch (err) {
      setError(getErrorMessage(err))
      throw err
    }
  }, [nodeId, updateState])

  const applyWsEvent = useCallback((event: IntelFXWsMessage) => {
    setLastEvent(event)
    const payload = (event.data ?? {}) as Record<string, unknown>

    switch (event.type) {
      case 'intelfx:state': {
        const nextState = payload as unknown as IntelFXState
        updateState(() => ({
          connected: Boolean(nextState.connected),
          input_port_index: nextState.input_port_index ?? null,
          output_port_index: nextState.output_port_index ?? null,
          current_program: Number.isFinite(nextState.current_program) ? nextState.current_program : 0,
          shadow_state_count: Number.isFinite(nextState.shadow_state_count) ? nextState.shadow_state_count : 0,
          pending_realtime_updates: Number.isFinite(nextState.pending_realtime_updates)
            ? nextState.pending_realtime_updates
            : 0,
          rtmidi_available: Boolean(nextState.rtmidi_available),
        }))
        break
      }
      case 'intelfx:param_tx':
      case 'intelfx:param_rx': {
        const paramId = typeof payload.param_id === 'string' ? payload.param_id : ''
        const value = Number(payload.value)
        if (paramId) {
          if (Number.isFinite(value)) {
            updateShadow((prev) => ({ ...prev, [paramId]: value }))
          }
          removePendingParam(paramId)
        }
        break
      }
      case 'intelfx:program_changed': {
        const program = Number(payload.program)
        if (Number.isFinite(program)) {
          updateState((prev) => {
            if (!prev) {
              return {
                connected: false,
                input_port_index: null,
                output_port_index: null,
                current_program: program,
                shadow_state_count: Object.keys(shadowRef.current).length,
                pending_realtime_updates: 0,
                rtmidi_available: true,
              }
            }
            return { ...prev, current_program: program }
          })
          setPrograms((prev) =>
            prev.map((entry) => ({ ...entry, active: entry.program === program }))
          )
        }
        break
      }
      default:
        break
    }
  }, [removePendingParam, updateShadow, updateState])

  useEffect(() => {
    let cancelled = false

    const bootstrap = async () => {
      try {
        const [nextState, nextRegistry, nextPrograms] = await Promise.all([
          intelfxApi.getState(nodeId),
          intelfxApi.getRegistry(nodeId),
          intelfxApi.getPrograms(nodeId),
        ])
        if (cancelled) {
          return
        }
        updateState(() => nextState)
        setRegistry(nextRegistry)
        setPrograms(nextPrograms.programs)
        updateShadow((prev) => ({ ...buildDefaultShadow(nextRegistry), ...prev }))
        setError(null)
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err))
        }
      }
    }

    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [nodeId, updateShadow, updateState])

  useEffect(() => {
    if (!pollIntervalMs || pollIntervalMs <= 0) {
      return
    }

    const timer = window.setInterval(() => {
      void refresh().catch(() => undefined)
    }, pollIntervalMs)

    return () => window.clearInterval(timer)
  }, [pollIntervalMs, refresh])

  useEffect(() => {
    const allowWebSocket = autoConnectWs && !nodeId
    if (!allowWebSocket) {
      return
    }

    let cancelled = false

    const connect = () => {
      if (cancelled) {
        return
      }
      if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
        return
      }

      setWsState(reconnectAttemptsRef.current > 0 ? 'reconnecting' : 'connecting')
      const ws = new WebSocket(intelfxApi.wsUrl(nodeId))
      wsRef.current = ws

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0
        setWsState('connected')
      }

      ws.onmessage = (messageEvent: MessageEvent<string>) => {
        try {
          const event = JSON.parse(messageEvent.data) as IntelFXWsMessage
          applyWsEvent(event)
        } catch (err) {
          setError(getErrorMessage(err))
        }
      }

      ws.onerror = () => {
        setWsState('error')
      }

      ws.onclose = () => {
        wsRef.current = null
        if (cancelled) {
          setWsState('disconnected')
          return
        }
        if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          setWsState('disconnected')
          return
        }
        reconnectAttemptsRef.current += 1
        setWsState('reconnecting')
        reconnectTimerRef.current = setTimeout(connect, Math.max(150, reconnectDelayMs))
      }
    }

    connect()

    return () => {
      cancelled = true
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      if (wsRef.current) {
        try {
          wsRef.current.close(1000, 'IntelFX hook cleanup')
        } catch {
          // no-op
        }
      }
      wsRef.current = null
      setWsState('disconnected')
    }
  }, [applyWsEvent, autoConnectWs, maxReconnectAttempts, nodeId, reconnectDelayMs])

  const setParam = useCallback(async (paramId: string, value: number) => {
    const previousValue = shadowRef.current[paramId]
    updateShadow((prev) => ({ ...prev, [paramId]: value }))
    setPendingParamIds((prev) => (prev.includes(paramId) ? prev : [...prev, paramId]))

    try {
      const result = await intelfxApi.setParam(paramId, value, nodeId)
      updateShadow((prev) => ({ ...prev, [paramId]: result.value }))
      setError(null)
    } catch (err) {
      if (Number.isFinite(previousValue)) {
        updateShadow((prev) => ({ ...prev, [paramId]: previousValue }))
      }
      const message = getErrorMessage(err)
      setError(message)
      throw err
    } finally {
      removePendingParam(paramId)
    }
  }, [nodeId, removePendingParam, updateShadow])

  const setParams = useCallback(async (updates: IntelFXParamUpdateRequest[]) => {
    const rollbackValues: Record<string, number> = {}
    for (const update of updates) {
      rollbackValues[update.param_id] = shadowRef.current[update.param_id]
    }

    updateShadow((prev) => {
      const next = { ...prev }
      for (const update of updates) {
        next[update.param_id] = update.value
      }
      return next
    })

    setPendingParamIds((prev) => {
      const ids = new Set(prev)
      for (const update of updates) {
        ids.add(update.param_id)
      }
      return Array.from(ids)
    })

    try {
      const response = await intelfxApi.setParams(updates, nodeId)
      updateShadow((prev) => {
        const next = { ...prev }
        for (const item of response.results) {
          next[item.param_id] = item.value
        }
        return next
      })
      setError(null)
    } catch (err) {
      updateShadow((prev) => {
        const next = { ...prev }
        for (const update of updates) {
          const rollback = rollbackValues[update.param_id]
          if (Number.isFinite(rollback)) {
            next[update.param_id] = rollback
          }
        }
        return next
      })
      const message = getErrorMessage(err)
      setError(message)
      throw err
    } finally {
      setPendingParamIds((prev) => prev.filter((id) => !updates.some((update) => update.param_id === id)))
    }
  }, [nodeId, updateShadow])

  const setProgram = useCallback(async (program: number) => {
    const previousProgram = stateRef.current?.current_program ?? 0
    updateState((prev) => {
      if (!prev) {
        return {
          connected: false,
          input_port_index: null,
          output_port_index: null,
          current_program: program,
          shadow_state_count: Object.keys(shadowRef.current).length,
          pending_realtime_updates: 0,
          rtmidi_available: true,
        }
      }
      return { ...prev, current_program: program }
    })

    try {
      const response = await intelfxApi.setProgram(program, nodeId)
      updateState((prev) => {
        if (!prev) {
          return {
            connected: false,
            input_port_index: null,
            output_port_index: null,
            current_program: response.program,
            shadow_state_count: Object.keys(shadowRef.current).length,
            pending_realtime_updates: 0,
            rtmidi_available: true,
          }
        }
        return { ...prev, current_program: response.program }
      })
      setPrograms((prev) => prev.map((entry) => ({ ...entry, active: entry.program === response.program })))
      setError(null)
    } catch (err) {
      updateState((prev) => {
        if (!prev) {
          return prev
        }
        return { ...prev, current_program: previousProgram }
      })
      const message = getErrorMessage(err)
      setError(message)
      throw err
    }
  }, [nodeId, updateState])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    state,
    shadow,
    registry,
    programs,
    wsState,
    isConnected: wsState === 'connected',
    lastEvent,
    pendingParamIds,
    error,
    refresh,
    refreshPrograms,
    setParam,
    setParams,
    setProgram,
    clearError,
  }
}
