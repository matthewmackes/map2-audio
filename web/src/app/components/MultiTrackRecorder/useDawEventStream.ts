/**
 * T2503 Set 10 — DAW event-stream subscription hook.
 *
 * Wraps openDawEventStream() with a React-lifecycle-safe subscription.
 * Each sub-area page that needs WS events calls this and gets a
 * bounded sliding window (default 50 entries).
 *
 * Shared by Transport (timeline + event trace) and Sessions (project
 * lifecycle events) sub-areas. Other sub-areas may add subscriptions
 * as needed in later sets.
 */
import { useEffect, useState } from 'react'

import { openDawEventStream, type DawEvent } from '../../../map2/clients/daw'

export function useDawEventStream(window = 50): DawEvent[] {
  const [events, setEvents] = useState<DawEvent[]>([])

  useEffect(() => {
    const stream = openDawEventStream(
      (event) => setEvents((prev) => {
        const next = [...prev, event]
        return next.length > window ? next.slice(next.length - window) : next
      }),
      (err) => {
        // Surface the error in the console only; the shell drawer
        // shows aggregate health and operators see disconnected state
        // there. Per CLAUDE.md feedback: no toast noise for transient
        // socket errors.
        console.warn('[multitrack] WS error', err)
      },
    )
    return () => stream.close()
  }, [window])

  return events
}
