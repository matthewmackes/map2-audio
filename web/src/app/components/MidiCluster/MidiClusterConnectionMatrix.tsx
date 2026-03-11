import { useMemo, useState } from 'react'
import { Box, Button, Chip, MenuItem, Select, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'

import type { MidiClusterConnection, MidiClusterEndpoint } from '../../../map2/api'
import { useConnectMidiCluster, useDisconnectMidiCluster } from '../../hooks/useMidiCluster'

interface Props {
  endpoints: MidiClusterEndpoint[]
  connections: MidiClusterConnection[]
}

export function MidiClusterConnectionMatrix({ endpoints, connections }: Props) {
  const outputs = useMemo(() => endpoints.filter(e => e.direction === 'output'), [endpoints])
  const inputs = useMemo(() => endpoints.filter(e => e.direction === 'input'), [endpoints])

  const [sourceId, setSourceId] = useState('')
  const [destinationId, setDestinationId] = useState('')
  const [transport, setTransport] = useState('rtp-midi')

  const connect = useConnectMidiCluster()
  const disconnect = useDisconnectMidiCluster()

  const connectionKey = (src: string, dst: string) => `${src}=>${dst}`
  const active = new Map<string, MidiClusterConnection>()
  connections.forEach(c => active.set(connectionKey(c.source.endpoint_id, c.destination.endpoint_id), c))

  const handleToggle = (srcId: string, dstId: string) => {
    const key = connectionKey(srcId, dstId)
    const existing = active.get(key)
    if (existing) {
      void disconnect.mutateAsync(existing.connection_id)
      return
    }
    void connect.mutateAsync({ source_endpoint_id: srcId, destination_endpoint_id: dstId, transport })
  }

  return (
    <Box sx={{ mt: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center" mb={2}>
        <Select size="small" value={sourceId} onChange={(e) => setSourceId(e.target.value)} displayEmpty sx={{ minWidth: 220 }}>
          <MenuItem value="" disabled>Select output</MenuItem>
          {outputs.map(o => (
            <MenuItem key={o.endpoint_id} value={o.endpoint_id}>
              {o.node_id}: {o.port_name}
            </MenuItem>
          ))}
        </Select>
        <Select size="small" value={destinationId} onChange={(e) => setDestinationId(e.target.value)} displayEmpty sx={{ minWidth: 220 }}>
          <MenuItem value="" disabled>Select input</MenuItem>
          {inputs.map(i => (
            <MenuItem key={i.endpoint_id} value={i.endpoint_id}>
              {i.node_id}: {i.port_name}
            </MenuItem>
          ))}
        </Select>
        <Select size="small" value={transport} onChange={(e) => setTransport(e.target.value)} sx={{ minWidth: 140 }}>
          <MenuItem value="rtp-midi">RTP-MIDI</MenuItem>
          <MenuItem value="http-mesh">HTTP Mesh</MenuItem>
          <MenuItem value="udp-raw">UDP Raw</MenuItem>
        </Select>
        <Button
          variant="contained"
          disabled={!sourceId || !destinationId || connect.isPending}
          onClick={() => handleToggle(sourceId, destinationId)}
        >
          Connect
        </Button>
      </Stack>

      <Typography variant="subtitle2" sx={{ color: '#e5e7eb', mb: 1 }}>Connection matrix</Typography>
      <Table size="small" sx={{ background: '#0b1224', border: '1px solid #1f2937' }}>
        <TableHead>
          <TableRow>
            <TableCell sx={{ color: '#94a3b8' }}>Output / Input</TableCell>
            {inputs.map(input => (
              <TableCell key={input.endpoint_id} sx={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>
                {input.node_id}:{input.port_name}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {outputs.map(output => (
            <TableRow key={output.endpoint_id} hover>
              <TableCell sx={{ color: '#cbd5e1', whiteSpace: 'nowrap' }}>
                {output.node_id}:{output.port_name}
              </TableCell>
              {inputs.map(input => {
                const key = connectionKey(output.endpoint_id, input.endpoint_id)
                const conn = active.get(key)
                return (
                  <TableCell key={key} align="center">
                    {conn ? (
                      <Chip
                        size="small"
                        label={conn.transport}
                        color="success"
                        onClick={() => handleToggle(output.endpoint_id, input.endpoint_id)}
                        sx={{ cursor: 'pointer' }}
                      />
                    ) : (
                      <Chip
                        size="small"
                        label="connect"
                        variant="outlined"
                        onClick={() => handleToggle(output.endpoint_id, input.endpoint_id)}
                        sx={{ cursor: 'pointer', color: '#cbd5e1', borderColor: '#475569' }}
                      />
                    )}
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  )
}

export default MidiClusterConnectionMatrix
