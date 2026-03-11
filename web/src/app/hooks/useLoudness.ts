/**
 * useLoudness - React hook for LUFS loudness metering
 *
 * Provides ITU-R BS.1770-4 compliant loudness measurement data
 * from the JUCE audio engine for professional loudness monitoring.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getWsUrl, API_BASE } from '../../map2/api'
import { clusterScopeKey, withNodeQuery, withNodeTopic } from '../utils/clusterTransport'

export interface LufsLevels {
  momentary: number      // 400ms window (LUFS)
  shortTerm: number      // 3s window (LUFS)
  integrated: number     // Gated integrated (LUFS)
  range: number          // Loudness Range (LU)
  truePeak: number       // Max True Peak (dBTP)
  truePeakLeft: number   // Left channel True Peak (dBTP)
  truePeakRight: number  // Right channel True Peak (dBTP)
  running: boolean
}

export interface StereoInfo {
  phaseCorrelation: number  // -1 to +1
  balance: number           // -1 (left) to +1 (right)
  width: number             // 0 (mono) to 1 (full stereo)
  running: boolean
}

const DEFAULT_LUFS: LufsLevels = {
  momentary: -100,
  shortTerm: -100,
  integrated: -100,
  range: 0,
  truePeak: -100,
  truePeakLeft: -100,
  truePeakRight: -100,
  running: false
}

const DEFAULT_STEREO: StereoInfo = {
  phaseCorrelation: 0,
  balance: 0,
  width: 0,
  running: false
}

interface UseLoudnessOptions {
  /** Use WebSocket for real-time updates */
  useWebSocket?: boolean
  /** Polling interval in ms when not using WebSocket */
  pollingInterval?: number
  /** Target integrated loudness (e.g., -14 LUFS for streaming) */
  targetLufs?: number
  /** True peak limit (e.g., -1 dBTP) */
  truePeakLimit?: number
  /** Cluster node to target. Omit for local node. */
  nodeId?: string | null
}

export function useLoudness(options: UseLoudnessOptions = {}) {
  const {
    useWebSocket = true,
    pollingInterval = 100, // 10fps
    targetLufs = -14,
    truePeakLimit = -1,
    nodeId,
  } = options

  const queryClient = useQueryClient()
  const [lufs, setLufs] = useState<LufsLevels>(DEFAULT_LUFS)
  const [stereo, setStereo] = useState<StereoInfo>(DEFAULT_STEREO)
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const scopeKey = clusterScopeKey(nodeId)

  // WebSocket-based real-time updates
  useEffect(() => {
    if (!useWebSocket) return

    const ws = new WebSocket(getWsUrl())
    const lufsTopic = withNodeTopic('lufs', nodeId)
    const phaseTopic = withNodeTopic('phase', nodeId)
    wsRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
      // Subscribe to both LUFS and phase topics
      ws.send(JSON.stringify({ action: 'subscribe', topic: lufsTopic }))
      ws.send(JSON.stringify({ action: 'subscribe', topic: phaseTopic }))
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)

        if (message.type === 'lufs_update' && message.data) {
          const data: LufsLevels = {
            momentary: message.data.momentary ?? -100,
            shortTerm: message.data.short_term ?? -100,
            integrated: message.data.integrated ?? -100,
            range: message.data.range ?? 0,
            truePeak: message.data.true_peak ?? -100,
            truePeakLeft: message.data.true_peak_left ?? -100,
            truePeakRight: message.data.true_peak_right ?? -100,
            running: message.data.running ?? true
          }
          setLufs(data)
        }

        if (message.type === 'phase_update' && message.data) {
          const data: StereoInfo = {
            phaseCorrelation: message.data.phase_correlation ?? 0,
            balance: message.data.balance ?? 0,
            width: message.data.width ?? 0,
            running: message.data.running ?? true
          }
          setStereo(data)
        }
      } catch (e) {
        console.error('Error parsing loudness WebSocket message:', e)
      }
    }

    ws.onclose = () => {
      setIsConnected(false)
    }

    ws.onerror = (error) => {
      console.error('Loudness WebSocket error:', error)
      setIsConnected(false)
    }

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'unsubscribe', topic: lufsTopic }))
        ws.send(JSON.stringify({ action: 'unsubscribe', topic: phaseTopic }))
      }
      ws.close()
      wsRef.current = null
    }
  }, [nodeId, useWebSocket])

  // Polling — always enabled for initial load + fallback
  const lufsQuery = useQuery<LufsLevels>({
    queryKey: ['loudness', scopeKey, 'lufs'],
    queryFn: async () => {
      const res = await fetch(withNodeQuery(`${API_BASE}/engine/loudness/lufs`, nodeId))
      if (!res.ok) throw new Error('Failed to fetch LUFS levels')
      const data = await res.json()
      return {
        momentary: data.momentary ?? -100,
        shortTerm: data.short_term ?? -100,
        integrated: data.integrated ?? -100,
        range: data.range ?? 0,
        truePeak: data.true_peak ?? -100,
        truePeakLeft: data.true_peak_left ?? -100,
        truePeakRight: data.true_peak_right ?? -100,
        running: data.running ?? true
      }
    },
    refetchInterval: useWebSocket ? 5000 : pollingInterval,
    enabled: true
  })

  // Polling — always enabled for initial load + fallback
  const stereoQuery = useQuery<StereoInfo>({
    queryKey: ['loudness', scopeKey, 'stereo'],
    queryFn: async () => {
      const res = await fetch(withNodeQuery(`${API_BASE}/engine/loudness/stereo`, nodeId))
      if (!res.ok) throw new Error('Failed to fetch stereo info')
      const data = await res.json()
      return {
        phaseCorrelation: data.phase_correlation ?? 0,
        balance: data.balance ?? 0,
        width: data.width ?? 0,
        running: data.running ?? true
      }
    },
    refetchInterval: useWebSocket ? 5000 : pollingInterval,
    enabled: true
  })

  // Reset integrated loudness mutation
  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(withNodeQuery(`${API_BASE}/engine/loudness/reset`, nodeId), { method: 'POST' })
      if (!res.ok) throw new Error('Failed to reset integrated loudness')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loudness', scopeKey] })
    }
  })

  const wsHasLufs = useWebSocket && lufs.running
  const wsHasStereo = useWebSocket && stereo.running
  const currentLufs = wsHasLufs ? lufs : (lufsQuery.data || lufs)
  const currentStereo = wsHasStereo ? stereo : (stereoQuery.data || stereo)

  // Helper: Check if levels are within spec
  const isWithinSpec = useCallback(() => {
    const integratedOk = currentLufs.integrated >= targetLufs - 1 &&
                         currentLufs.integrated <= targetLufs + 1
    const truePeakOk = currentLufs.truePeak <= truePeakLimit
    return { integratedOk, truePeakOk, overall: integratedOk && truePeakOk }
  }, [currentLufs, targetLufs, truePeakLimit])

  // Helper: Get loudness category
  const getLoudnessCategory = useCallback(() => {
    const m = currentLufs.momentary
    if (m <= -24) return 'quiet'
    if (m <= -18) return 'soft'
    if (m <= -12) return 'moderate'
    if (m <= -6) return 'loud'
    return 'very_loud'
  }, [currentLufs])

  // Helper: Get phase status
  const getPhaseStatus = useCallback(() => {
    const c = currentStereo.phaseCorrelation
    if (c >= 0.8) return 'mono'
    if (c >= 0.3) return 'normal'
    if (c >= 0) return 'wide'
    if (c >= -0.5) return 'very_wide'
    return 'out_of_phase'
  }, [currentStereo])

  return {
    lufs: currentLufs,
    stereo: currentStereo,
    isConnected: useWebSocket ? isConnected : true,
    isLoading: !useWebSocket && (lufsQuery.isLoading || stereoQuery.isLoading),
    isError: !useWebSocket && (lufsQuery.isError || stereoQuery.isError),
    resetIntegrated: resetMutation.mutateAsync,
    isResetting: resetMutation.isPending,
    isWithinSpec,
    getLoudnessCategory,
    getPhaseStatus,
    targetLufs,
    truePeakLimit
  }
}

export default useLoudness
