import React from 'react'
import { Box, Typography, CircularProgress, Alert, Button } from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import { useTesiraDevices } from '../hooks/useTesiraApi'
import { useTesiraContext } from '../context/TesiraContext'
import { TesiraDeviceCard } from './TesiraDeviceCard'

export function TesiraFleetPanel() {
  const { data: devices, isLoading, isError, refetch } = useTesiraDevices()
  const { selectedDeviceId, selectDevice } = useTesiraContext()

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress size={24} />
      </Box>
    )
  }

  if (isError) {
    return (
      <Alert
        severity="error"
        action={
          <Button size="small" startIcon={<RefreshIcon />} onClick={() => refetch()}>
            Retry
          </Button>
        }
        sx={{ m: 1 }}
      >
        Failed to load Tesira fleet
      </Alert>
    )
  }

  if (!devices || devices.length === 0) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No Tesira devices configured.
        </Typography>
        <Typography variant="caption" color="text.disabled">
          Add devices via Settings → Tesira or in config.json.
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 0.5 }}>
        <Typography variant="caption" fontWeight={600} color="text.secondary" textTransform="uppercase" letterSpacing={0.8}>
          Fleet ({devices.length})
        </Typography>
        <Button size="small" onClick={() => refetch()} sx={{ minWidth: 0, p: 0.25 }}>
          <RefreshIcon sx={{ fontSize: 14 }} />
        </Button>
      </Box>

      {devices.map((device) => (
        <TesiraDeviceCard
          key={device.device_id}
          device={device}
          selected={selectedDeviceId === device.device_id}
          onSelect={() => selectDevice(
            selectedDeviceId === device.device_id ? null : device.device_id
          )}
        />
      ))}
    </Box>
  )
}
