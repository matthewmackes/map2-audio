import { Chip, LinearProgress, Paper, Stack, Typography } from '@mui/material'
import type { MidiClusterHealth } from '../../../map2/api'

interface Props {
  health?: MidiClusterHealth
}

export function MidiClusterHealthBar({ health }: Props) {
  if (!health) return null

  const healthyPercent = health.connection_count > 0
    ? Math.round((health.healthy_connection_count / health.connection_count) * 100)
    : 100

  return (
    <Paper elevation={0} sx={{ p: 2, background: '#0f172a', border: '1px solid #1f2937' }}>
      <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
        <Stack spacing={0.5}>
          <Typography variant="subtitle2" sx={{ color: '#e5e7eb' }}>
            Cluster MIDI Health
          </Typography>
          <Typography variant="caption" sx={{ color: '#94a3b8' }}>
            {health.node_count} nodes · {health.connection_count} connections · clock {health.clock_status}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={healthyPercent}
            sx={{ mt: 1, height: 8, borderRadius: 4, bgcolor: '#1f2937', '& .MuiLinearProgress-bar': { bgcolor: '#22c55e' } }}
          />
        </Stack>
        <Stack direction="row" spacing={1}>
          <Chip size="small" label={`Healthy ${health.healthy_connection_count}`} color="success" />
          <Chip size="small" label={`Degraded ${health.degraded_connections}`} color="warning" />
          <Chip size="small" label={`Clock drift ${health.clock_drift_ms.toFixed(1)} ms`} color="info" variant="outlined" />
        </Stack>
      </Stack>
    </Paper>
  )
}

export default MidiClusterHealthBar
