import { Outlet, useLocation, useParams } from 'react-router-dom'
import { DeviceContextBanner } from '../DeviceContext'
import { EmptyState } from '../shared/EmptyState'
import {
  getDeviceEntry,
  type DeviceRegistryEntry,
} from '../../data/deviceRegistry'

import './DevicesShell.css'

interface DevicesShellParams extends Record<string, string | undefined> {
  deviceId?: string
  view?: string
}

function activeViewForEntry(entry: DeviceRegistryEntry, requested: string | undefined): string {
  if (requested && entry.views.some((view) => view.id === requested)) {
    return requested
  }
  return entry.defaultView
}

function parseDevicePath(pathname: string): { deviceId?: string; view?: string } {
  const match = pathname.match(/^\/devices\/([^/]+)(?:\/([^/]+))?/)
  if (!match) return {}
  return { deviceId: match[1], view: match[2] }
}

export function DevicesShell() {
  const routeParams = useParams<DevicesShellParams>()
  const location = useLocation()
  const parsed = parseDevicePath(location.pathname)
  const deviceId = routeParams.deviceId ?? parsed.deviceId
  const view = routeParams.view ?? parsed.view

  const entry = deviceId ? getDeviceEntry(deviceId) : null
  const activeViewId = entry ? activeViewForEntry(entry, view) : null

  if (!entry) {
    return (
      <>
        <div className="devices-shell">
          <div className="devices-shell__main">
            {deviceId ? (
              <EmptyState
                title={`Unknown device: ${deviceId}`}
                description="Choose a hardware unit or control surface from the overview grid."
                align="left"
              />
            ) : (
              <div className="devices-shell__content">
                <Outlet />
              </div>
            )}
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="devices-shell">
        <div className="devices-shell__main">
          {entry.deviceContextKey ? (
            <DeviceContextBanner deviceName={entry.label} deviceKey={entry.deviceContextKey} />
          ) : null}
          <div className="devices-shell__content">
            <Outlet />
          </div>
        </div>
      </div>
    </>
  )
}
