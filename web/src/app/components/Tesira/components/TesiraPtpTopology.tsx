import React from 'react'
import { Box, CircularProgress, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import { useTesiraPtpTopology } from '../hooks/useTesiraApi'

export function TesiraPtpTopology() {
  const { data, isLoading: loading } = useTesiraPtpTopology()

  return (
    <Paper variant="outlined" sx={{ p: 1.25 }}>
      <Typography variant="caption" color="text.secondary">PTP Topology</Typography>
      {loading && !data ? (
        <Box sx={{ mt: 0.5 }}><CircularProgress size={14} /></Box>
      ) : (
        <Table size="small" sx={{ mt: 0.5 }}>
          <TableHead>
            <TableRow>
              <TableCell>Device</TableCell>
              <TableCell>Node</TableCell>
              <TableCell>State</TableCell>
              <TableCell>Offset (ns)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(data?.nodes || []).map((node) => (
              <TableRow key={node.device_id}>
                <TableCell>
                  <Typography variant="caption">{node.name || node.host}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption">{node.source_node_id ?? 'local'}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption">{node.ptp_state}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption">{node.offset_ns ?? '—'}</Typography>
                </TableCell>
              </TableRow>
            ))}
            {(!data?.nodes || data.nodes.length === 0) && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Typography variant="caption" color="text.secondary">No topology data.</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </Paper>
  )
}
