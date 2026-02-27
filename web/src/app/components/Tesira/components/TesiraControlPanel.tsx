import React, { useState, useCallback } from 'react'
import {
  Box, Tabs, Tab, Typography, CircularProgress, Alert,
  Paper, Button, Collapse,
} from '@mui/material'
import WifiOffIcon from '@mui/icons-material/WifiOff'
import SyncIcon from '@mui/icons-material/Sync'
import CloseIcon from '@mui/icons-material/Close'
import { useTesiraDevice, useReconnectDevice } from '../hooks/useTesiraApi'
import { useTesiraDeviceState } from '../hooks/useTesiraWebSocket'
import { useTesiraContext } from '../context/TesiraContext'
import { TesiraDeviceHeader } from './TesiraDeviceHeader'
import { TesiraLevelsTab } from './TesiraLevelsTab'
import { TesiraMixerTab } from './TesiraMixerTab'
import { TesiraEQTab } from './TesiraEQTab'
import { TesiraPresetsTab } from './TesiraPresetsTab'
import { TesiraAvbTab } from './TesiraAvbTab'
import { TesiraFaultsTab } from './TesiraFaultsTab'
import { TesiraFirmwareTab } from './TesiraFirmwareTab'
import { TesiraLoopBuilderTab } from './TesiraLoopBuilderTab'

const TABS = ['Levels', 'Mixer', 'EQ', 'Presets', 'AVB Streams', 'Faults', 'Firmware', 'Loops']

export function TesiraControlPanel() {
  const { selectedDeviceId, selectedTab, setSelectedTab } = useTesiraContext()

  if (!selectedDeviceId) {
    return (
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'text.disabled',
        }}
      >
        <Typography variant="body2">Select a device from the fleet panel</Typography>
      </Box>
    )
  }

  return (
    <DevicePanel deviceId={selectedDeviceId} tab={selectedTab} onTabChange={setSelectedTab} />
  )
}

interface DevicePanelProps {
  deviceId: string
  tab: number
  onTabChange: (n: number) => void
}

function DevicePanel({ deviceId, tab, onTabChange }: DevicePanelProps) {
  const { data: device, isLoading, isError } = useTesiraDevice(deviceId)

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress size={28} />
      </Box>
    )
  }

  if (isError || !device) {
    return <Alert severity="error" sx={{ m: 2 }}>Failed to load device details</Alert>
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <TesiraDeviceHeader device={device} />

      {/* Offline reconnect banner */}
      {!device.connected && (
        <OfflineBanner deviceId={deviceId} />
      )}

      <Tabs
        value={tab}
        onChange={(_e, v) => onTabChange(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 36 }}
        TabIndicatorProps={{ style: { backgroundColor: '#E31837' } }}
      >
        {TABS.map((label) => (
          <Tab
            key={label}
            label={label}
            sx={{ fontSize: 12, minHeight: 36, py: 0.5 }}
          />
        ))}
      </Tabs>

      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {tab === 0 && <TesiraLevelsTab deviceId={deviceId} />}
        {tab === 1 && <TesiraMixerTab deviceId={deviceId} />}
        {tab === 2 && <TesiraEQTab deviceId={deviceId} />}
        {tab === 3 && <TesiraPresetsTab deviceId={deviceId} />}
        {tab === 4 && <TesiraAvbTab deviceId={deviceId} />}
        {tab === 5 && <TesiraFaultsTab deviceId={deviceId} />}
        {tab === 6 && <TesiraFirmwareTab deviceId={deviceId} />}
        {tab === 7 && <TesiraLoopBuilderTab deviceId={deviceId} />}
      </Box>
    </Box>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Offline banner with reconnect status + "Try Now" button
// ─────────────────────────────────────────────────────────────────────────────

function OfflineBanner({ deviceId }: { deviceId: string }) {
  const reconnect = useReconnectDevice()
  const [dismissed, setDismissed] = useState(false)
  const [reconnectMsg, setReconnectMsg] = useState<string | null>(null)
  const [nextRetryS, setNextRetryS] = useState<number | null>(null)

  // Listen for WS reconnecting events for this device
  useTesiraDeviceState(
    useCallback((event) => {
      if (event.device_id !== deviceId) return
      if (event.event === 'reconnecting') {
        setNextRetryS(event.next_retry_s ?? null)
        setDismissed(false)
      } else if (event.event === 'connected') {
        setDismissed(true)
        setReconnectMsg(null)
      }
    }, [deviceId]),
  )

  const handleTryNow = async () => {
    setReconnectMsg(null)
    try {
      const result = await reconnect.mutateAsync(deviceId)
      setReconnectMsg(result.message || 'Reconnect attempt sent. Checking in 3s…')
    } catch (err: unknown) {
      setReconnectMsg(`Failed: ${err instanceof Error ? err.message : String(err)}`)
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
        <WifiOffIcon sx={{ fontSize: 18, color: 'warning.main', flexShrink: 0, mt: 0.25 }} />

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" fontWeight={700} color="warning.main" display="block">
            Device offline — TTP not reachable on port 23
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>
            MAP2 is probing port 61451 and retrying every 30s.
            {nextRetryS != null && ` Next retry in ${nextRetryS}s.`}
            {' '}Enable Telnet in Tesira Software: <em>Device Maintenance → Network Settings → Enable Telnet</em>.
          </Typography>
          {reconnectMsg && (
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
              {reconnectMsg}
            </Typography>
          )}
        </Box>

        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexShrink: 0 }}>
          <Button
            size="small"
            variant="outlined"
            color="warning"
            startIcon={
              reconnect.isPending
                ? <CircularProgress size={12} color="inherit" />
                : <SyncIcon sx={{ fontSize: 14 }} />
            }
            disabled={reconnect.isPending}
            onClick={handleTryNow}
            sx={{ fontSize: 11, py: 0.25, px: 1 }}
          >
            {reconnect.isPending ? 'Trying…' : 'Try Now'}
          </Button>
          <Button
            size="small"
            variant="text"
            color="inherit"
            sx={{ fontSize: 11, py: 0.25, px: 0.75, minWidth: 0, color: 'text.disabled' }}
            onClick={() => setDismissed(true)}
          >
            <CloseIcon sx={{ fontSize: 14 }} />
          </Button>
        </Box>
      </Paper>
    </Collapse>
  )
}
