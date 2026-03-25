import { useEffect, useState } from 'react'

export interface PollingResourceState<T> {
  data: T | null
  error: string | null
  loading: boolean
}

export function usePollingResource<T>(
  load: () => Promise<T>,
  intervalMs = 5000,
): PollingResourceState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function run(): Promise<void> {
      try {
        const next = await load()
        if (!active) {
          return
        }
        setData(next)
        setError(null)
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : String(loadError))
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void run()
    const timer = setInterval(() => {
      void run()
    }, intervalMs)

    return () => {
      active = false
      clearInterval(timer)
    }
  }, [intervalMs, load])

  return { data, error, loading }
}
