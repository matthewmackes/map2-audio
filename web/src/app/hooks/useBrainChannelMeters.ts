/**
 * useBrainChannelMeters — per-slot Performance Brain ConsoleView meters.
 *
 * 30 fps WebSocket feed via the `brain_metering` topic broadcast by the
 * backend MeteringBroadcastService, with a polling fallback against
 * GET /api/engine/brain/metering for the warm-up window before the first WS
 * tick lands. Each of the 16 slot strips reads `peakDb`, `rmsDb`, `clipping`,
 * plus a 2-second peak-hold value computed locally so the dot stays parked
 * at the recent maximum without forcing extra network bandwidth.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { API_BASE, getWsUrl } from '../../map2/api'

const SLOT_COUNT = 16
const MIN_DB = -60
const PEAK_HOLD_MS = 2000

export interface BrainChannelMeter {
  slotId: number
  peakDb: number
  rmsDb: number
  clipping: boolean
  peakHoldDb: number
}

export interface BrainChannelMetersState {
  meters: BrainChannelMeter[]
  running: boolean
  isConnected: boolean
}

interface BrainMeteringPayload {
  running: boolean
  slots: Array<{
    slot_id: number
    peak_db: number
    rms_db: number
    clipping: boolean
  }>
}

function emptyMeters(): BrainChannelMeter[] {
  return Array.from({ length: SLOT_COUNT }, (_, i) => ({
    slotId: i,
    peakDb: MIN_DB,
    rmsDb: MIN_DB,
    clipping: false,
    peakHoldDb: MIN_DB,
  }))
}

function applyPayload(
  payload: BrainMeteringPayload,
  prev: BrainChannelMeter[],
  holds: Map<number, { value: number; timestamp: number }>,
  now: number,
): BrainChannelMeter[] {
  const next = prev.slice()
  for (const slot of payload.slots) {
    const idx = slot.slot_id
    if (idx < 0 || idx >= SLOT_COUNT) continue
    const hold = holds.get(idx)
    let peakHold = hold?.value ?? MIN_DB
    if (slot.peak_db > peakHold) {
      peakHold = slot.peak_db
      holds.set(idx, { value: peakHold, timestamp: now })
    } else if (hold && now - hold.timestamp > PEAK_HOLD_MS) {
      // Hold expired — fall back to the live peak so the dot doesn't leave
      // a stale reading after the channel goes quiet.
      peakHold = slot.peak_db
      holds.set(idx, { value: peakHold, timestamp: now })
    }
    next[idx] = {
      slotId: idx,
      peakDb: slot.peak_db,
      rmsDb: slot.rms_db,
      clipping: slot.clipping,
      peakHoldDb: peakHold,
    }
  }
  return next
}

interface UseBrainChannelMetersOptions {
  /** Default true; flip to false in stories/tests to skip the WS lifecycle. */
  useWebSocket?: boolean
  /** Polling interval (ms) used when WS is disabled or before WS connects. */
  pollingIntervalMs?: number
}

export function useBrainChannelMeters(
  options: UseBrainChannelMetersOptions = {},
): BrainChannelMetersState {
  const { useWebSocket = true, pollingIntervalMs = 1000 } = options
  const [meters, setMeters] = useState<BrainChannelMeter[]>(() => emptyMeters())
  const [isConnected, setIsConnected] = useState(false)
  const [running, setRunning] = useState(false)
  const holdsRef = useRef<Map<number, { value: number; timestamp: number }>>(new Map())
  const pendingPayloadRef = useRef<BrainMeteringPayload | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  const flush = () => {
    animationFrameRef.current = null
    const payload = pendingPayloadRef.current
    if (!payload) return
    pendingPayloadRef.current = null
    const now = Date.now()
    setMeters((prev) => applyPayload(payload, prev, holdsRef.current, now))
    setRunning(payload.running)
  }

  const enqueue = (payload: BrainMeteringPayload) => {
    pendingPayloadRef.current = payload
    if (animationFrameRef.current != null) return
    if (typeof window.requestAnimationFrame === 'function') {
      animationFrameRef.current = window.requestAnimationFrame(flush)
    } else {
      animationFrameRef.current = window.setTimeout(flush, 16)
    }
  }

  // Polling fallback — only fires before the WS connects (or when WS is off).
  const shouldPoll = !useWebSocket || !isConnected
  useQuery<BrainMeteringPayload>({
    queryKey: ['brain', 'metering'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/engine/brain/metering`)
      if (!res.ok) throw new Error(`brain/metering ${res.status}`)
      const data = (await res.json()) as BrainMeteringPayload
      enqueue(data)
      return data
    },
    refetchInterval: shouldPoll ? pollingIntervalMs : false,
    enabled: shouldPoll,
    staleTime: 0,
  })

  useEffect(() => {
    if (!useWebSocket) return undefined

    const ws = new WebSocket(getWsUrl())
    let disposed = false

    ws.onopen = () => {
      if (disposed) return
      setIsConnected(true)
      ws.send(JSON.stringify({ action: 'subscribe', topic: 'brain_metering' }))
    }

    ws.onmessage = (event) => {
      if (disposed) return
      try {
        const message = JSON.parse(event.data) as { type?: string; data?: BrainMeteringPayload }
        if (message.type === 'brain_metering_update' && message.data) {
          enqueue(message.data)
        }
      } catch (err) {
        console.error('useBrainChannelMeters: bad WS payload', err)
      }
    }

    ws.onclose = () => {
      if (!disposed) setIsConnected(false)
    }
    ws.onerror = () => {
      if (!disposed) setIsConnected(false)
    }

    return () => {
      disposed = true
      if (animationFrameRef.current != null) {
        if (typeof window.cancelAnimationFrame === 'function') {
          window.cancelAnimationFrame(animationFrameRef.current)
        } else {
          window.clearTimeout(animationFrameRef.current)
        }
        animationFrameRef.current = null
      }
      pendingPayloadRef.current = null
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ action: 'unsubscribe', topic: 'brain_metering' }))
        } catch {
          // ignore — socket is closing
        }
      }
      ws.close()
    }
  }, [useWebSocket])

  return useMemo(() => ({ meters, running, isConnected }), [meters, running, isConnected])
}
