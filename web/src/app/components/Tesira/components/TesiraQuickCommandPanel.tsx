import React, { useMemo, useState } from 'react'
import { Code, Search } from '@carbon/icons-react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { useProbeTesiraDsp, useSendTesiraCommand, useTesiraDspBlocks } from '../hooks/useTesiraApi'
import type { TesiraRawCommandResponse } from '../types'

interface TesiraQuickCommandPanelProps {
  deviceId: string
}

function stringifyValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function TesiraQuickCommandPanel({ deviceId }: TesiraQuickCommandPanelProps) {
  const [command, setCommand] = useState('SESSION get aliases')
  const [search, setSearch] = useState('')
  const [response, setResponse] = useState<TesiraRawCommandResponse | null>(null)
  const dspBlocks = useTesiraDspBlocks(deviceId)
  const probeDsp = useProbeTesiraDsp(deviceId)
  const sendCommand = useSendTesiraCommand()

  const filteredBlocks = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return dspBlocks.data ?? []
    return (dspBlocks.data ?? []).filter((block) =>
      block.instance_tag.toLowerCase().includes(needle) ||
      block.block_type.toLowerCase().includes(needle) ||
      String(block.title || '').toLowerCase().includes(needle)
    )
  }, [dspBlocks.data, search])

  const handleSend = async () => {
    const trimmed = command.trim()
    if (!trimmed) return
    const result = await sendCommand.mutateAsync({ deviceId, command: trimmed })
    setResponse(result)
  }

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, mb: 1.25, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="subtitle2" fontWeight={700}>
            Tesira quick console
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Send recovery or verification commands from the dedicated Tesira route and use discovered instance tags as a command shortcut.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
          <Button size="small" variant="text" startIcon={<Code size={16} />} onClick={() => setCommand('DEVICE get hostname')}>
            Hostname
          </Button>
          <Button size="small" variant="text" startIcon={<Code size={16} />} onClick={() => setCommand('SESSION get aliases')}>
            Aliases
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              void probeDsp.mutateAsync(32)
            }}
            disabled={probeDsp.isPending}
          >
            {probeDsp.isPending ? 'Probing…' : 'Probe tags'}
          </Button>
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.1fr) minmax(0, 1fr)' }, gap: 1.5 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <TextField
            label="TTP command"
            multiline
            minRows={3}
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            placeholder="SESSION get aliases"
          />
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              size="small"
              variant="contained"
              onClick={() => {
                void handleSend()
              }}
              disabled={sendCommand.isPending}
            >
              {sendCommand.isPending ? 'Sending…' : 'Send command'}
            </Button>
          </Box>

          {sendCommand.isError ? (
            <Alert severity="error">
              {sendCommand.error instanceof Error ? sendCommand.error.message : 'Command failed'}
            </Alert>
          ) : null}

          <TextField
            label="Latest response"
            multiline
            minRows={8}
            value={
              response
                ? `${response.raw || response.message}\n${response.value != null ? `\n${stringifyValue(response.value)}` : ''}`
                : 'No command sent yet.'
            }
            InputProps={{
              readOnly: true,
              sx: {
                fontFamily: 'IBM Plex Mono, monospace',
                alignItems: 'flex-start',
              },
            }}
          />
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <TextField
            label="Filter discovered instance tags"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="LevelControl, MatrixMixer, SourceSelector…"
            InputProps={{
              startAdornment: <Search size={16} />,
            }}
          />

          {dspBlocks.isLoading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
              <CircularProgress size={18} />
              <Typography variant="body2" color="text.secondary">
                Loading instance tags…
              </Typography>
            </Box>
          ) : (
            <Paper variant="outlined" sx={{ maxHeight: 320, overflow: 'auto' }}>
              <Table size="small" aria-label="Discovered Tesira instance tags">
                <TableHead>
                  <TableRow>
                    <TableCell>Instance tag</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Params</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredBlocks.map((block) => {
                    const firstParam = Object.keys(block.parameter_map || {})[0] ?? 'level'
                    return (
                      <TableRow
                        key={block.instance_tag}
                        hover
                        onClick={() => setCommand(`${block.instance_tag} get ${firstParam}`)}
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell>{block.instance_tag}</TableCell>
                        <TableCell>{block.title ? `${block.title} (${block.block_type})` : block.block_type}</TableCell>
                        <TableCell>{Object.keys(block.parameter_map || {}).length}</TableCell>
                      </TableRow>
                    )
                  })}
                  {!filteredBlocks.length ? (
                    <TableRow>
                      <TableCell colSpan={3}>
                        <Typography variant="body2" color="text.secondary">
                          No instance tags are available yet. Probe tags or open DSP Explorer after the MAP2 layout is deployed.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </Paper>
          )}
        </Box>
      </Box>
    </Paper>
  )
}
