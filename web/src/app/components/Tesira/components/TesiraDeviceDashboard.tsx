import React, { useState } from 'react'
import { Box, Paper, Typography, Grid, CircularProgress, Button, Chip } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { useTesiraDevice } from '../hooks/useTesiraApi'
import { TesiraFleetHealth } from './TesiraFleetHealth'
import { TesiraPtpTopology } from './TesiraPtpTopology'
import { TesiraDeployDialog } from './TesiraDeployDialog'

interface TesiraDeviceDashboardProps {
  deviceId: string
}

export function TesiraDeviceDashboard({ deviceId }: TesiraDeviceDashboardProps) {
  const { data: device, isLoading } = useTesiraDevice(deviceId)
  const [deployOpen, setDeployOpen] = useState(false)

  if (isLoading || !device) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress size={24} />
      </Box>
    )
  }

  const cards = [
    { label: 'Connection', value: device.connected ? 'Online' : 'Offline' },
    { label: 'Faults', value: String(device.fault_count ?? 0) },
    { label: 'AVB Streams', value: String(device.avb_stream_count ?? 0) },
    { label: 'PTP', value: device.ptp_state || 'Unknown' },
  ]
  const talkers = device.avb_streams.filter((stream) => stream.direction === 'talker').length
  const listeners = device.avb_streams.filter((stream) => stream.direction === 'listener').length
  const streamHealth = device.connected ? 'Healthy' : 'Offline'

  return (
    <Box className="tesira-device-dashboard" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="subtitle1" fontWeight={700}>
        {device.name || device.host}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {device.host}:{device.port} {device.firmware_version ? ` · fw ${device.firmware_version}` : ''}
      </Typography>

      <Grid container spacing={1.5}>
        {cards.map((card) => (
          <Grid key={card.label} item xs={12} sm={6} md={3}>
            <Paper variant="outlined" sx={{ p: 1.25 }}>
              <Typography variant="caption" color="text.secondary">{card.label}</Typography>
              <Typography variant="body2" fontWeight={700}>{card.value}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Box className="tesira-dashboard-actions" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button size="small" component={RouterLink} to={`/tesira/${deviceId}/levels`} variant="outlined">Levels</Button>
        <Button size="small" component={RouterLink} to={`/tesira/${deviceId}/mixer`} variant="outlined">Mixer</Button>
        <Button size="small" component={RouterLink} to={`/tesira/${deviceId}/eq`} variant="outlined">EQ</Button>
        <Button size="small" component={RouterLink} to={`/tesira/${deviceId}/presets`} variant="outlined">Presets</Button>
        <Button size="small" component={RouterLink} to={`/tesira/${deviceId}/design`} variant="outlined">Design</Button>
        <Button size="small" component={RouterLink} to={`/tesira/${deviceId}/dsp`} variant="outlined">DSP</Button>
        <Button size="small" component={RouterLink} to={`/tesira/${deviceId}/settings`} variant="outlined">Settings</Button>
        <Button size="small" onClick={() => setDeployOpen(true)} variant="outlined">Deploy Chain</Button>
        <Button size="small" component={RouterLink} to="/avb-routing" variant="outlined">AVB Routing</Button>
      </Box>

      <Paper variant="outlined" sx={{ p: 1.25 }}>
        <Typography variant="caption" color="text.secondary">AVB Stream Health</Typography>
        <Box sx={{ mt: 0.75, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Chip
            size="small"
            color={streamHealth === 'Healthy' ? 'success' : 'default'}
            label={streamHealth}
          />
          <Typography variant="caption" color="text.secondary">Talkers: {talkers}</Typography>
          <Typography variant="caption" color="text.secondary">Listeners: {listeners}</Typography>
          <Button size="small" component={RouterLink} to={`/tesira/${deviceId}/avb`} variant="text">
            View Streams
          </Button>
        </Box>
      </Paper>

      <Grid container spacing={1.5}>
        <Grid item xs={12} md={5}>
          <TesiraFleetHealth />
        </Grid>
        <Grid item xs={12} md={7}>
          <TesiraPtpTopology />
        </Grid>
      </Grid>

      <TesiraDeployDialog
        deviceId={deviceId}
        open={deployOpen}
        onClose={() => setDeployOpen(false)}
      />
    </Box>
  )
}
