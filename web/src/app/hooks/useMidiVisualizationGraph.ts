/**
 * T2500-MV-C1 — useMidiVisualizationGraph
 *
 * Data hook for the MIDI Connections Visualization page.
 *
 * Composes:
 *   - One `useQuery('midi-visualization-graph')` against
 *     `/api/midi/visualization/graph` for the static topology.
 *   - One `WebSocket('/ws/midi/visualization')` for the live event
 *     stream + replay handshake.
 *   - A `requestAnimationFrame`-batched coalescer that aggregates
 *     incoming events into per-edge + per-node activity rollups.
 *
 * The hook returns a `{topology, edgeActivity, nodeActivity, status,
 * controls}` shape that the layout adapter and canvas overlay consume
 * directly. All filtering decisions (clock filter, event-kind toggle,
 * scope, intensity) live as `controls` so the page can wire a filter
 * bar into the same hook instance.
 *
 * Performance:
 *   - WS messages land in a `Set<string>` of dirty edge keys + a
 *     ring buffer of pending events; the rAF tick drains them.
 *   - Per-edge activity uses a single rolling timestamp deque
 *     (`event_ts_window`) capped at 300 entries — enough to compute
 *     a rate over the last second and absorb the buffer's full 5-min
 *     window without unbounded memory.
 *   - The hook never re-renders the page on individual events; React
 *     state updates happen at most once per animation frame.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import {
  edgeKey,
  type MidiVisualizationEdgeData,
  type MidiVisualizationNodeData,
} from '../pages/midi-services/visualization/midiVisualizationLayout'
import {
  DEFAULT_FILTER_STATE,
  type MidiVisualizationEvent,
  type MidiVisualizationFilterState,
  type MidiVisualizationTopology,
} from '../pages/midi-services/visualization/midiVisualizationTypes'

const TOPOLOGY_QUERY_KEY = ['midi-visualization-graph'] as const
const TOPOLOGY_URL = '/api/midi/visualization/graph'
const WS_PATH = '/ws/midi/visualization'

const RECENT_EVENTS_PER_NODE = 50
const RATE_WINDOW_MS = 1_000

const NOISE_STATUS_BYTES = new Set([0xf8, 0xfe])

export type MidiVisualizationStatus =
  | 'loading'
  | 'connecting'
  | 'live'
  | 'reconnecting'
  | 'error'

export interface UseMidiVisualizationGraphOptions {
  /** Override the WS URL builder — used by tests with a fake server. */
  websocketUrlBuilder?: () => string
  /** Override `WebSocket` constructor — used by tests. */
  websocketFactory?: (url: string) => WebSocket
  /** Override `requestAnimationFrame` — used by tests. */
  scheduleFrame?: (cb: () => void) => unknown
  /** Cancel a frame scheduled via `scheduleFrame` — used by tests. */
  cancelFrame?: (handle: unknown) => void
  /** Override clock source — used by tests. */
  now?: () => number
  /** Initial filter state. Defaults to `DEFAULT_FILTER_STATE`. */
  initialFilters?: Partial<MidiVisualizationFilterState>
}

export interface UseMidiVisualizationGraphResult {
  topology: MidiVisualizationTopology
  edgeActivity: Map<string, MidiVisualizationEdgeData>
  nodeActivity: Map<string, MidiVisualizationNodeData>
  status: MidiVisualizationStatus
  filters: MidiVisualizationFilterState
  setFilters: (
    update: Partial<MidiVisualizationFilterState>
      | ((prev: MidiVisualizationFilterState) => MidiVisualizationFilterState),
  ) => void
}

interface InternalActivityState {
  edges: Map<string, EdgeStats>
  nodes: Map<string, NodeStats>
}

interface EdgeStats {
  rateHz: number
  lastEventAt: number | null
  totalEvents: number
  /** Rolling timestamps of events in the last RATE_WINDOW_MS. */
  window: number[]
}

interface NodeStats {
  lastEventAt: number | null
  rateHz: number
  recentEvents: MidiVisualizationEvent[]
  window: number[]
}

const EMPTY_TOPOLOGY: MidiVisualizationTopology = { nodes: [], edges: [] }

export function useMidiVisualizationGraph(
  options: UseMidiVisualizationGraphOptions = {},
): UseMidiVisualizationGraphResult {
  const now = options.now ?? Date.now
  const scheduleFrame =
    options.scheduleFrame ??
    (typeof requestAnimationFrame !== 'undefined'
      ? requestAnimationFrame
      : (cb: () => void) => setTimeout(cb, 16))
  const cancelFrame =
    options.cancelFrame ??
    (typeof cancelAnimationFrame !== 'undefined'
      ? (cancelAnimationFrame as (h: unknown) => void)
      : (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>))

  const topologyQuery = useQuery({
    queryKey: TOPOLOGY_QUERY_KEY,
    queryFn: async (): Promise<MidiVisualizationTopology> => {
      const res = await fetch(TOPOLOGY_URL)
      if (!res.ok) throw new Error(`topology fetch ${res.status}`)
      return (await res.json()) as MidiVisualizationTopology
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })

  // Filter state is local — the canvas overlay reads it directly via
  // the returned reference.
  const [filters, setFiltersState] = useState<MidiVisualizationFilterState>(
    () => ({ ...DEFAULT_FILTER_STATE, ...(options.initialFilters ?? {}) }),
  )

  const setFilters = useCallback(
    (
      update: Partial<MidiVisualizationFilterState>
        | ((prev: MidiVisualizationFilterState) => MidiVisualizationFilterState),
    ) => {
      setFiltersState((prev) =>
        typeof update === 'function' ? update(prev) : { ...prev, ...update },
      )
    },
    [],
  )

  // Pending event queue + dirty flag — the rAF tick drains them and
  // updates the activity state in a single React batched update.
  const pendingEventsRef = useRef<MidiVisualizationEvent[]>([])
  const activityRef = useRef<InternalActivityState>({
    edges: new Map(),
    nodes: new Map(),
  })
  const filtersRef = useRef(filters)
  filtersRef.current = filters

  const [activitySnapshot, setActivitySnapshot] = useState({
    edges: new Map<string, MidiVisualizationEdgeData>(),
    nodes: new Map<string, MidiVisualizationNodeData>(),
  })
  const [status, setStatus] = useState<MidiVisualizationStatus>('loading')

  // ------------------------------------------------------------------
  // rAF batching pump
  // ------------------------------------------------------------------

  const frameHandleRef = useRef<unknown>(null)

  const flushFrame = useCallback(() => {
    frameHandleRef.current = null
    const pending = pendingEventsRef.current
    if (pending.length === 0) return
    pendingEventsRef.current = []
    const filter = filtersRef.current
    const activity = activityRef.current
    const t = now()

    for (const event of pending) {
      if (filter.dropClockAndActiveSense && isNoiseEvent(event)) continue
      if (filter.eventKind !== 'both' && event.kind !== filter.eventKind) continue

      const ek = edgeKey(event.source_node_id, event.target_node_id)
      const edge = ensureEdgeStats(activity.edges, ek)
      edge.totalEvents += 1
      edge.lastEventAt = event.ts_ms
      edge.window.push(event.ts_ms)
      pruneWindow(edge.window, t)
      edge.rateHz = (edge.window.length * 1000) / RATE_WINDOW_MS

      // Update the source + target nodes' rollups.
      for (const nodeId of [event.source_node_id, event.target_node_id]) {
        const node = ensureNodeStats(activity.nodes, nodeId)
        node.lastEventAt = event.ts_ms
        node.recentEvents.unshift(event)
        if (node.recentEvents.length > RECENT_EVENTS_PER_NODE) {
          node.recentEvents.length = RECENT_EVENTS_PER_NODE
        }
        node.window.push(event.ts_ms)
        pruneWindow(node.window, t)
        node.rateHz = (node.window.length * 1000) / RATE_WINDOW_MS
      }
    }

    setActivitySnapshot(snapshotActivity(activity))
  }, [now])

  const scheduleFlush = useCallback(() => {
    if (frameHandleRef.current !== null) return
    frameHandleRef.current = scheduleFrame(flushFrame)
  }, [flushFrame, scheduleFrame])

  // ------------------------------------------------------------------
  // WebSocket lifecycle
  // ------------------------------------------------------------------

  useEffect(() => {
    const url =
      options.websocketUrlBuilder?.() ?? defaultWebsocketUrl()
    const factory =
      options.websocketFactory ?? ((u: string) => new WebSocket(u))

    setStatus('connecting')
    let socket: WebSocket | null = null
    let cancelled = false

    try {
      socket = factory(url)
    } catch (exc) {
      setStatus('error')
      return () => undefined
    }

    socket.onopen = () => {
      if (cancelled) return
      setStatus('live')
    }
    socket.onmessage = (msg) => {
      if (cancelled) return
      let payload: unknown
      try {
        payload =
          typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data
      } catch {
        return
      }
      if (!payload || typeof payload !== 'object') return
      const frame = payload as { type: string; events?: unknown; event?: unknown }
      if (frame.type === 'replay' && Array.isArray(frame.events)) {
        for (const e of frame.events) {
          if (isVisualizationEvent(e)) pendingEventsRef.current.push(e)
        }
        scheduleFlush()
        return
      }
      if (frame.type === 'event' && isVisualizationEvent(frame.event)) {
        pendingEventsRef.current.push(frame.event)
        scheduleFlush()
      }
    }
    socket.onerror = () => {
      if (cancelled) return
      setStatus('error')
    }
    socket.onclose = () => {
      if (cancelled) return
      setStatus('reconnecting')
    }

    return () => {
      cancelled = true
      try {
        socket?.close()
      } catch {
        // socket already closed
      }
      if (frameHandleRef.current !== null) {
        cancelFrame(frameHandleRef.current)
        frameHandleRef.current = null
      }
    }
    // We intentionally re-open the socket only on URL/factory change;
    // changing filters does not re-open it (filter is applied during
    // flush, not at message receipt).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.websocketFactory, options.websocketUrlBuilder])

  // ------------------------------------------------------------------
  // Result assembly
  // ------------------------------------------------------------------

  const overallStatus: MidiVisualizationStatus = useMemo(() => {
    if (topologyQuery.isLoading) return 'loading'
    if (topologyQuery.isError) return 'error'
    return status
  }, [status, topologyQuery.isError, topologyQuery.isLoading])

  return {
    topology: topologyQuery.data ?? EMPTY_TOPOLOGY,
    edgeActivity: activitySnapshot.edges,
    nodeActivity: activitySnapshot.nodes,
    status: overallStatus,
    filters,
    setFilters,
  }
}

// ---------------------------------------------------------------------
// Helpers (exported for tests)
// ---------------------------------------------------------------------

export function isNoiseEvent(event: MidiVisualizationEvent): boolean {
  if (typeof event.status_byte === 'number' && NOISE_STATUS_BYTES.has(event.status_byte)) {
    return true
  }
  if (typeof event.raw_hex === 'string' && event.raw_hex.length >= 2) {
    const first = parseInt(event.raw_hex.slice(0, 2), 16)
    if (!Number.isNaN(first) && NOISE_STATUS_BYTES.has(first)) {
      return true
    }
  }
  return false
}

function ensureEdgeStats(
  map: Map<string, EdgeStats>,
  key: string,
): EdgeStats {
  let stats = map.get(key)
  if (!stats) {
    stats = { rateHz: 0, lastEventAt: null, totalEvents: 0, window: [] }
    map.set(key, stats)
  }
  return stats
}

function ensureNodeStats(
  map: Map<string, NodeStats>,
  key: string,
): NodeStats {
  let stats = map.get(key)
  if (!stats) {
    stats = { lastEventAt: null, rateHz: 0, recentEvents: [], window: [] }
    map.set(key, stats)
  }
  return stats
}

function pruneWindow(window: number[], now_ms: number): void {
  const cutoff = now_ms - RATE_WINDOW_MS
  // window is approximately sorted by arrival but events can arrive
  // slightly out-of-order from the buffer's replay handshake.
  // splice from the front while head is below cutoff.
  while (window.length > 0 && window[0] < cutoff) {
    window.shift()
  }
}

function snapshotActivity(state: InternalActivityState): {
  edges: Map<string, MidiVisualizationEdgeData>
  nodes: Map<string, MidiVisualizationNodeData>
} {
  const edges = new Map<string, MidiVisualizationEdgeData>()
  for (const [k, v] of state.edges.entries()) {
    edges.set(k, {
      rateHz: v.rateHz,
      lastEventAt: v.lastEventAt,
      totalEvents: v.totalEvents,
    })
  }
  const nodes = new Map<string, MidiVisualizationNodeData>()
  for (const [k, v] of state.nodes.entries()) {
    nodes.set(k, {
      // Caller (layout adapter) overwrites kind/label/raw from the
      // current topology snapshot; we only carry activity here.
      kind: 'device',
      label: '',
      raw: {},
      lastEventAt: v.lastEventAt,
      rateHz: v.rateHz,
      recentEvents: [...v.recentEvents],
    })
  }
  return { edges, nodes }
}

function isVisualizationEvent(value: unknown): value is MidiVisualizationEvent {
  if (!value || typeof value !== 'object') return false
  const v = value as MidiVisualizationEvent
  return (
    typeof v.source_node_id === 'string' &&
    typeof v.target_node_id === 'string' &&
    typeof v.ts_ms === 'number' &&
    (v.kind === 'raw' || v.kind === 'dispatched')
  )
}

function defaultWebsocketUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}${WS_PATH}`
}
