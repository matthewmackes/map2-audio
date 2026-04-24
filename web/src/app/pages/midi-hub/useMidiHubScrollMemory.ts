import { useCallback, useEffect, useRef } from 'react'

import { useMidiHubNavStore } from '../../stores/midiHubNavStore'

export interface MidiHubScrollMemoryHandle {
  containerRef: React.MutableRefObject<HTMLDivElement | null>
  onScroll: React.UIEventHandler<HTMLDivElement>
}

export function useMidiHubScrollMemory(routeKey: string): MidiHubScrollMemoryHandle {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const scrollTop = useMidiHubNavStore((state) => state.getScrollTop(routeKey))
  const setScrollTop = useMidiHubNavStore((state) => state.setScrollTop)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (containerRef.current) {
        containerRef.current.scrollTop = scrollTop
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [routeKey, scrollTop])

  const onScroll = useCallback<React.UIEventHandler<HTMLDivElement>>(
    (event) => setScrollTop(routeKey, event.currentTarget.scrollTop),
    [routeKey, setScrollTop],
  )

  return { containerRef, onScroll }
}
