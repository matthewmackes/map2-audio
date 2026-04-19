import { useEffect, useState } from 'react'

import { useWebSocketConnection, useWebSocketTopic } from '../../map2/hooks/useWebSocket'
import type { WebSocketMessage, WebSocketTopic } from '../../map2/websocket'

export type MidiClusterTopic =
  | 'midi_cluster'
  | 'midi_cluster_nodes'
  | 'midi_cluster_connections'
  | 'midi_cluster_clock'

export type MidiClusterSignal = WebSocketMessage & {
  topic?: MidiClusterTopic
}

type MidiClusterState = Record<string, MidiClusterSignal>

function eventKey(message: MidiClusterSignal): string {
  const data = message.data as Record<string, unknown> | undefined
  if (typeof data?.connection_id === 'string' && data.connection_id) {
    return data.connection_id
  }
  if (typeof data?.event_type === 'string' && data.event_type) {
    const nodeId = typeof data?.source_node_id === 'string' ? data.source_node_id : 'cluster'
    return `${data.event_type}:${nodeId}`
  }
  return `${message.type}:${message.timestamp ?? 'latest'}`
}

export function useMidiClusterFeed(topic: MidiClusterTopic) {
  const { isConnected } = useWebSocketConnection()
  const [latestSignal, setLatestSignal] = useState<MidiClusterSignal | null>(null)
  const [signals, setSignals] = useState<MidiClusterSignal[]>([])
  const [accumulatedState, setAccumulatedState] = useState<MidiClusterState>({})

  useEffect(() => {
    setLatestSignal(null)
    setSignals([])
    setAccumulatedState({})
  }, [topic])

  useWebSocketTopic(topic as WebSocketTopic, (data, message) => {
    const nextSignal: MidiClusterSignal = {
      ...message,
      data,
      topic,
    }

    setLatestSignal(nextSignal)
    setSignals((current) => [...current.slice(-49), nextSignal])
    setAccumulatedState((current) => ({
      ...current,
      [eventKey(nextSignal)]: nextSignal,
    }))
  })

  return {
    isConnected,
    latestSignal,
    signals,
    accumulatedState,
  }
}

export default useMidiClusterFeed
