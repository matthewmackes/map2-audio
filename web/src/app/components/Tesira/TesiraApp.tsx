import React, { useEffect } from 'react'
import { InlineLoading, InlineNotification } from '@carbon/react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { TesiraProvider } from './context/TesiraContext'
import { useTesiraContext } from './context/TesiraContext'
import { TesiraTopBar } from './components/TesiraTopBar'
import { TesiraFleetPanel } from './components/TesiraFleetPanel'
import { TesiraDeviceHeader } from './components/TesiraDeviceHeader'
import { TesiraOfflineBanner } from './components/TesiraOfflineBanner'
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
import { TesiraOnboardingWizard } from './components/TesiraOnboardingWizard'
import { useTesiraDevice, useTesiraDevices } from './hooks/useTesiraApi'
import { useCluster } from '../../contexts/ClusterContext'
import './components/TesiraCarbonChrome.css'

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
      <div className="tesira-app-shell">
        <TesiraTopBar />

        <div className="tesira-main-layout">
          <div className="tesira-fleet-column">
            <TesiraFleetPanel />
          </div>

          <div className="tesira-content-column">
            <TesiraRoutePanel />
          </div>
        </div>
      </div>
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
  const { selectDevice } = useTesiraContext()
  const { setActiveNode } = useCluster()

  useEffect(() => {
    selectDevice(null)
    setActiveNode(null)
  }, [selectDevice, setActiveNode])

  return (
    <div className="tesira-route-view__body">
      <TesiraOnboardingWizard />
    </div>
  )
}

function DeviceRouteView({ render }: { render: (deviceId: string) => React.ReactNode }) {
  const { deviceId } = useParams<{ deviceId: string }>()
  const { data: device, isLoading, isError } = useTesiraDevice(deviceId ?? '')
  const { data: devices = [] } = useTesiraDevices()
  const { selectDevice } = useTesiraContext()
  const { localNodeId, setActiveNode } = useCluster()
  const sourceNodeId = devices.find((entry) => entry.device_id === (deviceId ?? ''))?.source_node_id ?? null

  useEffect(() => {
    if (deviceId) selectDevice(deviceId)
    if (deviceId) {
      setActiveNode(sourceNodeId && sourceNodeId !== localNodeId ? sourceNodeId : null)
    }
  }, [deviceId, localNodeId, selectDevice, setActiveNode, sourceNodeId])

  if (!deviceId) return <FleetLanding />
  if (isLoading) {
    return (
      <div className="tesira-route-view__loading">
        <InlineLoading description="Loading Tesira device" />
      </div>
    )
  }
  if (isError || !device) {
    return (
      <div className="tesira-route-view__error">
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Failed to load device details"
          subtitle="The requested Tesira device could not be loaded from the active cluster context."
        />
      </div>
    )
  }

  return (
    <div className="tesira-route-view">
      <TesiraDeviceHeader device={device} />
      {!device.connected ? <TesiraOfflineBanner deviceId={deviceId} /> : null}
      <div className="tesira-route-view__body">
        {render(deviceId)}
      </div>
    </div>
  )
}
