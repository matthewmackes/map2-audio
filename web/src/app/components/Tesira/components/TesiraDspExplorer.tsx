import React, { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { TesiraDspProbeDialog } from './TesiraDspProbeDialog'
import { TesiraDspBlockPanel } from './TesiraDspBlockPanel'
import { useProbeTesiraDsp, useTesiraDspBlocks } from '../hooks/useTesiraApi'

interface TesiraDspExplorerProps {
  deviceId: string
}

export function TesiraDspExplorer({ deviceId }: TesiraDspExplorerProps) {
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [probeOpen, setProbeOpen] = useState(false)
  const [search, setSearch] = useState('')

  const dspBlocks = useTesiraDspBlocks(deviceId)
  const probeMutation = useProbeTesiraDsp(deviceId)

  const blocks = dspBlocks.data ?? []
  const filteredBlocks = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return blocks
    return blocks.filter((block) =>
      block.instance_tag.toLowerCase().includes(needle) ||
      block.block_type.toLowerCase().includes(needle) ||
      String(block.title || '').toLowerCase().includes(needle) ||
      String(block.category || '').toLowerCase().includes(needle)
    )
  }, [blocks, search])

  useEffect(() => {
    if (!selectedTag && filteredBlocks.length > 0) {
      setSelectedTag(filteredBlocks[0].instance_tag)
    }
    if (selectedTag && !filteredBlocks.some((b) => b.instance_tag === selectedTag)) {
      setSelectedTag(filteredBlocks[0]?.instance_tag ?? null)
    }
  }, [filteredBlocks, selectedTag])

  const probe = async (maxInstances: number = 32) => {
    await probeMutation.mutateAsync(maxInstances)
    setProbeOpen(false)
    await dspBlocks.refetch()
  }

  return (
    <Box className="tesira-dsp-explorer" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }} flexWrap="wrap">
        <Typography variant="subtitle2" fontWeight={700}>DSP Blocks</Typography>
        <TextField
          size="small"
          placeholder="Filter blocks…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          sx={{ minWidth: 220 }}
          inputProps={{ style: { fontSize: 12 } }}
        />
        <Button size="small" variant="outlined" onClick={() => setProbeOpen(true)} sx={{ width: { xs: '100%', sm: 'auto' } }}>Probe</Button>
        <Button
          size="small"
          variant="text"
          onClick={() => {
            dspBlocks.refetch().catch(() => undefined)
          }}
          sx={{ width: { xs: '100%', sm: 'auto' } }}
        >
          Refresh
        </Button>
      </Stack>

      {dspBlocks.error && (
        <Alert severity="warning">
          {(dspBlocks.error as Error).message || 'Failed to load DSP block list'}
        </Alert>
      )}

      {probeMutation.isError && (
        <Alert severity="warning">
          {(probeMutation.error as Error).message || 'Probe failed'}
        </Alert>
      )}

      {probeMutation.data?.errors?.length ? (
        <Alert severity="info">
          Probe completed with {probeMutation.data.errors.length} warning(s). Showing discovered blocks.
        </Alert>
      ) : null}

      {dspBlocks.isLoading ? (
        <CircularProgress size={20} />
      ) : (
        <Box className="tesira-table-scroll-wrap">
          <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
            <Table size="small" className="tesira-table">
            <TableHead>
              <TableRow>
                <TableCell>Instance Tag</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Family</TableCell>
                <TableCell>Channels</TableCell>
                <TableCell>Params</TableCell>
                <TableCell>Source</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredBlocks.map((block) => (
                <TableRow
                  key={block.instance_tag}
                  hover
                  selected={selectedTag === block.instance_tag}
                  onClick={() => setSelectedTag(block.instance_tag)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>{block.instance_tag}</TableCell>
                  <TableCell>{block.title ? `${block.title} (${block.block_type})` : block.block_type}</TableCell>
                  <TableCell>{block.category || 'processing'}</TableCell>
                  <TableCell>{block.channel_count}</TableCell>
                  <TableCell>{Object.keys(block.parameter_map || {}).length}</TableCell>
                  <TableCell>{block.is_probed ? 'Probed' : 'Declared'}</TableCell>
                </TableRow>
              ))}
              {filteredBlocks.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Typography variant="body2" color="text.secondary">
                      No DSP blocks matched this filter.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            </Table>
          </Paper>
          <Box className="tesira-table-scroll-hint" aria-hidden="true" />
        </Box>
      )}

      {selectedTag && (
        <TesiraDspBlockPanel deviceId={deviceId} instanceTag={selectedTag} />
      )}

      <TesiraDspProbeDialog
        open={probeOpen}
        busy={probeMutation.isPending}
        onClose={() => setProbeOpen(false)}
        onProbe={probe}
      />
    </Box>
  )
}
