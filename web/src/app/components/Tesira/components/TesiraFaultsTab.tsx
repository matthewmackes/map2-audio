import React from 'react'
import {
  Box, Typography, List, ListItem, ListItemIcon, ListItemText,
  Button, CircularProgress, Alert,
} from '@mui/material'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RefreshIcon from '@mui/icons-material/Refresh'
import { useTesiraFaults } from '../hooks/useTesiraApi'

interface TesiraFaultsTabProps {
  deviceId: string
}

export function TesiraFaultsTab({ deviceId }: TesiraFaultsTabProps) {
  const { data, isLoading, isError, refetch } = useTesiraFaults(deviceId)

  if (isLoading) return <Box sx={{ p: 2 }}><CircularProgress size={20} /></Box>

  if (isError) {
    return (
      <Alert severity="error" sx={{ m: 1 }}
        action={<Button size="small" onClick={() => refetch()}>Retry</Button>}
      >
        Failed to load fault list
      </Alert>
    )
  }

  const faults = data?.faults ?? []

  return (
    <Box sx={{ p: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="caption" fontWeight={600} color="text.secondary">
          ACTIVE FAULTS ({faults.length})
        </Typography>
        <Button size="small" startIcon={<RefreshIcon />} onClick={() => refetch()} sx={{ fontSize: 11 }}>
          Refresh
        </Button>
      </Box>

      {faults.length === 0 ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1 }}>
          <CheckCircleIcon sx={{ color: 'success.main', fontSize: 18 }} />
          <Typography variant="body2" color="success.main">No active faults</Typography>
        </Box>
      ) : (
        <List dense disablePadding>
          {faults.map((fault, idx) => (
            <ListItem key={idx} divider sx={{ py: 0.5 }}>
              <ListItemIcon sx={{ minWidth: 28 }}>
                <WarningAmberIcon sx={{ fontSize: 16, color: 'warning.main' }} />
              </ListItemIcon>
              <ListItemText
                primary={fault}
                primaryTypographyProps={{ variant: 'body2', sx: { fontSize: 12 } }}
              />
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  )
}
