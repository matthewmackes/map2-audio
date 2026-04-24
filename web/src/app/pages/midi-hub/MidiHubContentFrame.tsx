import type { ReactNode } from 'react'

import { useMidiHubScrollMemory } from './useMidiHubScrollMemory'
import './MidiHubContentFrame.css'

interface MidiHubContentFrameProps {
  routeKey: string
  children: ReactNode
}

export function MidiHubContentFrame({ routeKey, children }: MidiHubContentFrameProps) {
  const { containerRef, onScroll } = useMidiHubScrollMemory(routeKey)
  return (
    <div
      ref={containerRef}
      className="midi-hub-content-frame"
      onScroll={onScroll}
    >
      <div className="midi-hub-content-frame__stack">{children}</div>
    </div>
  )
}
