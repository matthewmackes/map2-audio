/**
 * ManualAddDialog — add a Tesira device by IP address without requiring TTP.
 *
 * Uses POST /api/tesira/devices which skips the TTP probe, so this works for
 * configured (non-factory-reset) units even when port 23 is disabled.
 *
 * The device is persisted to config and the fleet attempts connection.
 * If TTP is still disabled the device will appear Offline in the fleet panel
 * until TTP is enabled in Tesira Software (Device Maintenance → Network Settings).
 */
import React, { useState } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, TextField, Alert, CircularProgress, Typography, IconButton,
  Collapse,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import AddIcon from '@mui/icons-material/Add'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { MapMatrixProcessorIcon } from '../../icons/map'
import { useAddDevice } from '../hooks/useTesiraApi'

const BIAMP_RED = '#E31837'

interface ManualAddDialogProps {
  open: boolean
  onClose: () => void
}

export function ManualAddDialog({ open, onClose }: ManualAddDialogProps) {
  const [host, setHost] = useState('')
  const [port, setPort] = useState('23')
  const [name, setName] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const addDevice = useAddDevice()

  const handleAdd = async () => {
    const trimmedHost = host.trim()
    if (!trimmedHost) {
      setError('IP address is required')
      return
    }
    const portNum = parseInt(port, 10)
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setError('Port must be between 1 and 65535')
      return
    }
    setError(null)
    try {
      await addDevice.mutateAsync({ host: trimmedHost, port: portNum, name: name.trim() || undefined })
      setSuccess(true)
      setTimeout(() => {
        setSuccess(false)
        setHost('')
        setPort('23')
        setName('')
        setShowAdvanced(false)
        onClose()
      }, 900)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to add device')
    }
  }

  const handleClose = () => {
    if (!addDevice.isPending) {
      setHost('')
      setPort('23')
      setName('')
      setError(null)
      setSuccess(false)
      setShowAdvanced(false)
      onClose()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAdd()
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
        <MapMatrixProcessorIcon size={18} color={BIAMP_RED} />
        <Typography variant="h6" component="span">Add Tesira Device</Typography>
        <Box sx={{ flex: 1 }} />
        <IconButton size="small" onClick={handleClose} disabled={addDevice.isPending}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Enter the IP address of a Biamp Tesira Forte unit on the network.
          The device will be added to the fleet and shown as{' '}
          <strong>Offline</strong> until TTP is enabled in Tesira Software
          (Device Maintenance → Network Settings → Enable Telnet).
        </Typography>

        {error && <Alert severity="error" sx={{ py: 0 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ py: 0 }}>Device added to fleet</Alert>}

        <TextField
          label="IP Address"
          placeholder="192.168.1.100"
          value={host}
          onChange={(e) => { setHost(e.target.value); setError(null) }}
          disabled={addDevice.isPending || success}
          size="small"
          fullWidth
          autoFocus
          onKeyDown={handleKeyDown}
          inputProps={{ spellCheck: false }}
        />

        {/* Advanced: name + port */}
        <Box>
          <Button
            size="small"
            onClick={() => setShowAdvanced((v) => !v)}
            sx={{ fontSize: 11, color: 'text.secondary', p: 0, minWidth: 0 }}
            endIcon={
              <ExpandMoreIcon
                sx={{
                  fontSize: 14,
                  transition: 'transform 0.2s',
                  transform: showAdvanced ? 'rotate(180deg)' : 'none',
                }}
              />
            }
          >
            Advanced
          </Button>
          <Collapse in={showAdvanced}>
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <TextField
                label="Name (optional)"
                placeholder="Main Hall DSP"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={addDevice.isPending || success}
                size="small"
                sx={{ flex: 1 }}
                onKeyDown={handleKeyDown}
              />
              <TextField
                label="TTP Port"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                disabled={addDevice.isPending || success}
                size="small"
                sx={{ width: 90 }}
                inputProps={{ spellCheck: false }}
                onKeyDown={handleKeyDown}
              />
            </Box>
          </Collapse>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button onClick={handleClose} disabled={addDevice.isPending} color="inherit">
          Cancel
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="contained"
          startIcon={
            addDevice.isPending
              ? <CircularProgress size={14} sx={{ color: '#fff' }} />
              : <AddIcon />
          }
          onClick={handleAdd}
          disabled={addDevice.isPending || success || !host.trim()}
          sx={{
            bgcolor: BIAMP_RED,
            '&:hover': { bgcolor: '#c01530' },
            '&.Mui-disabled': { bgcolor: 'rgba(227,24,55,0.3)', color: 'rgba(255,255,255,0.4)' },
          }}
        >
          {addDevice.isPending ? 'Adding…' : 'Add Device'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
