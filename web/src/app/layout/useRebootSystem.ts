import { useEffect, useRef, useState } from 'react'

import { systemApi } from '../../map2/clients/platform'

export type RebootStage =
  | 'idle'
  | 'preflight'
  | 'saving-state'
  | 'stopping-audio'
  | 'stopping-services'
  | 'shutting-down-os'
  | 'waiting-for-hardware'
  | 'reconnecting'
  | 'ready'
  | 'error'
  | 'timeout'

export type RebootProgressStep = {
  key: Exclude<RebootStage, 'idle' | 'preflight' | 'error' | 'timeout'>
  label: string
  description: string
}

export type RebootPreflightResult = {
  audioLive: boolean
  avbEnabled: boolean
  midiLearning: boolean
  snapshotPending: boolean
}

export const REBOOT_PROGRESS_STEPS: readonly RebootProgressStep[] = [
  {
    key: 'saving-state',
    label: 'Saving system state',
    description: 'Flushing active session data and securing your current settings to disk.',
  },
  {
    key: 'stopping-audio',
    label: 'Stopping the audio engine',
    description: 'Gracefully halting the audio processing pipeline. Output will go silent.',
  },
  {
    key: 'stopping-services',
    label: 'Stopping platform services',
    description: 'Closing the MAP2 platform services, routing layer, and device managers.',
  },
  {
    key: 'shutting-down-os',
    label: 'Shutting down the foundational OS',
    description:
      'The operating system is powering down all hardware drivers and core processes. This is normal.',
  },
  {
    key: 'waiting-for-hardware',
    label: 'Waiting for hardware to come back online',
    description:
      'The system is coming back up. USB audio devices, AVB interfaces, and MIDI controllers are re-enumerating.',
  },
  {
    key: 'reconnecting',
    label: 'Reconnecting to the platform',
    description: 'Restoring your browser connection to the MAP2 platform and verifying services.',
  },
  {
    key: 'ready',
    label: 'System ready',
    description: 'Full platform reboot complete. All systems are back online.',
  },
] as const

const REBOOT_TIMEOUT_MS = 180_000
const HEALTH_POLL_INTERVAL_MS = 2000
// Staged delays — reboot takes much longer than a backend restart.
const STAGE_DELAYS: Partial<Record<RebootStage, number>> = {
  'saving-state': 2200,
  'stopping-audio': 1800,
  'stopping-services': 2000,
  'shutting-down-os': 0, // held here until health probe sees unavailable
}

export function useRebootSystem({
  closeShellMenus,
  websocketStatus,
}: {
  closeShellMenus: () => void
  websocketStatus: string
}) {
  const [rebootConfirmOpen, setRebootConfirmOpen] = useState(false)
  const [rebootStage, setRebootStage] = useState<RebootStage>('idle')
  const [rebootError, setRebootError] = useState<string | null>(null)
  const [preflight, setPreflight] = useState<RebootPreflightResult | null>(null)
  const [preflightLoading, setPreflightLoading] = useState(false)

  const sawUnavailableRef = useRef(false)
  const sawReconnectRef = useRef(false)
  const completionRequestedRef = useRef(false)
  const rebootStartTimeRef = useRef<number | null>(null)
  const timeoutHandleRef = useRef<number | null>(null)

  // ── Preflight check ────────────────────────────────────────────────────────
  const runPreflight = async () => {
    setPreflightLoading(true)
    try {
      const [health, midi] = await Promise.allSettled([
        fetch('/api/health', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/v2/midi/learn/status', { cache: 'no-store' }).then((r) => r.json()),
      ])

      const healthData = health.status === 'fulfilled' ? health.value : null
      const midiData = midi.status === 'fulfilled' ? midi.value : null

      setPreflight({
        audioLive: healthData?.audio_running ?? false,
        avbEnabled: healthData?.subsystems?.audio?.avb_enabled ?? false,
        midiLearning: midiData?.learning ?? false,
        snapshotPending: false, // websocket-based — assume safe
      })
    } catch {
      setPreflight({ audioLive: false, avbEnabled: false, midiLearning: false, snapshotPending: false })
    } finally {
      setPreflightLoading(false)
    }
  }

  const handleOpenRebootConfirm = async () => {
    closeShellMenus()
    setRebootStage('preflight')
    setRebootConfirmOpen(true)
    await runPreflight()
  }

  // ── Confirm and begin ──────────────────────────────────────────────────────
  const handleConfirmReboot = async () => {
    setRebootConfirmOpen(false)
    sawUnavailableRef.current = false
    sawReconnectRef.current = false
    completionRequestedRef.current = false
    rebootStartTimeRef.current = Date.now()
    setRebootError(null)
    setRebootStage('saving-state')

    // Install the 180-second timeout
    timeoutHandleRef.current = window.setTimeout(() => {
      setRebootStage('timeout')
    }, REBOOT_TIMEOUT_MS)

    try {
      await systemApi.restartSystem()
    } catch (err) {
      window.clearTimeout(timeoutHandleRef.current ?? undefined)
      setRebootError(err instanceof Error ? err.message : 'Failed to send reboot command.')
      setRebootStage('error')
    }
  }

  // ── beforeunload guard ─────────────────────────────────────────────────────
  useEffect(() => {
    const active = ['saving-state', 'stopping-audio', 'stopping-services', 'shutting-down-os', 'waiting-for-hardware', 'reconnecting'].includes(rebootStage)
    if (!active) return

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = 'A system reboot is in progress — leaving this page may cause you to miss reconnection.'
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [rebootStage])

  // ── Staged delays for early phases ────────────────────────────────────────
  useEffect(() => {
    if (rebootStage === 'idle' || rebootStage === 'error' || rebootStage === 'timeout' || rebootStage === 'preflight') {
      return
    }

    const delay = STAGE_DELAYS[rebootStage]
    if (delay == null) return

    const stageOrder: Array<Exclude<RebootStage, 'idle' | 'preflight' | 'error' | 'timeout'>> = [
      'saving-state',
      'stopping-audio',
      'stopping-services',
      'shutting-down-os',
      'waiting-for-hardware',
      'reconnecting',
      'ready',
    ]
    const currentIndex = stageOrder.indexOf(rebootStage as typeof stageOrder[number])
    if (currentIndex === -1 || currentIndex + 1 >= stageOrder.length) return

    const next = stageOrder[currentIndex + 1]
    // For shutting-down-os, we advance only after health probe confirms unavailable
    if (rebootStage === 'shutting-down-os') return

    const id = window.setTimeout(() => setRebootStage(next), delay)
    return () => window.clearTimeout(id)
  }, [rebootStage])

  // ── Health probe (detects system going down, then coming back) ─────────────
  useEffect(() => {
    const activeForProbe = ['stopping-services', 'shutting-down-os', 'waiting-for-hardware', 'reconnecting'].includes(rebootStage)
    if (!activeForProbe) return undefined

    let cancelled = false

    const probe = async () => {
      try {
        const resp = await fetch('/api/live', { cache: 'no-store', signal: AbortSignal.timeout(3000) })
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        // System is back
        if (!cancelled && sawUnavailableRef.current) {
          setRebootStage('reconnecting')
        }
      } catch {
        // System is down — expected during OS reboot
        sawUnavailableRef.current = true
        if (!cancelled && rebootStage === 'shutting-down-os') {
          setRebootStage('waiting-for-hardware')
        }
      }
    }

    void probe()
    const id = window.setInterval(() => void probe(), HEALTH_POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [rebootStage])

  // ── WebSocket reconnection signal ─────────────────────────────────────────
  useEffect(() => {
    const activeForWs = ['stopping-services', 'shutting-down-os', 'waiting-for-hardware', 'reconnecting'].includes(rebootStage)
    if (!activeForWs) return

    if (websocketStatus === 'reconnecting' || websocketStatus === 'error') {
      sawReconnectRef.current = true
      setRebootStage('reconnecting')
      return
    }

    if (websocketStatus === 'connected' && sawReconnectRef.current) {
      setRebootStage('ready')
    }
  }, [rebootStage, websocketStatus])

  // ── Ready → dismiss ────────────────────────────────────────────────────────
  useEffect(() => {
    if (rebootStage !== 'ready' || completionRequestedRef.current) return

    completionRequestedRef.current = true
    window.clearTimeout(timeoutHandleRef.current ?? undefined)
  }, [rebootStage])

  // ── Cleanup timeout on unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      window.clearTimeout(timeoutHandleRef.current ?? undefined)
    }
  }, [])

  const rebootProgressIndex = Math.max(
    0,
    REBOOT_PROGRESS_STEPS.findIndex((s) => s.key === rebootStage),
  )
  const rebootCurrentStep =
    rebootStage === 'error' || rebootStage === 'timeout' || rebootStage === 'idle' || rebootStage === 'preflight'
      ? null
      : REBOOT_PROGRESS_STEPS[rebootProgressIndex] ?? REBOOT_PROGRESS_STEPS[0]

  return {
    rebootConfirmOpen,
    rebootStage,
    rebootError,
    preflight,
    preflightLoading,
    rebootProgressIndex,
    rebootCurrentStep,
    handleOpenRebootConfirm,
    handleConfirmReboot,
    setRebootStage,
    setRebootConfirmOpen,
  }
}
