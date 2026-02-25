import React from 'react'
import {
  Card, CardActionArea, CardContent, Box, Typography, Chip, Tooltip,
} from '@mui/material'
import WifiIcon from '@mui/icons-material/Wifi'
import WifiOffIcon from '@mui/icons-material/WifiOff'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import type { TesiraDeviceSummary } from '../types'
import { BiampIcon } from '../BiampIcon'

const BIAMP_RED = '#E31837'

interface TesiraDeviceCardProps {
  device: TesiraDeviceSummary
  selected: boolean
  onSelect: () => void
}

export function TesiraDeviceCard({ device, selected, onSelect }: TesiraDeviceCardProps) {
  return (
    <Card
      variant="outlined"
      sx={{
        borderColor: selected ? BIAMP_RED : device.connected ? 'divider' : 'warning.dark',
        borderWidth: selected ? 2 : 1,
        transition: 'border-color 0.15s',
      }}
    >
      <CardActionArea onClick={onSelect}>
        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <BiampIcon size={18} color={device.connected ? BIAMP_RED : '#888'} />

            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" fontWeight={600} noWrap>
                {device.name || device.host}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {device.host}:{device.port}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
              {device.connected ? (
                <WifiIcon sx={{ fontSize: 14, color: 'success.main' }} />
              ) : (
                <WifiOffIcon sx={{ fontSize: 14, color: 'error.main' }} />
              )}
              {device.fault_count > 0 && (
                <Tooltip title={`${device.fault_count} fault(s)`}>
                  <WarningAmberIcon sx={{ fontSize: 14, color: 'warning.main' }} />
                </Tooltip>
              )}
            </Box>
          </Box>

          {/* Status chips */}
          <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
            <Chip
              label={device.connected ? 'Online' : 'Offline'}
              size="small"
              color={device.connected ? 'success' : 'default'}
              sx={{ height: 18, fontSize: 10 }}
            />
            {device.avb_stream_count > 0 && (
              <Chip
                label={`${device.avb_stream_count} AVB`}
                size="small"
                variant="outlined"
                sx={{ height: 18, fontSize: 10 }}
              />
            )}
            {device.ptp_state && (
              <Chip
                label={`PTP ${device.ptp_state}`}
                size="small"
                variant="outlined"
                sx={{
                  height: 18,
                  fontSize: 10,
                  borderColor: device.ptp_state === 'MASTER' ? BIAMP_RED : undefined,
                }}
              />
            )}
            {device.firmware_version && (
              <Chip
                label={`fw ${device.firmware_version}`}
                size="small"
                variant="outlined"
                sx={{ height: 18, fontSize: 10 }}
              />
            )}
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  )
}
