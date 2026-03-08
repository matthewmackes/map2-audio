import React, { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Paper,
  TextField,
  Typography,
} from '@mui/material'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RefreshIcon from '@mui/icons-material/Refresh'
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useTesiraFaults, useTesiraMeterHistory, useTesiraMeterPeak } from '../hooks/useTesiraApi'

interface TesiraFaultsTabProps {
  deviceId: string
}

export function TesiraFaultsTab({ deviceId }: TesiraFaultsTabProps) {
  const [meterTag, setMeterTag] = useState('LevelControl1')
  const { data, isLoading, isError, refetch } = useTesiraFaults(deviceId)
  const meterHistory = useTesiraMeterHistory(deviceId, meterTag, 120)
  const meterPeak = useTesiraMeterPeak(deviceId, meterTag)

  const faults = data?.faults ?? []
  const chartData = useMemo(
    () => (meterHistory.data?.history ?? []).map((sample, index) => ({
      t: index,
      peak: sample.levels_dbu.length > 0 ? Math.max(...sample.levels_dbu) : -100,
    })),
    [meterHistory.data],
  )

  if (isLoading) return <Box sx={{ p: 2 }}><CircularProgress size={20} /></Box>

  return (
    <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {isError ? (
        <Alert
          severity="error"
          action={<Button size="small" onClick={() => refetch()}>Retry</Button>}
        >
          Failed to load fault list
        </Alert>
      ) : (
        <Paper variant="outlined" sx={{ p: 1.25 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="caption" fontWeight={600} color="text.secondary">
              ACTIVE FAULTS ({faults.length})
            </Typography>
            <Button
              size="small"
              startIcon={<RefreshIcon />}
              onClick={() => {
                refetch().catch(() => undefined)
              }}
              sx={{ fontSize: 11 }}
            >
              Refresh
            </Button>
          </Box>

          {faults.length === 0 ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 0.5 }}>
              <CheckCircleIcon sx={{ color: 'success.main', fontSize: 18 }} />
              <Typography variant="body2" color="success.main">No active faults</Typography>
            </Box>
          ) : (
            <List dense disablePadding>
              {faults.map((fault, idx) => (
                <ListItem key={`${idx}-${fault}`} divider sx={{ py: 0.5 }}>
                  <ListItemIcon sx={{ minWidth: 28 }}>
                    <WarningAmberIcon sx={{ fontSize: 16, color: 'warning.main' }} />
                  </ListItemIcon>
                  <ListItemText
                    primary={fault}
                    primaryTypographyProps={{ variant: 'body2', sx: { fontSize: 12 } }}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Paper>
      )}

      <Paper variant="outlined" sx={{ p: 1.25 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="caption" fontWeight={600} color="text.secondary">
            METER HISTORY
          </Typography>
          <TextField
            size="small"
            label="Instance Tag"
            value={meterTag}
            onChange={(event) => setMeterTag(event.target.value)}
            sx={{ width: 220 }}
            inputProps={{ style: { fontSize: 12 } }}
          />
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              meterHistory.refetch().catch(() => undefined)
              meterPeak.refetch().catch(() => undefined)
            }}
          >
            Refresh
          </Button>
        </Box>

        {meterHistory.error ? (
          <Alert severity="warning">{(meterHistory.error as Error).message || 'Meter history unavailable'}</Alert>
        ) : meterHistory.isLoading ? (
          <CircularProgress size={18} />
        ) : chartData.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No meter samples available for this tag.
          </Typography>
        ) : (
          <Box sx={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <XAxis dataKey="t" hide />
                <YAxis domain={[-80, 20]} width={36} />
                <ChartTooltip />
                <Line type="monotone" dataKey="peak" stroke="#E31837" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        )}

        <Typography variant="caption" color="text.secondary">
          Peak: {meterPeak.data?.peak_dbu != null ? `${meterPeak.data.peak_dbu.toFixed(2)} dBu` : '—'}
        </Typography>
      </Paper>
    </Box>
  )
}
