import React from 'react'
import { Box, Typography, Chip, Button, Tooltip } from '@mui/material'
import LinkIcon from '@mui/icons-material/Link'
import LinkOffIcon from '@mui/icons-material/LinkOff'
import type { TesiraDeviceDetail } from '../types'
import { BiampIcon } from '../BiampIcon'
import { useConnectDevice, useDisconnectDevice } from '../hooks/useTesiraApi'

const BIAMP_RED = '#E31837'

interface TesiraDeviceHeaderProps {
  device: TesiraDeviceDetail
}

export function TesiraDeviceHeader({ device }: TesiraDeviceHeaderProps) {
  const connect = useConnectDevice()
  const disconnect = useDisconnectDevice()

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
      <BiampIcon size={24} color={device.connected ? BIAMP_RED : '#666'} />

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle1" fontWeight={700} noWrap>
          {device.name || device.host}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {device.host}:{device.port}
          {device.transport ? ` · ${device.transport.toUpperCase()}${device.transport_port ? `:${device.transport_port}` : ''}` : ''}
          {device.serial_number && ` · S/N ${device.serial_number}`}
          {device.firmware_version && ` · fw ${device.firmware_version}`}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
        {device.ptp_state && (
          <Tooltip title={`PTP: ${device.ptp_state}`}>
            <Chip
              label={`PTP ${device.ptp_state}`}
              size="small"
              sx={{
                height: 20,
                fontSize: 10,
                borderColor: device.ptp_state === 'MASTER' ? BIAMP_RED : undefined,
                color: device.ptp_state === 'MASTER' ? BIAMP_RED : undefined,
              }}
              variant="outlined"
            />
          </Tooltip>
        )}

        {device.fault_count > 0 && (
          <Chip
            label={`${device.fault_count} fault${device.fault_count > 1 ? 's' : ''}`}
            size="small"
            color="warning"
            sx={{ height: 20, fontSize: 10 }}
          />
        )}

        {device.connected ? (
          <Button
            size="small"
            variant="outlined"
            color="error"
            startIcon={<LinkOffIcon />}
            onClick={() => disconnect.mutate(device.device_id)}
            disabled={disconnect.isPending}
            sx={{ height: 28, fontSize: 11 }}
          >
            Disconnect
          </Button>
        ) : (
          <Button
            size="small"
            variant="contained"
            startIcon={<LinkIcon />}
            onClick={() => connect.mutate(device.device_id)}
            disabled={connect.isPending}
            sx={{ height: 28, fontSize: 11, bgcolor: BIAMP_RED, '&:hover': { bgcolor: '#b5122a' } }}
          >
            Connect
          </Button>
        )}
      </Box>
    </Box>
  )
}
