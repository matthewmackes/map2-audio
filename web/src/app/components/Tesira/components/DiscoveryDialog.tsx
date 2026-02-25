/**
 * DiscoveryDialog — auto-discover and adopt Biamp Tesira Forte AVB units.
 *
 * Flow:
 *   idle → scanning (POST /discovery/start)
 *        → found/not_found (scan complete)
 *        → adopting (POST /discovery/adopt per device)
 *        → adopted (green check per device)
 *        → error (scan or adopt failure)
 *
 * Uses:
 *   - REST polling via useDiscoveryStatus (1 s interval while scanning)
 *   - WebSocket push via useTesiraDiscoveryEvents (live device-found events)
 */
import React, { useState, useCallback, useEffect } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Typography, Chip, CircularProgress,
  TextField, Divider, Alert, LinearProgress, Tooltip,
  IconButton,
} from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import SearchIcon from '@mui/icons-material/Search'
import CloseIcon from '@mui/icons-material/Close'
import { BiampIcon } from '../BiampIcon'
import {
  useStartDiscovery,
  useDiscoveryStatus,
  useAdoptDevice,
} from '../hooks/useTesiraApi'
import { useTesiraDiscoveryEvents } from '../hooks/useTesiraWebSocket'
import type { DiscoveredTesiraDevice } from '../types'

const BIAMP_RED = '#E31837'
const DEFAULT_TIMEOUT = 8

interface DiscoveryDialogProps {
  open: boolean
  onClose: () => void
}

/** Derive model variant label from model string */
function modelVariant(model: string | null): 'CI' | 'VI' | null {
  if (!model) return null
  const upper = model.toUpperCase()
  if (upper.includes(' CI')) return 'CI'
  if (upper.includes(' VI')) return 'VI'
  return null
}

function ModelBadge({ model }: { model: string | null }) {
  const variant = modelVariant(model)
  if (!variant) return null
  return (
    <Chip
      label={variant}
      size="small"
      sx={{
        bgcolor: variant === 'CI' ? '#b45309' : '#1d4ed8',
        color: '#fff',
        fontWeight: 700,
        fontSize: 10,
        height: 18,
        minWidth: 24,
        px: 0.5,
      }}
    />
  )
}

function ScanAnimation() {
  return (
    <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', py: 0.5 }}>
      {[0, 150, 300].map((delay) => (
        <Box
          key={delay}
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: BIAMP_RED,
            animation: 'tesiraPulse 1.2s ease-in-out infinite',
            animationDelay: `${delay}ms`,
            '@keyframes tesiraPulse': {
              '0%, 80%, 100%': { opacity: 0.2, transform: 'scale(0.8)' },
              '40%': { opacity: 1, transform: 'scale(1.2)' },
            },
          }}
        />
      ))}
    </Box>
  )
}

interface DeviceCardProps {
  device: DiscoveredTesiraDevice
  nameValue: string
  onNameChange: (name: string) => void
  onAdopt: () => void
  adopted: boolean
  adopting: boolean
  adoptError: string | null
}

function DeviceCard({
  device, nameValue, onNameChange, onAdopt,
  adopted, adopting, adoptError,
}: DeviceCardProps) {
  return (
    <Box
      sx={{
        border: 1,
        borderColor: adopted ? 'success.main' : 'divider',
        borderRadius: 1,
        p: 1.5,
        bgcolor: adopted ? 'success.dark' : 'background.default',
        transition: 'all 0.2s',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <BiampIcon size={14} color={BIAMP_RED} />
        <Typography variant="body2" fontWeight={700} sx={{ flex: 1 }}>
          {device.model ?? device.mdns_name}
        </Typography>
        <ModelBadge model={device.model} />
        {device.already_configured && (
          <Chip label="Already configured" size="small" variant="outlined" sx={{ fontSize: 10, height: 18 }} />
        )}
        {adopted && (
          <Tooltip title="Adopted">
            <CheckCircleIcon sx={{ color: 'success.light', fontSize: 18 }} />
          </Tooltip>
        )}
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        {device.host}:{device.port}
        {device.serial_number && ` · SN: ${device.serial_number}`}
        {device.firmware_version && ` · FW: ${device.firmware_version}`}
        {device.mac_address && ` · MAC: ${device.mac_address}`}
      </Typography>

      {adoptError && (
        <Alert severity="error" sx={{ py: 0, mb: 1, fontSize: 11 }}>{adoptError}</Alert>
      )}

      {!adopted && (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <TextField
            size="small"
            label="Name"
            value={nameValue}
            onChange={(e) => onNameChange(e.target.value)}
            disabled={adopting || device.already_configured}
            sx={{ flex: 1, '& input': { fontSize: 12 } }}
          />
          <Button
            variant="contained"
            size="small"
            onClick={onAdopt}
            disabled={adopting || device.already_configured}
            sx={{
              bgcolor: BIAMP_RED,
              '&:hover': { bgcolor: '#c01530' },
              minWidth: 72,
            }}
          >
            {adopting ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : 'Adopt'}
          </Button>
        </Box>
      )}
    </Box>
  )
}

export function DiscoveryDialog({ open, onClose }: DiscoveryDialogProps) {
  const [names, setNames] = useState<Record<string, string>>({})
  const [adopted, setAdopted] = useState<Record<string, boolean>>({})
  const [adoptingHost, setAdoptingHost] = useState<string | null>(null)
  const [adoptErrors, setAdoptErrors] = useState<Record<string, string>>({})
  const [hasScanned, setHasScanned] = useState(false)

  const startDiscovery = useStartDiscovery()
  const { data: status } = useDiscoveryStatus()
  const adoptDevice = useAdoptDevice()

  const isScanning = status?.is_scanning ?? false
  const devices = status?.devices ?? []
  const scanError = status?.error ?? null

  // Live WS events — the status poll also picks these up, but WS makes it feel instant
  useTesiraDiscoveryEvents(useCallback((event) => {
    if (event.event === 'device_found' && event.device) {
      const d = event.device
      setNames((prev) => prev[d.host] !== undefined ? prev : { ...prev, [d.host]: d.hostname ?? d.mdns_name ?? d.host })
    }
  }, []))

  // Sync names when devices arrive via poll too
  useEffect(() => {
    devices.forEach((d) => {
      setNames((prev) => prev[d.host] !== undefined ? prev : { ...prev, [d.host]: d.hostname ?? d.mdns_name ?? d.host })
    })
  }, [devices])

  const handleScan = () => {
    setAdopted({})
    setAdoptErrors({})
    setHasScanned(true)
    startDiscovery.mutate(DEFAULT_TIMEOUT)
  }

  const handleAdopt = async (device: DiscoveredTesiraDevice) => {
    setAdoptingHost(device.host)
    setAdoptErrors((prev) => ({ ...prev, [device.host]: '' }))
    try {
      await adoptDevice.mutateAsync({ host: device.host, name: names[device.host] })
      setAdopted((prev) => ({ ...prev, [device.host]: true }))
    } catch (err: any) {
      const msg = err?.message ?? 'Adoption failed'
      setAdoptErrors((prev) => ({ ...prev, [device.host]: msg }))
    } finally {
      setAdoptingHost(null)
    }
  }

  const handleClose = () => {
    if (!isScanning) onClose()
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
        <BiampIcon size={20} color={BIAMP_RED} />
        <Typography variant="h6" component="span">Discover Tesira Devices</Typography>
        <Box sx={{ flex: 1 }} />
        {isScanning && <ScanAnimation />}
        <IconButton size="small" onClick={handleClose} disabled={isScanning}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      {isScanning && <LinearProgress sx={{ '& .MuiLinearProgress-bar': { bgcolor: BIAMP_RED } }} />}

      <DialogContent sx={{ pt: 2 }}>
        {/* Scan description */}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Scans the local network for Biamp Tesira Forte CI and VI units at factory reset
          (mDNS + TTP port 23, no password required). The scan runs for {DEFAULT_TIMEOUT} seconds.
        </Typography>

        {startDiscovery.isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Failed to start scan: {String(startDiscovery.error)}
          </Alert>
        )}

        {scanError && !isScanning && (
          <Alert severity="warning" sx={{ mb: 2 }}>Scan error: {scanError}</Alert>
        )}

        {/* Status line */}
        {isScanning && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <CircularProgress size={14} sx={{ color: BIAMP_RED }} />
            <Typography variant="body2">
              Scanning… {devices.length > 0 ? `${devices.length} unit${devices.length !== 1 ? 's' : ''} found so far` : 'looking for Tesira units'}
            </Typography>
          </Box>
        )}

        {/* Results */}
        {devices.length > 0 && (
          <>
            <Divider sx={{ mb: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                Found {devices.length} unit{devices.length !== 1 ? 's' : ''}
              </Typography>
            </Divider>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {devices.map((dev) => (
                <DeviceCard
                  key={dev.host}
                  device={dev}
                  nameValue={names[dev.host] ?? ''}
                  onNameChange={(name) => setNames((prev) => ({ ...prev, [dev.host]: name }))}
                  onAdopt={() => handleAdopt(dev)}
                  adopted={adopted[dev.host] ?? false}
                  adopting={adoptingHost === dev.host}
                  adoptError={adoptErrors[dev.host] || null}
                />
              ))}
            </Box>
          </>
        )}

        {/* No results after scan */}
        {hasScanned && !isScanning && devices.length === 0 && !scanError && (
          <Box sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}>
            <ErrorOutlineIcon sx={{ fontSize: 40, mb: 1, opacity: 0.4 }} />
            <Typography variant="body2">
              No Tesira units found. Check that units are on the same L2 segment
              and advertising via mDNS, or verify TTP port 23 is reachable.
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button
          variant="outlined"
          startIcon={<SearchIcon />}
          onClick={handleScan}
          disabled={isScanning}
          sx={{ borderColor: BIAMP_RED, color: BIAMP_RED, '&:hover': { borderColor: '#c01530', bgcolor: 'rgba(227,24,55,0.04)' } }}
        >
          {hasScanned ? 'Scan Again' : 'Start Scan'}
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={handleClose} disabled={isScanning} variant="contained" color="inherit">
          Done
        </Button>
      </DialogActions>
    </Dialog>
  )
}
