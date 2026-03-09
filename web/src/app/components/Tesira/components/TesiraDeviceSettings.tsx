import React, { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import { TesiraFirmwareTab } from './TesiraFirmwareTab'
import {
  useCaptureTesiraScene,
  useDeleteTesiraScene,
  useRecallTesiraScene,
  useSetTesiraGpioPin,
  useTesiraCapabilities,
  useTesiraGpio,
  useTesiraScenes,
} from '../hooks/useTesiraApi'

interface TesiraDeviceSettingsProps {
  deviceId: string
}

export function TesiraDeviceSettings({ deviceId }: TesiraDeviceSettingsProps) {
  const capabilities = useTesiraCapabilities(deviceId)
  const gpio = useTesiraGpio(deviceId)
  const setGpio = useSetTesiraGpioPin()
  const scenes = useTesiraScenes(deviceId)
  const captureScene = useCaptureTesiraScene()
  const recallScene = useRecallTesiraScene()
  const deleteScene = useDeleteTesiraScene()

  const [sceneName, setSceneName] = useState('Current Setup')
  const [localError, setLocalError] = useState<string | null>(null)

  const gpioRows = gpio.data?.pins ?? []
  const sceneRows = useMemo(() => scenes.data?.scenes ?? [], [scenes.data])

  const onTogglePin = async (pin: number, state: boolean) => {
    setLocalError(null)
    try {
      await setGpio.mutateAsync({ deviceId, pin, state })
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : String(err))
    }
  }

  const onCaptureScene = async () => {
    const trimmed = sceneName.trim()
    if (!trimmed) return
    setLocalError(null)
    try {
      await captureScene.mutateAsync({ deviceId, name: trimmed })
      setSceneName(trimmed)
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Box className="tesira-device-settings" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="subtitle2" fontWeight={700}>Firmware</Typography>
      <Paper variant="outlined">
        <TesiraFirmwareTab deviceId={deviceId} />
      </Paper>

      <Typography variant="subtitle2" fontWeight={700}>Capabilities</Typography>
      <Paper variant="outlined" sx={{ p: 1.5 }}>
        {capabilities.isLoading ? (
          <CircularProgress size={18} />
        ) : capabilities.error ? (
          <Typography variant="body2" color="text.secondary">Capabilities unavailable.</Typography>
        ) : (
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <Typography variant="caption">Model: {capabilities.data?.model || 'Unknown'}</Typography>
            <Typography variant="caption">GPIO: {capabilities.data?.capabilities?.gpio_count ?? 0}</Typography>
            <Typography variant="caption">AVB channels: {capabilities.data?.capabilities?.avb_max_channels ?? 0}</Typography>
            <Typography variant="caption">USB channels: {capabilities.data?.capabilities?.usb_channels ?? 0}</Typography>
          </Stack>
        )}
      </Paper>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
        <Typography variant="subtitle2" fontWeight={700}>GPIO</Typography>
        <Button
          size="small"
          variant="outlined"
          onClick={() => {
            gpio.refetch().catch(() => undefined)
          }}
          sx={{ width: { xs: '100%', sm: 'auto' } }}
        >
          Refresh
        </Button>
      </Stack>

      {localError && <Alert severity="warning">{localError}</Alert>}
      {gpio.error && (
        <Alert severity="warning">{(gpio.error as Error).message || 'GPIO query failed'}</Alert>
      )}
      {gpio.isLoading ? (
        <CircularProgress size={20} />
      ) : (
        <Box className="tesira-table-scroll-wrap">
          <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
            <Table size="small" className="tesira-table">
            <TableHead>
              <TableRow>
                <TableCell>Pin</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">State</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {gpioRows.map((pin) => (
                <TableRow key={pin.pin}>
                  <TableCell>{pin.pin}</TableCell>
                  <TableCell>{pin.ok ? 'OK' : 'Unavailable'}</TableCell>
                  <TableCell align="right">
                    <Switch
                      size="small"
                      checked={Boolean(pin.state)}
                      disabled={!pin.ok || pin.state == null || setGpio.isPending}
                      onChange={(_event, checked) => {
                        onTogglePin(pin.pin, checked).catch(() => undefined)
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {gpioRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3}>
                    <Typography variant="body2" color="text.secondary">No GPIO pins discovered.</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            </Table>
          </Paper>
          <Box className="tesira-table-scroll-hint" aria-hidden="true" />
        </Box>
      )}

      <Typography variant="subtitle2" fontWeight={700}>Scene Snapshots</Typography>
      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }} sx={{ mb: 1.5 }}>
          <TextField
            size="small"
            label="Scene name"
            value={sceneName}
            onChange={(event) => setSceneName(event.target.value)}
            sx={{ minWidth: { xs: '100%', sm: 240 } }}
            inputProps={{ style: { fontSize: 12 } }}
          />
          <Button
            size="small"
            variant="contained"
            onClick={() => {
              onCaptureScene().catch(() => undefined)
            }}
            disabled={captureScene.isPending || sceneName.trim() === ''}
            sx={{ width: { xs: '100%', sm: 'auto' } }}
          >
            Capture
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              scenes.refetch().catch(() => undefined)
            }}
            sx={{ width: { xs: '100%', sm: 'auto' } }}
          >
            Refresh
          </Button>
        </Stack>

        {scenes.error && (
          <Alert severity="warning" sx={{ mb: 1 }}>
            {(scenes.error as Error).message || 'Scene list failed'}
          </Alert>
        )}

        {scenes.isLoading ? (
          <CircularProgress size={18} />
        ) : (
          <Box className="tesira-table-scroll-wrap">
            <Table size="small" className="tesira-table">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Created</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sceneRows.map((scene) => (
                <TableRow key={scene.scene_id}>
                  <TableCell>{scene.name}</TableCell>
                  <TableCell>{scene.created_at ? new Date(scene.created_at).toLocaleString() : '—'}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<PlayArrowIcon />}
                        disabled={recallScene.isPending}
                        onClick={() => {
                          recallScene.mutate({ deviceId, sceneId: scene.scene_id })
                        }}
                      >
                        Recall
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        variant="outlined"
                        startIcon={<DeleteIcon />}
                        disabled={deleteScene.isPending}
                        onClick={() => {
                          deleteScene.mutate({ deviceId, sceneId: scene.scene_id })
                        }}
                      >
                        Delete
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {sceneRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3}>
                    <Typography variant="body2" color="text.secondary">No scene snapshots captured yet.</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            </Table>
            <Box className="tesira-table-scroll-hint" aria-hidden="true" />
          </Box>
        )}
      </Paper>
    </Box>
  )
}
