import React, { useState } from 'react'
import { Box, Typography, Chip, Tooltip, Button } from '@mui/material'
import SyncIcon from '@mui/icons-material/Sync'
import SearchIcon from '@mui/icons-material/Search'
import { MapMatrixProcessorIcon } from '../../icons/map'
import { useTesiraDevices, useDiscoveryStatus } from '../hooks/useTesiraApi'
import { DiscoveryDialog } from './DiscoveryDialog'

const BIAMP_RED = '#E31837'

export function TesiraTopBar() {
  const { data: devices } = useTesiraDevices()
  const { data: discoveryStatus } = useDiscoveryStatus()
  const [discoveryOpen, setDiscoveryOpen] = useState(false)

  const connectedCount = devices?.filter((d) => d.connected).length ?? 0
  const totalCount = devices?.length ?? 0
  const anyMaster = devices?.some((d) => d.ptp_state === 'MASTER')
  const isScanning = discoveryStatus?.is_scanning ?? false

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 2,
          py: 1,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <MapMatrixProcessorIcon size={22} color={BIAMP_RED} />
        <Typography variant="subtitle1" fontWeight={700}>
          Tesira AVB Fleet
        </Typography>

        <Box sx={{ flex: 1 }} />

        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Chip
            label={`${connectedCount}/${totalCount} online`}
            size="small"
            color={connectedCount === totalCount && totalCount > 0 ? 'success' : connectedCount > 0 ? 'warning' : 'default'}
            sx={{ fontSize: 11 }}
          />

          {anyMaster && (
            <Tooltip title="A Tesira unit is PTP Master — MAP2 ptp4l will be demoted to SLAVE">
              <Chip
                icon={<SyncIcon sx={{ fontSize: 12 }} />}
                label="PTP Slaved"
                size="small"
                variant="outlined"
                sx={{ fontSize: 11, borderColor: BIAMP_RED, color: BIAMP_RED }}
              />
            </Tooltip>
          )}

          <Tooltip title="Auto-discover Biamp Tesira Forte AVB units on the local network">
            <Button
              size="small"
              variant="outlined"
              startIcon={
                isScanning
                  ? <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: BIAMP_RED, animation: 'tesiraTopPulse 1s ease-in-out infinite', '@keyframes tesiraTopPulse': { '0%,100%': { opacity: 0.4 }, '50%': { opacity: 1 } } }} />
                  : <SearchIcon sx={{ fontSize: 14 }} />
              }
              onClick={() => setDiscoveryOpen(true)}
              sx={{
                borderColor: BIAMP_RED,
                color: BIAMP_RED,
                fontSize: 11,
                py: 0.25,
                px: 1,
                '&:hover': { borderColor: '#c01530', bgcolor: 'rgba(227,24,55,0.04)' },
              }}
            >
              {isScanning ? 'Scanning…' : 'Discover'}
            </Button>
          </Tooltip>
        </Box>
      </Box>

      <DiscoveryDialog open={discoveryOpen} onClose={() => setDiscoveryOpen(false)} />
    </>
  )
}
