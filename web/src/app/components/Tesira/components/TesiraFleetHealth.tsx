import React from 'react'
import { Box, Chip, CircularProgress, Paper, Typography } from '@mui/material'
import { useTesiraFleetHealth } from '../hooks/useTesiraApi'

export function TesiraFleetHealth() {
  const { data: health, isLoading: loading } = useTesiraFleetHealth()

  return (
    <Paper variant="outlined" sx={{ p: 1.25 }}>
      <Typography variant="caption" color="text.secondary">Fleet Health</Typography>
      {loading && !health ? (
        <Box sx={{ mt: 0.5 }}><CircularProgress size={14} /></Box>
      ) : (
        <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Chip
            label={health ? `${health.connected_devices}/${health.total_devices} online` : 'Unknown'}
            size="small"
            color={health?.status === 'healthy' ? 'success' : 'warning'}
          />
          <Typography variant="caption" color="text.secondary">
            Offline: {health?.offline_devices ?? '—'}
          </Typography>
        </Box>
      )}
    </Paper>
  )
}
