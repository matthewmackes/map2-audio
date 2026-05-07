import { useCallback, useState } from 'react'
import { ActionableNotification } from '@carbon/react'
import { useReconnectDevice } from '../hooks/useTesiraApi'
import { useTesiraDeviceState } from '../hooks/useTesiraWebSocket'

export interface TesiraOfflineBannerProps {
  deviceId: string
}

/**
 * T2481-E4 (Notifications phase): migrated from a hand-rolled banner
 * with Carbon <Button> + <InlineLoading> to a Carbon <ActionableNotification>
 * (the platform pattern — same shape as AudioDeviceDisconnectedBanner).
 * The TesiraCarbonChrome stylesheet's tesira-offline-banner__* classes
 * are retired with this migration.
 */
export function TesiraOfflineBanner({ deviceId }: TesiraOfflineBannerProps) {
  const reconnect = useReconnectDevice()
  const [dismissed, setDismissed] = useState(false)
  const [reconnectMsg, setReconnectMsg] = useState<string | null>(null)
  const [nextRetryS, setNextRetryS] = useState<number | null>(null)

  useTesiraDeviceState(
    useCallback((event) => {
      if (event.device_id !== deviceId) return
      if (event.event === 'reconnecting') {
        setNextRetryS(event.next_retry_s ?? null)
        setDismissed(false)
      } else if (event.event === 'connected') {
        setDismissed(true)
        setReconnectMsg(null)
      } else if (event.event === 'disconnected') {
        setDismissed(false)
      }
    }, [deviceId]),
  )

  const handleTryNow = async () => {
    setReconnectMsg(null)
    try {
      const result = await reconnect.mutateAsync(deviceId)
      setReconnectMsg(result.message || 'Reconnect attempt sent. Checking again shortly.')
    } catch (error: unknown) {
      setReconnectMsg(`Failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (dismissed) return null

  const baseSubtitle =
    `MAP2 is probing port 61451 and retrying every 30s.` +
    (nextRetryS != null ? ` Next retry in ${nextRetryS}s.` : '') +
    ` Enable Telnet or SSH in Tesira Software once the control layout is deployed.`
  const subtitle = reconnectMsg ? `${baseSubtitle} ${reconnectMsg}` : baseSubtitle

  return (
    <ActionableNotification
      kind="warning"
      title="Device offline — TTP not reachable on port 23"
      subtitle={subtitle}
      actionButtonLabel={reconnect.isPending ? 'Trying…' : 'Try now'}
      onActionButtonClick={() => {
        void handleTryNow()
      }}
      onCloseButtonClick={() => setDismissed(true)}
      closeOnEscape
      role="status"
    />
  )
}
