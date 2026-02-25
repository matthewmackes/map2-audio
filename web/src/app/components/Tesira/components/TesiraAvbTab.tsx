import React from 'react'
import {
  Box, Typography, Table, TableHead, TableRow, TableCell, TableBody,
  Chip, Button, Tooltip,
} from '@mui/material'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import { useTesiraAvbStreams, useTesiraPTP } from '../hooks/useTesiraApi'

interface TesiraAvbTabProps {
  deviceId: string
}

export function TesiraAvbTab({ deviceId }: TesiraAvbTabProps) {
  const { data: streams } = useTesiraAvbStreams(deviceId)
  const { data: ptp } = useTesiraPTP(deviceId)

  return (
    <Box sx={{ p: 1.5 }}>
      {/* PTP status */}
      {ptp && (
        <Box sx={{ mb: 2, p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1 }}>
          <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            PTP STATUS
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Chip
              label={`State: ${ptp.state ?? 'unknown'}`}
              size="small"
              color={ptp.state === 'MASTER' ? 'error' : ptp.state === 'SLAVE' ? 'success' : 'default'}
              sx={{ fontSize: 11 }}
            />
            {ptp.offset_ns != null && (
              <Chip
                label={`Offset: ${ptp.offset_ns} ns`}
                size="small"
                variant="outlined"
                sx={{ fontSize: 11 }}
              />
            )}
            {ptp.grandmaster_id && (
              <Chip
                label={`GM: ${ptp.grandmaster_id}`}
                size="small"
                variant="outlined"
                sx={{ fontSize: 10 }}
              />
            )}
          </Box>
        </Box>
      )}

      {/* AVB streams */}
      <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        AVB STREAMS
      </Typography>

      {!streams || (streams as any[]).length === 0 ? (
        <Typography variant="body2" color="text.secondary">No AVB streams discovered.</Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontSize: 11 }}>#</TableCell>
              <TableCell sx={{ fontSize: 11 }}>Name</TableCell>
              <TableCell sx={{ fontSize: 11 }}>Direction</TableCell>
              <TableCell sx={{ fontSize: 11 }}>Channels</TableCell>
              <TableCell sx={{ fontSize: 11 }}>Entity ID</TableCell>
              <TableCell sx={{ fontSize: 11 }}></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(streams as any[]).map((s: any) => (
              <TableRow key={`${s.stream_index}-${s.direction}`}>
                <TableCell sx={{ fontSize: 11 }}>{s.stream_index}</TableCell>
                <TableCell sx={{ fontSize: 11 }}>{s.name}</TableCell>
                <TableCell>
                  <Chip
                    label={s.direction}
                    size="small"
                    color={s.direction === 'talker' ? 'primary' : 'secondary'}
                    sx={{ fontSize: 10, height: 18 }}
                  />
                </TableCell>
                <TableCell sx={{ fontSize: 11 }}>{s.channels}</TableCell>
                <TableCell sx={{ fontSize: 10, fontFamily: 'monospace' }}>
                  {s.entity_id?.substring(0, 12)}…
                </TableCell>
                <TableCell>
                  <Tooltip title="View in AVB Routing">
                    <Button
                      size="small"
                      component="a"
                      href="/avb-routing"
                      endIcon={<OpenInNewIcon sx={{ fontSize: 12 }} />}
                      sx={{ fontSize: 10, minWidth: 0, p: 0.5 }}
                    >
                      Route
                    </Button>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Box>
  )
}
