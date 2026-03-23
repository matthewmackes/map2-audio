import { useCallback, useState } from 'react'
import { Close, Renew, WifiOff } from '@carbon/icons-react'
import { Box, Button, CircularProgress, Collapse, Paper, Typography } from '@mui/material'
import { useReconnectDevice } from '../hooks/useTesiraApi'
import { useTesiraDeviceState } from '../hooks/useTesiraWebSocket'

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
    <Collapse in>
      <Paper
        elevation={0}
        sx={{
          mx: 1.5,
          mt: 1,
          p: 1.25,
          bgcolor: 'rgba(245,158,11,0.08)',
          border: '1px solid',
          borderColor: 'warning.dark',
          borderRadius: 1,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1.25,
        }}
      >
        <Box sx={{ display: 'flex', color: 'warning.main', flexShrink: 0, mt: 0.25 }}>
          <WifiOff size={18} />
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" fontWeight={700} color="warning.main" display="block">
            Device offline — TTP not reachable on port 23
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>
            MAP2 is probing port 61451 and retrying every 30s.
            {nextRetryS != null ? ` Next retry in ${nextRetryS}s.` : ''}
            {' '}Enable Telnet or SSH in Tesira Software once the control layout is deployed.
          </Typography>
          {reconnectMsg ? (
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
              {reconnectMsg}
            </Typography>
          ) : null}
        </Box>

        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexShrink: 0 }}>
          <Button
            size="small"
            variant="outlined"
            color="warning"
            startIcon={reconnect.isPending ? <CircularProgress size={12} color="inherit" /> : <Renew size={14} />}
            disabled={reconnect.isPending}
            onClick={() => {
              void handleTryNow()
            }}
            sx={{ fontSize: 11, py: 0.25, px: 1 }}
          >
            {reconnect.isPending ? 'Trying…' : 'Try now'}
          </Button>
          <Button
            size="small"
            variant="text"
            color="inherit"
            sx={{ fontSize: 11, py: 0.25, px: 0.75, minWidth: 0, color: 'text.disabled' }}
            onClick={() => setDismissed(true)}
          >
            <Close size={14} />
          </Button>
        </Box>
      </Paper>
    </Collapse>
  )
}
