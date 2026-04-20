import { useEffect, useRef } from 'react'

import { filterPlatformEventDecisions, usePlatformEventDecisions } from '../../hooks/usePlatformEventDecisions'

function playBeep(frequency: number, durationMs: number) {
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextCtor) {
    return
  }
  const context = new AudioContextCtor()
  const oscillator = context.createOscillator()
  const gainNode = context.createGain()
  oscillator.frequency.value = frequency
  gainNode.gain.value = 0.05
  oscillator.connect(gainNode)
  gainNode.connect(context.destination)
  oscillator.start()
  window.setTimeout(() => {
    oscillator.stop()
    void context.close()
  }, durationMs)
}

export function AudioBeepsPresenter() {
  const { decisions } = usePlatformEventDecisions()
  const presentedIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    for (const decision of filterPlatformEventDecisions(decisions, 'audio_beep')) {
      if (presentedIdsRef.current.has(decision.eventId)) {
        continue
      }
      presentedIdsRef.current.add(decision.eventId)
      playBeep(decision.severity === 'critical' ? 1040 : 820, decision.severity === 'critical' ? 220 : 140)
    }
  }, [decisions])

  return null
}
