/**
 * useVuMeters - React hook for real-time VU meter levels
 *
 * Provides input/output level metering from the JUCE audio engine via WebSocket
 */

import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getWsUrl, API_BASE } from '../../map2/api'
import { clusterScopeKey, withNodeQuery, withNodeTopic } from '../utils/clusterTransport'

export interface VuLevels {
  inputLeft: number
  inputRight: number
  outputLeft: number
  outputRight: number
  running: boolean
}

const DEFAULT_LEVELS: VuLevels = {
  inputLeft: -60,
  inputRight: -60,
  outputLeft: -60,
  outputRight: -60,
  running: false
}

interface UseVuMetersOptions {
  /** Use WebSocket for real-time updates */
  useWebSocket?: boolean
  /** Polling interval in ms when not using WebSocket */
  pollingInterval?: number
  /** Cluster node to target. Omit for local node. */
  nodeId?: string | null
}

export function useVuMeters(options: UseVuMetersOptions = {}) {
  const {
    useWebSocket = true,
    pollingInterval = 33, // ~30fps
    nodeId,
  } = options

  const [levels, setLevels] = useState<VuLevels>(DEFAULT_LEVELS)
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const pendingLevelsRef = useRef<VuLevels | null>(null)
  const scopeKey = clusterScopeKey(nodeId)

  // Peak hold state
  const [peakHold, setPeakHold] = useState({
    inputLeft: -60,
    inputRight: -60,
    outputLeft: -60,
    outputRight: -60
  })
  const peakTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Update peak hold
  useEffect(() => {
    const exceedsInputLeft = levels.inputLeft > peakHold.inputLeft
    const exceedsInputRight = levels.inputRight > peakHold.inputRight
    const exceedsOutputLeft = levels.outputLeft > peakHold.outputLeft
    const exceedsOutputRight = levels.outputRight > peakHold.outputRight

    if (!exceedsInputLeft && !exceedsInputRight && !exceedsOutputLeft && !exceedsOutputRight) {
      return
    }

    setPeakHold({
      inputLeft: exceedsInputLeft ? levels.inputLeft : peakHold.inputLeft,
      inputRight: exceedsInputRight ? levels.inputRight : peakHold.inputRight,
      outputLeft: exceedsOutputLeft ? levels.outputLeft : peakHold.outputLeft,
      outputRight: exceedsOutputRight ? levels.outputRight : peakHold.outputRight,
    })

    // Reset peak hold after 2 seconds, but only if the post-decay value actually differs.
    if (peakTimeoutRef.current) clearTimeout(peakTimeoutRef.current)
    peakTimeoutRef.current = setTimeout(() => {
      setPeakHold((prev) => (
        prev.inputLeft === levels.inputLeft
          && prev.inputRight === levels.inputRight
          && prev.outputLeft === levels.outputLeft
          && prev.outputRight === levels.outputRight
          ? prev
          : {
            inputLeft: levels.inputLeft,
            inputRight: levels.inputRight,
            outputLeft: levels.outputLeft,
            outputRight: levels.outputRight,
          }
      ))
    }, 2000)

    return () => {
      if (peakTimeoutRef.current) clearTimeout(peakTimeoutRef.current)
    }
  }, [levels])

  // WebSocket connection
  useEffect(() => {
    if (!useWebSocket) return

    const ws = new WebSocket(getWsUrl())
    const topic = withNodeTopic('meters', nodeId)
    wsRef.current = ws

    const cancelScheduledFlush = () => {
      if (animationFrameRef.current == null) {
        return
      }

      if (typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(animationFrameRef.current)
      } else {
        window.clearTimeout(animationFrameRef.current)
      }
      animationFrameRef.current = null
    }

    const scheduleFlush = () => {
      if (typeof window.requestAnimationFrame === 'function') {
        animationFrameRef.current = window.requestAnimationFrame(flushPendingLevels)
        return
      }

      animationFrameRef.current = window.setTimeout(flushPendingLevels, 16)
    }

    const flushPendingLevels = () => {
      animationFrameRef.current = null
      const pendingLevels = pendingLevelsRef.current
      if (!pendingLevels) {
        return
      }

      pendingLevelsRef.current = null
      setLevels(pendingLevels)
    }

    const enqueueLevels = (nextLevels: VuLevels) => {
      pendingLevelsRef.current = nextLevels
      if (animationFrameRef.current != null) {
        return
      }

      scheduleFlush()
    }

    ws.onopen = () => {
      setIsConnected(true)
      ws.send(JSON.stringify({ action: 'subscribe', topic }))
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        if (message.type === 'meters_update' && message.data) {
          enqueueLevels({
            inputLeft: message.data.input_left ?? -60,
            inputRight: message.data.input_right ?? -60,
            outputLeft: message.data.output_left ?? -60,
            outputRight: message.data.output_right ?? -60,
            running: message.data.running ?? false
          })
        }
      } catch (e) {
        console.error('Error parsing VU meters WebSocket message:', e)
      }
    }

    ws.onclose = () => setIsConnected(false)
    ws.onerror = () => setIsConnected(false)

    return () => {
      cancelScheduledFlush()
      pendingLevelsRef.current = null
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'unsubscribe', topic }))
      }
      ws.close()
      wsRef.current = null
    }
  }, [nodeId, useWebSocket])

  // Polling is only needed before WebSocket connects or when WS is disabled.
  const shouldPoll = !useWebSocket || !isConnected

  const pollingQuery = useQuery<VuLevels>({
    queryKey: ['vu-meters', scopeKey],
    queryFn: async () => {
      const res = await fetch(withNodeQuery(`${API_BASE}/engine/meters`, nodeId))
      if (!res.ok) throw new Error('Failed to fetch VU meters')
      const data = await res.json()
      return {
        inputLeft: data.input_left ?? -60,
        inputRight: data.input_right ?? -60,
        outputLeft: data.output_left ?? -60,
        outputRight: data.output_right ?? -60,
        running: data.running ?? false
      }
    },
    refetchInterval: shouldPoll ? pollingInterval : false,
    enabled: shouldPoll
  })

  const wsHasData = useWebSocket && levels.running
  const currentLevels = wsHasData ? levels : (pollingQuery.data || levels)

  // Reset peaks
  const resetPeaks = () => {
    setPeakHold({
      inputLeft: currentLevels.inputLeft,
      inputRight: currentLevels.inputRight,
      outputLeft: currentLevels.outputLeft,
      outputRight: currentLevels.outputRight
    })
  }

  return {
    levels: currentLevels,
    peakHold,
    isConnected: useWebSocket ? isConnected : true,
    isRunning: currentLevels.running,
    resetPeaks
  }
}

export default useVuMeters
