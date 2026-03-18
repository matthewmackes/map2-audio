import { useMemo, useState } from 'react'
import { Box, Button, FormControl, InputLabel, MenuItem, Select, Stack, Typography } from '@mui/material'
import { MeterAlt, Renew, Timer } from '@carbon/icons-react'

import type { MidiClusterClock } from '../../../map2/api'
import { useClusterClockActions } from '../../hooks/useMidiCluster'

interface Props {
  clock?: MidiClusterClock
  nodes: Array<{ node_id: string; hostname: string }>
}

const strategies = [
  { value: 'leader-node', label: 'Leader node' },
  { value: 'lowest-latency', label: 'Lowest latency' },
  { value: 'manual', label: 'Manual' },
  { value: 'external', label: 'External' },
]

export function MidiClusterClockPanel({ clock, nodes }: Props) {
  const { setStrategy, forceSync } = useClusterClockActions()
  const [strategy, setStrategyValue] = useState(clock?.strategy ?? 'leader-node')
  const [manualNode, setManualNode] = useState<string>('')

  const masterHostname = useMemo(() => {
    if (!clock?.master_node_id) return ''
    return nodes.find(n => n.node_id === clock.master_node_id)?.hostname ?? clock.master_node_id
  }, [clock?.master_node_id, nodes])

  const handleApply = () => {
    void setStrategy.mutateAsync({ strategy, manualNodeId: strategy === 'manual' ? manualNode : undefined })
  }

  return (
    <Box sx={{ p: 2, border: '1px solid #1f2937', borderRadius: 2, background: '#0b1224' }}>
      <Stack direction="row" spacing={2} alignItems="center" mb={1}>
        <MeterAlt size={18} color="#22c55e" />
        <Typography variant="subtitle2" sx={{ color: '#e5e7eb' }}>Cluster Clock</Typography>
      </Stack>
      {clock ? (
        <Stack spacing={2}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Timer size={16} color="#60a5fa" />
            <Typography variant="body2" sx={{ color: '#cbd5e1' }}>
              Master: {masterHostname || 'n/a'} · BPM {clock.master_bpm.toFixed(1)} · Drift {clock.drift_ms.toFixed(2)} ms
            </Typography>
          </Stack>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel id="strategy">Strategy</InputLabel>
              <Select
                labelId="strategy"
                label="Strategy"
                value={strategy}
                onChange={(e) => setStrategyValue(e.target.value)}
              >
                {strategies.map(s => (
                  <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            {strategy === 'manual' && (
              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel id="manual-node">Manual master</InputLabel>
                <Select
                  labelId="manual-node"
                  label="Manual master"
                  value={manualNode}
                  onChange={(e) => setManualNode(e.target.value)}
                >
                  {nodes.map(n => (
                    <MenuItem key={n.node_id} value={n.node_id}>{n.hostname}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            <Button variant="contained" onClick={handleApply} disabled={setStrategy.isPending}>
              Apply
            </Button>
            <Button
              variant="outlined"
              startIcon={<Renew size={16} /> as any}
              onClick={() => forceSync.mutate()}
              disabled={forceSync.isPending}
            >
              Force re-sync
            </Button>
          </Stack>
        </Stack>
      ) : (
        <Typography variant="body2" sx={{ color: '#cbd5e1' }}>Clock data unavailable.</Typography>
      )}
    </Box>
  )
}

export default MidiClusterClockPanel
