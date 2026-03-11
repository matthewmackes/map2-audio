import React, { useState } from 'react'
import { Box, Typography, CircularProgress, Alert, Button, Tooltip, IconButton } from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import AddIcon from '@mui/icons-material/Add'
import { useNavigate } from 'react-router-dom'
import { useTesiraDevices } from '../hooks/useTesiraApi'
import { useTesiraContext } from '../context/TesiraContext'
import { TesiraDeviceCard } from './TesiraDeviceCard'
import { ManualAddDialog } from './ManualAddDialog'
import { useCluster } from '../../../contexts/ClusterContext'

export function TesiraFleetPanel() {
  const { data: devices, isLoading, isError, refetch } = useTesiraDevices()
  const { selectedDeviceId, selectDevice } = useTesiraContext()
  const { localNodeId, setActiveNode } = useCluster()
  const [manualAddOpen, setManualAddOpen] = useState(false)
  const navigate = useNavigate()

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

  return (
    <>
      <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 0.5 }}>
          <Typography variant="caption" fontWeight={600} color="text.secondary" textTransform="uppercase" letterSpacing={0.8}>
            Fleet ({devices?.length ?? 0})
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.25 }}>
            <Tooltip title="Add device by IP address">
              <IconButton size="small" onClick={() => setManualAddOpen(true)} sx={{ p: 0.25 }}>
                <AddIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Refresh fleet">
              <IconButton size="small" onClick={() => refetch()} sx={{ p: 0.25 }}>
                <RefreshIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {(!devices || devices.length === 0) ? (
          <Box sx={{ p: 1, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              No Tesira devices configured.
            </Typography>
            <Typography variant="caption" color="text.disabled">
              Use + to add by IP, or Discover in the toolbar.
            </Typography>
          </Box>
        ) : (
          devices.map((device) => (
            <TesiraDeviceCard
              key={device.device_id}
              device={device}
              selected={selectedDeviceId === device.device_id}
              onSelect={() => {
                const next = selectedDeviceId === device.device_id ? null : device.device_id
                const targetNodeId = device.source_node_id ?? null
                setActiveNode(next && targetNodeId && targetNodeId !== localNodeId ? targetNodeId : null)
                selectDevice(next)
                if (next) navigate(`/tesira/${next}/dashboard`)
                else navigate('/tesira')
              }}
            />
          ))
        )}
      </Box>

      <ManualAddDialog open={manualAddOpen} onClose={() => setManualAddOpen(false)} />
    </>
  )
}
