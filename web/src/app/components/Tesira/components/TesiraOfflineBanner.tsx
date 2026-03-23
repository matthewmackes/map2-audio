import { useCallback, useState } from 'react'
import { Close, Renew, WifiOff } from '@carbon/icons-react'
import { Button, InlineLoading } from '@carbon/react'
import { useReconnectDevice } from '../hooks/useTesiraApi'
import { useTesiraDeviceState } from '../hooks/useTesiraWebSocket'
import './TesiraCarbonChrome.css'

export interface TesiraOfflineBannerProps {
  deviceId: string
}

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

  return (
    <div className="tesira-offline-banner">
      <div className="tesira-offline-banner__icon" aria-hidden>
        <WifiOff size={18} />
      </div>

      <div className="tesira-offline-banner__copy">
        <p className="tesira-offline-banner__title">Device offline — TTP not reachable on port 23</p>
        <p className="tesira-offline-banner__body">
          MAP2 is probing port 61451 and retrying every 30s.
          {nextRetryS != null ? ` Next retry in ${nextRetryS}s.` : ''}
          {' '}Enable Telnet or SSH in Tesira Software once the control layout is deployed.
        </p>
        {reconnectMsg ? <p className="tesira-offline-banner__body">{reconnectMsg}</p> : null}
      </div>

      <div className="tesira-offline-banner__actions">
        <Button
          size="sm"
          kind="secondary"
          renderIcon={Renew}
          disabled={reconnect.isPending}
          onClick={() => {
            void handleTryNow()
          }}
        >
          {reconnect.isPending ? 'Trying…' : 'Try now'}
        </Button>
        {reconnect.isPending ? <InlineLoading description="Sending reconnect request" /> : null}
        <Button
          kind="ghost"
          size="sm"
          hasIconOnly
          renderIcon={Close}
          iconDescription="Dismiss offline banner"
          onClick={() => setDismissed(true)}
        />
      </div>
    </div>
  )
}
