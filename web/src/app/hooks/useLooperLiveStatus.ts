/**
 * T2523-D — Live LooperStatus subscription hook.
 *
 * Single reusable surface for any frontend mount that needs the
 * multi-track looper's live state: subscribes to ``looper:status``
 * over the platform WS and surfaces the most recent frame as
 * React state. Falls back to an initial HTTP fetch + a long-period
 * safety-net refresh while the WS is closed.
 *
 * Why a hook (not a TanStack Query subscription): the backend
 * broadcasts a status frame on every mutating verb (T2512-WS bridge)
 * so a polling cadence ≤ the broadcast cadence would either lose
 * frames or fire useless extra round-trips. Push-driven state
 * matches the recorder + maschine WS patterns elsewhere in the
 * codebase.
 *
 * Used by MaschineLooperSection (T2523-C) and any future consumer
 * (a future LooperPage refactor can swap its inline WS code for
 * this hook — out of scope for T2523).
 */

import { useEffect, useRef, useState } from 'react'

import { looperApi, type LooperStatus } from '../../map2/clients/looper'
import { getWsUrl } from '../../map2/transport'

const LOOPER_WS_TOPIC = 'looper:status'

interface LooperStatusFrame {
  type: 'looper_status'
  payload: LooperStatus
}

export interface LooperLiveStatus {
  status: LooperStatus | null
  isConnected: boolean
  error: string | null
}

const SAFETY_REFRESH_MS = 2000

export function useLooperLiveStatus(): LooperLiveStatus {
  const [status, setStatus] = useState<LooperStatus | null>(null)
  const [isConnected, setIsConnected] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const safetyHandleRef = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false

    const fetchOnce = async () => {
      try {
        const fresh = await looperApi.getStatus()
        if (!cancelled) {
          setStatus(fresh)
          setError(null)
        }
      } catch (exc: unknown) {
        if (!cancelled) {
          setError(exc instanceof Error ? exc.message : 'Unknown error')
        }
      }
    }
    void fetchOnce()

    // 2s safety-net refresh: the backend only pushes on mutating
    // verbs, so pure playhead motion never reaches the WS frame
    // path. Periodic HTTP keeps the position bar tickling.
    safetyHandleRef.current = window.setInterval(() => {
      void fetchOnce()
    }, SAFETY_REFRESH_MS)

    let ws: WebSocket | null = null
    try {
      ws = new WebSocket(getWsUrl())
      wsRef.current = ws
      ws.onopen = () => {
        if (cancelled) return
        ws?.send(JSON.stringify({ action: 'subscribe', topic: LOOPER_WS_TOPIC }))
        setIsConnected(true)
      }
      ws.onmessage = (event) => {
        if (cancelled) return
        try {
          const message = JSON.parse(event.data) as LooperStatusFrame
          if (message.type === 'looper_status' && message.payload) {
            setStatus(message.payload)
            setError(null)
          }
        } catch {
          // Drop malformed frames; the WS endpoint occasionally
          // sends control envelopes the looper consumer doesn't
          // need to parse.
        }
      }
      ws.onclose = () => {
        if (cancelled) return
        setIsConnected(false)
      }
      ws.onerror = () => {
        if (cancelled) return
        setIsConnected(false)
      }
    } catch (exc: unknown) {
      if (!cancelled) {
        setError(exc instanceof Error ? exc.message : 'Unknown error')
      }
    }

    return () => {
      cancelled = true
      if (safetyHandleRef.current !== null) {
        window.clearInterval(safetyHandleRef.current)
        safetyHandleRef.current = null
      }
      try {
        ws?.close()
      } catch {
        // Already closed — fine.
      }
      wsRef.current = null
    }
  }, [])

  return { status, isConnected, error }
}
