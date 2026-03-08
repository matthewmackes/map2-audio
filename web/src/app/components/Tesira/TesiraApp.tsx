import React, { useEffect } from 'react'
import { Alert, Box, CircularProgress, Typography } from '@mui/material'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { TesiraProvider } from './context/TesiraContext'
import { useTesiraContext } from './context/TesiraContext'
import { TesiraTopBar } from './components/TesiraTopBar'
import { TesiraFleetPanel } from './components/TesiraFleetPanel'
import { TesiraDeviceHeader } from './components/TesiraDeviceHeader'
import { TesiraDeviceDashboard } from './components/TesiraDeviceDashboard'
import { TesiraDspExplorer } from './components/TesiraDspExplorer'
import { TesiraDesignCanvas } from './components/TesiraDesignCanvas'
import { TesiraDeviceSettings } from './components/TesiraDeviceSettings'
import { TesiraLevelsTab } from './components/TesiraLevelsTab'
import { TesiraMixerTab } from './components/TesiraMixerTab'
import { TesiraEQTab } from './components/TesiraEQTab'
import { TesiraPresetsTab } from './components/TesiraPresetsTab'
import { TesiraAvbTab } from './components/TesiraAvbTab'
import { TesiraFaultsTab } from './components/TesiraFaultsTab'
import { TesiraLoopBuilderTab } from './components/TesiraLoopBuilderTab'
import { useTesiraDevice } from './hooks/useTesiraApi'

/**
 * TesiraApp — main container for Biamp Tesira Forte AVB fleet management.
 *
 * Layout:
 *   ┌────────────────────────────────────────┐
 *   │  TesiraTopBar (breadcrumb, PTP badge)  │
 *   ├──────────┬─────────────────────────────┤
 *   │  Fleet   │  ControlPanel (6 tabs)      │
 *   │  Panel   │  Levels / Mixer / EQ /      │
 *   │  (≤5 U)  │  Presets / AVB / Faults     │
 *   └──────────┴─────────────────────────────┘
 */
export function TesiraApp() {
  return (
    <TesiraProvider>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          minHeight: 0,
          bgcolor: 'background.default',
        }}
      >
        <TesiraTopBar />

        <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Left: fleet panel (fixed width) */}
          <Box
            sx={{
              width: 220,
              flexShrink: 0,
              borderRight: 1,
              borderColor: 'divider',
              overflow: 'auto',
            }}
          >
            <TesiraFleetPanel />
          </Box>

          {/* Right: device control panel */}
          <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <TesiraRoutePanel />
          </Box>
        </Box>
      </Box>
    </TesiraProvider>
  )
}

function TesiraRoutePanel() {
  return (
    <Routes>
      <Route index element={<FleetLanding />} />
      <Route path=":deviceId" element={<Navigate to="dashboard" replace />} />
      <Route path=":deviceId/dashboard" element={<DeviceRouteView render={(id) => <TesiraDeviceDashboard deviceId={id} />} />} />
      <Route path=":deviceId/design" element={<DeviceRouteView render={(id) => <TesiraDesignCanvas deviceId={id} />} />} />
      <Route path=":deviceId/dsp" element={<DeviceRouteView render={(id) => <TesiraDspExplorer deviceId={id} />} />} />
      <Route path=":deviceId/levels" element={<DeviceRouteView render={(id) => <TesiraLevelsTab deviceId={id} />} />} />
      <Route path=":deviceId/mixer" element={<DeviceRouteView render={(id) => <TesiraMixerTab deviceId={id} />} />} />
      <Route path=":deviceId/eq" element={<DeviceRouteView render={(id) => <TesiraEQTab deviceId={id} />} />} />
      <Route path=":deviceId/presets" element={<DeviceRouteView render={(id) => <TesiraPresetsTab deviceId={id} />} />} />
      <Route path=":deviceId/avb" element={<DeviceRouteView render={(id) => <TesiraAvbTab deviceId={id} />} />} />
      <Route path=":deviceId/faults" element={<DeviceRouteView render={(id) => <TesiraFaultsTab deviceId={id} />} />} />
      <Route path=":deviceId/loops" element={<DeviceRouteView render={(id) => <TesiraLoopBuilderTab deviceId={id} />} />} />
      <Route path=":deviceId/settings" element={<DeviceRouteView render={(id) => <TesiraDeviceSettings deviceId={id} />} />} />
      <Route path="*" element={<FleetLanding />} />
    </Routes>
  )
}

function FleetLanding() {
  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'text.disabled',
      }}
    >
      <Typography variant="body2">Select a Tesira device from the fleet panel.</Typography>
    </Box>
  )
}

function DeviceRouteView({ render }: { render: (deviceId: string) => React.ReactNode }) {
  const { deviceId } = useParams<{ deviceId: string }>()
  const { data: device, isLoading, isError } = useTesiraDevice(deviceId ?? '')
  const { selectDevice } = useTesiraContext()

  useEffect(() => {
    if (deviceId) selectDevice(deviceId)
  }, [deviceId, selectDevice])

  if (!deviceId) return <FleetLanding />
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress size={24} />
      </Box>
    )
  }
  if (isError || !device) return <Alert severity="error" sx={{ m: 2 }}>Failed to load device details</Alert>

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <TesiraDeviceHeader device={device} />
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {render(deviceId)}
      </Box>
    </Box>
  )
}
