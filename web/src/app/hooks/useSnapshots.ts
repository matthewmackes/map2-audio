import { useEffect, useRef, useState } from 'react'
import { getWsUrl } from '../../map2/api'
import type { SnapshotDetail } from '../../map2/types'

export interface SnapshotEvent {
  snapshot_id: number
  snapshot_name: string
  snapshot_data: SnapshotDetail
  triggered_by?: 'midi_pc' | 'ui'
  program_number?: number | null
}

interface UseSnapshotsOptions {
  enabled?: boolean
  onSnapshotLoaded?: (event: SnapshotEvent) => void
}

export function useSnapshots(options: UseSnapshotsOptions = {}) {
  const { enabled = true, onSnapshotLoaded } = options

  const [isConnected, setIsConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState<SnapshotEvent | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const onSnapshotLoadedRef = useRef(onSnapshotLoaded)

  useEffect(() => {
    onSnapshotLoadedRef.current = onSnapshotLoaded
  }, [onSnapshotLoaded])

  useEffect(() => {
    if (!enabled) {
      return
    }

    const ws = new WebSocket(getWsUrl())
    wsRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
      ws.send(JSON.stringify({ action: 'subscribe', topic: 'snapshots' }))
    }

    ws.onmessage = (messageEvent) => {
      try {
        const message = JSON.parse(messageEvent.data)
        if (message.type !== 'snapshot_loaded' || !message.data) {
          return
        }

        const event = {
          snapshot_id: message.data.snapshot_id,
          snapshot_name: message.data.snapshot_name,
          snapshot_data: message.data.snapshot_data,
          triggered_by: message.data.triggered_by,
          program_number: message.data.program_number,
        }
        setLastEvent(event)
        onSnapshotLoadedRef.current?.(event)
      } catch (error) {
        console.error('Error parsing snapshot WebSocket message:', error)
      }
    }

    ws.onclose = () => {
      setIsConnected(false)
    }

    ws.onerror = (error) => {
      console.error('Snapshots WebSocket error:', error)
      setIsConnected(false)
    }

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'unsubscribe', topic: 'snapshots' }))
        ws.close()
      }
      wsRef.current = null
    }
  }, [enabled])

  return {
    disconnect: () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: 'unsubscribe', topic: 'snapshots' }))
        wsRef.current.close()
      }
    },
    isConnected,
    lastEvent,
  }
}
