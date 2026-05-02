/**
 * T2483 loop 18 / iter 174 — useMidiLearnPoll hook.
 *
 * Polls /api/midi/bindings/learn/last-cc every 250ms for up to 10s
 * after `start()` is called. On the first non-null response with
 * an observed_at NEWER than the start time, fires the onCapture
 * callback and stops polling.
 *
 * Per the iter-171 plan D1: 250ms × 10s polling is fast enough for
 * the Learn UX (operator plays a CC, field fills within a frame
 * or two). WebSocket can come later if operators ask for sub-100ms.
 *
 * The "newer than start time" filter prevents stale CCs (captured
 * before the operator clicked Learn) from being mis-attributed.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { midiBindingsApi, type LastCcResponse } from '../../../map2/clients/midiBindings'

const POLL_INTERVAL_MS = 250
const POLL_TIMEOUT_MS = 10_000

export interface MidiLearnPollResult {
  /** Whether the poll loop is currently running. */
  active: boolean
  /** Start polling. The next CC observed AFTER this call will fire onCapture. */
  start: () => void
  /** Cancel polling without firing a capture. */
  cancel: () => void
}

interface UseMidiLearnPollOptions {
  onCapture: (cc: LastCcResponse) => void
}

export function useMidiLearnPoll({ onCapture }: UseMidiLearnPollOptions): MidiLearnPollResult {
  const [active, setActive] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startedAtRef = useRef<number>(0)
  const onCaptureRef = useRef(onCapture)
  // Keep the onCapture ref current without retriggering effects.
  useEffect(() => {
    onCaptureRef.current = onCapture
  }, [onCapture])

  const cleanup = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setActive(false)
  }, [])

  const cancel = useCallback(() => {
    cleanup()
  }, [cleanup])

  const start = useCallback(() => {
    cleanup()
    // Start time in seconds (server returns observed_at as a unix
    // timestamp in seconds — see app/services/midi/routes.py:LastCcResponse).
    startedAtRef.current = Date.now() / 1000
    setActive(true)

    intervalRef.current = setInterval(async () => {
      try {
        const response = await midiBindingsApi.lastCc()
        if (response && response.observed_at > startedAtRef.current) {
          onCaptureRef.current(response)
          cleanup()
        }
      } catch {
        // Network error: keep polling until timeout. The operator can
        // hit Cancel if they want to abort.
      }
    }, POLL_INTERVAL_MS)

    timeoutRef.current = setTimeout(() => {
      cleanup()
    }, POLL_TIMEOUT_MS)
  }, [cleanup])

  // Cancel on unmount so polling doesn't outlive the page.
  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current)
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
    }
  }, [])

  return { active, start, cancel }
}
