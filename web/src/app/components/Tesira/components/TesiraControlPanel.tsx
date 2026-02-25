import React from 'react'
import {
  Box, Tabs, Tab, Typography, CircularProgress, Alert,
} from '@mui/material'
import { useTesiraDevice } from '../hooks/useTesiraApi'
import { useTesiraContext } from '../context/TesiraContext'
import { TesiraDeviceHeader } from './TesiraDeviceHeader'
import { TesiraLevelsTab } from './TesiraLevelsTab'
import { TesiraMixerTab } from './TesiraMixerTab'
import { TesiraEQTab } from './TesiraEQTab'
import { TesiraPresetsTab } from './TesiraPresetsTab'
import { TesiraAvbTab } from './TesiraAvbTab'
import { TesiraFaultsTab } from './TesiraFaultsTab'

const TABS = ['Levels', 'Mixer', 'EQ', 'Presets', 'AVB Streams', 'Faults']

export function TesiraControlPanel() {
  const { selectedDeviceId, selectedTab, setSelectedTab } = useTesiraContext()

  if (!selectedDeviceId) {
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
        <Typography variant="body2">Select a device from the fleet panel</Typography>
      </Box>
    )
  }

  return (
    <DevicePanel deviceId={selectedDeviceId} tab={selectedTab} onTabChange={setSelectedTab} />
  )
}

interface DevicePanelProps {
  deviceId: string
  tab: number
  onTabChange: (n: number) => void
}

function DevicePanel({ deviceId, tab, onTabChange }: DevicePanelProps) {
  const { data: device, isLoading, isError } = useTesiraDevice(deviceId)

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress size={28} />
      </Box>
    )
  }

  if (isError || !device) {
    return <Alert severity="error" sx={{ m: 2 }}>Failed to load device details</Alert>
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <TesiraDeviceHeader device={device} />

      <Tabs
        value={tab}
        onChange={(_e, v) => onTabChange(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 36 }}
        TabIndicatorProps={{ style: { backgroundColor: '#E31837' } }}
      >
        {TABS.map((label) => (
          <Tab
            key={label}
            label={label}
            sx={{ fontSize: 12, minHeight: 36, py: 0.5 }}
          />
        ))}
      </Tabs>

      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {tab === 0 && <TesiraLevelsTab deviceId={deviceId} />}
        {tab === 1 && <TesiraMixerTab deviceId={deviceId} />}
        {tab === 2 && <TesiraEQTab deviceId={deviceId} />}
        {tab === 3 && <TesiraPresetsTab deviceId={deviceId} />}
        {tab === 4 && <TesiraAvbTab deviceId={deviceId} />}
        {tab === 5 && <TesiraFaultsTab deviceId={deviceId} />}
      </Box>
    </Box>
  )
}
