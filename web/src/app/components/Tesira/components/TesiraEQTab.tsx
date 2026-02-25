import React, { useState } from 'react'
import {
  Box, Typography, TextField, Slider, Grid,
  Table, TableHead, TableRow, TableCell, TableBody, Button,
} from '@mui/material'
import { tesiraApi } from '../../../../map2/api'

interface TesiraEQTabProps {
  deviceId: string
}

const BANDS = [
  { label: 'Low', band: 0, defaultFreq: 80 },
  { label: 'Low Mid', band: 1, defaultFreq: 250 },
  { label: 'High Mid', band: 2, defaultFreq: 2500 },
  { label: 'High', band: 3, defaultFreq: 10000 },
]

export function TesiraEQTab({ deviceId }: TesiraEQTabProps) {
  const [instanceTag, setInstanceTag] = useState('EQControl1')

  const [bandState, setBandState] = useState<Array<{ freq: number; gain: number; q: number }>>(
    BANDS.map((b) => ({ freq: b.defaultFreq, gain: 0, q: 1.0 }))
  )

  function handleFreq(bandIdx: number, freq: number) {
    setBandState((s) => s.map((b, i) => i === bandIdx ? { ...b, freq } : b))
    tesiraApi.setEQBandFreq(deviceId, instanceTag, bandIdx, freq).catch(() => undefined)
  }

  function handleGain(bandIdx: number, gain: number) {
    setBandState((s) => s.map((b, i) => i === bandIdx ? { ...b, gain } : b))
    tesiraApi.setEQBandGain(deviceId, instanceTag, bandIdx, gain).catch(() => undefined)
  }

  function handleQ(bandIdx: number, q: number) {
    setBandState((s) => s.map((b, i) => i === bandIdx ? { ...b, q } : b))
    tesiraApi.setEQBandQ(deviceId, instanceTag, bandIdx, q).catch(() => undefined)
  }

  return (
    <Box sx={{ p: 1.5 }}>
      <Box sx={{ mb: 2 }}>
        <TextField
          label="EQ Instance Tag"
          size="small"
          value={instanceTag}
          onChange={(e) => setInstanceTag(e.target.value)}
          sx={{ width: 220 }}
          inputProps={{ style: { fontSize: 12 } }}
        />
      </Box>

      <Grid container spacing={2}>
        {BANDS.map((band, idx) => (
          <Grid item xs={6} md={3} key={band.band}>
            <Box
              sx={{
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                p: 1.5,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
              }}
            >
              <Typography variant="caption" fontWeight={600} color="text.secondary">
                {band.label}
              </Typography>

              <Typography variant="caption" sx={{ fontSize: 10 }}>
                Freq: {bandState[idx].freq} Hz
              </Typography>
              <Slider
                size="small"
                min={20}
                max={20000}
                step={10}
                value={bandState[idx].freq}
                onChange={(_e, val) => handleFreq(idx, val as number)}
                sx={{ color: '#E31837' }}
              />

              <Typography variant="caption" sx={{ fontSize: 10 }}>
                Gain: {bandState[idx].gain.toFixed(1)} dB
              </Typography>
              <Slider
                size="small"
                min={-15}
                max={15}
                step={0.5}
                value={bandState[idx].gain}
                onChange={(_e, val) => handleGain(idx, val as number)}
                sx={{ color: '#E31837' }}
              />

              <Typography variant="caption" sx={{ fontSize: 10 }}>
                Q: {bandState[idx].q.toFixed(2)}
              </Typography>
              <Slider
                size="small"
                min={0.1}
                max={10}
                step={0.05}
                value={bandState[idx].q}
                onChange={(_e, val) => handleQ(idx, val as number)}
                sx={{ color: '#E31837' }}
              />
            </Box>
          </Grid>
        ))}
      </Grid>
    </Box>
  )
}
