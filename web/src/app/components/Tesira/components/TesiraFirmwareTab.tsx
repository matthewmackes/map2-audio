import React, { useState } from 'react'
import {
  CheckmarkOutline,
  ChevronDown,
  ChevronUp,
  Download,
  Launch,
  Power,
  Renew,
  WarningAlt,
} from '@carbon/icons-react'
import {
  Box, Typography, Table, TableHead, TableRow, TableCell, TableBody,
  Chip, Button, CircularProgress, Alert, Divider, Paper, Tooltip,
  Collapse, IconButton, Stack, Link,
} from '@mui/material'
import { useTesiraDevices, useFirmwareLatest, useDeviceFirmware, useRebootDevice } from '../hooks/useTesiraApi'
import type { TesiraFirmwareStatus } from '../types'

const BIAMP_RED = '#E31837'

interface TesiraFirmwareTabProps {
  /** Currently-selected device (for the detail pane). */
  deviceId: string
}

export function TesiraFirmwareTab({ deviceId }: TesiraFirmwareTabProps) {
  const { data: devices = [], isLoading: devicesLoading } = useTesiraDevices()
  const { data: latest, isLoading: latestLoading, refetch: refetchLatest } = useFirmwareLatest()

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* ── Fleet status table ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="subtitle2" fontWeight={700} color="text.primary">
          Fleet Firmware Status
        </Typography>
        <Tooltip title="Refresh latest version from Biamp">
          <span>
            <IconButton
              size="small"
              onClick={() => refetchLatest()}
              disabled={latestLoading}
            >
              {latestLoading ? <CircularProgress size={14} /> : <Renew size={16} />}
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {latest && (
        <Typography variant="caption" color="text.secondary">
          Latest available: <strong style={{ color: '#f1f5f9' }}>{latest.version ?? '—'}</strong>
          {latest.fetched_at && ` · checked ${new Date(latest.fetched_at).toLocaleTimeString()}`}
        </Typography>
      )}

      {devicesLoading ? (
        <CircularProgress size={24} />
      ) : (
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontSize: 11, fontWeight: 700, color: 'text.secondary', py: 0.75 } }}>
                <TableCell>Device</TableCell>
                <TableCell>Current</TableCell>
                <TableCell>Latest</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {devices.map((d) => (
                <DeviceRow
                  key={d.device_id}
                  deviceId={d.device_id}
                  latestVersion={latest?.version ?? null}
                  selected={d.device_id === deviceId}
                />
              ))}
              {devices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} sx={{ color: 'text.disabled', fontSize: 12, textAlign: 'center' }}>
                    No devices in fleet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>
      )}

      {/* ── Per-device detail pane ── */}
      {deviceId && (
        <>
          <Divider />
          <DeviceDetail deviceId={deviceId} latestVersion={latest?.version ?? null} latestFirmware={latest} />
        </>
      )}
    </Box>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Fleet table row — fetches firmware status per device
// ─────────────────────────────────────────────────────────────────────────────

function DeviceRow({
  deviceId,
  latestVersion,
  selected,
}: {
  deviceId: string
  latestVersion: string | null
  selected: boolean
}) {
  const { data: fw, isLoading } = useDeviceFirmware(deviceId)

  if (isLoading) {
    return (
      <TableRow selected={selected}>
        <TableCell colSpan={4}><CircularProgress size={12} /></TableCell>
      </TableRow>
    )
  }

  if (!fw) return null

  return (
    <TableRow
      selected={selected}
      sx={{
        '&.Mui-selected': { bgcolor: 'rgba(227,24,55,0.06)' },
        '& td': { fontSize: 12, py: 0.75 },
      }}
    >
      <TableCell>
        <Typography variant="caption" fontWeight={600} noWrap sx={{ maxWidth: 140, display: 'block' }}>
          {fw.name || fw.host}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
          {fw.host}
        </Typography>
      </TableCell>
      <TableCell>{fw.connected ? (fw.current_version ?? '—') : '—'}</TableCell>
      <TableCell>{latestVersion ?? '—'}</TableCell>
      <TableCell>
        <FirmwareStatusChip fw={fw} />
      </TableCell>
    </TableRow>
  )
}

function FirmwareStatusChip({ fw }: { fw: TesiraFirmwareStatus }) {
  if (!fw.connected) {
    return (
      <Chip label="Offline" size="small" sx={{ height: 18, fontSize: 10, bgcolor: 'rgba(255,255,255,0.06)' }} />
    )
  }
  if (fw.update_available) {
    return (
      <Chip
        icon={<WarningAlt size={11} />}
        label="Update available"
        size="small"
        color="warning"
        sx={{ height: 18, fontSize: 10 }}
      />
    )
  }
  return (
    <Chip
      icon={<CheckmarkOutline size={11} />}
      label="Up to date"
      size="small"
      color="success"
      variant="outlined"
      sx={{ height: 18, fontSize: 10 }}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-device detail panel
// ─────────────────────────────────────────────────────────────────────────────

function DeviceDetail({
  deviceId,
  latestVersion,
  latestFirmware,
}: {
  deviceId: string
  latestVersion: string | null
  latestFirmware: { download_url: string; update_path_url: string; release_notes_url: string } | undefined
}) {
  const { data: fw, isLoading } = useDeviceFirmware(deviceId)
  const reboot = useRebootDevice()
  const [guideOpen, setGuideOpen] = useState(false)
  const [rebootResult, setRebootResult] = useState<string | null>(null)

  const handleReboot = async () => {
    setRebootResult(null)
    try {
      const result = await reboot.mutateAsync(deviceId)
      setRebootResult(result.message || 'Reboot command sent. Device will reconnect shortly.')
    } catch (err: unknown) {
      setRebootResult(`Error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (isLoading) return <CircularProgress size={20} />
  if (!fw) return null

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="subtitle2" fontWeight={700}>
        {fw.name || fw.host} — Firmware Detail
      </Typography>

      {/* Version comparison */}
      <Stack direction="row" spacing={2} alignItems="center">
        <Box>
          <Typography variant="caption" color="text.secondary">Current</Typography>
          <Typography variant="body2" fontWeight={600}>
            {fw.connected ? (fw.current_version ?? '—') : '—'}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">Latest</Typography>
          <Typography variant="body2" fontWeight={600} color={fw.update_available ? 'warning.main' : 'text.primary'}>
            {latestVersion ?? '—'}
          </Typography>
        </Box>
        {fw.update_available && (
          <Chip
            icon={<WarningAlt size={13} />}
            label="Update available"
            size="small"
            color="warning"
          />
        )}
        {fw.connected && !fw.update_available && fw.current_version && (
          <Chip
            icon={<CheckmarkOutline size={13} />}
            label="Up to date"
            size="small"
            color="success"
            variant="outlined"
          />
        )}
      </Stack>

      {/* Action buttons */}
      <Stack direction="row" spacing={1} flexWrap="wrap">
        <Tooltip title={fw.connected ? 'Send DEVICE reboot via TTP' : 'Device must be online to reboot'}>
          <span>
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={reboot.isPending ? <CircularProgress size={14} color="inherit" /> : <Power size={16} />}
              disabled={!fw.connected || reboot.isPending}
              onClick={handleReboot}
              sx={{ fontSize: 12 }}
            >
              {reboot.isPending ? 'Rebooting…' : 'Reboot device'}
            </Button>
          </span>
        </Tooltip>

        {latestFirmware?.download_url && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<Download size={16} />}
            endIcon={<Launch size={12} />}
            href={latestFirmware.download_url}
            target="_blank"
            rel="noopener noreferrer"
            sx={{ fontSize: 12 }}
          >
            Download firmware
          </Button>
        )}

        {latestFirmware?.update_path_url && (
          <Button
            size="small"
            variant="text"
            endIcon={<Launch size={12} />}
            href={latestFirmware.update_path_url}
            target="_blank"
            rel="noopener noreferrer"
            sx={{ fontSize: 12 }}
          >
            Update path guide
          </Button>
        )}
      </Stack>

      {rebootResult && (
        <Alert
          severity={rebootResult.startsWith('Error') ? 'error' : 'success'}
          onClose={() => setRebootResult(null)}
          sx={{ py: 0.5, fontSize: 12 }}
        >
          {rebootResult}
        </Alert>
      )}

      {/* How-to guide (collapsible) */}
      <Box>
        <Button
          size="small"
          variant="text"
          sx={{ fontSize: 11, color: 'text.secondary', p: 0, textTransform: 'none' }}
          endIcon={guideOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          onClick={() => setGuideOpen((v) => !v)}
        >
          How to update firmware
        </Button>
        <Collapse in={guideOpen}>
          <Paper variant="outlined" sx={{ mt: 1, p: 1.5, bgcolor: 'rgba(255,255,255,0.02)' }}>
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 2, display: 'block' }}>
              Biamp Tesira firmware is updated through <strong>Tesira Software</strong> (Windows/macOS) —
              firmware cannot be flashed remotely via TTP.
            </Typography>
            <Box component="ol" sx={{ m: 0, pl: 2.5, mt: 1 }}>
              {[
                <>Download the <code>.tfa2</code> firmware file from{' '}
                  <Link href={latestFirmware?.download_url} target="_blank" rel="noopener noreferrer" sx={{ color: BIAMP_RED }}>
                    Biamp support
                  </Link>
                </>,
                'Open Tesira Software on a Windows/macOS computer',
                'Connect to the device: System → Connect',
                'Go to System → Device Maintenance',
                'Click "Update Firmware", select the .tfa2 file, select target devices',
                'Do NOT disconnect power during update (~10 min)',
                'After update completes, use "Reboot device" above if needed',
              ].map((step, i) => (
                <Typography
                  key={i}
                  component="li"
                  variant="caption"
                  color="text.secondary"
                  sx={{ mb: 0.25, lineHeight: 1.8 }}
                >
                  {step}
                </Typography>
              ))}
            </Box>
          </Paper>
        </Collapse>
      </Box>
    </Box>
  )
}
