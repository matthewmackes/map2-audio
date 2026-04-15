import { useEffect, useState, useRef } from 'react'

interface LCDData {
  output: string
  lines: string[]
}

interface UseLCDDataReturn {
  data: LCDData | null
  isLoading: boolean
  isConnected: boolean
  error: Error | null
}

const POLL_INTERVAL_MS = 1000 // Update LCD display every 1 second

export function useLCDData(): UseLCDDataReturn {
  const [data, setData] = useState<LCDData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const fetchLCDData = async () => {
      try {
        const response = await fetch('/api/lcd/simulation')
        
        if (!response.ok) {
          throw new Error(`LCD API error: ${response.status} ${response.statusText}`)
        }

        const lcdData: LCDData = await response.json()
        
        if (isMountedRef.current) {
          setData(lcdData)
          setIsConnected(true)
          setError(null)
          
          if (isLoading) {
            setIsLoading(false)
          }
        }
      } catch (err) {
        if (isMountedRef.current) {
          setError(err instanceof Error ? err : new Error(String(err)))
          setIsConnected(false)
          
          if (isLoading) {
            setIsLoading(false)
          }
        }
      }
    }

    // Initial fetch
    fetchLCDData()

    // Set up polling for real-time updates
    pollIntervalRef.current = setInterval(fetchLCDData, POLL_INTERVAL_MS)

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [isLoading])

  return {
    data,
    isLoading,
    isConnected,
    error,
  }
}
