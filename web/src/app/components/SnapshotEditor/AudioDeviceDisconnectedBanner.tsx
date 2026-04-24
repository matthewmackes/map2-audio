import { ActionableNotification } from '@carbon/react'
import { useCallback, useState } from 'react'

import {
  recoverAudioDevice,
  type AudioDeviceHealth,
} from '../../hooks/useAudioDeviceHealth'

interface AudioDeviceDisconnectedBannerProps {
  health: AudioDeviceHealth | null | undefined
  onRecovered?: (health: AudioDeviceHealth) => void
}

/**
 * T2451: first-class inline banner for audio interface disconnect.
 * Only renders when backend reports the device is disconnected. The
 * primary action forces a JUCE engine reinit + audio start.
 */
export function AudioDeviceDisconnectedBanner({
  health,
  onRecovered,
}: AudioDeviceDisconnectedBannerProps) {
  const [recovering, setRecovering] = useState(false)
  const [recoveryError, setRecoveryError] = useState<string | null>(null)

  const handleRecover = useCallback(async () => {
    setRecovering(true)
    setRecoveryError(null)
    try {
      const next = await recoverAudioDevice()
      onRecovered?.(next)
    } catch (err) {
      setRecoveryError(err instanceof Error ? err.message : String(err))
    } finally {
      setRecovering(false)
    }
  }, [onRecovered])

  if (!health) return null
  const disconnected = !health.device_connected
  if (!disconnected) return null

  const deviceLabel = health.device_name ?? 'audio interface'
  const subtitle = health.last_error
    ? `Last error: ${health.last_error}`
    : health.recovery_attempts > 0
      ? `Recovery attempts so far: ${health.recovery_attempts}.`
      : 'The backend has lost its audio device.'

  return (
    <ActionableNotification
      kind="error"
      title={`Audio interface disconnected — ${deviceLabel}`}
      subtitle={recoveryError ? `${subtitle} Reconnect failed: ${recoveryError}` : subtitle}
      actionButtonLabel={recovering ? 'Reconnecting…' : 'Reconnect now'}
      onActionButtonClick={handleRecover}
      hideCloseButton
      lowContrast={false}
      role="alert"
    />
  )
}
