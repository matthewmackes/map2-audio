import React, { useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material'
import { NumberInput } from '../../Controls/NumberInput'

interface TesiraDspProbeDialogProps {
  open: boolean
  busy?: boolean
  onClose: () => void
  onProbe: (maxInstances: number) => Promise<void> | void
}

export function TesiraDspProbeDialog({ open, busy = false, onClose, onProbe }: TesiraDspProbeDialogProps) {
  const [maxInstances, setMaxInstances] = useState(32)

  const runProbe = async () => {
    await onProbe(Math.max(1, Math.min(128, maxInstances)))
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Probe DSP Blocks</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: '8px !important' }}>
        <Typography variant="caption" color="text.secondary">
          Probe runtime instance tags (LevelControl, Mixer, PEQ, Router, GPIO).
        </Typography>
        <NumberInput
          label="Max instances per block family"
          value={maxInstances}
          min={1}
          max={128}
          step={1}
          size="small"
          showBounds={false}
          onChange={(value) => setMaxInstances(Math.round(value))}
        />
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button size="small" variant="contained" onClick={() => { runProbe().catch(() => undefined) }} disabled={busy}>
          {busy ? 'Probing…' : 'Probe'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
