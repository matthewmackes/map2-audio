/**
 * useSpectrum - React hook for real-time FFT spectrum data
 *
 * Provides spectrum analysis data from the JUCE audio engine via WebSocket
 * for visualization in spectrum analyzer components.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'

export interface SpectrumData {
  magnitudes: number[]
  frequencies: number[]
  peakFrequency: number
  peakMagnitude: number
  spectralCentroid: number
}

const DEFAULT_SPECTRUM: SpectrumData = {
  magnitudes: [],
  frequencies: [],
  peakFrequency: 0,
  peakMagnitude: -100,
  spectralCentroid: 0
}

interface UseSpectrumOptions {
  /** Use WebSocket for real-time updates (recommended for visualizations) */
  useWebSocket?: boolean
  /** Polling interval in ms when not using WebSocket */
  pollingInterval?: number
  /** Callback for each spectrum update */
  onUpdate?: (data: SpectrumData) => void
}

export function useSpectrum(options: UseSpectrumOptions = {}) {
  const {
    useWebSocket = true,
    pollingInterval = 33, // ~30fps
    onUpdate
  } = options

  const [spectrum, setSpectrum] = useState<SpectrumData>(DEFAULT_SPECTRUM)
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate

  // WebSocket-based real-time updates
  useEffect(() => {
    if (!useWebSocket) return

    const ws = new WebSocket(`ws://${window.location.host}/ws`)
    wsRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
      // Subscribe to spectrum topic
      ws.send(JSON.stringify({ action: 'subscribe', topic: 'spectrum' }))
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        if (message.type === 'spectrum_update' && message.data) {
          const data: SpectrumData = {
            magnitudes: message.data.magnitudes || [],
            frequencies: message.data.frequencies || [],
            peakFrequency: message.data.peak_frequency || 0,
            peakMagnitude: message.data.peak_magnitude || -100,
            spectralCentroid: message.data.spectral_centroid || 0
          }
          setSpectrum(data)
          onUpdateRef.current?.(data)
        }
      } catch (e) {
        console.error('Error parsing spectrum WebSocket message:', e)
      }
    }

    ws.onclose = () => {
      setIsConnected(false)
    }

    ws.onerror = (error) => {
      console.error('Spectrum WebSocket error:', error)
      setIsConnected(false)
    }

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'unsubscribe', topic: 'spectrum' }))
      }
      ws.close()
      wsRef.current = null
    }
  }, [useWebSocket])

  // Polling fallback when WebSocket is not used
  const pollingQuery = useQuery<SpectrumData>({
    queryKey: ['spectrum'],
    queryFn: async () => {
      const res = await fetch('/api/engine/spectrum')
      if (!res.ok) throw new Error('Failed to fetch spectrum')
      const data = await res.json()
      return {
        magnitudes: data.magnitudes || [],
        frequencies: data.frequencies || [],
        peakFrequency: data.peak_frequency || 0,
        peakMagnitude: data.peak_magnitude || -100,
        spectralCentroid: data.spectral_centroid || 0
      }
    },
    refetchInterval: useWebSocket ? false : pollingInterval,
    enabled: !useWebSocket
  })

  // Get current spectrum data
  const currentSpectrum = useWebSocket
    ? spectrum
    : (pollingQuery.data || DEFAULT_SPECTRUM)

  // Get peak info for tuner-like displays
  const getPeakInfo = useCallback(() => {
    return {
      frequency: currentSpectrum.peakFrequency,
      magnitude: currentSpectrum.peakMagnitude,
      note: frequencyToNote(currentSpectrum.peakFrequency)
    }
  }, [currentSpectrum])

  // Get band energy (useful for EQ-style displays)
  const getBandEnergy = useCallback((lowFreq: number, highFreq: number) => {
    const { magnitudes, frequencies } = currentSpectrum
    if (!magnitudes.length || !frequencies.length) return -100

    let sum = 0
    let count = 0

    for (let i = 0; i < frequencies.length; i++) {
      if (frequencies[i] >= lowFreq && frequencies[i] <= highFreq) {
        sum += Math.pow(10, magnitudes[i] / 20) // Convert from dB
        count++
      }
    }

    if (count === 0) return -100
    return 20 * Math.log10(sum / count) // Back to dB
  }, [currentSpectrum])

  return {
    spectrum: currentSpectrum,
    isConnected: useWebSocket ? isConnected : true,
    isLoading: !useWebSocket && pollingQuery.isLoading,
    isError: !useWebSocket && pollingQuery.isError,
    getPeakInfo,
    getBandEnergy
  }
}

// Helper: Convert frequency to musical note
function frequencyToNote(frequency: number): string {
  if (frequency <= 0) return '-'

  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const a4 = 440
  const semitones = 12 * Math.log2(frequency / a4)
  const noteNumber = Math.round(semitones) + 69 // MIDI note number for A4 is 69

  if (noteNumber < 0 || noteNumber > 127) return '-'

  const note = noteNames[noteNumber % 12]
  const octave = Math.floor(noteNumber / 12) - 1

  return `${note}${octave}`
}

export default useSpectrum
