import React from 'react'
import { InlineLoading, InlineNotification, Tab, TabList, Tabs, Tile } from '@carbon/react'
import { useTesiraDevice } from '../hooks/useTesiraApi'
import { useTesiraContext } from '../context/TesiraContext'
import { TesiraDeviceHeader } from './TesiraDeviceHeader'
import { TesiraOfflineBanner } from './TesiraOfflineBanner'
import { TesiraLevelsTab } from './TesiraLevelsTab'
import { TesiraMixerTab } from './TesiraMixerTab'
import { TesiraEQTab } from './TesiraEQTab'
import { TesiraPresetsTab } from './TesiraPresetsTab'
import { TesiraAvbTab } from './TesiraAvbTab'
import { TesiraFaultsTab } from './TesiraFaultsTab'
import { TesiraFirmwareTab } from './TesiraFirmwareTab'
import { TesiraLoopBuilderTab } from './TesiraLoopBuilderTab'
import './TesiraCarbonChrome.css'

const TABS = ['Levels', 'Mixer', 'EQ', 'Presets', 'AVB Streams', 'Faults', 'Firmware', 'Loops']

export function TesiraControlPanel() {
  const { selectedDeviceId, selectedTab, setSelectedTab } = useTesiraContext()

  if (!selectedDeviceId) {
    return (
      <div className="tesira-control-panel__empty-wrap">
        <Tile className="tesira-control-panel__empty">
          <p className="tesira-dashboard__eyebrow">Tesira fleet</p>
          <h3 className="tesira-dashboard__title">Select a device from the fleet panel</h3>
          <p className="tesira-dashboard__summary">
            Choose a Tesira unit to open its Carbon-aligned control tabs, onboarding helpers, and recovery views.
          </p>
        </Tile>
      </div>
    )
  }

  return (
    <DevicePanel deviceId={selectedDeviceId} tab={selectedTab} onTabChange={setSelectedTab} />
  )
}

interface DevicePanelProps {
  deviceId: string
  tab: number
  onTabChange: (index: number) => void
}

function DevicePanel({ deviceId, tab, onTabChange }: DevicePanelProps) {
  const { data: device, isLoading, isError } = useTesiraDevice(deviceId)

  if (isLoading) {
    return (
      <div className="tesira-control-panel__loading">
        <InlineLoading description="Loading device details" />
      </div>
    )
  }

  if (isError || !device) {
    return (
      <div className="tesira-control-panel__error">
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Failed to load device details"
          subtitle="Retry after confirming the Tesira device is still reachable from the fleet panel."
        />
      </div>
    )
  }

  return (
    <div className="tesira-control-panel">
      <TesiraDeviceHeader device={device} />

      {!device.connected ? <TesiraOfflineBanner deviceId={deviceId} /> : null}

      <div className="tesira-control-panel__tabs">
        <Tabs selectedIndex={tab} onChange={({ selectedIndex }) => onTabChange(selectedIndex)}>
          <TabList aria-label="Tesira device tabs" contained>
            {TABS.map((label) => (
              <Tab key={label}>{label}</Tab>
            ))}
          </TabList>
        </Tabs>
      </div>

      <div className="tesira-control-panel__body">
        {tab === 0 ? <TesiraLevelsTab deviceId={deviceId} /> : null}
        {tab === 1 ? <TesiraMixerTab deviceId={deviceId} /> : null}
        {tab === 2 ? <TesiraEQTab deviceId={deviceId} /> : null}
        {tab === 3 ? <TesiraPresetsTab deviceId={deviceId} /> : null}
        {tab === 4 ? <TesiraAvbTab deviceId={deviceId} /> : null}
        {tab === 5 ? <TesiraFaultsTab deviceId={deviceId} /> : null}
        {tab === 6 ? <TesiraFirmwareTab deviceId={deviceId} /> : null}
        {tab === 7 ? <TesiraLoopBuilderTab deviceId={deviceId} /> : null}
      </div>
    </div>
  )
}
