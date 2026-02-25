import React, { useState } from 'react'
import {
  Box, Typography, TextField, Button, Table, TableHead,
  TableRow, TableCell, TableBody, Slider,
} from '@mui/material'
import { useSetCrosspoint } from '../hooks/useTesiraApi'

interface TesiraMixerTabProps {
  deviceId: string
}

const DEFAULT_ROWS = 4
const DEFAULT_COLS = 4

export function TesiraMixerTab({ deviceId }: TesiraMixerTabProps) {
  const [instanceTag, setInstanceTag] = useState('RouterControl1')
  const [rows, setRows] = useState(DEFAULT_ROWS)
  const [cols, setCols] = useState(DEFAULT_COLS)
  const setCrosspoint = useSetCrosspoint()

  return (
    <Box sx={{ p: 1.5 }}>
      <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
        <TextField
          label="Router tag"
          size="small"
          value={instanceTag}
          onChange={(e) => setInstanceTag(e.target.value)}
          sx={{ width: 200 }}
          inputProps={{ style: { fontSize: 12 } }}
        />
        <TextField
          label="Inputs"
          size="small"
          type="number"
          value={rows}
          onChange={(e) => setRows(Math.min(32, Math.max(1, +e.target.value)))}
          sx={{ width: 80 }}
          inputProps={{ style: { fontSize: 12 }, min: 1, max: 32 }}
        />
        <TextField
          label="Outputs"
          size="small"
          type="number"
          value={cols}
          onChange={(e) => setCols(Math.min(32, Math.max(1, +e.target.value)))}
          sx={{ width: 80 }}
          inputProps={{ style: { fontSize: 12 }, min: 1, max: 32 }}
        />
      </Box>

      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ tableLayout: 'fixed', minWidth: cols * 72 + 64 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontSize: 11, width: 64 }}>In \ Out</TableCell>
              {Array.from({ length: cols }, (_, c) => (
                <TableCell key={c} align="center" sx={{ fontSize: 11, width: 72 }}>
                  Out {c + 1}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {Array.from({ length: rows }, (_, r) => (
              <TableRow key={r}>
                <TableCell sx={{ fontSize: 11 }}>In {r + 1}</TableCell>
                {Array.from({ length: cols }, (_, c) => (
                  <TableCell key={c} align="center" sx={{ px: 0.5 }}>
                    <Slider
                      size="small"
                      min={-60}
                      max={12}
                      step={1}
                      defaultValue={-60}
                      sx={{ color: '#E31837', width: 56 }}
                      onChange={(_e, val) =>
                        setCrosspoint.mutate({
                          deviceId, tag: instanceTag, row: r, col: c, gainDb: val as number,
                        })
                      }
                    />
                    <Typography variant="caption" sx={{ fontSize: 9, display: 'block' }}>
                      dB
                    </Typography>
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Box>
  )
}
