/**
 * DevicesShell — unified sidebar + outlet for the `/devices/:deviceId/:view`
 * route family. Phase 2 of T2420.
 *
 * Reads `DEVICE_REGISTRY` and renders one `UnifiedWorkspaceSideNav` group
 * per registry entry. Selecting a device navigates to its `defaultView`;
 * selecting a sub-view navigates directly. The rendered view is whatever
 * the router decides to mount into `<Outlet />` (wired in a later phase).
 *
 * This shell is additive — no routes consume it yet.
 */
import { useMemo } from 'react'
import { Outlet, useNavigate, useParams } from 'react-router-dom'
import {
  UnifiedWorkspaceSideNav,
  type UnifiedWorkspaceSideNavItem,
} from '../navigation/UnifiedWorkspaceSideNav'
import { DeviceContextBanner } from '../DeviceContext'
import { ShellWindowTitleStrip } from '../shared/ShellWindowTitleStrip'
import { EmptyState } from '../shared/EmptyState'
import {
  DEVICE_REGISTRY,
  buildDeviceRoute,
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

export function DevicesShell() {
  const { deviceId, view } = useParams<DevicesShellParams>()
  const navigate = useNavigate()

  const entry = deviceId ? getDeviceEntry(deviceId) : null
  const activeViewId = entry ? activeViewForEntry(entry, view) : null

  const navigationItems = useMemo<UnifiedWorkspaceSideNavItem[]>(() => {
    return DEVICE_REGISTRY.flatMap((candidate) => {
      const isActiveDevice = candidate.id === deviceId
      const topRow: UnifiedWorkspaceSideNavItem = {
        key: `device:${candidate.id}`,
        label: candidate.label,
        description: candidate.description,
        to: buildDeviceRoute(candidate.id),
        icon: candidate.icon,
        active: isActiveDevice && !view,
        onOpen: () => navigate(buildDeviceRoute(candidate.id)),
        meta: candidate.kind === 'control-surface' ? 'Surface' : undefined,
      }

      if (!isActiveDevice) {
        return [topRow]
      }

      const childRows: UnifiedWorkspaceSideNavItem[] = candidate.views.map((candidateView) => ({
        key: `device:${candidate.id}:${candidateView.id}`,
        label: `› ${candidateView.label}`,
        to: buildDeviceRoute(candidate.id, candidateView.id),
        icon: candidateView.icon,
        active: activeViewId === candidateView.id,
        onOpen: () => navigate(buildDeviceRoute(candidate.id, candidateView.id)),
      }))

      return [topRow, ...childRows]
    })
  }, [deviceId, view, activeViewId, navigate])

  if (!entry) {
    return (
      <>
        <ShellWindowTitleStrip />
        <div className="devices-shell">
          <UnifiedWorkspaceSideNav
            ariaLabel="Devices navigation"
            className="devices-shell__sidebar"
            eyebrow="Devices"
            title="Hardware & control surfaces"
            description="Pick a device from the sidebar or the overview grid."
            items={navigationItems}
            storageKey="devices-shell"
          />
          <div className="devices-shell__main">
            <EmptyState
              title={deviceId ? `Unknown device: ${deviceId}` : 'Select a device'}
              description="Choose a hardware unit or control surface from the sidebar."
              align="left"
            />
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <ShellWindowTitleStrip />
      <div className="devices-shell">
        <UnifiedWorkspaceSideNav
          ariaLabel="Devices navigation"
          className="devices-shell__sidebar"
          eyebrow="Devices"
          title={entry.label}
          description={entry.description}
          items={navigationItems}
          metaBlocks={[
            { key: 'device-kind', label: 'Kind', value: entry.kind },
            { key: 'device-view', label: 'View', value: activeViewId ?? entry.defaultView },
          ]}
          storageKey="devices-shell"
        />
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
