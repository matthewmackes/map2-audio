/**
 * useVuMeters - React hook for real-time VU meter levels
 *
 * Provides input/output level metering from the JUCE audio engine via WebSocket
 */

import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getWsUrl, API_BASE } from '../../map2/api'

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
}

export function useVuMeters(options: UseVuMetersOptions = {}) {
  const {
    useWebSocket = true,
    pollingInterval = 33 // ~30fps
  } = options

  const [levels, setLevels] = useState<VuLevels>(DEFAULT_LEVELS)
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

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
    const newPeaks = { ...peakHold }
    let updated = false

    if (levels.inputLeft > peakHold.inputLeft) {
      newPeaks.inputLeft = levels.inputLeft
      updated = true
    }
    if (levels.inputRight > peakHold.inputRight) {
      newPeaks.inputRight = levels.inputRight
      updated = true
    }
    if (levels.outputLeft > peakHold.outputLeft) {
      newPeaks.outputLeft = levels.outputLeft
      updated = true
    }
    if (levels.outputRight > peakHold.outputRight) {
      newPeaks.outputRight = levels.outputRight
      updated = true
    }

    if (updated) {
      setPeakHold(newPeaks)

      // Reset peak hold after 2 seconds
      if (peakTimeoutRef.current) clearTimeout(peakTimeoutRef.current)
      peakTimeoutRef.current = setTimeout(() => {
        setPeakHold({
          inputLeft: levels.inputLeft,
          inputRight: levels.inputRight,
          outputLeft: levels.outputLeft,
          outputRight: levels.outputRight
        })
      }, 2000)
    }

    return () => {
      if (peakTimeoutRef.current) clearTimeout(peakTimeoutRef.current)
    }
  }, [levels])

  // WebSocket connection
  useEffect(() => {
    if (!useWebSocket) return

    const ws = new WebSocket(getWsUrl())
    wsRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
      ws.send(JSON.stringify({ action: 'subscribe', topic: 'meters' }))
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        if (message.type === 'meters_update' && message.data) {
          setLevels({
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
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'unsubscribe', topic: 'meters' }))
      }
      ws.close()
      wsRef.current = null
    }
  }, [useWebSocket])

  // Polling is only needed before WebSocket connects or when WS is disabled.
  const shouldPoll = !useWebSocket || !isConnected

  const pollingQuery = useQuery<VuLevels>({
    queryKey: ['vu-meters'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/engine/meters`)
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
