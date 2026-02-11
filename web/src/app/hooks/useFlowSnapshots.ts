/**
 * useFlowSnapshots - React hook for flow snapshots with WebSocket support
 *
 * Provides real-time updates when flow snapshots are loaded via MIDI Program Change
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import type { FlowSnapshotData } from '../../map2/types'
import { getWsUrl } from '../../map2/api'

export interface FlowSnapshotEvent {
  snapshot_id: number
  snapshot_name: string
  snapshot_data: FlowSnapshotData
  triggered_by?: 'midi_pc' | 'ui'
  program_number?: number
}

interface UseFlowSnapshotsOptions {
  /** Callback when a snapshot is loaded (from MIDI PC or other source) */
  onSnapshotLoaded?: (event: FlowSnapshotEvent) => void
  /** Whether to enable WebSocket connection */
  enabled?: boolean
}

export function useFlowSnapshots(options: UseFlowSnapshotsOptions = {}) {
  const { onSnapshotLoaded, enabled = true } = options

  const [isConnected, setIsConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState<FlowSnapshotEvent | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const onSnapshotLoadedRef = useRef(onSnapshotLoaded)

  // Keep callback ref updated
  useEffect(() => {
    onSnapshotLoadedRef.current = onSnapshotLoaded
  }, [onSnapshotLoaded])

  // WebSocket connection for real-time snapshot events
  useEffect(() => {
    if (!enabled) return

    const ws = new WebSocket(getWsUrl())
    wsRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
      // Subscribe to flow_snapshots topic
      ws.send(JSON.stringify({ action: 'subscribe', topic: 'flow_snapshots' }))
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        if (message.type === 'flow_snapshot_loaded' && message.data) {
          const snapshotEvent: FlowSnapshotEvent = {
            snapshot_id: message.data.snapshot_id,
            snapshot_name: message.data.snapshot_name,
            snapshot_data: message.data.snapshot_data,
            triggered_by: message.data.triggered_by,
            program_number: message.data.program_number,
          }
          setLastEvent(snapshotEvent)
          onSnapshotLoadedRef.current?.(snapshotEvent)
        }
      } catch (e) {
        console.error('Error parsing flow snapshot WebSocket message:', e)
      }
    }

    ws.onclose = () => {
      setIsConnected(false)
    }

    ws.onerror = (error) => {
      console.error('Flow snapshots WebSocket error:', error)
      setIsConnected(false)
    }

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'unsubscribe', topic: 'flow_snapshots' }))
        ws.close()
      }
      wsRef.current = null
    }
  }, [enabled])

  // Manual disconnect
  const disconnect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'unsubscribe', topic: 'flow_snapshots' }))
      wsRef.current.close()
    }
  }, [])

  return {
    isConnected,
    lastEvent,
    disconnect,
  }
}
