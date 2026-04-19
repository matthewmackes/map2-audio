import { useEffect, useRef, useState } from 'react'

import { systemApi } from '../../map2/clients/platform'
import { returnHomeDesktopToBoot } from '../pages/homeDesktopSession'

export type RestartProgressStage = 'idle' | 'stopping' | 'restarting' | 'reconnecting' | 'ready' | 'error'

export type RestartProgressStep = {
  key: Exclude<RestartProgressStage, 'idle' | 'error'>
  label: string
  description: string
}

const RESTART_PROGRESS_STEPS: readonly RestartProgressStep[] = [
  { key: 'stopping', label: 'Stopping engine', description: 'Closing active backend processes and preparing the shell for restart.' },
  { key: 'restarting', label: 'Restarting service', description: 'Waiting for the MAP2 backend service manager to bring the runtime back.' },
  { key: 'reconnecting', label: 'Reconnecting', description: 'Restoring live shell connectivity and validating the desktop session.' },
  { key: 'ready', label: 'Ready', description: 'Backend is reachable again. Returning to the boot splash.' },
] as const

export function useRestartBackend({
  closeShellMenus,
  websocketStatus,
}: {
  closeShellMenus: () => void
  websocketStatus: string
}) {
  const [restartConfirmOpen, setRestartConfirmOpen] = useState(false)
  const [restartProgressStage, setRestartProgressStage] = useState<RestartProgressStage>('idle')
  const [restartError, setRestartError] = useState<string | null>(null)
  const restartSawUnavailableRef = useRef(false)
  const restartSawReconnectRef = useRef(false)
  const restartCompletionRequestedRef = useRef(false)

  const handleConfirmRestartBackend = async () => {
    setRestartConfirmOpen(false)
    closeShellMenus()
    restartSawUnavailableRef.current = false
    restartSawReconnectRef.current = false
    restartCompletionRequestedRef.current = false
    setRestartError(null)

    try {
      await systemApi.restartBackend()
      setRestartProgressStage('stopping')
    } catch (err) {
      setRestartError(err instanceof Error ? err.message : 'Failed to restart backend.')
      setRestartProgressStage('error')
    }
  }

  useEffect(() => {
    if (restartProgressStage === 'idle' || restartProgressStage === 'error') {
      return undefined
    }

    if (restartProgressStage === 'stopping') {
      const timerId = window.setTimeout(() => setRestartProgressStage('restarting'), 1100)
      return () => window.clearTimeout(timerId)
    }

    if (restartProgressStage === 'restarting') {
      const timerId = window.setTimeout(() => setRestartProgressStage('reconnecting'), 1200)
      return () => window.clearTimeout(timerId)
    }

    if (restartProgressStage === 'ready' && !restartCompletionRequestedRef.current) {
      restartCompletionRequestedRef.current = true
      const timerId = window.setTimeout(() => {
        returnHomeDesktopToBoot()
      }, 900)
      return () => window.clearTimeout(timerId)
    }

    return undefined
  }, [restartProgressStage])

  useEffect(() => {
    if (!['stopping', 'restarting', 'reconnecting'].includes(restartProgressStage)) {
      return undefined
    }

    let cancelled = false

    const probeHealth = async () => {
      try {
        const response = await fetch('/api/health', { cache: 'no-store' })
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        if (!cancelled && restartSawUnavailableRef.current) {
          setRestartProgressStage('ready')
        }
      } catch {
        restartSawUnavailableRef.current = true
      }
    }

    void probeHealth()
    const intervalId = window.setInterval(() => {
      void probeHealth()
    }, 1000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [restartProgressStage])

  useEffect(() => {
    if (!['stopping', 'restarting', 'reconnecting'].includes(restartProgressStage)) {
      return
    }

    if (websocketStatus === 'reconnecting' || websocketStatus === 'error') {
      restartSawReconnectRef.current = true
      setRestartProgressStage('reconnecting')
      return
    }

    if (websocketStatus === 'connected' && restartSawReconnectRef.current) {
      setRestartProgressStage('ready')
    }
  }, [restartProgressStage, websocketStatus])

  const restartProgressIndex = Math.max(
    0,
    RESTART_PROGRESS_STEPS.findIndex((step) => step.key === restartProgressStage),
  )
  const restartCurrentStep = restartProgressStage === 'error'
    ? null
    : RESTART_PROGRESS_STEPS[restartProgressIndex] ?? RESTART_PROGRESS_STEPS[0]

  return {
    restartConfirmOpen,
    restartProgressStage,
    restartError,
    restartProgressSteps: RESTART_PROGRESS_STEPS,
    restartProgressIndex,
    restartCurrentStep,
    setRestartConfirmOpen,
    setRestartProgressStage,
    handleConfirmRestartBackend,
  }
}
