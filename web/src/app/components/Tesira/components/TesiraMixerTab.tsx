import React, { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Slider,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { useSetCrosspoint, useSetCrosspointMute, useTesiraCrosspointMatrix } from '../hooks/useTesiraApi'
import { NumberInput } from '../../Controls/NumberInput'

interface TesiraMixerTabProps {
  deviceId: string
}

const DEFAULT_ROWS = 4
const DEFAULT_COLS = 4

export function TesiraMixerTab({ deviceId }: TesiraMixerTabProps) {
  const [instanceTag, setInstanceTag] = useState('RouterControl1')
  const [rows, setRows] = useState(DEFAULT_ROWS)
  const [cols, setCols] = useState(DEFAULT_COLS)

  const matrix = useTesiraCrosspointMatrix(deviceId, instanceTag, rows, cols)
  const setCrosspoint = useSetCrosspoint()
  const setCrosspointMute = useSetCrosspointMute()

  const matrixRows = useMemo(() => matrix.data?.matrix ?? [], [matrix.data])

  return (
    <Box sx={{ p: 1.5 }}>
      <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          label="Router tag"
          size="small"
          value={instanceTag}
          onChange={(event) => setInstanceTag(event.target.value)}
          sx={{ width: 220 }}
          inputProps={{ style: { fontSize: 12 } }}
        />
        <NumberInput
          label="Inputs"
          value={rows}
          min={1}
          max={32}
          step={1}
          size="small"
          showBounds={false}
          style={{ width: 80 }}
          onChange={(value) => setRows(Math.min(32, Math.max(1, Math.round(value))))}
        />
        <NumberInput
          label="Outputs"
          value={cols}
          min={1}
          max={32}
          step={1}
          size="small"
          showBounds={false}
          style={{ width: 80 }}
          onChange={(value) => setCols(Math.min(32, Math.max(1, Math.round(value))))}
        />
        <Button
          size="small"
          variant="outlined"
          onClick={() => {
            matrix.refetch().catch(() => undefined)
          }}
        >
          Refresh
        </Button>
      </Box>

      {matrix.error && (
        <Alert severity="warning" sx={{ mb: 1 }}>
          {(matrix.error as Error).message || 'Failed to read crosspoint matrix'}
        </Alert>
      )}

      {matrix.isLoading ? (
        <CircularProgress size={20} />
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ tableLayout: 'fixed', minWidth: cols * 152 + 84 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontSize: 11, width: 84 }}>In \ Out</TableCell>
                {Array.from({ length: cols }, (_, c) => (
                  <TableCell key={c} align="center" sx={{ fontSize: 11, width: 152 }}>
                    Out {c + 1}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {Array.from({ length: rows }, (_, rowIdx) => (
                <TableRow key={rowIdx}>
                  <TableCell sx={{ fontSize: 11 }}>In {rowIdx + 1}</TableCell>
                  {Array.from({ length: cols }, (_, colIdx) => {
                    const cell = matrixRows[rowIdx]?.[colIdx]
                    const gain = typeof cell?.gain_db === 'number' ? cell.gain_db : -60
                    const muted = Boolean(cell?.muted)
                    return (
                      <TableCell key={`${rowIdx}-${colIdx}`} align="center" sx={{ px: 0.75 }}>
                        <Slider
                          size="small"
                          min={-60}
                          max={12}
                          step={0.5}
                          value={gain}
                          sx={{ color: '#E31837', width: 96 }}
                          onChangeCommitted={(_event, value) => {
                            setCrosspoint.mutate({
                              deviceId,
                              tag: instanceTag,
                              row: rowIdx + 1,
                              col: colIdx + 1,
                              gainDb: Number(value),
                              rows,
                              cols,
                            })
                          }}
                        />
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                          <Switch
                            size="small"
                            checked={muted}
                            onChange={(_event, checked) => {
                              setCrosspointMute.mutate({
                                deviceId,
                                tag: instanceTag,
                                row: rowIdx + 1,
                                col: colIdx + 1,
                                muted: checked,
                                rows,
                                cols,
                              })
                            }}
                          />
                          <Typography variant="caption" sx={{ fontSize: 10 }}>
                            {gain.toFixed(1)} dB
                          </Typography>
                        </Box>
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  )
}
