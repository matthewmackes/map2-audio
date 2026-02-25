import { useCallback, useEffect, useRef, useState } from 'react'

import { API_BASE, getWsBaseUrl } from './api'

const MPX1_API_BASE = `${API_BASE}/mpx1`

export type MPX1Block =
  | 'pitch'
  | 'chorus'
  | 'eq'
  | 'mod'
  | 'reverb'
  | 'delay'
  | 'program'
  | 'system'
  | 'global'
  | 'midi'
  | string

export interface MPX1Range {
  min: number
  max: number
}

export interface MPX1RegistryParam {
  id: string
  address_bytes: [number, number, number, number] | number[]
  display_name: string
  block: MPX1Block
  algorithm: string
  type: string
  range: MPX1Range
  default: number
  units: string
  log_taper: boolean
  widget: string
  page: string
  realtime_safe: boolean
  panel_control: string
  source_ref?: string
}

export interface MPX1RegistryCoverage {
  status: string
  algorithm_slot_coverage: Record<string, string>
  known_gaps: string[]
}

export interface MPX1RegistryDocument {
  title: string
  url?: string
  notes?: string
}

export interface MPX1ModifierMatrix {
  sources: string[]
  destinations: string[]
}

export interface MPX1ProgramManagement {
  program_slots: number
  name_length_chars: number
  supports_current_program_dump: boolean
  supports_compact_program_dump: boolean
}

export interface MPX1Registry {
  schema_version: string
  device: {
    manufacturer: string
    model: string
    transport: string
  }
  source_documents: MPX1RegistryDocument[]
  coverage: MPX1RegistryCoverage
  modifier_matrix: MPX1ModifierMatrix
  program_management: MPX1ProgramManagement
  params: MPX1RegistryParam[]
}

export type MPX1Shadow = Record<string, number>

export interface MPX1State {
  connected: boolean
  input_port_index: number | null
  output_port_index: number | null
  current_program: number
  shadow_state_count: number
  pending_realtime_updates: number
  rtmidi_available: boolean
}

export interface MPX1Program {
  program: number
  name: string
  tags: string[]
  active: boolean
}

export interface MPX1LibraryEntry {
  program: number
  name: string
  tags: string[]
  [key: string]: unknown
}

export type MPX1TagAction = 'add' | 'remove'

export interface MPX1MidiPort {
  index: number
  name: string
  connected: boolean
}

export interface MPX1MidiPorts {
  rtmidi_available: boolean
  inputs: MPX1MidiPort[]
  outputs: MPX1MidiPort[]
  recommended_input_index?: number | null
  recommended_output_index?: number | null
}

export interface MPX1MidiConnectRequest {
  input_port_index?: number
  output_port_index?: number
  name_hint?: string
}

export interface MPX1Health {
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
}

export interface MPX1TrafficEvent {
  timestamp: number
  type: string
  hex: string
  param_id?: string
  value?: number
  source?: string
  [key: string]: unknown
}

export interface MPX1Diagnostics {
  traffic: MPX1TrafficEvent[]
  count: number
  packet_error_count: number
  last_heartbeat: number
}

export interface MPX1PingResponse {
  status: string
  latency_ms: number
  param_id: string
  timestamp: number
}

export interface MPX1ParamUpdateRequest {
  param_id: string
  value: number
}

export interface MPX1ParamUpdateResult {
  queued: boolean
  param_id: string
  value: number
}

export interface MPX1ParamUpdateResponse extends MPX1ParamUpdateResult {
  status: string
}

export interface MPX1BulkParamUpdateResponse {
  status: string
  count: number
  results: MPX1ParamUpdateResult[]
}

export interface MPX1ProgramResponse {
  status: string
  program: number
}

export interface MPX1ProgramsResponse {
  programs: MPX1Program[]
  count: number
}

export interface MPX1DumpResponse {
  job_id: string
  status: string
}

export interface MPX1LibraryResponse {
  entries: MPX1LibraryEntry[]
}

export interface MPX1LibraryTagResponse {
  status: string
  program: number
  tags: string[]
}

export interface MPX1MidiConnectResponse {
  status: string
  connected: boolean
  detail?: string
  input_port_index?: number
  output_port_index?: number
}

export type MPX1MidiCurve = 'linear' | 'log' | 'exp' | 's_curve' | 'reverse'
export type MPX1MappingPolarity = 'normal' | 'inverted'
export type MPX1MappingMode = 'continuous' | 'momentary' | 'toggle'

export interface MPX1MidiMapping {
  id: string
  cc: number
  channel: number
  target_param_id: string
  source_min: number
  source_max: number
  target_min: number
  target_max: number
  curve: MPX1MidiCurve
  smoothing_ms: number
  polarity: MPX1MappingPolarity
  mode: MPX1MappingMode
  enabled: boolean
  name?: string
  macro_group?: string
}

export interface MPX1MidiMap {
  id: string
  name: string
  description?: string
  active?: boolean
  mappings: MPX1MidiMapping[]
  created_at?: number
  updated_at?: number
}

export interface MPX1MidiMapsResponse {
  active_map_id: string | null
  learn_target_param_id: string | null
  maps: MPX1MidiMap[]
  count: number
}

export interface MPX1MidiMapSaveResponse {
  status: string
  map: MPX1MidiMap
  active_map_id: string | null
}

export interface MPX1MidiMapDeleteResponse {
  status: string
  removed: number
  active_map_id: string | null
}

export interface MPX1MidiMapActivateResponse {
  status: string
  active_map_id: string
}

export interface MPX1MidiLearnTargetResponse {
  status: string
  learn_target_param_id: string | null
}

export type MPX1WsMessageType =
  | 'mpx1:state'
  | 'mpx1:heartbeat'
  | 'mpx1:param_tx'
  | 'mpx1:param_rx'
  | 'mpx1:program_changed'
  | 'mpx1:dump_progress'
  | 'mpx1:dump_completed'
  | 'mpx1:dump_failed'
  | 'mpx1:library_tag'
  | 'mpx1:midi_connected'
  | string

export interface MPX1WsMessage<T = unknown> {
  type: MPX1WsMessageType
  data?: T
  timestamp?: number | string
}

export type MPX1WsConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'

class Mpx1ApiError extends Error {
  status: number
  statusText: string
  body?: unknown

  constructor(status: number, statusText: string, body?: unknown) {
    super(`MPX1 API Error ${status}: ${statusText}`)
    this.name = 'Mpx1ApiError'
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

async function fetchMpx1Json<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${MPX1_API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!response.ok) {
    let body: unknown
    try {
      const text = await response.text()
      try {
        body = JSON.parse(text)
      } catch {
        body = text
      }
    } catch {
      body = response.statusText
    }
    throw new Mpx1ApiError(response.status, response.statusText, body)
  }

  return response.json() as Promise<T>
}

function buildDefaultShadow(registry: MPX1Registry | null): MPX1Shadow {
  if (!registry) {
    return {}
  }
  const shadow: MPX1Shadow = {}
  for (const param of registry.params) {
    const fallback = typeof param.default === 'number' ? param.default : 0
    shadow[param.id] = fallback
  }
  return shadow
}

function buildWsUrl(): string {
  return `${getWsBaseUrl()}/api/mpx1/ws`
}

export const mpx1Api = {
  wsUrl: buildWsUrl,

  getState: () => fetchMpx1Json<MPX1State>('/state'),

  getRegistry: () => fetchMpx1Json<MPX1Registry>('/registry'),

  setParam: (paramId: string, value: number) =>
    fetchMpx1Json<MPX1ParamUpdateResponse>(`/param/${encodeURIComponent(paramId)}`, {
      method: 'POST',
      body: JSON.stringify({ value }),
    }),

  setParams: (updates: MPX1ParamUpdateRequest[]) =>
    fetchMpx1Json<MPX1BulkParamUpdateResponse>('/params', {
      method: 'POST',
      body: JSON.stringify({ updates }),
    }),

  setProgram: (program: number) =>
    fetchMpx1Json<MPX1ProgramResponse>(`/program/${Math.max(0, Math.floor(program))}`, {
      method: 'POST',
    }),

  getPrograms: () => fetchMpx1Json<MPX1ProgramsResponse>('/programs'),

  dumpAll: () =>
    fetchMpx1Json<MPX1DumpResponse>('/dump/all', {
      method: 'POST',
    }),

  getLibrary: () => fetchMpx1Json<MPX1LibraryResponse>('/library'),

  tagLibrary: (program: number, tag: string, action: MPX1TagAction = 'add') =>
    fetchMpx1Json<MPX1LibraryTagResponse>('/library/tag', {
      method: 'POST',
      body: JSON.stringify({ program, tag, action }),
    }),

  importLibrary: (entries: MPX1LibraryEntry[]) =>
    fetchMpx1Json<{ status: string; entries: MPX1LibraryEntry[]; count: number }>('/library/import', {
      method: 'POST',
      body: JSON.stringify({ entries }),
    }),

  getMidiPorts: () => fetchMpx1Json<MPX1MidiPorts>('/midi/ports'),

  connectMidi: (request: MPX1MidiConnectRequest = {}) =>
    fetchMpx1Json<MPX1MidiConnectResponse>('/midi/connect', {
      method: 'POST',
      body: JSON.stringify(request),
    }),

  disconnectMidi: () =>
    fetchMpx1Json<{ status: string; connected: boolean }>('/midi/disconnect', {
      method: 'POST',
    }),

  getMidiMaps: () => fetchMpx1Json<MPX1MidiMapsResponse>('/midi-maps'),

  saveMidiMap: (midiMap: MPX1MidiMap, makeActive = false) =>
    fetchMpx1Json<MPX1MidiMapSaveResponse>('/midi-maps', {
      method: 'POST',
      body: JSON.stringify({ midi_map: midiMap, make_active: makeActive }),
    }),

  deleteMidiMap: (mapId: string) =>
    fetchMpx1Json<MPX1MidiMapDeleteResponse>(`/midi-maps/${encodeURIComponent(mapId)}`, {
      method: 'DELETE',
    }),

  activateMidiMap: (mapId: string) =>
    fetchMpx1Json<MPX1MidiMapActivateResponse>(`/midi-maps/${encodeURIComponent(mapId)}/activate`, {
      method: 'POST',
    }),

  setMidiLearnTarget: (targetParamId: string | null) =>
    fetchMpx1Json<MPX1MidiLearnTargetResponse>('/midi-maps/learn-target', {
      method: 'POST',
      body: JSON.stringify({ target_param_id: targetParamId }),
    }),

  getDiagnostics: (limit = 100) =>
    fetchMpx1Json<MPX1Diagnostics>(`/diagnostics?limit=${Math.max(1, Math.min(500, Math.floor(limit)))}`),

  pingDiagnostics: () =>
    fetchMpx1Json<MPX1PingResponse>('/diagnostics/ping', {
      method: 'POST',
    }),

  getHealth: () => fetchMpx1Json<MPX1Health>('/health'),
}

export interface UseMPX1StateOptions {
  autoConnectWs?: boolean
  reconnectDelayMs?: number
  maxReconnectAttempts?: number
}

export interface UseMPX1StateResult {
  state: MPX1State | null
  shadow: MPX1Shadow
  registry: MPX1Registry | null
  programs: MPX1Program[]
  wsState: MPX1WsConnectionState
  isConnected: boolean
  lastEvent: MPX1WsMessage | null
  pendingParamIds: string[]
  error: string | null
  refresh: () => Promise<void>
  refreshPrograms: () => Promise<void>
  setParam: (paramId: string, value: number) => Promise<void>
  setParams: (updates: MPX1ParamUpdateRequest[]) => Promise<void>
  setProgram: (program: number) => Promise<void>
  clearError: () => void
}

export function useMPX1State({
  autoConnectWs = true,
  reconnectDelayMs = 1500,
  maxReconnectAttempts = 20,
}: UseMPX1StateOptions = {}): UseMPX1StateResult {
  const [state, setState] = useState<MPX1State | null>(null)
  const [shadow, setShadow] = useState<MPX1Shadow>({})
  const [registry, setRegistry] = useState<MPX1Registry | null>(null)
  const [programs, setPrograms] = useState<MPX1Program[]>([])
  const [wsState, setWsState] = useState<MPX1WsConnectionState>('disconnected')
  const [lastEvent, setLastEvent] = useState<MPX1WsMessage | null>(null)
  const [pendingParamIds, setPendingParamIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const shadowRef = useRef<MPX1Shadow>({})
  const stateRef = useRef<MPX1State | null>(null)

  const updateShadow = useCallback((updater: (prev: MPX1Shadow) => MPX1Shadow) => {
    setShadow((prev) => {
      const next = updater(prev)
      shadowRef.current = next
      return next
    })
  }, [])

  const updateState = useCallback((updater: (prev: MPX1State | null) => MPX1State | null) => {
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
      const payload = await mpx1Api.getPrograms()
      setPrograms(payload.programs)
      setError(null)
    } catch (err) {
      setError(getErrorMessage(err))
      throw err
    }
  }, [])

  const refresh = useCallback(async () => {
    try {
      const [nextState, nextPrograms] = await Promise.all([
        mpx1Api.getState(),
        mpx1Api.getPrograms(),
      ])
      updateState(() => nextState)
      setPrograms(nextPrograms.programs)
      setError(null)
    } catch (err) {
      setError(getErrorMessage(err))
      throw err
    }
  }, [updateState])

  const applyWsEvent = useCallback((event: MPX1WsMessage) => {
    setLastEvent(event)
    const payload = (event.data ?? {}) as Record<string, unknown>

    switch (event.type) {
      case 'mpx1:state': {
        const nextState = payload as unknown as MPX1State
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
      case 'mpx1:param_tx':
      case 'mpx1:param_rx': {
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
      case 'mpx1:program_changed': {
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
          mpx1Api.getState(),
          mpx1Api.getRegistry(),
          mpx1Api.getPrograms(),
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
  }, [updateShadow, updateState])

  useEffect(() => {
    if (!autoConnectWs) {
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
      const ws = new WebSocket(mpx1Api.wsUrl())
      wsRef.current = ws

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0
        setWsState('connected')
      }

      ws.onmessage = (messageEvent: MessageEvent<string>) => {
        try {
          const event = JSON.parse(messageEvent.data) as MPX1WsMessage
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
          wsRef.current.close(1000, 'MPX1 hook cleanup')
        } catch {
          // no-op
        }
      }
      wsRef.current = null
      setWsState('disconnected')
    }
  }, [applyWsEvent, autoConnectWs, maxReconnectAttempts, reconnectDelayMs])

  const setParam = useCallback(async (paramId: string, value: number) => {
    const previousValue = shadowRef.current[paramId]
    updateShadow((prev) => ({ ...prev, [paramId]: value }))
    setPendingParamIds((prev) => (prev.includes(paramId) ? prev : [...prev, paramId]))

    try {
      const result = await mpx1Api.setParam(paramId, value)
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
  }, [removePendingParam, updateShadow])

  const setParams = useCallback(async (updates: MPX1ParamUpdateRequest[]) => {
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
      const response = await mpx1Api.setParams(updates)
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
  }, [updateShadow])

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
      const response = await mpx1Api.setProgram(program)
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
  }, [updateState])

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
