/**
 * ManualAddDialog — manually enter a Tesira device IP address to add it to the fleet.
 *
 * Uses the same /discovery/adopt endpoint as auto-discovery adoption, which
 * persists the device to config and hot-connects it to the running fleet.
 */
import React, { useState } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, TextField, Alert, CircularProgress, Typography, IconButton,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import AddIcon from '@mui/icons-material/Add'
import { BiampIcon } from '../BiampIcon'
import { useAdoptDevice } from '../hooks/useTesiraApi'

const BIAMP_RED = '#E31837'

interface ManualAddDialogProps {
  open: boolean
  onClose: () => void
}

export function ManualAddDialog({ open, onClose }: ManualAddDialogProps) {
  const [host, setHost] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const adoptDevice = useAdoptDevice()

  const handleAdd = async () => {
    const trimmedHost = host.trim()
    if (!trimmedHost) {
      setError('IP address is required')
      return
    }
    setError(null)
    try {
      await adoptDevice.mutateAsync({ host: trimmedHost, name: name.trim() || undefined })
      setSuccess(true)
      setTimeout(() => {
        setSuccess(false)
        setHost('')
        setName('')
        onClose()
      }, 900)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to add device')
    }
  }

  const handleClose = () => {
    if (!adoptDevice.isPending) {
      setHost('')
      setName('')
      setError(null)
      setSuccess(false)
      onClose()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAdd()
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
        <BiampIcon size={18} color={BIAMP_RED} />
        <Typography variant="h6" component="span">Add Tesira Device</Typography>
        <Box sx={{ flex: 1 }} />
        <IconButton size="small" onClick={handleClose} disabled={adoptDevice.isPending}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Enter the IP address of a Biamp Tesira Forte unit reachable on the network.
          TTP port 23 is used for the connection.
        </Typography>

        {error && <Alert severity="error" sx={{ py: 0 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ py: 0 }}>Device added to fleet</Alert>}

        <TextField
          label="IP Address"
          placeholder="192.168.1.100"
          value={host}
          onChange={(e) => { setHost(e.target.value); setError(null) }}
          disabled={adoptDevice.isPending || success}
          size="small"
          fullWidth
          autoFocus
          onKeyDown={handleKeyDown}
          inputProps={{ spellCheck: false }}
        />
        <TextField
          label="Name (optional)"
          placeholder="Main Hall DSP"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={adoptDevice.isPending || success}
          size="small"
          fullWidth
          onKeyDown={handleKeyDown}
        />
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button onClick={handleClose} disabled={adoptDevice.isPending} color="inherit">
          Cancel
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="contained"
          startIcon={
            adoptDevice.isPending
              ? <CircularProgress size={14} sx={{ color: '#fff' }} />
              : <AddIcon />
          }
          onClick={handleAdd}
          disabled={adoptDevice.isPending || success || !host.trim()}
          sx={{
            bgcolor: BIAMP_RED,
            '&:hover': { bgcolor: '#c01530' },
            '&.Mui-disabled': { bgcolor: 'rgba(227,24,55,0.3)', color: 'rgba(255,255,255,0.4)' },
          }}
        >
          {adoptDevice.isPending ? 'Adding…' : 'Add Device'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
