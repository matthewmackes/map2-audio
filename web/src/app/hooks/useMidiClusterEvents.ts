import { useEffect, useState } from 'react'

import { useWebSocketConnection, useWebSocketTopic } from '../../map2/hooks/useWebSocket'
import type { WebSocketMessage, WebSocketTopic } from '../../map2/websocket'

export type MidiClusterTopic =
  | 'midi_cluster'
  | 'midi_cluster_nodes'
  | 'midi_cluster_connections'
  | 'midi_cluster_clock'

export type MidiClusterEvent = WebSocketMessage & {
  topic?: MidiClusterTopic
}

type MidiClusterState = Record<string, MidiClusterEvent>

function eventKey(message: MidiClusterEvent): string {
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

export function useMidiClusterEvents(topic: MidiClusterTopic) {
  const { isConnected } = useWebSocketConnection()
  const [latestEvent, setLatestEvent] = useState<MidiClusterEvent | null>(null)
  const [events, setEvents] = useState<MidiClusterEvent[]>([])
  const [accumulatedState, setAccumulatedState] = useState<MidiClusterState>({})

  useEffect(() => {
    setLatestEvent(null)
    setEvents([])
    setAccumulatedState({})
  }, [topic])

  useWebSocketTopic(topic as WebSocketTopic, (data, message) => {
    const nextEvent: MidiClusterEvent = {
      ...message,
      data,
      topic,
    }

    setLatestEvent(nextEvent)
    setEvents((current) => [...current.slice(-49), nextEvent])
    setAccumulatedState((current) => ({
      ...current,
      [eventKey(nextEvent)]: nextEvent,
    }))
  })

  return {
    isConnected,
    latestEvent,
    events,
    accumulatedState,
  }
}

export default useMidiClusterEvents
