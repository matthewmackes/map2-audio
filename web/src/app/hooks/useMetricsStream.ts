/**
 * WebSocket Integration for Real-time System Metrics
 * Enables streaming updates instead of polling
 */

import { useEffect, useCallback, useRef } from 'react'
import type { SystemHealthOverview, DiskHealthData } from '@/map2/types'
import { getWsBaseUrl } from '../../map2/api'

export interface WebSocketConfig {
  url: string
  reconnectInterval: number
  maxReconnectAttempts: number
  heartbeatInterval: number
}

export const DEFAULT_WS_CONFIG: WebSocketConfig = {
  url: `${typeof window !== 'undefined' ? getWsBaseUrl() : 'ws://localhost:8080'}/ws/system/metrics`,
  reconnectInterval: 3000,
  maxReconnectAttempts: 5,
  heartbeatInterval: 30000,
}

export interface MetricsUpdate {
  type: 'health-overview' | 'disk-health' | 'heartbeat'
  data: SystemHealthOverview | DiskHealthData | null
  timestamp: number
}

/**
 * Hook for WebSocket connection to real-time metrics
 */
export function useSystemMetricsWebSocket(config: Partial<WebSocketConfig> = {}) {
  const finalConfig = { ...DEFAULT_WS_CONFIG, ...config }
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectCountRef = useRef(0)
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    try {
      wsRef.current = new WebSocket(finalConfig.url)

      wsRef.current.onopen = () => {
        console.log('WebSocket connected to metrics stream')
        reconnectCountRef.current = 0

        // Start heartbeat
        heartbeatTimerRef.current = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'ping' }))
          }
        }, finalConfig.heartbeatInterval)
      }

      wsRef.current.onclose = () => {
        console.log('WebSocket disconnected')
        if (heartbeatTimerRef.current) {
          clearInterval(heartbeatTimerRef.current)
        }

        // Attempt reconnect
        if (reconnectCountRef.current < finalConfig.maxReconnectAttempts) {
          reconnectCountRef.current++
          setTimeout(connect, finalConfig.reconnectInterval)
        }
      }

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error)
      }
    } catch (error) {
      console.error('Failed to create WebSocket:', error)
    }
  }, [finalConfig])

  const disconnect = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current)
    }
    wsRef.current?.close()
  }, [])

  const subscribe = useCallback(
    (callback: (update: MetricsUpdate) => void) => {
      if (!wsRef.current) {
        connect()
      }

      const messageHandler = (event: MessageEvent) => {
        try {
          const update = JSON.parse(event.data) as MetricsUpdate
          callback(update)
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      if (wsRef.current) {
        wsRef.current.addEventListener('message', messageHandler)
      }

      return () => {
        if (wsRef.current) {
          wsRef.current.removeEventListener('message', messageHandler)
        }
      }
    },
    [connect]
  )

  const send = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    } else {
      console.warn('WebSocket is not connected')
    }
  }, [])

  const isConnected = wsRef.current?.readyState === WebSocket.OPEN

  return {
    connect,
    disconnect,
    subscribe,
    send,
    isConnected,
    wsRef,
  }
}

/**
 * Higher-level hook combining WebSocket with fallback to polling
 */
export function useMetricsStream(preferWebSocket: boolean = true) {
  const wsConnection = useSystemMetricsWebSocket()

  useEffect(() => {
    if (preferWebSocket) {
      wsConnection.connect()

      return () => {
        wsConnection.disconnect()
      }
    }
  }, [preferWebSocket, wsConnection])

  const getStreamStatus = useCallback(() => {
    return {
      type: wsConnection.isConnected ? ('websocket' as const) : ('polling' as const),
      connected: wsConnection.isConnected,
      fallbackActive: !wsConnection.isConnected && preferWebSocket,
    }
  }, [wsConnection.isConnected, preferWebSocket])

  return {
    wsConnection,
    getStreamStatus,
    isWebSocketConnected: wsConnection.isConnected,
  }
}

/**
 * Backend endpoint handler stub for WebSocket
 * This would be implemented in the Flask backend
 */
export const setupMetricsWebSocketHandler = () => {
  // Backend implementation would look like:
  /*
  @app.websocket('/ws/system/metrics')
  async def metrics_stream(ws):
      try:
          while True:
              # Send health overview every 2 seconds
              health = await get_health_overview()
              await ws.send(json.dumps({
                  'type': 'health-overview',
                  'data': health,
                  'timestamp': time.time()
              }))
              
              # Send disk health every 5 seconds (less frequently)
              if int(time.time()) % 5 == 0:
                  disk = await get_disk_health()
                  await ws.send(json.dumps({
                      'type': 'disk-health',
                      'data': disk,
                      'timestamp': time.time()
                  }))
              
              await asyncio.sleep(2)
      except Exception as e:
          print(f"WebSocket error: {e}")
  */
}
