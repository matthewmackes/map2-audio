/**
 * useRecorderSession — T2509-5 (phase 5 of T2504).
 *
 * Wraps `/api/v1/recorder/*` (T2508-4) HTTP and the
 * `recorder:session` WebSocket topic (T2508-6 bridge) into a single
 * React hook. Returns:
 *
 *   sessions        — current list of in-flight RecorderSessionStatus
 *   isConnected     — `true` while the WS subscription is live
 *   isLoading       — `true` for the initial list fetch
 *   armSession      — POST /sessions
 *   startRolling    — POST /sessions/{id}/roll
 *   stopSession     — POST /sessions/{id}/stop
 *   disarmSession   — DELETE /sessions/{id}
 *
 * The hook owns the WS lifecycle (open on mount, close on unmount).
 * Lifecycle events arriving on the topic apply locally so the UI
 * stays in sync without polling. A short refetch on connect
 * reconciles the list against the backend in case events arrived
 * before the WS handshake completed.
 *
 * Tests inject a fake WebSocket constructor + recorderApi via the
 * `__opts` parameter so the suite doesn't need a live backend.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getWsUrl } from '../../map2/transport'
import {
  recorderApi as defaultRecorderApi,
  type ArmSessionRequest,
  type RecorderSessionFrame,
  type RecorderSessionStatus,
} from '../../map2/clients/recorder'

const QUERY_KEY = ['recorder', 'sessions'] as const
const WS_TOPIC = 'recorder:session'

export interface UseRecorderSessionOptions {
  /** Open the WebSocket subscription. Default true. */
  enableWebSocket?: boolean
  /** Polling interval (ms) when WS is disabled. Default 5000. */
  pollingIntervalMs?: number
}

/** Test-only overrides — never set in production code. */
export interface UseRecorderSessionTestOverrides {
  recorderApi?: typeof defaultRecorderApi
  /** Replace the WebSocket constructor (e.g. a Jest fake). */
  WebSocketImpl?: typeof WebSocket
  /** Custom WS URL builder. */
  getWsUrl?: () => string
}

export interface UseRecorderSessionResult {
  sessions: RecorderSessionStatus[]
  isConnected: boolean
  isLoading: boolean
  armSession: (request: ArmSessionRequest) => Promise<RecorderSessionStatus>
  startRolling: (sessionId: string) => Promise<RecorderSessionStatus>
  stopSession: (sessionId: string) => Promise<RecorderSessionStatus>
  disarmSession: (sessionId: string) => Promise<void>
}

function applyStatusToList(
  previous: RecorderSessionStatus[],
  next: RecorderSessionStatus,
): RecorderSessionStatus[] {
  const index = previous.findIndex((s) => s.session_id === next.session_id)
  if (index === -1) {
    return [...previous, next]
  }
  const copy = previous.slice()
  copy[index] = next
  return copy
}

export function useRecorderSession(
  options: UseRecorderSessionOptions = {},
  __overrides: UseRecorderSessionTestOverrides = {},
): UseRecorderSessionResult {
  const { enableWebSocket = true, pollingIntervalMs = 5000 } = options
  const api = __overrides.recorderApi ?? defaultRecorderApi
  // Pin the test-only deps to refs so the WS useEffect doesn't
  // re-fire when a parent re-render hands us a fresh
  // `__overrides` object literal.
  const overridesRef = useRef(__overrides)
  overridesRef.current = __overrides

  const queryClient = useQueryClient()
  const [isConnected, setIsConnected] = useState(false)
  const [sessions, setSessions] = useState<RecorderSessionStatus[]>([])
  const wsRef = useRef<WebSocket | null>(null)
  // Once the WS subscription is live, it's authoritative — refetches
  // on the listQuery come in for polling-mode reconciliation only
  // and must not stomp WS-applied state.
  const wsAuthoritativeRef = useRef(false)

  // Initial list fetch + reconciliation polling when WS is closed.
  const listQuery = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => api.listSessions(),
    refetchInterval: isConnected ? false : pollingIntervalMs,
  })

  // Merge query results into local state so WS-applied updates
  // don't get overwritten by a stale refetch. Once the WS topic is
  // authoritative we stop accepting listQuery overwrites.
  useEffect(() => {
    if (!listQuery.data) return
    if (wsAuthoritativeRef.current) return
    setSessions(listQuery.data.sessions)
  }, [listQuery.data])

  // WebSocket lifecycle.
  useEffect(() => {
    if (!enableWebSocket) {
      setIsConnected(false)
      return
    }

    const WebSocketImpl = overridesRef.current.WebSocketImpl ?? WebSocket
    const wsUrlFn = overridesRef.current.getWsUrl ?? getWsUrl

    let cancelled = false
    const ws = new WebSocketImpl(wsUrlFn())
    wsRef.current = ws

    ws.onopen = () => {
      if (cancelled) return
      ws.send(JSON.stringify({ action: 'subscribe', topic: WS_TOPIC }))
      setIsConnected(true)
      // WS is now authoritative; subsequent listQuery refetches must
      // not overwrite WS-applied state.
      wsAuthoritativeRef.current = true
    }

    ws.onmessage = (event) => {
      if (cancelled) return
      try {
        const message = JSON.parse(event.data) as RecorderSessionFrame
        if (message.type !== 'recorder_session' || !message.payload) {
          return
        }
        const status = message.payload
        setSessions((prev) => applyStatusToList(prev, status))
      } catch (err) {
        // Bad JSON on a topic we own — log but don't crash the hook.
        // eslint-disable-next-line no-console
        console.error('useRecorderSession: bad WS frame', err)
      }
    }

    ws.onclose = () => {
      setIsConnected(false)
      wsAuthoritativeRef.current = false
    }
    ws.onerror = () => {
      setIsConnected(false)
      wsAuthoritativeRef.current = false
    }

    return () => {
      cancelled = true
      if (ws.readyState === (WebSocketImpl as any).OPEN) {
        try {
          ws.send(JSON.stringify({ action: 'unsubscribe', topic: WS_TOPIC }))
        } catch {
          // Connection may have been torn down mid-flight; safe to ignore.
        }
      }
      ws.close()
      wsRef.current = null
      setIsConnected(false)
    }
  }, [enableWebSocket, queryClient])

  // Mutations
  const armMutation = useMutation({
    mutationFn: (request: ArmSessionRequest) => api.armSession(request),
    onSuccess: (status) => {
      setSessions((prev) => applyStatusToList(prev, status))
    },
  })

  const rollMutation = useMutation({
    mutationFn: (sessionId: string) => api.startRolling(sessionId),
    onSuccess: (status) => {
      setSessions((prev) => applyStatusToList(prev, status))
    },
  })

  const stopMutation = useMutation({
    mutationFn: (sessionId: string) => api.stopSession(sessionId),
    onSuccess: (status) => {
      setSessions((prev) => applyStatusToList(prev, status))
    },
  })

  const disarmMutation = useMutation({
    mutationFn: (sessionId: string) => api.disarmSession(sessionId),
    onSuccess: (_void, sessionId) => {
      setSessions((prev) => prev.filter((s) => s.session_id !== sessionId))
    },
  })

  const armSession = useCallback(
    (request: ArmSessionRequest) => armMutation.mutateAsync(request),
    [armMutation],
  )
  const startRolling = useCallback(
    (sessionId: string) => rollMutation.mutateAsync(sessionId),
    [rollMutation],
  )
  const stopSession = useCallback(
    (sessionId: string) => stopMutation.mutateAsync(sessionId),
    [stopMutation],
  )
  const disarmSession = useCallback(
    (sessionId: string) => disarmMutation.mutateAsync(sessionId),
    [disarmMutation],
  )

  return {
    sessions,
    isConnected,
    isLoading: listQuery.isLoading,
    armSession,
    startRolling,
    stopSession,
    disarmSession,
  }
}
