import React, { useState, useCallback } from 'react'
import {
  Card, CardActionArea, CardContent, Box, Typography, Chip, Tooltip,
} from '@mui/material'
import WifiIcon from '@mui/icons-material/Wifi'
import WifiOffIcon from '@mui/icons-material/WifiOff'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import SyncIcon from '@mui/icons-material/Sync'
import type { TesiraDeviceSummary } from '../types'
import { BiampIcon } from '../BiampIcon'
import { useTesiraDeviceState } from '../hooks/useTesiraWebSocket'
import { useCluster } from '../../../contexts/ClusterContext'

const BIAMP_RED = '#E31837'

interface TesiraDeviceCardProps {
  device: TesiraDeviceSummary
  selected: boolean
  onSelect: () => void
}

export function TesiraDeviceCard({ device, selected, onSelect }: TesiraDeviceCardProps) {
  const { nodes } = useCluster()
  const [reconnecting, setReconnecting] = useState(false)
  const [nextRetryS, setNextRetryS] = useState<number | null>(null)
  const discoveryLabel = (device.discovered_by_node_ids ?? [])
    .map((nodeId) => nodes.find((node) => node.nodeId === nodeId)?.hostname ?? nodeId)
    .join(', ')

  useTesiraDeviceState(
    useCallback((event) => {
      if (event.device_id !== device.device_id) return
      if (event.event === 'reconnecting') {
        setReconnecting(true)
        setNextRetryS(event.next_retry_s ?? null)
      } else if (event.event === 'connected') {
        setReconnecting(false)
        setNextRetryS(null)
      } else if (event.event === 'disconnected') {
        setReconnecting(false)
      }
    }, [device.device_id]),
  )

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
              ) : reconnecting ? (
                <Tooltip title={nextRetryS != null ? `Retrying in ${nextRetryS}s` : 'Reconnecting…'}>
                  <SyncIcon
                    sx={{
                      fontSize: 14,
                      color: 'warning.main',
                      animation: 'spin 1.5s linear infinite',
                      '@keyframes spin': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } },
                    }}
                  />
                </Tooltip>
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
            {device.connected ? (
              <Chip label="Online" size="small" color="success" sx={{ height: 18, fontSize: 10 }} />
            ) : reconnecting ? (
              <Chip
                label={nextRetryS != null ? `Retry in ${nextRetryS}s` : 'Reconnecting…'}
                size="small"
                color="warning"
                variant="outlined"
                sx={{ height: 18, fontSize: 10 }}
              />
            ) : (
              <Chip label="Offline" size="small" color="default" sx={{ height: 18, fontSize: 10 }} />
            )}
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
            {discoveryLabel && (
              <Chip
                label={`Seen by ${discoveryLabel}`}
                size="small"
                variant="outlined"
                sx={{ height: 18, fontSize: 10 }}
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
